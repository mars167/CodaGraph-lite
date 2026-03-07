/**
 * 平台 API 客户端
 * 为 GitHub、Gitee、GitLab 提供统一的评论发布接口
 * 包含重试机制、rate limit 处理和行级评论支持
 */

import { logger } from '../utils/logger';

/**
 * PR 信息接口
 */
export interface PRInfo {
  platform: 'github' | 'gitee' | 'gitlab';
  owner: string;
  repo: string;
  prNumber: string;
}

/**
 * 评论内容接口
 */
export interface CommentContent {
  body: string;
  filePath?: string;
  lineNumber?: number;
  commitId?: string;
}

/**
 * 位置信息接口（用于行级评论）
 */
export interface CommentPosition {
  path: string;
  line: number;
  startLine?: number;
  endLine?: number;
  startSide?: 'RIGHT' | 'LEFT';
}

/**
 * API 错误类型
 */
export class PlatformApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'PlatformApiError';
  }
}

/**
 * Rate limit 信息
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
} as const;

/**
 * 检查状态码是否可重试
 */
function isRetryableStatus(statusCode: number): boolean {
  return RETRY_CONFIG.retryableStatuses.includes(statusCode as any);
}

/**
 * 重试装饰器 - 使用指数退避
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  customMaxAttempts?: number
): Promise<T> {
  const maxAttempts = customMaxAttempts || RETRY_CONFIG.maxAttempts;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 检查是否可重试
      const isRetryable =
        error instanceof PlatformApiError && error.retryable;

      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }

      // 指数退避
      const delay = RETRY_CONFIG.baseDelayMs * Math.pow(
        RETRY_CONFIG.backoffMultiplier,
        attempt - 1
      );

      logger.warn(
        `${context} 失败 (尝试 ${attempt}/${maxAttempts})，${delay}ms 后重试: ${error}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`${context} 失败: 未知错误`);
}

/**
 * 解析 GitHub rate limit 头信息
 */
function parseGitHubRateLimit(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');

  if (!limit || !remaining || !reset) {
    return null;
  }

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    used: parseInt(limit, 10) - parseInt(remaining, 10),
    reset: new Date(parseInt(reset, 10) * 1000),
  };
}

/**
 * 等待 rate limit 重置
 */
