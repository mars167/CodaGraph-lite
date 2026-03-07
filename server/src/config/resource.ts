/**
 * 2u2g 资源配置
 *
 * 定义 CodaGraph 在 2 cores / 2GB RAM 服务器上的资源限制
 * 和并发策略
 */

import { logger } from '../utils/logger';

/**
 * Agent 类型
 */
export enum AgentType {
  CONTEXT = 'context-agent',
  REVIEW = 'review-agent',
}

/**
 * 作业优先级
 */
export enum JobPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

/**
 * 优先级权重（数值越小优先级越高）
 */
export const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
  [JobPriority.CRITICAL]: 0,
  [JobPriority.HIGH]: 1,
  [JobPriority.NORMAL]: 2,
  [JobPriority.LOW]: 3,
};

/**
 * 资源使用状态
 */
export interface ResourceUsage {
  activeAgent: AgentType | null;
  activeJobId: string | null;
  memoryUsedMB: number;
  memoryLimitMB: number;
  memoryUsagePercent: number;
}

/**
 * 资源分配器接口
 */
export interface ResourceAllocator {
  /**
   * 检查是否有足够资源启动 agent
   */
  canStartAgent(type: AgentType): boolean;

  /**
   * 保留资源（启动 agent 时）
   */
  reserveResources(type: AgentType, jobId: string): void;

  /**
   * 释放资源（agent 完成时）
   */
  releaseResources(type: AgentType): void;

  /**
   * 获取当前资源使用
   */
  getCurrentUsage(): ResourceUsage;

  /**
   * 获取可用资源
   */
  getAvailableResources(): AvailableResources;
}

/**
 * 可用资源信息
 */
export interface AvailableResources {
  cpuCores: number;
  memoryMB: number;
  canStartContextAgent: boolean;
  canStartReviewAgent: boolean;
}

/**
 * 资源配置
 */
export const RESOURCE_CONFIG = {
  // 并发控制
  workerCount: 1,                  // 单并发强制
  maxConcurrentAgents: 1,            // 同时最多 1 个 agent

  // 内存限制 (MB)
  nodeMemoryLimit: 512,              // Node.js 监控阈值
  pythonMemoryLimit: 512,             // Python 进程内存限制
  gitAiMemoryLimit: 512,             // git-ai CLI 内存限制

  // 超时 (ms)
  contextAgentTimeout: 300000,         // Context Agent 5 分钟
  reviewAgentTimeout: 600000,          // Review Agent 10 分钟
  grpcRequestTimeout: 60000,           // gRPC 请求 60 秒
  killGracePeriod: 5000,              // 5 秒优雅关闭

  // 缓存配置
  enableCache: true,
  cacheTtl: 300000,                  // 缓存 5 分钟
  maxCacheEntries: 100,               // 最多缓存 100 条

  // 批处理配置
  batchSize: 5,                       // 每批 5 个文件
  parallelFiles: 3,                    // 单 agent 内并行 3 个文件

  // 重试配置
  maxRetries: 3,
  retryBaseDelay: 2000,               // 2 秒
  retryBackoffMultiplier: 2,

  // 监控配置
  healthCheckInterval: 30000,           // 30 秒
  zombieCheckInterval: 30000,           // 30 秒
  memoryCheckInterval: 30000,           // 30 秒

  // 告警阈值
  memoryWarningThreshold: 90,            // 90%
  memoryCriticalThreshold: 95,          // 95%

} as const;

/**
 * 资源分配器实现
 */
export class ResourceAllocator implements ResourceAllocator {
  private activeAgent: AgentType | null = null;
  private activeJobId: string | null = null;

  constructor() {
    logger.info(`🏗 资源分配器初始化`);
    logger.info(`   2u2g 限制: 2 cores, 2GB RAM`);
    logger.info(`   Worker 数量: ${RESOURCE_CONFIG.workerCount}`);
    logger.info(`   最大并发 Agents: ${RESOURCE_CONFIG.maxConcurrentAgents}`);
  }

  /**
   * 检查是否有足够资源启动 agent
   */
  canStartAgent(type: AgentType): boolean {
    // 2u2g 单并发检查
    if (this.activeAgent !== null) {
      logger.warn(
        `资源不足: 已有 ${this.activeAgent} 在运行，无法启动 ${type}`
      );
      return false;
    }

    // 检查 Node.js 内存
    const nodeUsage = process.memoryUsage();
    const nodeMemoryMB = nodeUsage.heapUsed / 1024 / 1024;

    if (nodeMemoryMB > RESOURCE_CONFIG.nodeMemoryLimit * 0.9) {
      logger.warn(`Node.js 内存过高: ${nodeMemoryMB}MB`);
      return false;
    }

    return true;
  }

