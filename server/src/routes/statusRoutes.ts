/**
 * 状态监控 API 路由
 *
 * 提供：
 * - GET /api/status/health - 健康检查
 * - GET /api/status/memory - 内存状态
 * - GET /api/status/resources - 资源使用报告
 * - GET /api/status/config - 配置摘要
 * - GET /api/status/2u2g - 2u2g 限制检查
 */

import express, { Request, Response } from 'express';
import { getMemoryMonitor, MemoryPressure } from '../config/memory';
import { getConfig, getResourceLimits } from '../config';
import { getResourceAllocator } from '../config/resource';
import { getQueueService } from '../jobs/QueueService';
import { getConnection } from '../database/connection';
import { getUsageMetricModel } from '../models/UsageMetric';
import { getSystemSettingsService } from '../services/SystemSettingsService';
import { logger } from '../utils/logger';

const router = express.Router();

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

router.get('/', (_req: Request, res: Response) => {
  try {
    const memoryMonitor = getMemoryMonitor();
    const memoryStatus = memoryMonitor.getResourceStatus();
    const queueService = getQueueService();
    const queueStatus = queueService.getQueueStatus();
    const dbConnection = getConnection();
    let database: 'connected' | 'disconnected' = 'disconnected';

    if (dbConnection.isReady()) {
      try {
        dbConnection.getDatabase().prepare('SELECT 1').get();
        database = 'connected';
      } catch (error) {
        const err = toError(error);
        logger.warn(`数据库连通性检查失败: ${err.message}`);
      }
    }

    let worker: 'running' | 'stopped' | 'error' = 'running';
    if (queueStatus.deadCount > 0) {
      worker = 'error';
    } else if (queueStatus.activeCount === 0 && queueStatus.pendingCount === 0) {
      worker = 'running';
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (database === 'disconnected') {
      status = 'unhealthy';
    } else if (!memoryMonitor.canStartJob().canStart || worker === 'error') {
      status = 'degraded';
    }

    return res.json({
      status,
      database,
      worker,
      memoryUsage: {
        total: memoryStatus.memory.totalMB * 1024 * 1024,
        used: memoryStatus.memory.usedMB * 1024 * 1024,
        available: memoryStatus.memory.freeMB * 1024 * 1024,
        percentage: memoryStatus.memory.usedPercent,
        swapTotal: memoryStatus.swap.totalMB * 1024 * 1024,
        swapUsed: memoryStatus.swap.usedMB * 1024 * 1024,
        swapPercentage: memoryStatus.swap.usedPercent,
      },
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
    });
  } catch (error) {
    const err = toError(error);
    logger.error('获取系统状态失败:', err);
    return res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      worker: 'error',
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
    });
  }
});

/**
 * GET /api/status/health
 * 健康检查端点
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    const memoryMonitor = getMemoryMonitor();
    const memoryStatus = memoryMonitor.canStartJob();

    const health = {
      status: memoryStatus.canStart ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        memory: {
          status: memoryStatus.canStart ? 'ok' : 'warning',
          message: memoryStatus.reason || 'Memory usage is acceptable',
        },
        database: {
          status: 'ok', // TODO: 实际数据库检查
          message: 'Database connection is healthy',
        },
        queue: {
          status: 'ok',
          message: 'Job queue is operational',
        },
      },
    };

    const httpStatus = health.status === 'healthy' ? 200 : 503;
    return res.status(httpStatus).json(health);
  } catch (error) {
    const err = toError(error);
    logger.error('健康检查失败:', err);
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

/**
 * GET /api/status/memory
 * 内存状态端点
 */