async function waitForRateReset(rateLimit: RateLimitInfo): Promise<void> {
  const now = Date.now();
  const resetTime = rateLimit.reset.getTime();
  const waitTime = Math.max(0, resetTime - now);

  if (waitTime > 0) {
    logger.warn(
      `GitHub API rate limit 已用尽，等待 ${Math.ceil(waitTime / 1000)} 秒重置`
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

/**
 * 平台 API 客户端接口
 */
export interface PlatformClient {
  /**
   * 发布评论
   */
  postComment(prInfo: PRInfo, comment: CommentContent): Promise<void>;

  /**
   * 发布行级评论
   */
  postReviewComment(
    prInfo: PRInfo,
    comment: CommentContent,
    position: CommentPosition
  ): Promise<void>;

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;

  /**
   * 获取 rate limit 信息
   */
  getRateLimitInfo(): Promise<RateLimitInfo | null>;
}

/**
 * GitHub API 客户端
 */
export class GitHubClient implements PlatformClient {
  private apiUrl: string;
  private accessToken: string;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(accessToken: string) {
    this.apiUrl = 'https://api.github.com';
    this.accessToken = accessToken;
  }

  async postComment(
    prInfo: PRInfo,
    comment: CommentContent
  ): Promise<void> {
    return withRetry(async () => {
      // 检查 rate limit
      if (this.rateLimitInfo && this.rateLimitInfo.remaining < 10) {
        await waitForRateReset(this.rateLimitInfo);
      }

      const url = `${this.apiUrl}/repos/${prInfo.owner}/${prInfo.repo}/issues/${prInfo.prNumber}/comments`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: comment.body }),
      });

      // 更新 rate limit 信息
      const newRateLimit = parseGitHubRateLimit(response.headers);
      if (newRateLimit) {
        this.rateLimitInfo = newRateLimit;
        logger.debug(
          `GitHub API rate limit: ${newRateLimit.remaining}/${newRateLimit.limit}，重置于 ${newRateLimit.reset.toISOString()}`
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = isRetryableStatus(response.status);
        throw new PlatformApiError(
          `GitHub API 失败: ${response.status}: ${errorText}`,
          response.status,
          retryable
        );
      }

      logger.info(`GitHub 评论发布成功: ${prInfo.owner}/${prInfo.repo}#${prInfo.prNumber}`);
    }, 'GitHub 评论发布');
  }

  async postReviewComment(
    prInfo: PRInfo,
    comment: CommentContent,
    position: CommentPosition
  ): Promise<void> {
    return withRetry(async () => {
      if (this.rateLimitInfo && this.rateLimitInfo.remaining < 10) {
        await waitForRateReset(this.rateLimitInfo);
      }

      // GitHub 行级评论使用 review comments API
      const url = `${this.apiUrl}/repos/${prInfo.owner}/${prInfo.repo}/pulls/${prInfo.prNumber}/comments`;

      const requestBody: any = {
        body: comment.body,
        path: position.path,
        line: position.line,
      };

      // 可选：指定 commitId
      if (comment.commitId) {
        requestBody.commit_id = comment.commitId;
      }

      // 可选：多行评论
      if (position.startLine && position.endLine) {
        requestBody.start_line = position.startLine;
        requestBody.end_line = position.endLine;
      }

      if (position.startSide) {
        requestBody.start_side = position.startSide;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const newRateLimit = parseGitHubRateLimit(response.headers);
      if (newRateLimit) {
        this.rateLimitInfo = newRateLimit;
      }

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = isRetryableStatus(response.status);
        throw new PlatformApiError(
          `GitHub API 行级评论失败: ${response.status}: ${errorText}`,
          response.status,
          retryable
        );
      }

      logger.info(
        `GitHub 行级评论发布成功: ${position.path}:${position.line}`
      );
    }, 'GitHub 行级评论发布');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.apiUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      const newRateLimit = parseGitHubRateLimit(response.headers);
      if (newRateLimit) {
        this.rateLimitInfo = newRateLimit;
      }

      return response.ok;
    } catch (error) {
      logger.error(`GitHub 健康检查失败: ${error}`);
      return false;
    }
  }

  async getRateLimitInfo(): Promise<RateLimitInfo | null> {
    const response = await fetch(`${this.apiUrl}/rate_limit`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json() as { rate: { limit: number; remaining: number; used: number; reset: number } };
      return {
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        used: data.rate.used,
        reset: new Date(data.rate.reset * 1000),
      };
    }

    return this.rateLimitInfo;
  }
}

/**
 * Gitee API 客户端
 */
export class GiteeClient implements PlatformClient {
  private apiUrl: string;
  private accessToken: string;

  constructor(accessToken: string) {
    this.apiUrl = 'https://gitee.com/api/v5';
    this.accessToken = accessToken;
  }

  async postComment(
    prInfo: PRInfo,
    comment: CommentContent
  ): Promise<void> {
    return withRetry(async () => {
      const url = `${this.apiUrl}/repos/${prInfo.owner}/${prInfo.repo}/pulls/${prInfo.prNumber}/comments`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify({ body: comment.body }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = isRetryableStatus(response.status);
        throw new PlatformApiError(
          `Gitee API 失败: ${response.status}: ${errorText}`,
          response.status,
          retryable
        );
      }

      logger.info(`Gitee 评论发布成功: ${prInfo.owner}/${prInfo.repo}#${prInfo.prNumber}`);
    }, 'Gitee 评论发布');
  }

