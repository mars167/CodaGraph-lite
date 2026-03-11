/**
 * Webhook 验证器
 *
 * 验证来自 GitHub/Gitee/GitLab 的 Webhook 请求签名
 */

import crypto from 'crypto';
import type { Request } from 'express';
import type { Platform } from '../models/types';
import { parseRepositoryFullName } from '../utils/repositoryCoordinates';

/**
 * Webhook 验证结果
 */
export interface WebhookValidationResult {
  isValid: boolean;
  platform: Platform;
  signature?: string;
  deliveryId?: string;
  eventType?: string;
}

/**
 * 验证 GitHub Webhook 签名
 *
 * GitHub 使用 HMAC-SHA256 签名，签名放在 X-Hub-Signature-256 头中
 * 格式: sha256=<hex_digest>
 */
export function validateGitHubWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // GitHub 签名格式: sha256=<hex_digest>
  const expectedPrefix = 'sha256=';
  if (!signature.startsWith(expectedPrefix)) {
    console.warn('⚠️ GitHub 签名格式错误');
    return false;
  }

  const receivedHash = signature.substring(expectedPrefix.length);
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  const receivedBuffer = Buffer.from(receivedHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) {
    console.warn('⚠️ GitHub Webhook 签名长度不匹配');
    return false;
  }

  const isValid = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

  if (!isValid) {
    console.warn('⚠️ GitHub Webhook 签名验证失败');
  }

  return isValid;
}

/**
 * 验证 Gitee Webhook 签名
 *
 * Gitee 使用 HMAC-SHA1 签名，签名放在 X-Gitee-Token 头中
 */
export function validateGiteeWebhook(
  payload: string,
  token: string,
  secret: string
): boolean {
  const receivedHash = crypto
    .createHash('sha1')
    .update(payload + secret, 'utf8')
    .digest('hex');

  const isValid = receivedHash === token;

  if (!isValid) {
    console.warn('⚠️ Gitee Webhook 签名验证失败');
  }

  return isValid;
}

/**
 * 验证 GitLab Webhook 签名
 *
 * GitLab 使用 HMAC-SHA256 签名，签名放在 X-Gitlab-Token 头中
 */
export function validateGitLabWebhook(
  payload: string,
  token: string,
  secret: string
): boolean {
  const receivedHash = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  const receivedBuffer = Buffer.from(receivedHash, 'hex');
  const tokenBuffer = Buffer.from(token, 'hex');

  if (receivedBuffer.length !== tokenBuffer.length) {
    console.warn('⚠️ GitLab Webhook 签名长度不匹配');
    return false;
  }

  const isValid = crypto.timingSafeEqual(receivedBuffer, tokenBuffer);

  if (!isValid) {
    console.warn('⚠️ GitLab Webhook 签名验证失败');
  }

  return isValid;
}

/**
 * 从请求中提取 GitHub Webhook 签名信息
 */
export function extractGitHubWebhookHeaders(
  req: Request
): { signature?: string; deliveryId?: string; eventType?: string } {
  return {
    signature: req.headers['x-hub-signature-256'] as string | undefined,
    deliveryId: req.headers['x-github-delivery'] as string | undefined,
    eventType: req.headers['x-github-event'] as string | undefined,
  };
}

/**
 * 从请求中提取 Gitee Webhook 签名信息
 */
export function extractGiteeWebhookHeaders(
  req: Request
): { token?: string; deliveryId?: string; eventType?: string } {
  return {
    token: req.headers['x-gitee-token'] as string | undefined,
    deliveryId: req.headers['x-gitee-timestamp'] as string | undefined,
    eventType: req.headers['x-gitee-event'] as string | undefined,
  };
}

/**
 * 从请求中提取 GitLab Webhook 签名信息
 */
export function extractGitLabWebhookHeaders(
  req: Request
): { token?: string; deliveryId?: string; eventType?: string } {
  return {
    token: req.headers['x-gitlab-token'] as string | undefined,
    deliveryId: req.headers['x-gitlab-delivery'] as string | undefined,
    eventType: req.headers['x-gitlab-event'] as string | undefined,
  };
}

/**
 * 验证 Webhook 请求
 *
 * 根据平台自动选择合适的验证方法
 */
export function validateWebhook(
  req: Request,
  payload: string,
  platform: Platform,
  secret: string
): WebhookValidationResult {
  switch (platform) {
    case 'github': {
      const headers = extractGitHubWebhookHeaders(req);
      if (!headers.signature) {
        return { isValid: false, platform };
      }

      const isValid = validateGitHubWebhook(payload, headers.signature, secret);
      return {
        isValid,
        platform,
        signature: headers.signature,
        deliveryId: headers.deliveryId,
        eventType: headers.eventType,
      };
    }

    case 'gitee': {
      const headers = extractGiteeWebhookHeaders(req);
      if (!headers.token) {
        return { isValid: false, platform };
      }

      const isValid = validateGiteeWebhook(payload, headers.token, secret);
      return {
        isValid,
        platform,
        signature: headers.token,
        deliveryId: headers.deliveryId,
        eventType: headers.eventType,
      };
    }

    case 'gitlab': {
      const headers = extractGitLabWebhookHeaders(req);
      if (!headers.token) {
        return { isValid: false, platform };
      }

      const isValid = validateGitLabWebhook(payload, headers.token, secret);
      return {
        isValid,
        platform,
        signature: headers.token,
        deliveryId: headers.deliveryId,
        eventType: headers.eventType,
      };
    }

    default:
      return { isValid: false, platform };
  }
}