router.get('/memory', (_req: Request, res: Response) => {
  try {
    const memoryMonitor = getMemoryMonitor();
    const status = memoryMonitor.getResourceStatus();

    return res.json({
      status: 'ok',
      data: {
        memory: {
          system: {
            total: status.memory.totalMB,
            used: status.memory.usedMB,
            free: status.memory.freeMB,
            percent: status.memory.usedPercent,
          },
          node: {
            heapUsed: status.memory.nodeHeapUsedMB,
            heapTotal: status.memory.nodeHeapTotalMB,
            external: status.memory.nodeExternalMB,
            rss: status.memory.nodeRssMB,
          },
        },
        swap: {
          total: status.swap.totalMB,
          used: status.swap.usedMB,
          free: status.swap.freeMB,
          percent: status.swap.usedPercent,
          exists: status.swap.exists,
        },
        pressure: status.pressure,
        canStartJob: memoryMonitor.canStartJob(),
        recommendations: status.recommendations,
        timestamp: status.timestamp,
      },
    });
  } catch (error) {
    const err = toError(error);
    logger.error('获取内存状态失败:', err);
    return res.status(500).json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/status/resources
 * 完整资源使用报告
 */
router.get('/resources', (_req: Request, res: Response) => {
  try {
    const memoryMonitor = getMemoryMonitor();
    const config = getConfig();
    const limits = getResourceLimits();
    const resourceAllocator = getResourceAllocator();
    const queueService = getQueueService();
    const usageMetricModel = getUsageMetricModel();
    const llmConfig = getSystemSettingsService().getLlmConfig();

    // 获取内存状态
    const memoryStatus = memoryMonitor.getResourceStatus();

    // 获取资源分配状态
    const resourceUsage = resourceAllocator.getCurrentUsage();
    const availableResources = resourceAllocator.getAvailableResources();

    // 获取队列状态
    const queueStatus = queueService.getQueueStatus();
    const promptTokens = usageMetricModel.getTotal('llm_prompt_tokens');
    const completionTokens = usageMetricModel.getTotal('llm_completion_tokens');
    const totalTokens = usageMetricModel.getTotal('llm_total_tokens');
    const requests = usageMetricModel.getTotal('llm_requests_total');
    const failedRequests = usageMetricModel.getTotal('llm_requests_failed');

    return res.json({
      status: 'ok',
      data: {
        // 内存信息
        memory: {
          system: {
            total: memoryStatus.memory.totalMB,
            used: memoryStatus.memory.usedMB,
            free: memoryStatus.memory.freeMB,
            percent: memoryStatus.memory.usedPercent,
          },
          node: {
            heapUsed: memoryStatus.memory.nodeHeapUsedMB,
            heapTotal: memoryStatus.memory.nodeHeapTotalMB,
            external: memoryStatus.memory.nodeExternalMB,
            rss: memoryStatus.memory.nodeRssMB,
          },
          pressure: memoryStatus.pressure,
        },
        // Swap 信息
        swap: {
          total: memoryStatus.swap.totalMB,
          used: memoryStatus.swap.usedMB,
          percent: memoryStatus.swap.usedPercent,
          exists: memoryStatus.swap.exists,
        },
        // 资源限制 (2u2g)
        limits: {
          nodeMemoryLimit: limits.nodeMemoryLimit,
          sqliteCacheSize: limits.sqliteCacheSize,
          pythonMemoryLimit: limits.pythonMemoryLimit,
          codeContextRuntimeMemoryLimit: limits.codeContextRuntimeMemoryLimit,
          workerCount: limits.workerCount,
          enableConcurrentJobs: limits.enableConcurrentJobs,
        },
        // 当前资源使用
        usage: {
          activeAgent: resourceUsage.activeAgent,
          activeJobId: resourceUsage.activeJobId,
          memoryUsedMB: resourceUsage.memoryUsedMB,
          memoryLimitMB: resourceUsage.memoryLimitMB,
          memoryUsagePercent: resourceUsage.memoryUsagePercent,
        },
        // 可用资源
        available: {
          cpuCores: availableResources.cpuCores,
          memoryMB: availableResources.memoryMB,
          canStartContextAgent: availableResources.canStartContextAgent,
          canStartReviewExecution: availableResources.canStartReviewExecution,
        },
        // 队列状态
        queue: {
          activeCount: queueStatus.activeCount,
          pendingCount: queueStatus.pendingCount,
          total: queueStatus.total,
        },
        // 作业统计 (前端 dashboard 需要)
        jobsProcessed: queueStatus.completedCount,
        jobsFailed: queueStatus.failedCount + queueStatus.deadCount,
        avgProcessingTime: queueStatus.avgProcessingTime / 1000, // 转换为秒
        currentMemory: {
          total: memoryStatus.memory.totalMB,
          used: memoryStatus.memory.usedMB,
          free: memoryStatus.memory.freeMB,
          percentage: memoryStatus.memory.usedPercent,
          swapTotal: memoryStatus.swap.totalMB,
          swapUsed: memoryStatus.swap.usedMB,
          swapPercentage: memoryStatus.swap.usedPercent,
        },
        peakMemory: memoryStatus.memory.usedMB,
        llm: {
          configured: llmConfig.apiKey.trim().length > 0,
          provider: llmConfig.provider,
          model: llmConfig.model,
          baseUrl: llmConfig.baseUrl,
          promptTokens,
          completionTokens,
          totalTokens,
          requests,
          failedRequests,
        },
        // 建议
        recommendations: memoryStatus.recommendations,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const err = toError(error);
    logger.error('获取资源状态失败:', err);
    return res.status(500).json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/status/config
 * 配置摘要
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = getConfig();

    // 只返回非敏感配置
    return res.json({
      status: 'ok',
      data: {
        server: {
          frontendPort: config.server.frontendPort,
          backendPort: config.server.backendPort,
          nodeOptions: config.server.nodeOptions,
        },
        database: {
          databasePath: config.database.databasePath,
          sqliteCacheSize: config.database.sqliteCacheSize,
          walMode: config.database.walMode,
        },
        jobQueue: {
          workerCount: config.jobQueue.workerCount,
          enableConcurrentJobs: config.jobQueue.enableConcurrentJobs,
          pollingInterval: config.jobQueue.pollingInterval,
        },
        agent: {
          contextAgentPort: config.agent.contextAgentPort,
          contextAgentTimeout: config.agent.contextAgentTimeout,
          pythonMemoryLimit: config.agent.pythonMemoryLimit,
        },
        codeContextRuntime: {
          engineRoot: config.codeContextRuntime.engineRoot,
          maxMemory: config.codeContextRuntime.maxMemory,
          workspaceRoot: config.codeContextRuntime.workspaceRoot,
        },
        monitoring: {
          enableSwapWarning: config.monitoring.enableSwapWarning,
          memoryWarningThreshold: config.monitoring.memoryWarningThreshold,
          memoryCriticalThreshold: config.monitoring.memoryCriticalThreshold,
        },
        logging: {
          logLevel: config.logging.logLevel,
          enableRequestLogging: config.logging.enableRequestLogging,
        },
        timezone: config.timezone,
        locale: config.locale,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = toError(error);
    logger.error('获取配置失败:', err);
    return res.status(500).json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/status/2u2g
 * 2u2g 限制检查
 */
router.get('/2u2g', (_req: Request, res: Response) => {
  try {
    const limits = getResourceLimits();
    const memoryMonitor = getMemoryMonitor();
    const memoryStatus = memoryMonitor.getResourceStatus();

    // 检查 2u2g 配置是否正确
    const checks = {
      workerCount: {
        required: 1,
        current: limits.workerCount,
        passed: limits.workerCount === 1,
      },
      concurrentJobs: {
        required: false,
        current: limits.enableConcurrentJobs,
        passed: limits.enableConcurrentJobs === false,
      },
      nodeMemoryLimit: {
        required: 200,
        current: limits.nodeMemoryLimit,
        passed: limits.nodeMemoryLimit <= 200,
      },
      sqliteCacheSize: {
        required: -2000, // 2MB
        current: limits.sqliteCacheSize,
        passed: limits.sqliteCacheSize === -2000,
      },
      pythonMemoryLimit: {
        recommended: 300,
        current: limits.pythonMemoryLimit,
        passed: limits.pythonMemoryLimit <= 300,
      },
      codeContextRuntimeMemoryLimit: {
        recommended: 512,
        current: limits.codeContextRuntimeMemoryLimit,
        passed: limits.codeContextRuntimeMemoryLimit <= 512,
      },
    };

    // 计算总体通过状态
    const allPassed = Object.values(checks).every(c => c.passed);

    // 内存压力评估
    const memoryPressureOk = memoryStatus.pressure !== MemoryPressure.CRITICAL;

    return res.json({
      status: 'ok',
      data: {
        compliant: allPassed && memoryPressureOk,
        checks,
        memory: {
          pressure: memoryStatus.pressure,
          usedPercent: memoryStatus.memory.usedPercent,
          swapExists: memoryStatus.swap.exists,
          swapPercent: memoryStatus.swap.usedPercent,
        },
        warnings: memoryStatus.recommendations,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const err = toError(error);
    logger.error('2u2g 检查失败:', err);
    return res.status(500).json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/status/memory/cleanup
 * 执行内存清理
 */
router.post('/memory/cleanup', async (_req: Request, res: Response) => {
  try {
    const memoryMonitor = getMemoryMonitor();
    const result = await memoryMonitor.performMemoryCleanup();

    return res.json({
      status: 'ok',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = toError(error);
    logger.error('内存清理失败:', err);
    return res.status(500).json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