  async postReviewComment(
    prInfo: PRInfo,
    comment: CommentContent,
    position: CommentPosition
  ): Promise<void> {
    // Gitee API 支持行级评论，使用 pr comments API
    return withRetry(async () => {
      const url = `${this.apiUrl}/repos/${prInfo.owner}/${prInfo.repo}/pulls/${prInfo.prNumber}/comments`;

      const requestBody: any = {
        body: comment.body,
        path: position.path,
        position: position.line,
      };

      if (comment.commitId) {
        requestBody.commit_id = comment.commitId;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = isRetryableStatus(response.status);
        throw new PlatformApiError(
          `Gitee API 行级评论失败: ${response.status}: ${errorText}`,
          response.status,
          retryable
        );
      }

      logger.info(`Gitee 行级评论发布成功: ${position.path}:${position.line}`);
    }, 'Gitee 行级评论发布');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.apiUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return response.ok;
    } catch (error) {
      logger.error(`Gitee 健康检查失败: ${error}`);
      return false;
    }
  }

  async getRateLimitInfo(): Promise<RateLimitInfo | null> {
    // Gitee API 不公开 rate limit 信息
    return null;
  }
}

/**
 * GitLab API 客户端
 */
export class GitLabClient implements PlatformClient {
  private apiUrl: string;
  private accessToken: string;

  constructor(accessToken: string) {
    this.apiUrl = process.env.GITLAB_API_URL || 'https://gitlab.com';
    this.accessToken = accessToken;
  }

  async postComment(
    prInfo: PRInfo,
    comment: CommentContent
  ): Promise<void> {
    return withRetry(async () => {
      // GitLab 使用 encoded path: owner%2Frepo
      const encodedRepo = encodeURIComponent(`${prInfo.owner}/${prInfo.repo}`);
      const url = `${this.apiUrl}/api/v4/projects/${encodedRepo}/merge_requests/${prInfo.prNumber}/notes`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: comment.body }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = isRetryableStatus(response.status);
        throw new PlatformApiError(
          `GitLab API 失败: ${response.status}: ${errorText}`,
          response.status,
          retryable
        );
      }

      logger.info(`GitLab 评论发布成功: ${prInfo.owner}/${prInfo.repo}!${prInfo.prNumber}`);
    }, 'GitLab 评论发布');
  }

  async postReviewComment(
    prInfo: PRInfo,
    comment: CommentContent,
    position: CommentPosition
  ): Promise<void> {
    return withRetry(async () => {
      const encodedRepo = encodeURIComponent(`${prInfo.owner}/${prInfo.repo}`);
      const url = `${this.apiUrl}/api/v4/projects/${encodedRepo}/merge_requests/${prInfo.prNumber}/discussions`;

      const requestBody: any = {
        body: comment.body,
        position: {
          base_sha: comment.commitId || '',
          head_sha: comment.commitId || '',
          start_sha: comment.commitId || '',
          position_type: 'text',
          new_path: position.path,
          new_line: position.line,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = isRetryableStatus(response.status);
        throw new PlatformApiError(
          `GitLab API 行级评论失败: ${response.status}: ${errorText}`,
          response.status,
          retryable
        );
      }

      logger.info(`GitLab 行级评论发布成功: ${position.path}:${position.line}`);
    }, 'GitLab 行级评论发布');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v4/user`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return response.ok;
    } catch (error) {
      logger.error(`GitLab 健康检查失败: ${error}`);
      return false;
    }
  }

  async getRateLimitInfo(): Promise<RateLimitInfo | null> {
    // GitLab rate limit 通过响应头返回，需要在实际请求中提取
    return null;
  }
}

/**
 * 创建平台客户端
 */
export function createPlatformClient(
  platform: string,
  accessToken: string
): PlatformClient {
  switch (platform) {
    case 'github':
      return new GitHubClient(accessToken);
    case 'gitee':
      return new GiteeClient(accessToken);
    case 'gitlab':
      return new GitLabClient(accessToken);
    default:
      throw new Error(`不支持的平台: ${platform}`);
  }
}
