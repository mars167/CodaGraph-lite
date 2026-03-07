/**
 * OAuth 与作业队列集成
 *
 * 将 OAuth Webhook 事件集成到作业队列系统
 */

import type { Request, Response } from 'express';
import { getAnalysisModel } from '../models/Analysis';
import { getJobModel } from '../models/Job';
import { getRepositoryModel } from '../models/Repository';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import type { Platform } from '../models/types';
import type {
  WebhookEventType,
  UnifiedWebhookPayload,
} from '../webhook/validator';
import {
  extractRepositoryInfo,
  extractPullRequestInfo,
  parseWebhookEventType,
} from '../webhook/validator';
import { shouldProcessEvent } from '../webhook/handlers';
import { getReviewTriggerService } from '../services/ReviewTriggerService';

/**
 * Webhook 到作业队列的集成选项
 */
export interface OAuthQueueIntegrationOptions {
  platform: Platform;
  secret: string;
  webhookBaseUrl: string;
}

/**
 * 作业负载类型
 */
export interface WebhookJobPayload {
  platform: Platform;
  owner: string;
  repo: string;
  fullName: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  baseCommit: string;
  headCommit: string;
  installationId: number;
  action: 'opened' | 'synchronize' | 'reopened' | 'update';
  eventType: WebhookEventType;
  receivedAt: string;
}

/**
 * 创建分析任务
 *
 * 从 Webhook 事件创建分析任务并提交到作业队列
 */
