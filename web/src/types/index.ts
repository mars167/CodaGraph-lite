// ============ 认证相关类型 ============

export interface Admin {
  id: string;
  username: string;
  createdAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  admin?: Admin;
  message?: string;
}

export interface Session {
  admin: Admin;
  expiresAt: string;
}

// ============ OAuth 相关类型 ============

export type Platform = 'github' | 'gitee' | 'gitlab';

export interface OAuthInstallation {
  id: string;
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  scope: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface OAuthState {
  platform: Platform;
  state: string;
  redirectUri: string;
}

// ============ 仓库相关类型 ============

export interface Repository {
  id: string;
  installationId: string;
  platform: Platform;
  platformRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  language?: string;
  htmlUrl?: string;
  webhookUrl?: string;
  lastSyncedAt?: string;
  watchEnabled?: boolean;
  favorite?: boolean;
  favoritedAt?: string;
  watchLastCheckedAt?: string;
  active?: boolean;
  stars?: number;
  forks?: number;
  pullRequests?: number;
  lastCommitAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PullRequestReviewStatus = 'not_started' | 'pending' | 'processing' | 'completed' | 'failed';
export type PullRequestRiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export interface PullRequestReviewJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead';
  triggerSource?: 'manual' | 'watch' | 'webhook' | 'unknown';
  headCommit?: string;
  shortHeadCommit?: string;
  analysisId?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  report?: ReviewReportSummary;
}

export interface RepositoryPullRequest {
  prNumber: number;
  title: string;
  author: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  updatedAt: string;
  reviewStatus: PullRequestReviewStatus;
  reviewProgress: number;
  latestAnalysisId?: string;
  latestReviewJobId?: string;
  latestReviewJobStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead';
  latestReviewJobCreatedAt?: string;
  lastReviewedAt?: string;
  latestRiskLevel: PullRequestRiskLevel;
  latestRiskSummary?: string;
  commentCount: number;
  issueCount: number;
  fileCount: number;
  analysisJobStage?: string;
  analysisJobMessage?: string;
  jobCount: number;
  jobs: PullRequestReviewJob[];
  reports: ReviewReportSummary[];
}

export interface PullRequestHistoryItem {
  repositoryId?: string;
  repositoryFullName: string;
  repositoryUrl?: string;
  repositoryWatchEnabled?: boolean;
  platform: Platform;
  owner: string;
  repoName: string;
  prNumber: number;
  title: string;
  author: string;
  url: string;
  reviewStatus: PullRequestReviewStatus;
  reviewProgress: number;
  latestAnalysisId?: string;
  latestReviewJobId?: string;
  latestReviewJobStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead';
  latestReviewJobCreatedAt?: string;
  lastReviewedAt?: string;
  latestRiskLevel: PullRequestRiskLevel;
  latestRiskSummary?: string;
  commentCount: number;
  issueCount: number;
  fileCount: number;
  latestHeadCommit?: string;
  lastActivityAt: string;
  jobCount: number;
  jobs: PullRequestReviewJob[];
  reports: ReviewReportSummary[];
}

export interface ReviewReportSummary {
  analysisId: string;
  jobId?: string;
  status: AnalysisStatus;
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  summary?: string;
  issueCount: number;
  commentCount: number;
  fileCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface ReviewFinding {
  filePath: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'bug' | 'logic' | 'impact' | 'performance' | 'maintainability';
  lineNumber?: number;
  resolvedLineNumber?: number;
  suggestion?: string;
  source?: 'rule' | 'llm' | 'summary';
  codeSnippet?: string;
}

export interface ReviewSemanticContext {
  changedSymbols: string[];
  relatedSnippets: string[];
  impactReferences: string[];
  relatedTests: string[];
  contextEngineAvailable: boolean;
}

export interface ReviewCoverageSummary {
  totalFiles: number;
  reviewedFiles: number;
  skippedFiles: Array<{
    path: string;
    status: string;
    reason: 'missing_patch' | 'unsupported_type' | 'empty_diff';
  }>;
  partialReview: boolean;
}

export interface SuppressedFinding {
  finding: ReviewFinding;
  reason: string;
}

export interface ReviewTraceStageEntry {
  kind: 'stage';
  stage: string;
  status: 'started' | 'completed' | 'failed' | 'timeout' | 'skipped';
  detail?: string;
  durationMs?: number;
  at: string;
}

export interface ReviewTraceToolEntry {
  kind: 'tool';
  stage: string;
  tool: string;
  input: string;
  output: string;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  durationMs: number;
  at: string;
}

export interface ReviewTraceDecisionEntry {
  kind: 'decision';
  stage: string;
  filePath?: string;
  title?: string;
  action: 'produced' | 'suppressed' | 'fallback';
  reason: string;
  evidenceRefs?: string[];
  at: string;
}

export type ReviewTraceEntry = ReviewTraceStageEntry | ReviewTraceToolEntry | ReviewTraceDecisionEntry;

export interface ReviewTracePayload {
  mode: 'normal' | 'improve';
  promptVersion: string;
  generatedAt: string;
  entries: ReviewTraceEntry[];
}

export interface ReviewReportCodeLine {
  type: 'add' | 'delete' | 'context' | 'omitted';
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
  content: string;
  findings: ReviewFinding[];
}

export interface ReviewReportFileContext {
  filePath: string;
  status?: string;
  language?: string;
  fileSummary?: string;
  semanticContext?: ReviewSemanticContext;
  usedFallback?: boolean;
  additions: number;
  deletions: number;
  changes: number;
  patchAvailable: boolean;
  totalFindings: number;
  generalFindings: ReviewFinding[];
  lines: ReviewReportCodeLine[];
}

export interface ReviewReportDetail {
  analysis: Analysis;
  summary?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  confidence?: 'high' | 'medium' | 'low';
  reviewMode?: 'normal' | 'improve';
  reportMarkdown?: string;
  findings: ReviewFinding[];
  fileContexts: ReviewReportFileContext[];
  coverage?: ReviewCoverageSummary;
  nextActions?: string[];
  suppressedFindings?: SuppressedFinding[];
  trace?: ReviewTracePayload;
  fileCount: number;
  commentCount: number;
  issueCount: number;
  jobId?: string;
  generatedAt?: string;
}

// ============ 分析相关类型 ============

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Analysis {
  id: string;
  repositoryId: string;
  platform: Platform;
  platformPrId: string;
  platformPrNumber: number;
  prTitle: string;
  prAuthor: string;
  prUrl: string;
  baseBranch: string;
  headBranch: string;
  status: AnalysisStatus;
  errorMessage?: string;
  reviewCommentCount: number;
  fileAnalysisCount: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  repository?: Repository;
}

// ============ 作业相关类型 ============

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type JobType = 'analyze_pr' | 'sync_repository' | 'refresh_oauth';

export interface AnalysisJob {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  repoName?: string;
  prNumber?: number;
  prTitle?: string;
  triggerSource?: 'manual' | 'watch' | 'webhook';
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  analysisId?: string;
  analysis?: Analysis;
}

export interface JobLog {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  createdAt: string;
}

// ============ API 响应类型 ============

export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}

// ============ UI 相关类型 ============

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  createdAt: string;
}

