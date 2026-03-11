/**
 * 作业队列服务
 *
 * 负责：
 * - 作业创建和验证
 * - 作业分配（单并发）
 * - 作业状态管理
 */

import { getJobModel } from '../models/Job';
import { getJobLogModel } from '../models/JobLog';
import { getAnalysisModel } from '../models/Analysis';
import { getAnalysisJobModel } from '../models/AnalysisJob';
import type { JobType, QueueJobStatus, JobPayload } from '../models/types';
import { sanitizeSensitiveText } from '../utils/redactSensitive';

export interface QueueServiceConfig {
  maxConcurrentJobs?: number; // 最大并发作业数（2u2g: 1）
  pollingIntervalMs?: number; // 轮询间隔（默认 2000ms）
  enableAutoRetry?: boolean; // 是否启用自动重试
}

/**
 * 作业队列服务
 */
export class QueueService {
  private jobModel = getJobModel();
  private jobLogModel = getJobLogModel();
  private analysisModel = getAnalysisModel();
  private analysisJobModel = getAnalysisJobModel();
  private config: Required<QueueServiceConfig>;
  private activeJobs: Set<number> = new Set();
  private cancellationRequests: Set<number> = new Set();
  private isRunning = false;
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor(config: QueueServiceConfig = {}) {
    this.config = {
      maxConcurrentJobs: config.maxConcurrentJobs ?? 1,
      pollingIntervalMs: config.pollingIntervalMs ?? 2000,
      enableAutoRetry: config.enableAutoRetry ?? true,
    };
  }

  async createJob(
    type: JobType,
    payload: JobPayload,
    priority: number = 5
  ): Promise<{ id: number; error?: string }> {
    if (this.config.maxConcurrentJobs === 1 && this.activeJobs.size > 0) {
      return {
        id: 0,
        error: '系统仅支持单并发作业',
      };
    }

    const validTypes: JobType[] = ['pr_analysis', 'context_analysis', 'code_review'];
    if (!validTypes.includes(type)) {
      return {
        id: 0,
        error: `无效的作业类型: ${type}`,
      };
    }

    if (!payload || !payload.platform || !payload.repo_name || !payload.pr_number) {
      return {
        id: 0,
        error: '缺少必要的 payload 字段',
      };
    }

    if (priority < 1 || priority > 10) {
      return {
        id: 0,
        error: '优先级必须在 1-10 之间',
      };
    }

    const job = this.jobModel.create(type, payload, priority);
    this.jobLogModel.create(
      job.id,
      'info',
      `作业已创建，类型=${type}，优先级=${priority}，PR=${payload.repo_name}#${payload.pr_number}`
    );
    console.log(`📝 创建作业 #${job.id}: ${type} (优先级: ${priority})`);
    return { id: job.id };
  }

  private parsePayload(rawPayload: string): Partial<JobPayload> {
    try {
      return JSON.parse(rawPayload) as Partial<JobPayload>;
    } catch {
      return {};
    }
  }

  recoverInterruptedJobs(): { recoveredCount: number; recoveredJobIds: number[] } {
    const processingJobs = this.jobModel.findProcessing();
    const recoveredJobIds: number[] = [];

    for (const job of processingJobs) {
      const payload = this.parsePayload(job.payload);
      const analysisId = typeof payload.analysis_id === 'string'
        ? parseInt(payload.analysis_id, 10)
        : typeof payload.analysis_id === 'number'
          ? payload.analysis_id
          : NaN;
      const analysisJobId = typeof payload.analysis_job_id === 'string'
        ? parseInt(payload.analysis_job_id, 10)
        : typeof payload.analysis_job_id === 'number'
          ? payload.analysis_job_id
          : NaN;

      this.jobModel.markPending(job.id);

      if (!Number.isNaN(analysisId)) {
        this.analysisModel.markPending(analysisId);
      }

      if (!Number.isNaN(analysisJobId)) {
        this.analysisJobModel.markPending(analysisJobId);
      }

      this.activeJobs.delete(job.id);
      this.cancellationRequests.delete(job.id);
      this.jobLogModel.create(job.id, 'warn', '检测到服务重启或进程退出，作业已自动恢复为待处理状态');
      recoveredJobIds.push(job.id);
    }

    if (recoveredJobIds.length > 0) {
      console.warn(`🔄 已恢复中断作业: ${recoveredJobIds.join(', ')}`);
    }

    return {
      recoveredCount: recoveredJobIds.length,
      recoveredJobIds,
    };
  }

  getNextJob(): { id: number; type: JobType; payload: string } | null {
    if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
      return null;
    }

    const job = this.jobModel.findNext();
    if (!job) {
      return null;
    }

    const processingJob = this.jobModel.markProcessing(job.id);
    if (!processingJob) {
      return null;
    }

    this.activeJobs.add(job.id);
    this.jobLogModel.create(job.id, 'info', '作业已被 worker 拾取，开始处理');

