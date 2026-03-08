/**
 * OAuth 数据库 Schema
 *
 * 定义 OAuth 相关的数据库表结构
 */

/**
 * OAuth 安装表
 */
export const OAUTH_INSTALLATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS oauth_installations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  auth_type TEXT DEFAULT 'oauth',
  github_app_installation_id TEXT,
  account_id TEXT NOT NULL,
  account_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at DATETIME,
  permissions TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_oauth_installations_platform ON oauth_installations(platform);
CREATE INDEX IF NOT EXISTS idx_oauth_installations_account ON oauth_installations(account_id, platform);
`;

/**
 * OAuth 授权表（存储临时代码）
 */
export const OAUTH_AUTHORIZE_TABLE = `
CREATE TABLE IF NOT EXISTS oauth_authorize (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  state TEXT NOT NULL UNIQUE,
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorize_state ON oauth_authorize(state);
CREATE INDEX IF NOT EXISTS idx_oauth_authorize_expires ON oauth_authorize(expires_at);
`;

/**
 * OAuth Token 表（存储访问令牌）
 */
export const OAUTH_TOKEN_TABLE = `
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
  account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK(token_type IN ('access', 'refresh', 'state')),
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_platform ON oauth_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_account ON oauth_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_type ON oauth_tokens(token_type);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);
`;

export const OAUTH_TABLES = [
  OAUTH_INSTALLATIONS_TABLE,
  OAUTH_AUTHORIZE_TABLE,
  OAUTH_TOKEN_TABLE,
] as const;
