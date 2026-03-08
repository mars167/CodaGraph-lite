import type {
  Analysis,
  AnalysisJob,
  ApiResponse,
  ApiError,
  LoginRequest,
  LoginResponse,
  MemoryInfo,
  OAuthInstallation,
  PaginatedResponse,
  PullRequestHistoryItem,
  PullRequestReviewJob,
  Repository,
  RepositoryPullRequest,
  JobLog,
  ReviewReportDetail,
  ReviewReportSummary,
  ResourceStats,
  LlmTestResult,
  SystemSettings,
  SystemStatus,
} from '@/types';

// API 基础 URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7900';

// API 响应类型守卫
function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as ApiError).success === false &&
    'error' in response
  );
}

// 请求配置
interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

interface VerifyResponse {
  success: boolean;
  message?: string;
  admin?: {
    id: string;
    username: string;
  } | null;
}

interface OAuthInstallationApiItem {
  id: string | number;
  platform: OAuthInstallation['platform'];
  account_id: string;
  account_name?: string | null;
  access_token: string;
  refresh_token?: string | null;
  permissions?: string | null;
  token_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface RepositoryApiItem {
  id: string | number;
  remote_id?: string | null;
  installation_id: string | number;
  platform: Repository['platform'];
  owner: string;
  name: string;
  full_name: string;
  description?: string | null;
  is_private?: boolean;
  language?: string | null;
  stars_count?: number;
  forks_count?: number;
  pull_requests_count?: number;
  pr_count?: number;
  html_url?: string | null;
  webhook_url?: string | null;
  is_active: boolean;
  watch_enabled?: boolean;
  created_at: string;
  updated_at: string;
  last_synced_at?: string | null;
  last_analyzed_at?: string | null;
  watch_last_checked_at?: string | null;
  last_commit_at?: string | null;
  pushed_at?: string | null;
}

interface RepositoryListResponse {
  repositories: RepositoryApiItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface RepositoryPullRequestApiItem {
  prNumber: number;
  title: string;
  author: string;
  url: string;
  state: RepositoryPullRequest['state'];
  createdAt: string;
  updatedAt: string;
  reviewStatus: RepositoryPullRequest['reviewStatus'];
  reviewProgress: number;
  latestAnalysisId?: number | null;
  latestReviewJobId?: number | null;
  latestReviewJobStatus?: RepositoryPullRequest['latestReviewJobStatus'] | null;
  latestReviewJobCreatedAt?: string | null;
  lastReviewedAt?: string | null;
  latestRiskLevel: RepositoryPullRequest['latestRiskLevel'];
  latestRiskSummary?: string | null;
  commentCount: number;
  issueCount: number;
  fileCount: number;
  analysisJobStage?: string | null;
  analysisJobMessage?: string | null;
  jobCount?: number;
  jobs?: PullRequestReviewJobApiItem[];
  reports?: ReviewReportSummaryApiItem[];
}

interface RepositoryPullRequestListResponse {
  repository: RepositoryApiItem;
  pullRequests: RepositoryPullRequestApiItem[];
}

interface PullRequestReviewJobApiItem {
  id: string | number;
  status: PullRequestReviewJob['status'];
  triggerSource?: PullRequestReviewJob['triggerSource'] | null;
  headCommit?: string | null;
  shortHeadCommit?: string | null;
  analysisId?: string | number | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
  report?: ReviewReportSummaryApiItem | null;
}

interface PullRequestHistoryApiItem {
  repositoryId?: string | number | null;
  repositoryFullName: string;
  repositoryUrl?: string | null;
  repositoryWatchEnabled?: boolean;
  platform: PullRequestHistoryItem['platform'];
  owner: string;
  repoName: string;
  prNumber: number;
  title: string;
  author: string;
  url: string;
  reviewStatus: PullRequestHistoryItem['reviewStatus'];
  reviewProgress: number;
  latestAnalysisId?: string | number | null;
  latestReviewJobId?: string | number | null;
  latestReviewJobStatus?: PullRequestHistoryItem['latestReviewJobStatus'] | null;
  latestReviewJobCreatedAt?: string | null;
  lastReviewedAt?: string | null;
  latestRiskLevel: PullRequestHistoryItem['latestRiskLevel'];
  latestRiskSummary?: string | null;
  commentCount: number;
  issueCount: number;
  fileCount: number;
  latestHeadCommit?: string | null;
  lastActivityAt: string;
  jobCount?: number;
  jobs?: PullRequestReviewJobApiItem[];
  reports?: ReviewReportSummaryApiItem[];
}

interface PullRequestHistoryListResponse {
  pullRequests: PullRequestHistoryApiItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface AnalysisApiItem {
  id: string | number;
  platform: Analysis['platform'];
  owner: string;
  repo_name: string;
  pr_number: number;
  pr_title: string;
  pr_author: string;
  base_commit: string;
  head_commit: string;
  status: Analysis['status'] | 'cancelled';
  comment_count: number;
  file_count: number;
  issue_count: number;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewReportSummaryApiItem {
  analysisId: string | number;
  jobId?: string | number | null;
  status: Analysis['status'] | 'cancelled';
  riskLevel: ReviewReportSummary['riskLevel'];
  summary?: string | null;
  issueCount: number;
  commentCount: number;
  fileCount: number;
  createdAt: string;
  completedAt?: string | null;
}

interface ReviewReportDetailResponse {
  analysis: AnalysisApiItem;
  report?: {
    summary?: string;
    riskLevel?: ReviewReportDetail['riskLevel'];
    reportMarkdown?: string;
    findings?: ReviewReportDetail['findings'];
    fileContexts?: ReviewReportDetail['fileContexts'];
    postedCommentCount?: number;
    jobId?: string | number;
    generatedAt?: string;
  } | null;
}

interface AnalysisListResponse {
  analyses: AnalysisApiItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface JobApiItem {
  id: string | number;
  type: 'pr_analysis' | 'context_analysis' | 'code_review';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead';
  priority: number;
  payload: string;
  repo_name?: string | null;
  pr_number?: number | null;
  pr_title?: string | null;
  trigger_source?: 'manual' | 'watch' | 'webhook' | null;
  attempts: number;
  max_attempts: number;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

interface JobLogApiItem {
  id: string | number;
  level: JobLog['level'];
  message: string;
  created_at: string;
}

interface JobListResponse {
  jobs: JobApiItem[];
  count: number;
  page: number;
  limit: number;
}

function isNetworkErrorMessage(message: string): boolean {
  return message.includes('Failed to fetch')
    || message.includes('NetworkError')
    || message.includes('Load failed')
    || message.includes('无法连接到后端服务')
    || message.includes('请求超时');
}

function buildPrUrl(platform: Analysis['platform'], owner: string, repoName: string, prNumber: number): string {
  switch (platform) {
    case 'github':
      return `https://github.com/${owner}/${repoName}/pull/${prNumber}`;
    case 'gitee':
      return `https://gitee.com/${owner}/${repoName}/pulls/${prNumber}`;
    case 'gitlab':
      return `https://gitlab.com/${owner}/${repoName}/-/merge_requests/${prNumber}`;
  }
}

function mapRepository(item: RepositoryApiItem): Repository {
  return {
    id: String(item.id),
    installationId: String(item.installation_id),
    platform: item.platform,
    platformRepoId: item.remote_id ? String(item.remote_id) : String(item.id),
    owner: item.owner,
    name: item.name,
    fullName: item.full_name,
    description: item.description || undefined,
    private: Boolean(item.is_private),
    language: item.language || undefined,
    htmlUrl: item.html_url || undefined,
    webhookUrl: item.webhook_url || undefined,
    lastSyncedAt: item.last_synced_at || item.last_analyzed_at || undefined,
    watchEnabled: Boolean(item.watch_enabled),
    watchLastCheckedAt: item.watch_last_checked_at || undefined,
    active: item.is_active,
    stars: item.stars_count ?? 0,
    forks: item.forks_count ?? 0,
    pullRequests: item.pull_requests_count ?? item.pr_count ?? undefined,
    lastCommitAt: item.last_commit_at || item.pushed_at || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapPullRequestReviewJob(item: PullRequestReviewJobApiItem): PullRequestReviewJob {
  return {
    id: String(item.id),
    status: item.status,
    triggerSource: item.triggerSource || undefined,
    headCommit: item.headCommit || undefined,
    shortHeadCommit: item.shortHeadCommit || undefined,
    analysisId: item.analysisId ? String(item.analysisId) : undefined,
    errorMessage: item.errorMessage || undefined,
    createdAt: item.createdAt,
    startedAt: item.startedAt || undefined,
    completedAt: item.completedAt || undefined,
    updatedAt: item.updatedAt,
    report: item.report ? mapReviewReportSummary(item.report) : undefined,
  };
}

function mapRepositoryPullRequest(item: RepositoryPullRequestApiItem): RepositoryPullRequest {
  return {
    prNumber: item.prNumber,
    title: item.title,
    author: item.author,
    url: item.url,
    state: item.state,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    reviewStatus: item.reviewStatus,
    reviewProgress: item.reviewProgress,
    latestAnalysisId: item.latestAnalysisId ? String(item.latestAnalysisId) : undefined,
    latestReviewJobId: item.latestReviewJobId ? String(item.latestReviewJobId) : undefined,
    latestReviewJobStatus: item.latestReviewJobStatus || undefined,
    latestReviewJobCreatedAt: item.latestReviewJobCreatedAt || undefined,
    lastReviewedAt: item.lastReviewedAt || undefined,
    latestRiskLevel: item.latestRiskLevel,
    latestRiskSummary: item.latestRiskSummary || undefined,
    commentCount: item.commentCount,
    issueCount: item.issueCount,
    fileCount: item.fileCount,
    analysisJobStage: item.analysisJobStage || undefined,
    analysisJobMessage: item.analysisJobMessage || undefined,
    jobCount: item.jobCount ?? item.jobs?.length ?? 0,
    jobs: (item.jobs || []).map(mapPullRequestReviewJob),
    reports: (item.reports || []).map(mapReviewReportSummary),
  };
}

function mapPullRequestHistoryItem(item: PullRequestHistoryApiItem): PullRequestHistoryItem {
  return {
    repositoryId: item.repositoryId ? String(item.repositoryId) : undefined,
    repositoryFullName: item.repositoryFullName,
    repositoryUrl: item.repositoryUrl || undefined,
    repositoryWatchEnabled: Boolean(item.repositoryWatchEnabled),
    platform: item.platform,
    owner: item.owner,
    repoName: item.repoName,
    prNumber: item.prNumber,
    title: item.title,
    author: item.author,
    url: item.url,
    reviewStatus: item.reviewStatus,
    reviewProgress: item.reviewProgress,
    latestAnalysisId: item.latestAnalysisId ? String(item.latestAnalysisId) : undefined,
    latestReviewJobId: item.latestReviewJobId ? String(item.latestReviewJobId) : undefined,
    latestReviewJobStatus: item.latestReviewJobStatus || undefined,
    latestReviewJobCreatedAt: item.latestReviewJobCreatedAt || undefined,
    lastReviewedAt: item.lastReviewedAt || undefined,
    latestRiskLevel: item.latestRiskLevel,
    latestRiskSummary: item.latestRiskSummary || undefined,
    commentCount: item.commentCount,
    issueCount: item.issueCount,
    fileCount: item.fileCount,
    latestHeadCommit: item.latestHeadCommit || undefined,
    lastActivityAt: item.lastActivityAt,
    jobCount: item.jobCount ?? item.jobs?.length ?? 0,
    jobs: (item.jobs || []).map(mapPullRequestReviewJob),
    reports: (item.reports || []).map(mapReviewReportSummary),
  };
}

function mapReviewReportSummary(item: ReviewReportSummaryApiItem): ReviewReportSummary {
  return {
    analysisId: String(item.analysisId),
    jobId: item.jobId ? String(item.jobId) : undefined,
    status: item.status === 'cancelled' ? 'failed' : item.status,
    riskLevel: item.riskLevel,
    summary: item.summary || undefined,
    issueCount: item.issueCount,
    commentCount: item.commentCount,
    fileCount: item.fileCount,
    createdAt: item.createdAt,
    completedAt: item.completedAt || undefined,
  };
}

function mapAnalysis(item: AnalysisApiItem): Analysis {
  return {
    id: String(item.id),
    repositoryId: `${item.platform}:${item.owner}/${item.repo_name}`,
    platform: item.platform,
    platformPrId: String(item.id),
    platformPrNumber: item.pr_number,
    prTitle: item.pr_title,
    prAuthor: item.pr_author,
    prUrl: buildPrUrl(item.platform, item.owner, item.repo_name, item.pr_number),
    baseBranch: item.base_commit,
    headBranch: item.head_commit,
    status: item.status === 'cancelled' ? 'failed' : item.status,
    errorMessage: item.error_message || undefined,
    reviewCommentCount: item.comment_count,
    fileAnalysisCount: item.file_count,
    startedAt: item.started_at || undefined,
    completedAt: item.completed_at || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapJob(item: JobApiItem): AnalysisJob {
  return {
    id: String(item.id),
    type: item.type === 'pr_analysis' ? 'analyze_pr' : item.type === 'context_analysis' ? 'sync_repository' : 'refresh_oauth',
    status: item.status === 'dead' ? 'failed' : item.status,
    priority: item.priority,
    payload: (() => {
      try {
        return JSON.parse(item.payload) as Record<string, unknown>;
      } catch {
        return {};
      }
    })(),
    repoName: item.repo_name || undefined,
    prNumber: typeof item.pr_number === 'number' ? item.pr_number : undefined,
    prTitle: item.pr_title || undefined,
    triggerSource: item.trigger_source || undefined,
    attempts: item.attempts,
    maxAttempts: item.max_attempts,
    errorMessage: item.error_message || undefined,
    createdAt: item.created_at,
    startedAt: item.started_at || undefined,
    completedAt: item.completed_at || undefined,
  };
}

function mapJobLog(item: JobLogApiItem): JobLog {
  return {
    id: String(item.id),
    level: item.level,
    message: item.message,
    createdAt: item.created_at,
  };
}

// 创建带超时的 fetch
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`请求超时 (${timeout}ms)`);
    }
    if (error instanceof TypeError && isNetworkErrorMessage(error.message)) {
      throw new Error(`无法连接到后端服务: ${url}`);
    }
    throw error;
  }
}

// 构建 URL 查询参数
function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, baseUrl);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      url.searchParams.append(key, String(value));
    });
  }
  return url.toString();
}

// 获取认证 token
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

// 设置认证 token
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('auth_token', token);
}

