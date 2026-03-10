/**
 * PR 代码审查 Worker
 *
 * 负责：
 * - 轮询作业队列
 * - 执行完整的 PR 分析流程（克隆、上下文收集、代码审查）
 * - 存储分析结果
 * - 发布审查评论到平台
 * - 清理工作区
 *
 * 注意：这是 Worker 的框架实现，实际的 Agent 交互逻辑待集成
 */

import { getQueueService } from './QueueService';
import { logger } from '../utils/logger';
import { getReviewExecutionService } from '../services/ReviewExecutionService';

/**
 * 工作区根目录
 */
const WORKSPACE_ROOT = '/tmp/repos';

/**
 * Worker 配置
 */
interface WorkerConfig {
  workspaceRoot?: string;
  maxConcurrentJobs?: number;
}

/**
 * PR 代码审查 Worker（简化版本）
 */
export class CodeReviewWorker {
  private queueService = getQueueService();
  private reviewExecutionService = getReviewExecutionService();
  private isRunning = false;
  private processingJobId: number | null = null;

  constructor(private config: WorkerConfig) {}

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️ Worker 已经在运行');
      return;
    }

    logger.info('🚀 启动 PR 代码审查 Worker');
    this.isRunning = true;

    // 开始处理作业
    this.processingLoop();
  }

  /**
   * 停止 Worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('⏹️ 停止 Worker...');
    this.isRunning = false;

    logger.info('✅ Worker 已停止');
  }

  /**
   * 作业处理循环
   */
  private processingLoop(): void {
    const interval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }

      // 如果已有作业在处理，跳过
      if (this.processingJobId) {
        return;
      }

      // 获取下一个作业
      const job = this.queueService.getNextJob();

      if (job) {
        logger.info(`📝 拾取作业 #${job.id}: ${job.type}`);
        this.processingJobId = job.id;

        // 处理作业（简化版本）
        this.processJob(job.id, job.type, job.payload)
          .finally(() => {
            this.processingJobId = null;
          });
      }
    }, 2000); // 每 2 秒轮询一次

    logger.info(`🔄 Worker 轮询已启动（间隔: 2000ms）`);
  }

  /**
   * 处理单个作业（简化框架）
   */
  private async processJob(
    jobId: number,
    jobType: string,
    payload: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info(`📋 作业 #${jobId} 处理中...`);
      await this.reviewExecutionService.execute(jobId, payload);
      this.queueService.completeJob(jobId);
      logger.info(`✅ 作业 #${jobId} 完成 (耗时: ${Math.round((Date.now() - startTime) / 1000)}s)`);
    } catch (error) {
      if ((error as Error).name === 'ReviewCancelledError') {
        await this.reviewExecutionService.markCancelled(jobId, payload, (error as Error).message);
        this.queueService.failJob(jobId, (error as Error).message);
        logger.warn(`🛑 作业 #${jobId} 已终止`);
        return;
      }

      await this.reviewExecutionService.markFailed(jobId, payload, (error as Error).message);
      logger.error(`❌ 作业 #${jobId} 处理失败: ${error}`);
      this.queueService.failJob(jobId, (error as Error).message);
    }
  }

  /**
   * 获取 Worker 状态
   */
  getStatus(): {
    isRunning: boolean;
    processingJobId: number | null;
  } {
    return {
      isRunning: this.isRunning,
      processingJobId: this.processingJobId,
    };
  }
}