export async function createAnalysisJobFromWebhook(
  platform: Platform,
  eventType: WebhookEventType,
  payload: UnifiedWebhookPayload,
  action: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _webhookBaseUrl: string
): Promise<{ success: boolean; jobId?: number; error?: string }> {
  try {
    // 提取仓库和 PR 信息
    const repositoryInfo = extractRepositoryInfo(payload, platform);
    const prInfo = extractPullRequestInfo(payload, platform);

    if (!repositoryInfo || !prInfo) {
      return {
        success: false,
        error: '无法从 Webhook payload 中提取必要信息',
      };
    }

    // 获取 OAuth 安装
    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findByPlatformAndAccount(
      platform,
      // TODO: 需要从 payload 中获取 account_id
      repositoryInfo.owner
    );

    if (!installation) {
      return {
        success: false,
        error: '未找到对应的 OAuth 安装',
      };
    }

    // 获取仓库记录
    const repositoryModel = getRepositoryModel();
    let repository = repositoryModel.findByPlatformOwnerName(
      platform,
      repositoryInfo.owner,
      repositoryInfo.repo
    );

    if (!repository) {
      // 如果仓库不存在，创建它
      const createDto = {
        platform,
        owner: repositoryInfo.owner,
        name: repositoryInfo.repo,
        full_name: repositoryInfo.fullName,
        installation_id: installation.id,
        is_active: true,
      };
      repositoryModel.create(createDto);
      repository = repositoryModel.findByPlatformOwnerName(
        platform,
        repositoryInfo.owner,
        repositoryInfo.repo
      );
      console.log(`📦 创建仓库记录: ${repositoryInfo.fullName}`);
    }

    if (!repository) {
      return {
        success: false,
        error: '创建或读取仓库记录失败',
      };
    }

    // 检查是否应该处理该事件
    if (!shouldProcessEvent(eventType, action)) {
      return {
        success: false,
        error: `事件 ${String(eventType)}:${action} 不需要处理`,
      };
    }

    const result = await getReviewTriggerService().triggerForRepository(repository, prInfo.number, {
      source: 'webhook',
      priority: calculateJobPriority(action, platform),
      force: false,
    });

    console.log(
      `📝 Webhook 触发分析作业: ${repositoryInfo.fullName}#${prInfo.number} (${action})`
    );

    return {
      success: true,
      jobId: result.jobId || undefined,
    };
  } catch (error) {
    console.error('创建分析作业失败:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 计算作业优先级
 *
 * 根据事件类型和平台计算作业优先级
 */
function calculateJobPriority(
  action: string,
  platform: Platform
): number {
  let priority = 5; // 默认优先级

  // 新打开的 PR 优先级最高
  if (action === 'opened') {
    priority = 1;
  }

  // 重新打开的 PR 次高优先级
  if (action === 'reopened') {
    priority = 2;
  }

  // 同步/更新的 PR 次高优先级
  if (action === 'synchronize' || action === 'update') {
    priority = 3;
  }

  // 某些平台可能有特殊优先级
  if (platform === 'github') {
    priority -= 0.5; // GitHub 稍微优先
  }

  // 确保优先级在有效范围内 (1-10)
  return Math.max(1, Math.min(10, Math.round(priority)));
}

function normalizeJobAction(
  action: string
): WebhookJobPayload['action'] {
  if (action === 'opened' || action === 'synchronize' || action === 'reopened' || action === 'update') {
    return action;
  }
  return 'opened';
}

/**
 * 处理 Webhook 事件并提交作业到队列
 */
export async function handleWebhookAndSubmitJob(
  req: Request,
  res: Response,
  options: OAuthQueueIntegrationOptions
): Promise<void> {
  try {
    // 解析事件类型
    const eventTypeStr = req.headers['x-github-event'] as string ||
                           req.headers['x-gitee-event'] as string ||
                           req.headers['x-gitlab-event'] as string ||
                           '';

    const eventType = parseWebhookEventType(eventTypeStr, options.platform);

    if (!eventType) {
      console.warn(`⚠️ 未知的事件类型: ${eventTypeStr}`);
      res.status(400).json({ error: '未知的事件类型' });
      return;
    }

    // 提取 action
    const action = (req.body as any).action || (req.body as any).object_attributes?.action || 'opened';

    // 验证是否应该处理该事件
    if (!shouldProcessEvent(eventType, action)) {
      console.log(`📝 事件无需处理: ${eventType}:${action}`);
      res.status(200).json({ message: '事件已接收，无需处理' });
      return;
    }

    // 创建作业
    const result = await createAnalysisJobFromWebhook(
      options.platform,
      eventType,
      req.body as UnifiedWebhookPayload,
      action,
      options.webhookBaseUrl
    );

    if (!result.success) {
      console.error(`❌ 创建作业失败: ${result.error}`);
      res.status(500).json({ error: result.error });
      return;
    }

    // 返回成功响应
    res.status(202).json({
      success: true,
      message: '分析任务已创建',
      jobId: result.jobId,
    });

    console.log(`✅ Webhook 处理成功: ${options.platform} - 作业 ID ${result.jobId}`);
  } catch (error) {
    console.error('Webhook 处理失败:', error);
    res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
}

/**
 * 检查作业队列状态
 */
export interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  dead: number;
  total: number;
}

export function getQueueStatus(): QueueStatus {
  const jobModel = getJobModel();
  const jobs = jobModel.findAll();

  const status: QueueStatus = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    dead: 0,
    total: jobs.length,
  };

  for (const job of jobs) {
    status[job.status]++;
  }

  return status;
}

/**
 * 获取作业统计信息
 */
export function getJobStatistics() {
  const jobModel = getJobModel();
  const repositoryModel = getRepositoryModel();
  const analysisModel = getAnalysisModel();

  const jobs = jobModel.findAll();
  const repositories = repositoryModel.findAll();
  const analyses = analysisModel.findAll();

  // 按类型统计
  const byType = {
    pr_analysis: 0,
    context_analysis: 0,
    code_review: 0,
  };

  for (const job of jobs) {
    byType[job.type]++;
  }

  // 按状态统计
  const byStatus = {
    pending: jobs.filter((j) => j.status === 'pending').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    cancelled: jobs.filter((j) => j.status === 'cancelled').length,
    dead: jobs.filter((j) => j.status === 'dead').length,
  };

  return {
    total: jobs.length,
    byType,
    byStatus,
    repositories: repositories.length,
    analyses: analyses.length,
    successRate: byStatus.completed > 0
      ? (byStatus.completed / (byStatus.completed + byStatus.failed)) * 100
      : 0,
  };
}

/**
 * 重试失败的任务
 */
export function retryFailedJobs(maxRetries = 3): { retried: number; skipped: number } {
  const jobModel = getJobModel();
  const failedJobs = jobModel.findAll().filter(
    (j) => j.status === 'failed' && j.attempts < maxRetries
  );

  let retried = 0;
  let skipped = 0;

  for (const job of failedJobs) {
    const payload = JSON.parse(job.payload) as WebhookJobPayload;

    // 重新提交任务
    jobModel.create(job.type, payload as any, job.priority);

    // 标记原任务为已重试
    jobModel.incrementAttempts(job.id);

    retried++;
  }

  console.log(`🔄 重试失败任务: ${retried} 个`);

  return { retried, skipped: failedJobs.length - retried };
}

/**
 * 清理死信队列
 */
export function cleanupDeadQueue(): number {
  const jobModel = getJobModel();

  // 删除所有死信任务
  const deadJobs = jobModel.findAll().filter((j) => j.status === 'dead');

  let deleted = 0;
  for (const job of deadJobs) {
    if (jobModel.delete(job.id)) {
      deleted++;
    }
  }

  console.log(`🧹 清理死信队列: ${deleted} 个任务`);

  return deleted;
}

/**
 * 获取平台作业统计
 */
export function getPlatformJobStats(): Record<Platform, QueueStatus> {
  const jobModel = getJobModel();
  const jobs = jobModel.findAll();

  const stats: Record<Platform, QueueStatus> = {
    github: { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, dead: 0, total: 0 },
    gitee: { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, dead: 0, total: 0 },
    gitlab: { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, dead: 0, total: 0 },
  };

  for (const job of jobs) {
    try {
      const payload = JSON.parse(job.payload) as WebhookJobPayload;
      const platform = payload.platform;

      if (platform && stats[platform]) {
        stats[platform].total++;
        stats[platform][job.status]++;
      }
    } catch {
      // 忽略无法解析的 payload
    }
  }

  return stats;
}