export interface RouteGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// ============ 系统状态类型 ============

export interface SystemStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: 'connected' | 'disconnected';
  worker: 'running' | 'stopped' | 'error';
  memoryUsage?: {
    total: number;
    used: number;
    available: number;
    percentage: number;
    swapTotal?: number;
    swapUsed?: number;
    swapPercentage?: number;
  };
  uptime: number;
  version: string;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  percentage: number;
  swapTotal?: number;
  swapUsed?: number;
  swapPercentage?: number;
}

// 系统设置相关类型
export interface SystemSettings {
  // 环境变量
  apiPort: number;
  apiHost: string;
  frontendPort: number;
  frontendUrl: string;
  // 数据库配置
  dbCacheSize: number;
  dbConnectionPoolSize: number;
  dbConnectionTimeout: number;
  // OAuth 配置
  githubEnabled: boolean;
  giteeEnabled: boolean;
  gitlabEnabled: boolean;
  // 系统选项
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  jobTimeout: number;
  jobMaxRetries: number;
  jobConcurrency: number;
  // 性能优化
  twoU2gEnabled: boolean;
  memoryLimit: number;
  // 安全设置
  sessionTimeout: number;
  passwordMinLength: number;
  requireStrongPassword: boolean;
  // 备份配置
  autoBackupEnabled: boolean;
  backupSchedule: string;
  backupRetentionDays: number;
  // LLM 配置
  llmProvider: string;
  llmApiKey: string;
  llmApiBaseUrl: string;
  llmModel: string;
  llmMaxRetries: number;
}

export interface BackupInfo {
  id: string;
  path: string;
  size: number;
  createdAt: string;
}

export interface ResourceStats {
  jobsProcessed: number;
  jobsFailed: number;
  avgProcessingTime: number;
  queue?: {
    activeCount: number;
    pendingCount: number;
    total: number;
  };
  limits?: {
    workerCount: number;
  };
  currentMemory?: MemoryInfo;
  peakMemory?: number;
  llm?: {
    configured: boolean;
    provider: string;
    model: string;
    baseUrl?: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
    failedRequests: number;
  };
}

export interface LlmTestResult {
  available: boolean;
  latencyMs: number;
  provider: string;
  model: string;
  availableModels: string[];
  responsePreview?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  message: string;
}
