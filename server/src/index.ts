/**
 * 主入口文件
 *
 * 初始化并启动所有服务
 *
 * 2u2g 关键：
 * - 配置验证
 * - 内存监控启动
 * - 资源状态 API
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger';
import { getQueueService } from './jobs/QueueService';
import { CodeReviewWorker } from './jobs/CodeReviewWorker';
import { initializeDatabase } from './database';
import jobRoutes from './routes/jobRoutes';
import webhookRoutes from './routes/webhookRoutes';
import authRoutes from './auth/routes';
import statusRoutes from './routes/statusRoutes';
import oauthRoutes from './oauth/routes';
import repositoryRoutes from './routes/repositoryRoutes';
import analysisRoutes from './routes/analysisRoutes';
import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import { getConfig, printConfigSummary, ConfigurationError } from './config';
import { getMemoryMonitor } from './config/memory';
import { getResourceAllocator } from './config/resource';
import { RepositoryWatchService } from './services/RepositoryWatchService';

// 加载环境变量
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];
const envPath = envCandidates.find(p => fs.existsSync(p));
dotenv.config(envPath ? { path: envPath } : undefined);

async function main() {
  try {
    // ============================================
    // 1. 配置加载和验证
    // ============================================
    logger.info('============================================');
    logger.info('  CodaGraph-lite Backend');
    logger.info('  2u2g 优化版本');
    logger.info('============================================');

    // 加载配置（包含 2u2g 验证）
    let config;
    try {
      config = getConfig();
      printConfigSummary();
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error(`❌ 配置错误: ${error.message}`);
        logger.error('请检查 .env 文件并确保 2u2g 配置正确');
        process.exit(1);
      }
      throw error;
    }

    // ============================================
    // 2. 数据库初始化
    // ============================================
    await initializeDatabase();
    logger.info('✅ 数据库初始化完成');

    // ============================================
    // 3. 资源管理初始化
    // ============================================
    const memoryMonitor = getMemoryMonitor();
    getResourceAllocator();

    // 启动内存监控
    memoryMonitor.startMonitoring(config.monitoring.memoryCheckInterval);
    logger.info('✅ 内存监控已启动');

    // 记录初始内存状态
    memoryMonitor.logMemoryUsage('启动');

    // 启动后台作业 worker，消费 pending 队列任务
    const reviewWorker = new CodeReviewWorker({
      contextAgentHost: config.agent.contextAgentHost,
      contextAgentPort: config.agent.contextAgentPort,
      reviewAgentHost: config.agent.reviewAgentHost,
      reviewAgentPort: config.agent.reviewAgentPort,
      workspaceRoot: config.gitAi.workspaceRoot,
      maxConcurrentJobs: config.jobQueue.workerCount,
    });
    await reviewWorker.start();
    logger.info('✅ PR Review Worker 已启动');

    const repositoryWatchService = new RepositoryWatchService({
      intervalMs: 60_000,
    });
    await repositoryWatchService.start();
    logger.info('✅ Repository Watcher 已启动');

    // ============================================
    // 4. 启动 Express 服务器
    // ============================================
    const express = await import('express');
    const app = express.default();
    const PORT = config.server.backendPort;
    const corsOptions: CorsOptions = {
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (config.cors.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS 不允许的源: ${origin}`));
      },
      credentials: true,
      methods: config.cors.corsMethods,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Timestamp', 'X-Request-Id'],
    };

    // 基础中间件
    app.use(cors(corsOptions));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use((req, res, next) => {
      const requestTimestamp = typeof req.headers['x-request-timestamp'] === 'string'
        ? req.headers['x-request-timestamp']
        : new Date().toISOString();
      const requestId = typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = Date.now();

      res.setHeader('X-Request-Timestamp', requestTimestamp);
      res.setHeader('X-Request-Id', requestId);

      logger.info(`[REQ] ${requestId} ${requestTimestamp} ${req.method} ${req.originalUrl}`);

      res.on('finish', () => {
        logger.info(
          `[RES] ${requestId} ${requestTimestamp} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`
        );
      });

      next();
    });

    // ============================================
    // 5. 路由注册
    // ============================================
    // 认证路由
    app.use('/api/auth', authRoutes);

    // 作业队列路由
    app.use('/api/jobs', jobRoutes);

    // 仓库路由
    app.use('/api/repositories', repositoryRoutes);

    // 分析路由
    app.use('/api/analyses', analysisRoutes);

    // Webhook 路由
    app.use('/webhook', webhookRoutes);

    // 状态监控路由（新增）
    app.use('/api/status', statusRoutes);

    // OAuth 路由
    app.use('/api/oauth', oauthRoutes);

    // ============================================
    // 6. 健康检查
    // ============================================
    app.get('/health', (_req, res) => {
      const memoryStatus = memoryMonitor.canStartJob();

      res.json({
        status: memoryStatus.canStart ? 'ok' : 'degraded',
        service: 'CodaGraph-lite Backend',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      });
    });

    // ============================================
    // 7. 优雅关闭
    // ============================================
    const gracefulShutdown = async (signal: string) => {
      logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

      // 停止内存监控
      memoryMonitor.stopMonitoring();

      // 停止后台 worker
      await reviewWorker.stop();
      await repositoryWatchService.stop();

      // 停止作业队列
      const queueService = getQueueService();
      queueService.stop();

      logger.info('✅ 服务已关闭');
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // ============================================
    // 8. 启动服务器
    // ============================================
    app.listen(PORT, () => {
      logger.info(`✅ Express 服务器已启动在端口 ${PORT}`);
      logger.info('');
      logger.info('API 端点:');
      logger.info('  - GET  /health              健康检查');
      logger.info('  - GET  /api/status/memory   内存状态');
      logger.info('  - GET  /api/status/resources 资源报告');
      logger.info('  - GET  /api/status/2u2g     2u2g 检查');
      logger.info('');
    });

  } catch (error) {
    logger.error('❌ 启动失败:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

main();
