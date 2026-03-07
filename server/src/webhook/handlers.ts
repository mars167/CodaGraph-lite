/**
 * Webhook 处理器
 *
 * 处理来自 GitHub/Gitee/GitLab 的 Webhook 事件
 */

import type { Request, Response } from 'express';
import type { Platform } from '../models/types';
import {
  validateWebhook,
  parseWebhookEventType,
  WebhookEventType,
  extractRepositoryInfo,
  extractPullRequestInfo,
  extractCommitInfo,
  type UnifiedWebhookPayload,
} from './validator';

/**
 * Webhook 处理选项
 */
export interface WebhookHandlerOptions {
  platform: Platform;
  secret: string;
}

/**
 * Webhook 事件处理结果
 */
export interface WebhookHandlerResult {
  success: boolean;
  message?: string;
  data?: {
    eventType: WebhookEventType;
    repository?: { owner: string; repo: string; fullName: string };
    pullRequest?: { number: number; title: string; author: string; htmlUrl: string };
    commits?: { headSha: string; baseSha?: string; headRef: string; baseRef: string };
  };
}

/**
 * Webhook 事件处理回调类型
 */
export type WebhookEventHandler = (
  platform: Platform,
  eventType: WebhookEventType,
  payload: UnifiedWebhookPayload
) => Promise<void>;

/**
 * 处理 Webhook 请求
 */
