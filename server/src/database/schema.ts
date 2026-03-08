/**
 * SQLite 数据库 Schema 定义
 *
 * CodaGraph-lite 使用 SQLite 作为主数据库，2u2g 优化：
 * - WAL mode 启用以提高并发性能
 * - cache_size 限制为 2MB (cache_size=-2000)
 * - 适当的索引设计
 */

/**
 * 管理员账户表
 * 用于单管理员认证
 */
export const ADMIN_TABLE = `
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
  last_login_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_admin_username ON admin(username);
`;

/**
 * OAuth 安装表
 * 存储各平台的 OAuth 安装和 token 信息
 */
export const INSTALLATION_TABLE = `
CREATE TABLE IF NOT EXISTS installation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  account_id TEXT NOT NULL,
  account_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at DATETIME,
  permissions TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
  is_active BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_installation_platform ON installation(platform);
CREATE INDEX IF NOT EXISTS idx_installation_account ON installation(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_installation_unique ON installation(platform, account_id);
`;

/**
 * 仓库表
 * 存储已连接的仓库信息
 */
export const REPOSITORY_TABLE = `
CREATE TABLE IF NOT EXISTS repository (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  remote_id TEXT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT 0,
  language TEXT,
  stars_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  default_branch TEXT,
  html_url TEXT,
  installation_id INTEGER NOT NULL REFERENCES installation(id) ON DELETE CASCADE,
  webhook_id TEXT,
  webhook_secret TEXT,
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT 1,
  watch_enabled BOOLEAN DEFAULT 0,
  is_favorite BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
  last_synced_at DATETIME,
  last_analyzed_at DATETIME,
  watch_last_checked_at DATETIME,
  favorited_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_repository_platform ON repository(platform);
CREATE INDEX IF NOT EXISTS idx_repository_owner ON repository(owner);
CREATE INDEX IF NOT EXISTS idx_repository_installation ON repository(installation_id);
CREATE INDEX IF NOT EXISTS idx_repository_watch_enabled ON repository(watch_enabled, is_active);
CREATE INDEX IF NOT EXISTS idx_repository_favorite ON repository(is_favorite, favorited_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repository_unique ON repository(platform, owner, name);
`;

/**
 * 分析记录表
 * 存储每次 PR 审查的分析结果
 */
export const ANALYSIS_TABLE = `
CREATE TABLE IF NOT EXISTS analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_title TEXT,
  pr_author TEXT,
  base_commit TEXT,
  head_commit TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  analysis_result TEXT, -- JSON 格式的完整分析结果
  comment_count INTEGER DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  issue_count INTEGER DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  failed_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_pr ON analysis(platform, owner, repo_name, pr_number);
CREATE INDEX IF NOT EXISTS idx_analysis_status ON analysis(status);
CREATE INDEX IF NOT EXISTS idx_analysis_created ON analysis(created_at DESC);
`;

/**
 * 分析作业表
 * 跟踪 PR 分析的处理进度
 */
export const ANALYSIS_JOB_TABLE = `
CREATE TABLE IF NOT EXISTS analysis_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER REFERENCES analysis(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'cloning' CHECK(stage IN (
    'cloning',
    'indexing',
    'context_gathering',
    'code_review',
    'posting_comments',
    'cleanup',
    'completed',
    'failed'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  progress REAL DEFAULT 0, -- 0.0 到 1.0
  message TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  failed_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_job_analysis ON analysis_job(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_job_status ON analysis_job(status);
`;

/**
 * 作业队列表
 * 用于 SQLite 基于的作业队列
 */
export const JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('pr_analysis', 'context_analysis', 'code_review')),
  payload TEXT NOT NULL, -- JSON 格式的作业负载
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  priority INTEGER DEFAULT 5 CHECK(priority >= 1 AND priority <= 10), -- 1 = 最高优先级, 10 = 最低
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  failed_at DATETIME,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
`;

export const REVIEW_LOCK_TABLE = `
CREATE TABLE IF NOT EXISTS review_lock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  head_commit TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual', 'watch', 'webhook')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'released')),
  analysis_id INTEGER REFERENCES analysis(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
  released_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_review_lock_analysis ON review_lock(analysis_id);
CREATE INDEX IF NOT EXISTS idx_review_lock_job ON review_lock(job_id);
CREATE INDEX IF NOT EXISTS idx_review_lock_pr ON review_lock(platform, owner, repo_name, pr_number, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_lock_active
ON review_lock(platform, owner, repo_name, pr_number, head_commit)
WHERE status = 'active';
`;

export const JOB_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS job_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_job_log_job_id ON job_log(job_id, created_at DESC);
`;

/**
 * Webhook 事件表
 * 记录所有接收到的 webhook 事件
 */
export const WEBHOOK_EVENT_TABLE = `
CREATE TABLE IF NOT EXISTS webhook_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  event_type TEXT NOT NULL,
  payload_id TEXT,
  payload TEXT, -- JSON 格式的完整 payload
  processed BOOLEAN DEFAULT 0,
  processing_error TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_platform ON webhook_event(platform);
CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON webhook_event(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_event_processed ON webhook_event(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_event_created ON webhook_event(created_at DESC);
`;

/**
 * 使用指标表
 * 记录系统使用统计
 */
export const USAGE_METRIC_TABLE = `
CREATE TABLE IF NOT EXISTS usage_metric (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_type TEXT NOT NULL CHECK(metric_type IN (
    'analysis_total',
    'analysis_completed',
    'analysis_failed',
    'pr_analyzed',
    'comments_posted',
    'files_reviewed',
    'llm_prompt_tokens',
    'llm_completion_tokens',
    'llm_total_tokens',
    'llm_requests_total',
    'llm_requests_failed'
  )),
  metric_value INTEGER NOT NULL,
  platform TEXT,
  repository_id INTEGER REFERENCES repository(id) ON DELETE SET NULL,
  recorded_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_usage_metric_type ON usage_metric(metric_type);
CREATE INDEX IF NOT EXISTS idx_usage_metric_recorded ON usage_metric(recorded_at DESC);
`;

export const APP_SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS app_setting (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_app_setting_updated_at ON app_setting(updated_at DESC);
`;

/**
 * Schema 版本表
 * 用于数据库迁移管理
 */
export const SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  description TEXT,
  applied_at DATETIME DEFAULT (datetime('now', 'localtime'))
);
`;

/**
 * 获取所有表创建 SQL
 */
export const ALL_TABLES = [
  { name: 'schema_version', sql: SCHEMA_VERSION_TABLE },
  { name: 'admin', sql: ADMIN_TABLE },
  { name: 'installation', sql: INSTALLATION_TABLE },
  { name: 'repository', sql: REPOSITORY_TABLE },
  { name: 'analysis', sql: ANALYSIS_TABLE },
  { name: 'analysis_job', sql: ANALYSIS_JOB_TABLE },
  { name: 'jobs', sql: JOBS_TABLE },
  { name: 'review_lock', sql: REVIEW_LOCK_TABLE },
  { name: 'job_log', sql: JOB_LOG_TABLE },
  { name: 'webhook_event', sql: WEBHOOK_EVENT_TABLE },
  { name: 'usage_metric', sql: USAGE_METRIC_TABLE },
  { name: 'app_setting', sql: APP_SETTING_TABLE },
];

/**
 * 当前 schema 版本
 */
export const CURRENT_SCHEMA_VERSION = 1;
