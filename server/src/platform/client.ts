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
  authType?: 'oauth' | 'github_app' | 'pat';
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

function normalizeErrorPreview(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function pushErrorPart(parts: string[], value: string | null | undefined): void {
  if (!value || parts.includes(value)) {
    return;
  }

  parts.push(value);
}

function appendRequestErrorMetadata(parts: string[], source: unknown): void {
  if (!source || typeof source !== 'object') {
    return;
  }

  const candidate = source as Record<string, unknown>;
  const fields: Array<[string, string]> = [
    ['code', 'code'],
    ['errno', 'errno'],
    ['syscall', 'syscall'],
    ['host', 'host'],
    ['hostname', 'hostname'],
    ['address', 'address'],
    ['port', 'port'],
  ];

  for (const [key, label] of fields) {
    const value = candidate[key];
    if (typeof value === 'string' || typeof value === 'number') {
      pushErrorPart(parts, `${label}=${String(value)}`);
    }
  }
}

function describeRequestError(error: unknown): string {
  const parts: string[] = [];
  const message = error instanceof Error ? normalizeErrorPreview(error.message) : normalizeErrorPreview(String(error));
  pushErrorPart(parts, message);

  const cause = error instanceof Error
    ? (error as Error & { cause?: unknown }).cause
    : undefined;

  if (cause instanceof Error) {
    pushErrorPart(parts, `cause=${normalizeErrorPreview(cause.message)}`);
  } else if (typeof cause === 'string') {
    pushErrorPart(parts, `cause=${normalizeErrorPreview(cause)}`);
  }

  appendRequestErrorMetadata(parts, error);
  appendRequestErrorMetadata(parts, cause);

  return parts.join(' | ');
}

async function describeErrorResponse(response: Response): Promise<string> {
  const statusLine = `${response.status} ${response.statusText}`;

  try {
    const rawBody = await response.text();
    const preview = normalizeErrorPreview(rawBody).slice(0, 240);
    return preview ? `${statusLine} | body=${preview}` : statusLine;
  } catch {
    return statusLine;
  }
}

type GiteeRepositoryResponse = Repository & {
  clone_url?: string | null;
  html_url?: string | null;
  full_name: string;
};

type GitLabRepositoryResponse = Record<string, unknown> & {
  id: number;
  name: string;
  path?: string;
  path_with_namespace?: string;
  namespace?: {
    id?: number;
    full_path?: string;
  } | null;
  owner?: {
    id?: number;
    username?: string;
  } | null;
  visibility?: string | null;
  description?: string | null;
  forked_from_project?: unknown;
  language?: string | null;
  star_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  created_at?: string;
  updated_at?: string;
  last_activity_at?: string | null;
  web_url?: string;
  http_url_to_repo?: string;
  ssh_url_to_repo?: string;
  default_branch?: string | null;
};

type GiteePullRequestFileResponse = Record<string, unknown> & {
  patch?: string | {
    diff?: string;
    new_path?: string;
    old_path?: string;
    new_file?: boolean;
    renamed_file?: boolean;
    deleted_file?: boolean;
  } | null;
  diff?: string | null;
  status?: string | null;
  new_path?: string;
  old_path?: string;
  new_file?: boolean;
  renamed_file?: boolean;
  deleted_file?: boolean;
};

function normalizeGiteeCloneUrl(repository: GiteeRepositoryResponse): string {
  if (typeof repository.clone_url === 'string' && repository.clone_url.trim()) {
    return repository.clone_url;
  }

  if (typeof repository.html_url === 'string' && repository.html_url.trim()) {
    return repository.html_url.endsWith('.git')
      ? repository.html_url
      : `${repository.html_url}.git`;
  }

  return `https://gitee.com/${repository.full_name}.git`;
}

function normalizeGiteeRepository(repository: GiteeRepositoryResponse): Repository {
  return {
    ...repository,
    clone_url: normalizeGiteeCloneUrl(repository),
  };
}

function resolveGitLabOwnerLogin(repository: GitLabRepositoryResponse, fullName: string): string {
  if (typeof repository.namespace?.full_path === 'string' && repository.namespace.full_path.trim()) {
    return repository.namespace.full_path;
  }

  if (typeof repository.owner?.username === 'string' && repository.owner.username.trim()) {
    return repository.owner.username;
  }

  const separatorIndex = fullName.lastIndexOf('/');
  return separatorIndex > 0 ? fullName.slice(0, separatorIndex) : '';
}

function resolveGitLabFullName(repository: GitLabRepositoryResponse): string {
  if (typeof repository.path_with_namespace === 'string' && repository.path_with_namespace.trim()) {
    return repository.path_with_namespace;
  }

  const repoPath = repository.path || repository.name;
  const namespace = repository.namespace?.full_path || repository.owner?.username || '';
  return namespace ? `${namespace}/${repoPath}` : repoPath;
}

function normalizeGitLabRepository(repository: GitLabRepositoryResponse): Repository {
  const fullName = resolveGitLabFullName(repository);
  const ownerLogin = resolveGitLabOwnerLogin(repository, fullName);
  const repoName = repository.path || repository.name;
  const fallbackTimestamp = repository.updated_at || repository.last_activity_at || repository.created_at || new Date(0).toISOString();

  return {
    id: repository.id,
    name: repoName,
    full_name: fullName,
    owner: {
      login: ownerLogin,
      id: repository.owner?.id ?? repository.namespace?.id ?? 0,
    },
    private: repository.visibility !== 'public',
    description: repository.description || null,
    fork: Boolean(repository.forked_from_project),
    language: repository.language || null,
    stargazers_count: repository.star_count ?? 0,
    watchers_count: 0,
    forks_count: repository.forks_count ?? 0,
    open_issues_count: repository.open_issues_count ?? 0,
    created_at: repository.created_at || fallbackTimestamp,
    updated_at: repository.updated_at || fallbackTimestamp,
    pushed_at: repository.last_activity_at || null,
    html_url: repository.web_url || `https://gitlab.com/${fullName}`,
    clone_url: repository.http_url_to_repo || `https://gitlab.com/${fullName}.git`,
    ssh_url: repository.ssh_url_to_repo || `git@gitlab.com:${fullName}.git`,
    default_branch: repository.default_branch ?? null,
  };
}

function normalizeGiteePullRequestFile(
  file: GiteePullRequestFileResponse
): Record<string, unknown> {
  const patchObject = file.patch && typeof file.patch === 'object'
    ? file.patch as Exclude<GiteePullRequestFileResponse['patch'], string | null>
    : null;
  const rawStatus = typeof file.status === 'string'
    ? file.status
    : patchObject?.deleted_file
      ? 'deleted'
      : patchObject?.renamed_file
        ? 'renamed'
        : patchObject?.new_file
          ? 'added'
          : 'modified';

  return {
    ...file,
    status: rawStatus,
    diff: typeof file.diff === 'string' && file.diff
      ? file.diff
      : typeof patchObject?.diff === 'string'
        ? patchObject.diff
        : null,
    patch: typeof file.patch === 'string'
      ? file.patch
      : typeof patchObject?.diff === 'string'
        ? patchObject.diff
        : '',
    new_path: typeof file.new_path === 'string'
      ? file.new_path
      : patchObject?.new_path,
    old_path: typeof file.old_path === 'string'
      ? file.old_path
      : patchObject?.old_path,
    new_file: typeof file.new_file === 'boolean'
      ? file.new_file
      : patchObject?.new_file,
    renamed_file: typeof file.renamed_file === 'boolean'
      ? file.renamed_file
      : patchObject?.renamed_file,
    deleted_file: typeof file.deleted_file === 'boolean'
      ? file.deleted_file
      : patchObject?.deleted_file,
  };
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

  protected async requestJson<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        ...options,
      });
    } catch (error) {
      throw new Error(`${method} ${url} 失败: ${describeRequestError(error)}`);
    }

    if (!response.ok) {
      throw new Error(`${method} ${url} 失败: ${await describeErrorResponse(response)}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * 发起 GET 请求
   */
  protected async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.requestJson<T>('GET', path, options);
  }

  /**
   * 发起 POST 请求
   */
  protected async post<T>(path: string, data?: unknown): Promise<T> {
    return this.requestJson<T>('POST', path, {
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * 发起 PUT 请求
   */
  protected async put<T>(path: string, data?: unknown): Promise<T> {
    return this.requestJson<T>('PUT', path, {
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * 发起 DELETE 请求
   */
  protected async delete<T>(path: string): Promise<T> {
    return this.requestJson<T>('DELETE', path);
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

    const repositories = await this.get<GiteeRepositoryResponse[]>(path);
    return repositories.map((repository) => normalizeGiteeRepository(repository));
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
    const repository = await this.get<GiteeRepositoryResponse>(`/repos/${owner}/${repo}`);
    return normalizeGiteeRepository(repository);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest> {
    return this.get<PullRequest>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<unknown[]> {
    const files = await this.get<GiteePullRequestFileResponse[]>(`/repos/${owner}/${repo}/pulls/${number}/files`);
    return files.map((file) => normalizeGiteePullRequestFile(file));
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
      merge_requests_events: true,
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

    const repositories = await this.get<GitLabRepositoryResponse[]>(path);
    return repositories.map((repository) => normalizeGitLabRepository(repository));
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
    const repository = await this.get<GitLabRepositoryResponse>(`/projects/${encodedPath}`);
    return normalizeGitLabRepository(repository);
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