export async function handleWebhookRequest(
  req: Request,
  res: Response,
  options: WebhookHandlerOptions,
  onEvent?: WebhookEventHandler
): Promise<WebhookHandlerResult> {
  try {
    // 获取原始 body（用于签名验证）
    const rawBody = req.body;

    // 验证签名
    const validation = validateWebhook(
      req,
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
      options.platform,
      options.secret
    );

    if (!validation.isValid) {
      console.warn(`⚠️ Webhook 签名验证失败: ${options.platform}`);
      res.status(401).json({ error: '签名验证失败' });
      return {
        success: false,
        message: '签名验证失败',
      };
    }

    // 解析 payload
    const payload: UnifiedWebhookPayload = typeof rawBody === 'string'
      ? JSON.parse(rawBody)
      : rawBody;

    // 解析事件类型
    const eventTypeStr = validation.eventType || '';
    const eventType = parseWebhookEventType(eventTypeStr, options.platform);

    if (!eventType) {
      console.warn(`⚠️ 未知的事件类型: ${eventTypeStr}`);
      res.status(400).json({ error: '未知的事件类型' });
      return {
        success: false,
        message: '未知的事件类型',
      };
    }

    console.log(`📥 Webhook 事件: ${options.platform} - ${eventType}`);

    // 提取事件数据
    const repositoryInfo = extractRepositoryInfo(payload, options.platform);
    const prInfo = extractPullRequestInfo(payload, options.platform);
    const commitInfo = extractCommitInfo(payload, options.platform);

    // 调用事件处理回调
    if (onEvent) {
      await onEvent(options.platform, eventType, payload);
    }

    // 返回成功响应
    res.status(200).json({
      success: true,
      message: 'Webhook 处理成功',
      eventType,
    });

    return {
      success: true,
      data: {
        eventType,
        repository: repositoryInfo || undefined,
        pullRequest: prInfo || undefined,
        commits: commitInfo || undefined,
      },
    };
  } catch (error) {
    console.error('Webhook 处理错误:', error);
    res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

/**
 * 处理 Pull Request 事件
 */
export async function handlePullRequestEvent(
  platform: Platform,
  payload: UnifiedWebhookPayload,
  action: 'opened' | 'synchronized' | 'closed' | 'reopened'
): Promise<void> {
  const prInfo = extractPullRequestInfo(payload, platform);
  const repoInfo = extractRepositoryInfo(payload, platform);

  if (!prInfo || !repoInfo) {
    console.warn('⚠️ 无法提取 PR 或仓库信息');
    return;
  }

  console.log(`📋 PR ${action}: ${repoInfo.fullName}#${prInfo.number} - ${prInfo.title}`);

  // 这里可以添加业务逻辑，例如：
  // - 创建分析任务
  // - 更新数据库记录
  // - 触发代码审查流程
}

/**
 * 处理 Ping 事件
 */
export async function handlePingEvent(
  platform: Platform,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _payload: UnifiedWebhookPayload
): Promise<void> {
  console.log(`🏓 Ping 事件: ${platform}`);
  // Ping 事件通常用于验证 webhook 配置
  // 可以在这里进行一些健康检查
}

/**
 * 处理 Push 事件
 */
export async function handlePushEvent(
  platform: Platform,
  payload: UnifiedWebhookPayload
): Promise<void> {
  const repoInfo = extractRepositoryInfo(payload, platform);

  if (!repoInfo) {
    console.warn('⚠️ 无法提取仓库信息');
    return;
  }

  console.log(`📦 Push 事件: ${repoInfo.fullName}`);

  // Push 事件可能用于：
  // - 监控仓库更新
  // - 触发索引更新
  // - 缓存失效处理
}

/**
 * 创建事件处理器
 */
export function createEventHandler(
  onPullRequest?: (
    platform: Platform,
    payload: UnifiedWebhookPayload,
    action: 'opened' | 'synchronized' | 'closed' | 'reopened'
  ) => Promise<void>,
  onPing?: (platform: Platform, payload: UnifiedWebhookPayload) => Promise<void>,
  onPush?: (platform: Platform, payload: UnifiedWebhookPayload) => Promise<void>
): WebhookEventHandler {
  return async (platform: Platform, eventType: WebhookEventType, payload: UnifiedWebhookPayload) => {
    switch (eventType) {
      case WebhookEventType.PULL_REQUEST:
      case WebhookEventType.PULL_REQUEST_GITEE:
      case WebhookEventType.MERGE_REQUEST:
        // 提取 action（GitHub 和 Gitee）
        const action = (payload as any).action || (payload as any).object_attributes?.action;
        if (onPullRequest && action) {
          await onPullRequest(platform, payload, action);
        }
        break;

      case WebhookEventType.PING:
        if (onPing) {
          await onPing(platform, payload);
        }
        break;

      case WebhookEventType.PUSH:
      case WebhookEventType.PUSH_GITEE:
      case WebhookEventType.PUSH_GITLAB:
        if (onPush) {
          await onPush(platform, payload);
        }
        break;

      default:
        console.log(`📝 未处理的事件类型: ${eventType}`);
    }
  };
}

/**
 * 解析 GitHub Webhook action
 */
export function parseGitHubAction(payload: UnifiedWebhookPayload): string | null {
  const ghPayload = payload as any;
  return ghPayload.action || null;
}

/**
 * 解析 GitLab Webhook action
 */
export function parseGitLabAction(payload: UnifiedWebhookPayload): string | null {
  const glPayload = payload as any;
  return glPayload.object_attributes?.action || null;
}

/**
 * 判断是否应该处理该事件
 */
export function shouldProcessEvent(
  eventType: WebhookEventType,
  action?: string
): boolean {
  // 只处理 PR 的打开、更新、重新打开事件
  if (eventType === WebhookEventType.PULL_REQUEST ||
      eventType === WebhookEventType.PULL_REQUEST_GITEE ||
      eventType === WebhookEventType.MERGE_REQUEST) {
    return action === 'opened' ||
           action === 'synchronize' ||
           action === 'reopened' ||
           action === 'update';
  }

  // Ping 事件总是处理
  if (eventType === WebhookEventType.PING) {
    return true;
  }

  // Push 事件可以处理（如果需要）
  // return eventType === WebhookEventType.PUSH ||
  //        eventType === WebhookEventType.PUSH_GITEE ||
  //        eventType === WebhookEventType.PUSH_GITLAB;

  return false;
}