/**
 * Webhook 事件类型
 */
export enum WebhookEventType {
  // GitHub 事件
  PULL_REQUEST = 'pull_request',
  PUSH = 'push',
  PING = 'ping',

  // Gitee 事件
  PULL_REQUEST_GITEE = 'Pull Request',
  PUSH_GITEE = 'Push Hook',

  // GitLab 事件
  MERGE_REQUEST = 'Merge Request Hook',
  PUSH_GITLAB = 'Push Hook',
}

/**
 * 解析 Webhook 事件类型
 */
export function parseWebhookEventType(
  eventType: string,
  platform: Platform
): WebhookEventType | null {
  switch (platform) {
    case 'github':
      switch (eventType) {
        case 'pull_request':
          return WebhookEventType.PULL_REQUEST;
        case 'push':
          return WebhookEventType.PUSH;
        case 'ping':
          return WebhookEventType.PING;
        default:
          return null;
      }

    case 'gitee':
      switch (eventType) {
        case 'Pull Request':
          return WebhookEventType.PULL_REQUEST_GITEE;
        case 'Push Hook':
          return WebhookEventType.PUSH_GITEE;
        default:
          return null;
      }

    case 'gitlab':
      switch (eventType) {
        case 'Merge Request Hook':
          return WebhookEventType.MERGE_REQUEST;
        case 'Push Hook':
          return WebhookEventType.PUSH_GITLAB;
        default:
          return null;
      }

    default:
      return null;
  }
}

/**
 * 判断事件是否为 Pull Request 相关
 */
export function isPullRequestEvent(eventType: string, platform: Platform): boolean {
  const parsed = parseWebhookEventType(eventType, platform);
  if (!parsed) return false;

  // 使用显式类型检查
  if (platform === 'github' && eventType === 'pull_request') return true;
  if (platform === 'gitee' && eventType === 'Pull Request') return true;
  if (platform === 'gitlab' && eventType === 'Merge Request Hook') return true;

  return false;
}

/**
 * 判断事件是否为 Push 相关
 */
export function isPushEvent(eventType: string, platform: Platform): boolean {
  // 使用显式类型检查
  if (platform === 'github' && eventType === 'push') return true;
  if (platform === 'gitee' && eventType === 'Push Hook') return true;
  if (platform === 'gitlab' && eventType === 'Push Hook') return true;

  return false;
}

/**
 * 判断事件是否为 Ping 事件
 */
export function isPingEvent(eventType: string, platform: Platform): boolean {
  return eventType === 'ping' && platform === 'github';
}

/**
 * GitHub Webhook Payload 接口
 */
export interface GitHubWebhookPayload {
  action?: string;
  number: number;
  pull_request?: {
    number: number;
    title: string;
    html_url: string;
    state: 'open' | 'closed' | 'merged';
    user: {
      login: string;
      id: number;
    };
    head: {
      sha: string;
      ref: string;
      repo: {
        full_name: string;
      };
    };
    base: {
      sha: string;
      ref: string;
      repo: {
        full_name: string;
      };
    };
  };
  repository?: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
  sender?: {
    login: string;
    id: number;
  };
}

/**
 * Gitee Webhook Payload 接口
 */
export interface GiteeWebhookPayload {
  action?: string;
  number: number;
  pull_request?: {
    number: number;
    title: string;
    html_url: string;
    state: string;
    user: {
      login: string;
      id: number;
    };
    head: {
      sha: string;
      ref: string;
      repo: {
        full_name: string;
      };
    };
    base: {
      sha: string;
      ref: string;
      repo: {
        full_name: string;
      };
    };
  };
  repository?: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
  sender?: {
    login: string;
    id: number;
  };
}

/**
 * GitLab Webhook Payload 接口
 */
export interface GitLabWebhookPayload {
  object_kind?: string;
  event_type?: string;
  object_attributes?: {
    id: number;
    title: string;
    url: string;
    state: string;
    action?: string;
    source_branch: string;
    target_branch: string;
    source: {
      id: number;
      sha: string;
      ref: string;
    };
    target: {
      id: number;
      sha: string;
      ref: string;
    };
  };
  project?: {
    path_with_namespace: string;
    name: string;
    owner: {
      name: string;
    };
  };
  user?: {
    username: string;
    id: number;
  };
}

/**
 * 统一的 Webhook Payload 类型
 */
export type UnifiedWebhookPayload =
  | GitHubWebhookPayload
  | GiteeWebhookPayload
  | GitLabWebhookPayload;

