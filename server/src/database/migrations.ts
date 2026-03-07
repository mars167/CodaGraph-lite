/**
 * 数据库迁移系统
 *
 * 管理数据库 schema 版本和迁移脚本
 */

import { getConnection } from './index';

/**
 * 迁移记录
 */
export interface Migration {
  version: number;
  name: string;
  applied_at: Date | string;
}

/**
 * 获取迁移历史
 */
export function getMigrationHistory(): Migration[] {
  const db = getConnection();

  // 确保 migration_history 表存在
  db.execute(`
    CREATE TABLE IF NOT EXISTS migration_history (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  const migrations = db.all<Migration>(
    'SELECT * FROM migration_history ORDER BY version DESC'
  );

  return migrations;
}

/**
 * 运行所有未应用的迁移
 */
export async function runMigrations(): Promise<number> {
  const db = getConnection();
  const applied = 0;

  try {
    // 确保数据库已初始化
    await db.initialize();

    // 获取已应用的迁移版本
    const appliedVersions = new Set<number>();
    const history = getMigrationHistory();
    for (const record of history) {
      appliedVersions.add(record.version);
    }

    // 迁移脚本列表
    const migrations = [
      {
        version: 1,
        name: 'initial_schema',
        sql: `
          -- 创建管理员表
          CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            last_login_at TEXT
          );

          -- 创建 OAuth 安装表
          CREATE TABLE IF NOT EXISTS installation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            account_id TEXT NOT NULL,
            account_name TEXT,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_expires_at TEXT,
            permissions TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            is_active INTEGER NOT NULL DEFAULT 1
          );

          -- 创建仓库表
          CREATE TABLE IF NOT EXISTS repository (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            owner TEXT NOT NULL,
            name TEXT NOT NULL,
            full_name TEXT NOT NULL,
            installation_id INTEGER NOT NULL,
            webhook_id TEXT,
            webhook_secret TEXT,
            webhook_url TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            last_analyzed_at TEXT
          );

          -- 创建分析记录表
          CREATE TABLE IF NOT EXISTS analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            owner TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            pr_number INTEGER NOT NULL,
            pr_title TEXT NOT NULL,
            pr_author TEXT NOT NULL,
            base_commit TEXT NOT NULL,
            head_commit TEXT NOT NULL,
            status TEXT NOT NULL,
            analysis_result TEXT NOT NULL,
            comment_count INTEGER NOT NULL DEFAULT 0,
            file_count INTEGER NOT NULL DEFAULT 0,
            issue_count INTEGER NOT NULL DEFAULT 0,
            started_at TEXT,
            completed_at TEXT,
            failed_at TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );

          -- 创建分析作业表
          CREATE TABLE IF NOT EXISTS analysis_job (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            analysis_id INTEGER NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL,
            progress REAL NOT NULL DEFAULT 0,
            message TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            failed_at TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );

          -- 创建 Webhook 事件表
          CREATE TABLE IF NOT EXISTS webhook_event (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            processed INTEGER NOT NULL DEFAULT 0,
            processing_error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );

          -- 创建使用指标表
          CREATE TABLE IF NOT EXISTS usage_metric (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_type TEXT NOT NULL,
            metric_value INTEGER NOT NULL,
            platform TEXT,
            repository_id INTEGER,
            recorded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );

          -- 创建作业表
          CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            priority INTEGER NOT NULL DEFAULT 5,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            error_message TEXT,
            started_at TEXT,
            completed_at TEXT,
            failed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );
        `
      },
      {
        version: 2,
        name: 'add_activity_log_table',
        sql: `
          -- 创建活动日志表
          CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
            action TEXT NOT NULL CHECK(action IN ('login', 'logout', 'password_change', 'failed_login')),
            ip_address TEXT,
            user_agent TEXT,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );

          CREATE INDEX IF NOT EXISTS idx_activity_log_admin ON activity_log(admin_id);
          CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
          CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
        `
      },
      {
        version: 3,
        name: 'add_oauth_tables',
        sql: `
          -- 创建 OAuth 安装表
          CREATE TABLE IF NOT EXISTS oauth_installations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
            account_id TEXT NOT NULL,
            account_name TEXT,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_expires_at DATETIME,
            permissions TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_oauth_installations_platform ON oauth_installations(platform);
          CREATE INDEX IF NOT EXISTS idx_oauth_installations_account ON oauth_installations(account_id, platform);

          -- 创建 OAuth 授权表（存储临时 state）
          CREATE TABLE IF NOT EXISTS oauth_authorize (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
            state TEXT NOT NULL UNIQUE,
            redirect_uri TEXT NOT NULL,
            scope TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_oauth_authorize_state ON oauth_authorize(state);
          CREATE INDEX IF NOT EXISTS idx_oauth_authorize_expires ON oauth_authorize(expires_at);

          -- 创建 OAuth Token 表（存储访问令牌）
          CREATE TABLE IF NOT EXISTS oauth_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL CHECK(platform IN ('github', 'gitee', 'gitlab')),
            account_id TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_type TEXT NOT NULL CHECK(token_type IN ('access', 'refresh', 'state')),
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_oauth_tokens_platform ON oauth_tokens(platform);
          CREATE INDEX IF NOT EXISTS idx_oauth_tokens_account ON oauth_tokens(account_id);
          CREATE INDEX IF NOT EXISTS idx_oauth_tokens_type ON oauth_tokens(token_type);
          CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);
        `
      },
      {
        version: 4,
        name: 'add_github_app_fields_to_oauth_installations',
        sql: `
          ALTER TABLE oauth_installations ADD COLUMN auth_type TEXT DEFAULT 'oauth';
          ALTER TABLE oauth_installations ADD COLUMN github_app_installation_id TEXT;
          CREATE INDEX IF NOT EXISTS idx_oauth_installations_auth_type ON oauth_installations(auth_type);
          CREATE INDEX IF NOT EXISTS idx_oauth_installations_gh_app_installation_id ON oauth_installations(github_app_installation_id);
        `
      },
      {
        version: 5,
        name: 'add_repository_cache_fields',
        sql: `
          ALTER TABLE repository ADD COLUMN remote_id TEXT;
          ALTER TABLE repository ADD COLUMN description TEXT;
          ALTER TABLE repository ADD COLUMN is_private BOOLEAN DEFAULT 0;
          ALTER TABLE repository ADD COLUMN language TEXT;
          ALTER TABLE repository ADD COLUMN stars_count INTEGER DEFAULT 0;
          ALTER TABLE repository ADD COLUMN forks_count INTEGER DEFAULT 0;
          ALTER TABLE repository ADD COLUMN default_branch TEXT;
          ALTER TABLE repository ADD COLUMN html_url TEXT;
          ALTER TABLE repository ADD COLUMN last_synced_at DATETIME;
          CREATE INDEX IF NOT EXISTS idx_repository_remote_id ON repository(platform, remote_id);
        `
      },
      {
        version: 6,
        name: 'add_job_log_table',
        sql: `
          CREATE TABLE IF NOT EXISTS job_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_job_log_job_id ON job_log(job_id, created_at DESC);
        `
      },
      {
        version: 7,
        name: 'add_repository_watch_and_review_lock',
        sql: `
          ALTER TABLE repository ADD COLUMN watch_enabled BOOLEAN DEFAULT 0;
          ALTER TABLE repository ADD COLUMN watch_last_checked_at DATETIME;
          CREATE INDEX IF NOT EXISTS idx_repository_watch_enabled ON repository(watch_enabled, is_active);

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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            released_at DATETIME
          );

          CREATE INDEX IF NOT EXISTS idx_review_lock_analysis ON review_lock(analysis_id);
          CREATE INDEX IF NOT EXISTS idx_review_lock_job ON review_lock(job_id);
          CREATE INDEX IF NOT EXISTS idx_review_lock_pr ON review_lock(platform, owner, repo_name, pr_number, created_at DESC);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_review_lock_active
          ON review_lock(platform, owner, repo_name, pr_number, head_commit)
          WHERE status = 'active';
        `
      },
    ];

    // 应用未应用的迁移
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`📦 应用迁移 v${migration.version}: ${migration.name}`);

        // 分割 SQL 语句并逐个执行
        const statements = migration.sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const statement of statements) {
          db.execute(statement);
        }

        // 记录迁移
        db.execute(
          `INSERT INTO migration_history (version, name)
           VALUES (?, ?)`,
          [migration.version, migration.name]
        );

        return migration.version;
      }
    }

    return applied;
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw new Error(`迁移失败: ${(error as Error).message}`);
  }
}

/**
 * 验证迁移完整性
 */
export function verifyMigrationIntegrity(): boolean {
  // Use getConnection() to ensure database is accessible
  if (!getConnection()) {
    console.error('❌ 数据库连接不可用');
    return false;
  }
  const history = getMigrationHistory();

  // 检查是否有重复版本
  const versions = history.map(m => m.version);
  const uniqueVersions = new Set(versions);
  if (versions.length !== uniqueVersions.size) {
    console.error('❌ 迁移历史中存在重复版本');
    return false;
  }

  // 检查版本是否连续
  const sortedVersions = [...uniqueVersions].sort((a, b) => a - b);
  for (let i = 1; i < sortedVersions.length; i++) {
    if (sortedVersions[i] !== sortedVersions[i - 1] + 1) {
      console.error(`❌ 迁移版本不连续: ${sortedVersions[i - 1]} -> ${sortedVersions[i]}`);
      return false;
    }
  }

  return true;
}

/**
 * 回滚到指定版本
 */
export async function rollbackToVersion(version: number): Promise<void> {
  const db = getConnection();

  try {
    console.log(`⏪ 回滚到版本 ${version}`);

    // 删除迁移历史中大于指定版本的记录
    db.execute('DELETE FROM migration_history WHERE version > ?', [version]);

    console.log(`✅ 已回滚到版本 ${version}`);
  } catch (error) {
    console.error('❌ 回滚失败:', error);
    throw new Error(`回滚失败: ${(error as Error).message}`);
  }
}

/**
 * 创建迁移模板
 */
export function createMigrationTemplate(): string {
  return `
-- 迁移版本: {version}
-- 迁移名称: {name}
-- 描述: {description}

-- 在此处添加 SQL 语句
-- 例如:
-- CREATE TABLE IF NOT EXISTS example (
--   id INTEGER PRIMARY KEY,
--   name TEXT NOT NULL
-- );

-- 记录迁移
INSERT INTO migration_history (version, name)
VALUES ({version}, '{name}');
  `.trim();
}
