/**
 * 数据模型类型定义
 *
 * 定义所有数据表的 TypeScript 接口
 */

/**
 * 平台类型
 */
export type Platform = 'github' | 'gitee' | 'gitlab';

/**
 * 会话数据
 */
export interface SessionData {
  sessionId: string;
  adminId: number;
  adminUsername: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity?: Date;
}

/**
 * 创建管理员 DTO
 */
export interface CreateAdminDTO {
  username: string;
  password: string;
}

/**
 * 更新管理员 DTO
 */
export interface UpdateAdminDTO {
  username?: string;
  password?: string;
}

/**
 * OAuth 安装
 */
export interface OAuthInstallation {
  id: number;
  platform: Platform;
  auth_type?: 'oauth' | 'github_app' | null;
  github_app_installation_id?: string | null;
  account_id: string;
  account_name?: string | null;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
  permissions?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  is_active: boolean;
}

/**
 * OAuth 授权
 */
export interface OAuthAuthorize {
  id: number;
  platform: Platform;
  state: string;
  redirect_uri: string;
  scope?: string;
  created_at: Date | string;
  expires_at: Date;
}

/**
 * OAuth Token
 */
export interface OAuthToken {
  id: number;
  platform: Platform;
  account_id: string;
  token_type: 'access' | 'refresh' | 'state';
  access_token?: string;
  refresh_token?: string;
  expires_at: Date;
  created_at: Date | string;
}

/**
 * 分析作业阶段
 */
export type AnalysisJobStage = 'cloning' | 'indexing' | 'context_gathering' | 'code_review' | 'posting_comments' | 'cleanup' | 'completed' | 'failed';

/**
 * 作业状态
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * 分析状态
 */
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * 创建分析 DTO
 */
export interface CreateAnalysisDTO {
  platform: Platform;
  owner: string;
  repo_name: string;
  pr_number: number;
  pr_title: string;
  pr_author: string;
  base_commit: string;
  head_commit: string;
}

/**
 * 更新分析 DTO
 */
export interface UpdateAnalysisDTO {
  status?: AnalysisStatus;
  analysis_result?: string;
  comment_count?: number;
  file_count?: number;
  issue_count?: number;
  error_message?: string | null;
}

/**
 * 管理员
 */
export interface Admin {
  id: number;
  username: string;
  password_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_login_at?: Date | string | null;
}

/**
 * 活动日志
 */
export interface ActivityLog {
  id: number;
  admin_id: number;
  action: 'login' | 'logout' | 'password_change' | 'failed_login';
  ip_address?: string | null;
  user_agent?: string | null;
  details?: string | null;
  created_at: Date | string;
}

/**
 * 创建活动日志 DTO
 */
export interface CreateActivityLogDTO {
  admin_id: number;
  action: 'login' | 'logout' | 'password_change' | 'failed_login';
  ip_address?: string;
  user_agent?: string;
  details?: string;
}

/**
 * OAuth 安装
 */
export interface Installation {
  id: number;
  platform: Platform;
  account_id: string;
  account_name?: string | null;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
  permissions?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  is_active: boolean;
}

/**
 * 创建安装 DTO
 */
export interface CreateInstallationDTO {
  platform: Platform;
  auth_type?: 'oauth' | 'github_app';
  github_app_installation_id?: string | null;
  account_id: string;
  account_name?: string | null;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
  permissions?: string | null;
}

/**
 * 仓库
 */
export interface Repository {
  id: number;
  platform: Platform;
  remote_id?: string | null;
  owner: string;
  name: string;
  full_name: string;
  description?: string | null;
  is_private: boolean;
  language?: string | null;
  stars_count: number;
  forks_count: number;
  default_branch?: string | null;
  html_url?: string | null;
  installation_id: number;
  webhook_id?: string | null;
  webhook_secret?: string | null;
  webhook_url?: string | null;
  is_active: boolean;
  watch_enabled?: boolean;
  is_favorite?: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  last_synced_at?: Date | string | null;
  last_analyzed_at?: Date | string | null;
  watch_last_checked_at?: Date | string | null;
  favorited_at?: Date | string | null;
}

/**
 * 创建仓库 DTO
 */
