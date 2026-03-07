/**
 * 平台 API 客户端
 *
 * 提供与 GitHub/Gitee/GitLab API 交互的统一接口
 */

import type { Platform } from '../models/types';
import type { TokenResponse } from '../oauth/handlers';

/**
 * HeadersInit 类型定义（兼容 Node.js fetch）
 */
type FetchHeadersInit = Record<string, string>;

export interface PlatformClientOptions {
  authType?: 'oauth' | 'github_app';
  githubAppInstallationId?: string | null;
}

/**
 * 仓库信息
 */
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
  };
  private: boolean;
  description: string | null;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string | null;
}

/**
 * Pull Request 信息
 */
export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
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
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  html_url: string;
}

/**
 * 提交信息
 */
export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  date: string;
  html_url: string;
}

/**
 * Webhook 配置
 */
export interface WebhookConfig {
  url: string;
  content_type?: string;
  secret?: string;
  insecure_ssl?: boolean;
}

/**
 * 创建 Webhook 响应
 */
export interface WebhookResponse {
  id: number | string;
  url: string;
  test_url: string;
  ping_url: string;
  active: boolean;
}

/**
 * 分页参数
 */
export interface PaginationOptions {
  page?: number;
  per_page?: number;
  state?: 'open' | 'closed' | 'all';
}

/**
 * API 客户端基类
 */
abstract class BaseApiClient {
  protected accessToken: string;
  protected baseUrl: string;
  protected userAgent = 'CodaGraph/1.0';
  protected options: PlatformClientOptions;

  constructor(accessToken: string, baseUrl: string, options: PlatformClientOptions = {}) {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl;
    this.options = options;
  }