  /**
   * 保留资源（启动 agent 时）
   */
  reserveResources(type: AgentType, jobId: string): void {
    if (!this.canStartAgent(type)) {
      throw new Error(`无法为 ${type} 保留资源`);
    }

    this.activeAgent = type;
    this.activeJobId = jobId;

    logger.info(`🔒 资源已保留`);
    logger.info(`   Agent: ${type}`);
    logger.info(`   作业: ${jobId}`);

    // 启动资源监控
    this.startMonitoring();
  }

  /**
   * 释放资源（agent 完成时）
   */
  releaseResources(type: AgentType): void {
    if (this.activeAgent !== type) {
      logger.warn(`尝试释放未保留的资源: ${type}`);
      return;
    }

    logger.info(`🔓 资源已释放`);
    logger.info(`   Agent: ${type}`);
    logger.info(`   作业: ${this.activeJobId}`);

    this.activeAgent = null;
    this.activeJobId = null;
  }

  /**
   * 获取当前资源使用
   */
  getCurrentUsage(): ResourceUsage {
    const nodeUsage = process.memoryUsage();
    const nodeMemoryMB = nodeUsage.heapUsed / 1024 / 1024;

    // 根据 agent 类型确定内存限制
    const memoryLimitMB = this.activeAgent
      ? (this.activeAgent === AgentType.CONTEXT
          ? RESOURCE_CONFIG.pythonMemoryLimit
          : RESOURCE_CONFIG.pythonMemoryLimit)
      : 0;

    return {
      activeAgent: this.activeAgent,
      activeJobId: this.activeJobId,
      memoryUsedMB: nodeMemoryMB,
      memoryLimitMB,
      memoryUsagePercent: memoryLimitMB > 0
        ? (nodeMemoryMB / memoryLimitMB) * 100
        : 0,
    };
  }

  /**
   * 获取可用资源
   */
  getAvailableResources(): AvailableResources {
    const nodeUsage = process.memoryUsage();
    const nodeMemoryMB = nodeUsage.heapUsed / 1024 / 1024;
    const availableMemoryMB = RESOURCE_CONFIG.nodeMemoryLimit - nodeMemoryMB;

    return {
      cpuCores: RESOURCE_CONFIG.workerCount,
      memoryMB: availableMemoryMB,
      canStartContextAgent: this.canStartAgent(AgentType.CONTEXT),
      canStartReviewAgent: this.canStartAgent(AgentType.REVIEW),
    };
  }

  /**
   * 启动资源监控
   */
  private startMonitoring(): void {
    // 清理之前的监控定时器（如果有）
    this.stopMonitoring();

    // 内存监控
    const memoryInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, RESOURCE_CONFIG.memoryCheckInterval);

    // 保存 interval 以便清理
    (this as any).memoryCheckInterval = memoryInterval;
  }

  /**
   * 停止资源监控
   */
  private stopMonitoring(): void {
    const memoryInterval = (this as any).memoryCheckInterval;
    if (memoryInterval) {
      clearInterval(memoryInterval);
      (this as any).memoryCheckInterval = null;
    }
  }

  /**
   * 检查内存使用
   */
  private checkMemoryUsage(): void {
    const usage = this.getCurrentUsage();

    if (usage.memoryUsagePercent >= RESOURCE_CONFIG.memoryCriticalThreshold) {
      logger.error(
        `🚨 内存危急: ${usage.memoryUsedMB}MB/${usage.memoryLimitMB}MB ` +
        `(${Math.round(usage.memoryUsagePercent)}%)`
      );
    } else if (usage.memoryUsagePercent >= RESOURCE_CONFIG.memoryWarningThreshold) {
      logger.warn(
        `⚠️  内存警告: ${usage.memoryUsedMB}MB/${usage.memoryLimitMB}MB ` +
        `(${Math.round(usage.memoryUsagePercent)}%)`
      );
    }
  }
}

/**
 * 资源分配器单例
 */
let resourceAllocatorInstance: ResourceAllocator | null = null;

export function getResourceAllocator(): ResourceAllocator {
  if (!resourceAllocatorInstance) {
    resourceAllocatorInstance = new ResourceAllocator();
  }
  return resourceAllocatorInstance;
}

export function resetResourceAllocator(): void {
  if (resourceAllocatorInstance) {
    resourceAllocatorInstance = null;
  }
}