export interface CreateRepositoryDTO {
  platform: Platform;
  remote_id?: string | null;
  owner: string;
  name: string;
  full_name: string;
  description?: string | null;
  is_private?: boolean;
  language?: string | null;
  stars_count?: number;
  forks_count?: number;
  default_branch?: string | null;
  html_url?: string | null;
  installation_id: number;
  webhook_id?: string | null;
  webhook_secret?: string | null;
  webhook_url?: string | null;
  is_active: boolean;
  watch_enabled?: boolean;
  is_favorite?: boolean;
  favorited_at?: Date | string | null;
}

/**
 * 分析记录
 */
export interface Analysis {
  id: number;
  platform: 'github' | 'gitee' | 'gitlab';
  owner: string;
  repo_name: string;
  pr_number: number;
  pr_title: string;
  pr_author: string;
  base_commit: string;
  head_commit: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  analysis_result: string; // JSON 格式的完整分析结果
  comment_count: number;
  file_count: number;
  issue_count: number;
  started_at?: Date | string | null;
  completed_at?: Date | string | null;
  failed_at?: Date | string | null;
  error_message?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * 分析作业
 */
export interface AnalysisJob {
  id: number;
  analysis_id: number;
  stage: 'cloning' | 'indexing' | 'context_gathering' | 'code_review' | 'posting_comments' | 'cleanup' | 'completed' | 'failed';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0.0 到 1.0
  message: string;
  started_at?: Date | string | null;
  completed_at?: Date | string | null;
  failed_at?: Date | string | null;
  error_message?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * Webhook 事件
 */
export interface WebhookEvent {
  id: number;
  platform: 'github' | 'gitee' | 'gitlab';
  event_type: string;
  payload_id: string;
  payload: string; // JSON 格式的完整 payload
  processed: boolean;
  processing_error?: string | null;
  created_at: Date | string;
}

/**
 * 使用指标类型
 */
export type MetricType =
  | 'analysis_total'
  | 'analysis_completed'
  | 'analysis_failed'
  | 'pr_analyzed'
  | 'comments_posted'
  | 'files_reviewed'
  | 'llm_prompt_tokens'
  | 'llm_completion_tokens'
  | 'llm_total_tokens'
  | 'llm_requests_total'
  | 'llm_requests_failed';

/**
 * 使用指标
 */
export interface UsageMetric {
  id: number;
  metric_type: MetricType;
  metric_value: number;
  platform?: Platform;
  repository_id?: number;
  recorded_at: Date | string;
}

/**
 * 作业
 */
export interface Job {
  id: number;
  type: 'pr_analysis' | 'context_analysis' | 'code_review';
  payload: string; // JSON 格式的作业负载
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead';
  priority: number; // 1-10，1 为最高优先级
  attempts: number;
  max_attempts: number;
  error_message?: string | null;
  started_at?: Date | string | null;
  completed_at?: Date | string | null;
  failed_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ReviewLock {
  id: number;
  platform: Platform;
  owner: string;
  repo_name: string;
  pr_number: number;
  head_commit: string;
  source: 'manual' | 'watch' | 'webhook';
  status: 'active' | 'released';
  analysis_id?: number | null;
  job_id?: number | null;
  created_at: Date | string;
  updated_at: Date | string;
  released_at?: Date | string | null;
}

export interface JobLog {
  id: number;
  job_id: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  created_at: Date | string;
}

export interface ReviewReportSummary {
  analysisId: number;
  jobId: number | null;
  status: Analysis['status'];
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  summary: string | null;
  issueCount: number;
  commentCount: number;
  fileCount: number;
  createdAt: Date | string;
  completedAt?: Date | string | null;
}

/**
 * 作业状态
 */
export type JobType = 'pr_analysis' | 'context_analysis' | 'code_review';

/**
 * 作业状态
 */
export type QueueJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead';

/**
 * 作业负载
 */
export interface JobPayload {
  platform: string;
  repo_name: string;
  pr_number: string;
  pr_title?: string;
  pr_author?: string;
  repository_id?: string;
  analysis_id?: string;
  analysis_job_id?: string;
  head_commit?: string;
  trigger_source?: 'manual' | 'watch' | 'webhook';
  review_mode?: 'normal' | 'improve';
}

/**
 * 作业分页参数
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
  offset?: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 排序顺序
 */
export type SortOrder = 'ASC' | 'DESC';