  /**
   * 获取请求头
   */
  protected getHeaders(): FetchHeadersInit {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'User-Agent': this.userAgent,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * 发起 GET 请求
   */
  protected async get<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
      ...options,
    });

    if (!response.ok) {
      throw new Error(`GET ${url} 失败: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 发起 POST 请求
   */
  protected async post<T>(path: string, data?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`POST ${url} 失败: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 发起 PUT 请求
   */
  protected async put<T>(path: string, data?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`PUT ${url} 失败: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 发起 DELETE 请求
   */
  protected async delete<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`DELETE ${url} 失败: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 获取仓库列表
   */
  abstract getRepositories(options?: PaginationOptions): Promise<Repository[]>;

  /**
   * 获取 Pull Request 列表
   */
  abstract listPullRequests(owner: string, repo: string, options?: PaginationOptions): Promise<PullRequest[]>;

  /**
   * 获取指定仓库
   */
  abstract getRepository(owner: string, repo: string): Promise<Repository>;

  /**
   * 获取 Pull Request
   */
  abstract getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest>;

  /**
   * 获取 Pull Request 文件变更
   */
  abstract getPullRequestFiles(owner: string, repo: string, number: number): Promise<unknown[]>;

  /**
   * 创建 Webhook
   */
  abstract createWebhook(
    owner: string,
    repo: string,
    config: WebhookConfig
  ): Promise<WebhookResponse>;

  /**
   * 删除 Webhook
   */
  abstract deleteWebhook(owner: string, repo: string, id: number | string): Promise<void>;

  /**
   * 验证 Token
   */
  abstract verifyToken(): Promise<boolean>;
}

/**
 * GitHub API 客户端
 */
export class GitHubApiClient extends BaseApiClient {
  constructor(accessToken: string, options: PlatformClientOptions = {}) {
    super(accessToken, 'https://api.github.com', options);
  }

  protected override getHeaders(): FetchHeadersInit {
    return {
      ...super.getHeaders(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async getRepositories(options?: PaginationOptions): Promise<Repository[]> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.per_page) params.append('per_page', options.per_page.toString());

    if (this.options.authType === 'github_app') {
      const query = params.toString();
      const path = query ? `/installation/repositories?${query}` : '/installation/repositories';
      const response = await this.get<{ repositories: Repository[] }>(path);
      return response.repositories || [];
    }

    params.append('visibility', 'all');
    params.append('affiliation', 'owner,collaborator');

    const query = params.toString();
    const path = query ? `/user/repos?${query}` : '/user/repos';

    return this.get<Repository[]>(path);
  }

  async listPullRequests(owner: string, repo: string, options?: PaginationOptions): Promise<PullRequest[]> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.per_page) params.append('per_page', options.per_page.toString());
    params.append('state', options?.state || 'open');

    const query = params.toString();
    const path = query ? `/repos/${owner}/${repo}/pulls?${query}` : `/repos/${owner}/${repo}/pulls`;

    return this.get<PullRequest[]>(path);
  }

  async getRepository(owner: string, repo: string): Promise<Repository> {
    return this.get<Repository>(`/repos/${owner}/${repo}`);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest> {
    return this.get<PullRequest>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<unknown[]> {
    return this.get<unknown[]>(`/repos/${owner}/${repo}/pulls/${number}/files`);
  }

  async createWebhook(
    owner: string,
    repo: string,
    config: WebhookConfig
  ): Promise<WebhookResponse> {
    const data = {
      name: 'web',
      active: true,
      events: ['pull_request', 'push'],
      config: {
        url: config.url,
        content_type: config.content_type || 'json',
        secret: config.secret || '',
        insecure_ssl: config.insecure_ssl || false,
      },
    };

    return this.post<WebhookResponse>(`/repos/${owner}/${repo}/hooks`, data);
  }

  async deleteWebhook(owner: string, repo: string, id: number | string): Promise<void> {
    await this.delete<void>(`/repos/${owner}/${repo}/hooks/${id}`);
  }

  async verifyToken(): Promise<boolean> {
    try {
      if (this.options.authType === 'github_app') {
        await this.get<unknown>('/installation/repositories?per_page=1');
      } else {
        await this.get<unknown>('/user');
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取仓库的最新提交
   */
  async getCommits(owner: string, repo: string, ref?: string): Promise<Commit[]> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return this.get<Commit[]>(`/repos/${owner}/${repo}/commits${params}`);
  }

  /**
   * 发送 Pull Request 评论
   */
  async createPullRequestComment(
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<{ id: number; html_url: string }> {
    return this.post<{ id: number; html_url: string }>(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      { body }
    );
  }

  /**
   * 获取文件内容
   */
  async getFile(owner: string, repo: string, path: string, ref?: string): Promise<unknown> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return this.get<unknown>(`/repos/${owner}/${repo}/contents/${path}${params}`);
  }
}

/**
 * Gitee API 客户端
 */
export class GiteeApiClient extends BaseApiClient {
  constructor(accessToken: string) {
    super(accessToken, 'https://gitee.com/api/v5');
  }

  async getRepositories(options?: PaginationOptions): Promise<Repository[]> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.per_page) params.append('per_page', options.per_page.toString());
    params.append('visibility', 'all');

    const query = params.toString();
    const path = query ? `/user/repos?${query}` : '/user/repos';

    return this.get<Repository[]>(path);
  }

  async listPullRequests(owner: string, repo: string, options?: PaginationOptions): Promise<PullRequest[]> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.per_page) params.append('per_page', options.per_page.toString());
    params.append('state', options?.state || 'open');

    const query = params.toString();
    const path = query ? `/repos/${owner}/${repo}/pulls?${query}` : `/repos/${owner}/${repo}/pulls`;

    return this.get<PullRequest[]>(path);
  }

  async getRepository(owner: string, repo: string): Promise<Repository> {
    return this.get<Repository>(`/repos/${owner}/${repo}`);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest> {
    return this.get<PullRequest>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<unknown[]> {
    return this.get<unknown[]>(`/repos/${owner}/${repo}/pulls/${number}/files`);
  }

  async createWebhook(
    owner: string,
    repo: string,
    config: WebhookConfig
  ): Promise<WebhookResponse> {
    const data = {
      url: config.url,
      content_type: config.content_type || 'json',
      password: config.secret || '',
      push_events: true,
      pr_events: true,
      active: true,
    };

    return this.post<WebhookResponse>(`/repos/${owner}/${repo}/hooks`, data);
  }

  async deleteWebhook(owner: string, repo: string, id: number | string): Promise<void> {
    await this.delete<void>(`/repos/${owner}/${repo}/hooks/${id}`);
  }

  async verifyToken(): Promise<boolean> {
    try {
      await this.get<unknown>('/user');
      return true;
    } catch {
      return false;
    }
  }

  async getCommits(owner: string, repo: string, ref?: string): Promise<Commit[]> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return this.get<Commit[]>(`/repos/${owner}/${repo}/commits${params}`);
  }

  async createPullRequestComment(
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<{ id: number; html_url: string }> {
    return this.post<{ id: number; html_url: string }>(
      `/repos/${owner}/${repo}/pulls/${number}/comments`,
      { body }
    );
  }

  async getFile(owner: string, repo: string, path: string, ref?: string): Promise<unknown> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return this.get<unknown>(`/repos/${owner}/${repo}/contents/${path}${params}`);
  }
}

/**
 * GitLab API 客户端
 */
export class GitLabApiClient extends BaseApiClient {
  constructor(accessToken: string) {
    super(accessToken, 'https://gitlab.com/api/v4');
  }

  async getRepositories(options?: PaginationOptions): Promise<Repository[]> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.per_page) params.append('per_page', options.per_page.toString());
    params.append('membership', 'true');

    const query = params.toString();
    const path = query ? `/projects?${query}` : '/projects';

    return this.get<Repository[]>(path);
  }

  async listPullRequests(owner: string, repo: string, options?: PaginationOptions): Promise<PullRequest[]> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.per_page) params.append('per_page', options.per_page.toString());
    params.append('state', options?.state === 'all' ? 'all' : options?.state === 'closed' ? 'closed' : 'opened');

    const query = params.toString();
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    const path = query ? `/projects/${encodedPath}/merge_requests?${query}` : `/projects/${encodedPath}/merge_requests`;

    return this.get<PullRequest[]>(path);
  }

  async getRepository(owner: string, repo: string): Promise<Repository> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    return this.get<Repository>(`/projects/${encodedPath}`);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    return this.get<PullRequest>(`/projects/${encodedPath}/merge_requests/${number}`);
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<unknown[]> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    return this.get<unknown[]>(`/projects/${encodedPath}/merge_requests/${number}/changes`);
  }

  async createWebhook(
    owner: string,
    repo: string,
    config: WebhookConfig
  ): Promise<WebhookResponse> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    const data = {
      url: config.url,
      push_events: true,
      merge_requests_events: true,
      token: config.secret || '',
      enable_ssl_verification: !config.insecure_ssl,
    };

    return this.post<WebhookResponse>(`/projects/${encodedPath}/hooks`, data);
  }

  async deleteWebhook(owner: string, repo: string, id: number | string): Promise<void> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    await this.delete<void>(`/projects/${encodedPath}/hooks/${id}`);
  }

  async verifyToken(): Promise<boolean> {
    try {
      await this.get<unknown>('/user');
      return true;
    } catch {
      return false;
    }
  }

  async getCommits(owner: string, repo: string, ref?: string): Promise<Commit[]> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    const params = ref ? `?ref_name=${encodeURIComponent(ref)}` : '';
    return this.get<Commit[]>(`/projects/${encodedPath}/repository/commits${params}`);
  }

  async createPullRequestComment(
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<{ id: number; html_url: string }> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    return this.post<{ id: number; html_url: string }>(
      `/projects/${encodedPath}/merge_requests/${number}/notes`,
      { body }
    );
  }

  async getFile(owner: string, repo: string, path: string, ref?: string): Promise<unknown> {
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    const encodedFilePath = encodeURIComponent(path);
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return this.get<unknown>(
      `/projects/${encodedPath}/repository/files/${encodedFilePath}${params}`
    );
  }
}

/**
 * 创建平台 API 客户端工厂函数
 */
export function createPlatformClient(
  platform: Platform,
  accessToken: string,
  options: PlatformClientOptions = {}
): BaseApiClient {
  switch (platform) {
    case 'github':
      return new GitHubApiClient(accessToken, options);
    case 'gitee':
      return new GiteeApiClient(accessToken);
    case 'gitlab':
      return new GitLabApiClient(accessToken);
    default:
      throw new Error(`不支持的平台: ${platform}`);
  }
}

/**
 * 从 OAuth 令牌响应中提取访问令牌并创建客户端
 */
export function createClientFromTokenResponse(
  platform: Platform,
  tokenResponse: TokenResponse,
  options: PlatformClientOptions = {}
): BaseApiClient {
  if (!tokenResponse.access_token) {
    throw new Error('无效的令牌响应：缺少 access_token');
  }

  return createPlatformClient(platform, tokenResponse.access_token, options);
}