    const payloadObj = JSON.parse(processingJob.payload);
    return {
      id: processingJob.id,
      type: processingJob.type as JobType,
      payload: processingJob.payload,
    };
  }

  completeJob(id: number): boolean {
    if (!this.activeJobs.has(id)) {
      console.warn(`⚠️ 作业 #${id} 不在活动集合中`);
      return false;
    }

    const currentJob = this.jobModel.findById(id);
    if (currentJob?.status === 'cancelled') {
      this.activeJobs.delete(id);
      this.cancellationRequests.delete(id);
      this.jobLogModel.create(id, 'warn', '作业已终止，跳过完成状态写入');
      return true;
    }

    this.jobModel.markComplete(id);
    this.activeJobs.delete(id);
    this.cancellationRequests.delete(id);
    this.jobLogModel.create(id, 'info', '作业处理完成');

    console.log(`✅ 作业 #${id} 完成`);
    return true;
  }

  failJob(id: number, errorMessage: string): boolean {
    const sanitizedError = sanitizeSensitiveText(errorMessage);
    if (!this.activeJobs.has(id)) {
      console.warn(`⚠️ 作业 #${id} 不在活动集合中`);
      return false;
    }

    const currentJob = this.jobModel.findById(id);
    if (currentJob?.status === 'cancelled') {
      this.activeJobs.delete(id);
      this.cancellationRequests.delete(id);
      this.jobLogModel.create(id, 'warn', `作业终止完成: ${sanitizedError}`);
      return true;
    }

    this.jobModel.markFailed(id, sanitizedError);
    this.activeJobs.delete(id);
    this.cancellationRequests.delete(id);
    this.jobLogModel.create(id, 'error', `作业处理失败: ${sanitizedError}`);

    console.error(`❌ 作业 #${id} 失败: ${sanitizedError}`);
    return true;
  }

  moveToDeadLetterQueue(id: number): boolean {
    const job = this.jobModel.markDead(id);
    if (!job) {
      return false;
    }

    this.activeJobs.delete(id);
    this.jobLogModel.create(id, 'warn', '作业已移入死信队列');

    console.warn(`💀 作业 #${id} 已移入死信队列`);
    return true;
  }

  requeueDeadJob(id: number): boolean {
    const job = this.jobModel.findById(id);
    if (!job || job.status !== 'dead') {
      return false;
    }

    const updated = this.jobModel.update(id, { status: 'pending' as QueueJobStatus });
    if (updated) {
      this.jobLogModel.create(id, 'info', '死信作业已重新入队');
      console.log(`🔄 重新排队死信作业 #${id}`);
      return true;
    }

    return false;
  }

  cancelJob(id: number): boolean {
    const job = this.jobModel.findById(id);
    if (!job) {
      return false;
    }

    if (job.status === 'pending') {
      const updated = this.jobModel.markCancelled(id, '作业已取消');
      if (updated) {
        this.jobLogModel.create(id, 'warn', '作业在排队阶段被取消');
        console.log(`❌ 作业 #${id} 已取消`);
        return true;
      }

      return false;
    }

    if (job.status === 'processing') {
      const updated = this.jobModel.markCancelled(id, '作业已手动终止');
      if (updated) {
        this.cancellationRequests.add(id);
        this.jobLogModel.create(id, 'warn', '收到手动终止请求，等待 worker 安全中断');
        console.log(`🛑 作业 #${id} 正在终止`);
        return true;
      }

      return false;
    }

    return job.status === 'cancelled';
  }

  isCancellationRequested(id: number): boolean {
    return this.cancellationRequests.has(id);
  }

  clearCancellationRequest(id: number): void {
    this.cancellationRequests.delete(id);
  }

  getJobModel() {
    return this.jobModel;
  }

  getQueueStatus() {
    const stats = this.jobModel.getQueueStats();
    return {
      activeCount: stats.processing,
      pendingCount: stats.pending,
      total: stats.total,
      completedCount: stats.completed,
      failedCount: stats.failed,
      deadCount: stats.dead,
      avgProcessingTime: stats.avgProcessingTime,
      processingJobIds: Array.from(this.activeJobs),
    };
  }

  getConfig(): Required<QueueServiceConfig> {
    return { ...this.config };
  }

  start(): void {
    if (this.isRunning) {
      console.warn('⚠️ Worker 已经在运行');
      return;
    }

    this.isRunning = true;
    this.polling();

    console.log('🚀 Worker 已启动');
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    console.log('⏹️  Worker 已停止');
  }

  private polling(): void {
    console.log(`🔄 轮询间隔: ${this.config.pollingIntervalMs}ms`);

    this.pollingTimer = setInterval(async () => {
      try {
        const job = this.getNextJob();

        if (job) {
          await this.completeJob(job.id);
        } else {
          console.log('📊 没有待处理作业');
        }
      } catch (error) {
        console.error('❌ Worker 轮询错误:', error);
      }
    }, this.config.pollingIntervalMs);
  }
}

// 单例实例
let queueServiceInstance: QueueService | null = null;

export function getQueueService(config?: QueueServiceConfig): QueueService {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService(config);
  }
  return queueServiceInstance;
}