/**
 * 从 payload 中提取仓库信息
 */
export function extractRepositoryInfo(
  payload: UnifiedWebhookPayload,
  platform: Platform
): { owner: string; repo: string; fullName: string } | null {
  switch (platform) {
    case 'github': {
      const ghPayload = payload as GitHubWebhookPayload;
      if (!ghPayload.repository) return null;
      const fullName = ghPayload.repository.full_name;
      const parsed = parseRepositoryFullName(fullName);

      return {
        owner: parsed?.owner || ghPayload.repository.owner.login,
        repo: parsed?.repoName || ghPayload.repository.name,
        fullName,
      };
    }

    case 'gitee': {
      const gtPayload = payload as GiteeWebhookPayload;
      if (!gtPayload.repository) return null;
      const fullName = gtPayload.repository.full_name;
      const parsed = parseRepositoryFullName(fullName);

      return {
        owner: parsed?.owner || gtPayload.repository.owner.login,
        repo: parsed?.repoName || gtPayload.repository.name,
        fullName,
      };
    }

    case 'gitlab': {
      const glPayload = payload as GitLabWebhookPayload;
      if (!glPayload.project) return null;
      const fullName = glPayload.project.path_with_namespace;
      const parsed = parseRepositoryFullName(fullName);
      if (!parsed) {
        return null;
      }
      return {
        owner: parsed.owner,
        repo: parsed.repoName,
        fullName,
      };
    }

    default:
      return null;
  }
}

/**
 * 从 payload 中提取 PR 信息
 */
export function extractPullRequestInfo(
  payload: UnifiedWebhookPayload,
  platform: Platform
): { number: number; title: string; author: string; htmlUrl: string } | null {
  switch (platform) {
    case 'github': {
      const ghPayload = payload as GitHubWebhookPayload;
      if (!ghPayload.pull_request) return null;

      return {
        number: ghPayload.pull_request.number,
        title: ghPayload.pull_request.title,
        author: ghPayload.pull_request.user.login,
        htmlUrl: ghPayload.pull_request.html_url,
      };
    }

    case 'gitee': {
      const gtPayload = payload as GiteeWebhookPayload;
      if (!gtPayload.pull_request) return null;

      return {
        number: gtPayload.pull_request.number,
        title: gtPayload.pull_request.title,
        author: gtPayload.pull_request.user.login,
        htmlUrl: gtPayload.pull_request.html_url,
      };
    }

    case 'gitlab': {
      const glPayload = payload as GitLabWebhookPayload;
      if (!glPayload.object_attributes) return null;

      return {
        number: glPayload.object_attributes.id,
        title: glPayload.object_attributes.title,
        author: glPayload.user?.username || '',
        htmlUrl: glPayload.object_attributes.url || '',
      };
    }

    default:
      return null;
  }
}

/**
 * 从 payload 中提取提交信息
 */
export function extractCommitInfo(
  payload: UnifiedWebhookPayload,
  platform: Platform
): { headSha: string; baseSha?: string; headRef: string; baseRef: string } | null {
  switch (platform) {
    case 'github': {
      const ghPayload = payload as GitHubWebhookPayload;
      if (!ghPayload.pull_request) return null;

      return {
        headSha: ghPayload.pull_request.head.sha,
        baseSha: ghPayload.pull_request.base.sha,
        headRef: ghPayload.pull_request.head.ref,
        baseRef: ghPayload.pull_request.base.ref,
      };
    }

    case 'gitee': {
      const gtPayload = payload as GiteeWebhookPayload;
      if (!gtPayload.pull_request) return null;

      return {
        headSha: gtPayload.pull_request.head.sha,
        baseSha: gtPayload.pull_request.base.sha,
        headRef: gtPayload.pull_request.head.ref,
        baseRef: gtPayload.pull_request.base.ref,
      };
    }

    case 'gitlab': {
      const glPayload = payload as GitLabWebhookPayload;
      if (!glPayload.object_attributes) return null;

      return {
        headSha: glPayload.object_attributes.source?.sha || '',
        baseSha: glPayload.object_attributes.target?.sha,
        headRef: glPayload.object_attributes.source_branch || '',
        baseRef: glPayload.object_attributes.target_branch || '',
      };
    }

    default:
      return null;
  }
}

/**
 * 解析 platform 参数（从路径或 body）
 */
export function parsePlatformFromRequest(req: Request): Platform | null {
  // 从路径参数获取
  if (req.params && 'platform' in req.params) {
    const platformParam = req.params.platform as string | string[];
    const platformStr = Array.isArray(platformParam) ? platformParam[0] : platformParam;

    if (platformStr === 'github' || platformStr === 'gitee' || platformStr === 'gitlab') {
      return platformStr as Platform;
    }
  }

  // 从 body 获取
  if (req.body && typeof req.body === 'object') {
    const body = req.body as Record<string, unknown>;
    const platformStr = body.platform as string;

    if (platformStr === 'github' || platformStr === 'gitee' || platformStr === 'gitlab') {
      return platformStr as Platform;
    }
  }

  return null;
}