// 清除认证 token
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('auth_token');
}

// 获取请求头
function getHeaders(contentType = 'application/json', requestMetadata?: { timestamp: string; requestId: string }): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': contentType,
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (requestMetadata) {
    headers['X-Request-Timestamp'] = requestMetadata.timestamp;
    headers['X-Request-Id'] = requestMetadata.requestId;
  }

  return headers;
}

// API 客户端类
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // 通用请求方法
  private async request<T>(
    path: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const {
      method = 'GET',
      params,
      body,
      timeout,
      ...rest
    } = config;

    const url = buildUrl(this.baseUrl, path, params);
    const requestMetadata = {
      timestamp: new Date().toISOString(),
      requestId: `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };

    const options: RequestInit = {
      method,
      headers: getHeaders('application/json', requestMetadata),
      credentials: 'include',
      ...rest,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetchWithTimeout(url, { ...options, timeout });

      // 处理 401 未授权
      if (response.status === 401) {
        clearAuthToken();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        throw new Error('未授权，请重新登录');
      }

      // 处理非 JSON 响应
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return {} as T;
      }

      const data = await response.json();

      // 检查 API 错误
      if (isApiError(data)) {
        throw new Error(data.error || data.code || '请求失败');
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('请求失败，请稍后重试');
    }
  }

  // GET 请求
  async get<T>(path: string, params?: RequestConfig['params']): Promise<T> {
    return this.request<T>(path, { method: 'GET', params });
  }

  // POST 请求
  async post<T>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body as BodyInit | null | undefined, ...config });
  }

  // PUT 请求
  async put<T>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: body as BodyInit | null | undefined, ...config });
  }

  // DELETE 请求
  async delete<T>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', ...config });
  }

  // PATCH 请求
  async patch<T>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: body as BodyInit | null | undefined, ...config });
  }

  // ============ 认证 API ============

  // 管理员登录
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      return await this.post<LoginResponse>('/api/auth/login', credentials);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('identifier')) {
        throw error;
      }

      const fallbackCredentials = {
        identifier: credentials.username,
        password: credentials.password,
      };
      return this.post<LoginResponse>('/api/auth/login', fallbackCredentials);
    }
  }

  // 管理员登出
  async logout(): Promise<void> {
    try {
      await this.post<void>('/api/auth/logout');
    } finally {
      clearAuthToken();
    }
  }

  // 获取当前管理员信息
  async getCurrentAdmin(): Promise<ApiResponse<{ admin: { id: string; username: string } }>> {
    const response = await this.get<VerifyResponse>('/api/auth/verify');
    if (!response.success || !response.admin) {
      throw new Error(response.message || '未登录');
    }
    return {
      success: true,
      data: {
        admin: response.admin,
      },
    };
  }

  // 更新管理员密码
  async updatePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    return this.post<void>('/api/auth/change-password', {
      oldPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  }

  // ============ OAuth API ============

  // 获取 OAuth 授权 URL
  async getOAuthAuthorizationUrl(
    platform: string,
    authType: 'oauth' | 'github_app' = 'oauth'
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    return this.get<ApiResponse<{ authorizationUrl: string }>>(
      `/api/oauth/authorize/${platform}`,
      { authType }
    );
  }

  // 获取所有 OAuth 安装
  async getOAuthInstallations(): Promise<ApiResponse<{ installations: OAuthInstallation[] }>> {
    const response = await this.get<{ installations: OAuthInstallationApiItem[] }>('/api/oauth/installations');
    const installations: OAuthInstallation[] = (response.installations || []).map((item) => ({
      id: String(item.id),
      platform: item.platform,
      platformUserId: item.account_id,
      platformUsername: item.account_name || item.account_id,
      accessToken: item.access_token,
      refreshToken: item.refresh_token || undefined,
      scope: item.permissions || '',
      expiresAt: item.token_expires_at || undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    return {
      success: true,
      data: { installations },
    };
  }

  // 断开 OAuth 连接
  async disconnectOAuth(installationId: string): Promise<void> {
    return this.delete<void>(`/api/oauth/installations/${installationId}`);
  }

  // 刷新 OAuth token
  async refreshOAuthToken(installationId: string): Promise<void> {
    return this.post<void>(`/api/oauth/installations/${installationId}/refresh`);
  }

  // ============ 仓库 API ============

  // 获取仓库列表
  async getRepositories(params?: { platform?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<Repository>> {
    const response = await this.get<RepositoryListResponse>('/api/repositories', {
      platform: params?.platform,
      page: params?.page,
      limit: params?.pageSize,
    });
    return {
      success: true,
      data: response.repositories.map(mapRepository),
      total: response.pagination.total,
      page: response.pagination.page,
      pageSize: response.pagination.limit,
      hasMore: response.pagination.page < response.pagination.totalPages,
    };
  }

  // 获取仓库详情
  async getRepository(id: string): Promise<ApiResponse<Repository>> {
    const response = await this.get<{ repository: RepositoryApiItem }>(`/api/repositories/${id}`);
    return {
      success: true,
      data: mapRepository(response.repository),
    };
  }

  async getRepositoryPullRequests(
    repositoryId: string,
    params?: { state?: 'open' | 'closed' | 'all'; page?: number; pageSize?: number }
  ): Promise<ApiResponse<{ repository: Repository; pullRequests: RepositoryPullRequest[] }>> {
    const response = await this.get<RepositoryPullRequestListResponse>(
      `/api/repositories/${repositoryId}/pull-requests`,
      {
        state: params?.state,
        page: params?.page,
        limit: params?.pageSize,
      }
    );

    return {
      success: true,
      data: {
        repository: mapRepository(response.repository),
        pullRequests: response.pullRequests.map(mapRepositoryPullRequest),
      },
    };
  }

  async startRepositoryPullRequestReview(
    repositoryId: string,
    prNumber: number
  ): Promise<ApiResponse<{ jobId?: string; analysisId?: string; created: boolean; message: string }>> {
    const response = await this.post<{
      jobId?: number | null;
      created: boolean;
      message: string;
      analysis?: { id: number | string } | null;
    }>(
      `/api/repositories/${repositoryId}/pull-requests/${prNumber}/review`
    );

    return {
      success: true,
      data: {
        jobId: response.jobId ? String(response.jobId) : undefined,
        analysisId: response.analysis?.id ? String(response.analysis.id) : undefined,
        created: response.created,
        message: response.message,
      },
    };
  }

  async setRepositoryWatch(id: string, enabled: boolean): Promise<ApiResponse<Repository>> {
    const response = await this.patch<{ repository: RepositoryApiItem }>(`/api/repositories/${id}/watch`, {
      enabled,
    });

    return {
      success: true,
      data: mapRepository(response.repository),
    };
  }

  // 切换仓库激活状态
  async toggleRepository(id: string): Promise<void> {
    return this.patch<void>(`/api/repositories/${id}/toggle`);
  }

  // 删除仓库
  async deleteRepository(id: string): Promise<void> {
    return this.delete<void>(`/api/repositories/${id}`);
  }

  // ============ 分析 API ============

  async getPullRequestHistory(params?: {
    platform?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<PullRequestHistoryItem>> {
    const response = await this.get<PullRequestHistoryListResponse>('/api/analyses/pull-requests', {
      platform: params?.platform,
      status: params?.status,
      page: params?.page,
      limit: params?.pageSize,
    });

    return {
      success: true,
      data: response.pullRequests.map(mapPullRequestHistoryItem),
      total: response.pagination.total,
      page: response.pagination.page,
      pageSize: response.pagination.limit,
      hasMore: response.pagination.page < response.pagination.totalPages,
    };
  }

  // 获取分析列表
  async getAnalyses(params?: {
    repositoryId?: string;
    platform?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Analysis>> {
    const response = await this.get<AnalysisListResponse>('/api/analyses', {
      platform: params?.platform,
      status: params?.status,
      page: params?.page,
      limit: params?.pageSize,
    });
    return {
      success: true,
      data: response.analyses.map(mapAnalysis),
      total: response.pagination.total,
      page: response.pagination.page,
      pageSize: response.pagination.limit,
      hasMore: response.pagination.page < response.pagination.totalPages,
    };
  }

  // 获取分析详情
  async getAnalysis(id: string): Promise<ApiResponse<Analysis>> {
    const response = await this.get<{ analysis: AnalysisApiItem }>(`/api/analyses/${id}`);
    return {
      success: true,
      data: mapAnalysis(response.analysis),
    };
  }

  // 重新触发分析
  async retryAnalysis(id: string): Promise<ApiResponse<Analysis>> {
    const response = await this.post<{ analysis: AnalysisApiItem }>(`/api/analyses/${id}/retry`);
    return {
      success: true,
      data: mapAnalysis(response.analysis),
    };
  }

  // ============ 作业 API ============

  // 获取作业列表
  async getJobs(params?: {
    type?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<AnalysisJob>> {
    const response = await this.get<JobListResponse>('/api/jobs', {
      type: params?.type,
      status: params?.status,
      page: params?.page,
      limit: params?.pageSize,
    });
    return {
      success: true,
      data: response.jobs.map(mapJob),
      total: response.count,
      page: response.page,
      pageSize: response.limit,
      hasMore: response.jobs.length === response.limit,
    };
  }

  // 获取作业详情
  async getJob(id: string): Promise<ApiResponse<AnalysisJob>> {
    const response = await this.get<{ job: JobApiItem }>(`/api/jobs/${id}`);
    return {
      success: true,
      data: mapJob(response.job),
    };
  }

  async getJobDetail(id: string): Promise<ApiResponse<{ job: AnalysisJob; analysis?: Analysis }>> {
    const response = await this.get<{ job: JobApiItem; analysis?: AnalysisApiItem | null }>(`/api/jobs/${id}`);
    return {
      success: true,
      data: {
        job: mapJob(response.job),
        analysis: response.analysis ? mapAnalysis(response.analysis) : undefined,
      },
    };
  }

  async getJobLogs(id: string): Promise<ApiResponse<{ logs: JobLog[] }>> {
    const response = await this.get<{ logs: JobLogApiItem[] }>(`/api/jobs/${id}/logs`);
    return {
      success: true,
      data: {
        logs: (response.logs || []).map(mapJobLog),
      },
    };
  }

  // 取消作业
  async cancelJob(id: string): Promise<void> {
    return this.post<void>(`/api/jobs/${id}/cancel`);
  }

  async retryJob(id: string): Promise<ApiResponse<{ jobId: string }>> {
    const response = await this.post<{ jobId: string | number }>(`/api/jobs/${id}/retry`);
    return {
      success: true,
      data: {
        jobId: String(response.jobId),
      },
    };
  }

  async getReviewReport(id: string): Promise<ApiResponse<ReviewReportDetail>> {
    const response = await this.get<ReviewReportDetailResponse>(`/api/analyses/${id}/report`);
    const analysis = mapAnalysis(response.analysis);
    return {
      success: true,
      data: {
        analysis,
        summary: response.report?.summary,
        riskLevel: response.report?.riskLevel || 'unknown',
        reportMarkdown: response.report?.reportMarkdown,
        findings: response.report?.findings || [],
        fileContexts: response.report?.fileContexts || [],
        fileCount: analysis.fileAnalysisCount,
        commentCount: analysis.reviewCommentCount,
        issueCount: response.report?.findings?.length || 0,
        jobId: response.report?.jobId ? String(response.report.jobId) : undefined,
        generatedAt: response.report?.generatedAt,
      },
    };
  }

  // 获取作业统计
  async getJobStats(): Promise<ApiResponse<{ pending: number; processing: number; completed: number; failed: number }>> {
    const response = await this.get<{
      pendingCount: number;
      processingCount: number;
      completedCount: number;
      failedCount: number;
    }>('/api/jobs/stats');
    return {
      success: true,
      data: {
        pending: response.pendingCount,
        processing: response.processingCount,
        completed: response.completedCount,
        failed: response.failedCount,
      },
    };
  }

  // ============ 设置 API ============

  // 获取系统设置
  async getSettings(): Promise<ApiResponse<SystemSettings>> {
    return this.get<ApiResponse<SystemSettings>>('/api/settings');
  }

  // 保存系统设置
  async saveSettings(settings: SystemSettings): Promise<ApiResponse<SystemSettings>> {
    return this.put<ApiResponse<SystemSettings>>('/api/settings', settings);
  }

  async testLlmSettings(settings: Partial<SystemSettings>): Promise<ApiResponse<LlmTestResult>> {
    return this.post<ApiResponse<LlmTestResult>>('/api/settings/llm/test', settings);
  }

  // 创建数据库备份
  async createBackup(options?: { retentionDays?: number }): Promise<ApiResponse<{ backupId: string; backupPath: string }>> {
    return this.post<ApiResponse<{ backupId: string; backupPath: string }>>('/api/settings/backup', options);
  }

  // 恢复数据库备份
  async restoreBackup(backupId: string): Promise<void> {
    return this.post<void>(`/api/settings/restore/${backupId}`);
  }

  // 获取备份列表
  async getBackups(): Promise<ApiResponse<{ backups: Array<{ id: string; path: string; size: number; createdAt: string }> }>> {
    return this.get<ApiResponse<{ backups: Array<{ id: string; path: string; size: number; createdAt: string }> }>>('/api/settings/backups');
  }

  // 删除备份
  async deleteBackup(backupId: string): Promise<void> {
    return this.delete<void>(`/api/settings/backups/${backupId}`);
  }

  // 下载备份
  async downloadBackup(backupId: string): Promise<Response> {
    return fetch(`${this.baseUrl}/api/settings/backups/${backupId}/download`, {
      headers: getHeaders(),
    });
  }

  // ============ 系统状态 API ============

  // 获取系统状态
  async getSystemStatus(): Promise<SystemStatus> {
    return this.get<SystemStatus>('/api/status');
  }

  // 获取内存信息
  async getMemoryInfo(): Promise<ApiResponse<MemoryInfo>> {
    return this.get<ApiResponse<MemoryInfo>>('/api/status/memory');
  }

  // 获取资源统计
  async getResourceStats(): Promise<ApiResponse<ResourceStats>> {
    return this.get<ApiResponse<ResourceStats>>('/api/status/resources');
  }

  // 健康检查
  async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return this.get<ApiResponse<{ status: string; timestamp: string }>>('/api/health');
  }
}

// 导出单例实例
export const apiClient = new ApiClient(API_BASE_URL);
export { isNetworkErrorMessage };

// 导出类型
export type { RequestConfig };
