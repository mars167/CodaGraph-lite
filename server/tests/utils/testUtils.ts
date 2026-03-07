/**
 * 测试工具函数
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';

/**
 * 创建内存数据库用于测试
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');

  // 启用 WAL mode (内存数据库不支持，但设置无害)
  db.pragma('journal_mode = MEMORY');

  // 设置缓存大小
  db.pragma('cache_size = -2000');

  return db;
}

/**
 * 初始化测试数据库 schema
 */
export function initializeTestSchema(db: Database.Database): void {
  // Admin 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    )
  `);

  // Sessions 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      admin_username TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      ip TEXT,
      user_agent TEXT,
      FOREIGN KEY (admin_id) REFERENCES admin(id)
    )
  `);

  // Jobs 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 5,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      error_message TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      failed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Activity Log 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admin(id)
    )
  `);

  // OAuth Installation 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_installation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      account_id TEXT NOT NULL,
      account_name TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at DATETIME,
      permissions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1,
      UNIQUE(platform, account_id)
    )
  `);

  // Repository 表
  db.exec(`
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
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_analyzed_at DATETIME,
      FOREIGN KEY (installation_id) REFERENCES oauth_installation(id)
    )
  `);

  // Analysis 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_title TEXT,
      pr_author TEXT,
      base_commit TEXT,
      head_commit TEXT,
      status TEXT DEFAULT 'pending',
      analysis_result TEXT,
      comment_count INTEGER DEFAULT 0,
      file_count INTEGER DEFAULT 0,
      issue_count INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      failed_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Webhook Events 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_id TEXT,
      payload TEXT,
      processed BOOLEAN DEFAULT 0,
      processing_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
    CREATE INDEX IF NOT EXISTS idx_activity_log_admin_id ON activity_log(admin_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_status ON analysis(status);
  `);
}

/**
 * 清理测试数据库
 */
export function cleanupTestDatabase(db: Database.Database): void {
  db.exec('DELETE FROM activity_log');
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM jobs');
  db.exec('DELETE FROM analysis');
  db.exec('DELETE FROM repository');
  db.exec('DELETE FROM oauth_installation');
  db.exec('DELETE FROM admin');
}

/**
 * 关闭测试数据库
 */
export function closeTestDatabase(db: Database.Database): void {
  db.close();
}

/**
 * 创建测试管理员
 */
export function createTestAdmin(db: Database.Database, username = 'admin', password = 'password123'): number {
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  const result = db.prepare(
    'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
  ).run(username, passwordHash);

  return result.lastInsertRowid as number;
}

/**
 * 创建测试会话
 */
export function createTestSession(db: Database.Database, adminId: number, username = 'admin'): string {
  const sessionId = `test_sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO sessions (id, admin_id, admin_username, expires_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, adminId, username, expiresAt);

  return sessionId;
}

/**
 * 创建测试作业
 */
export function createTestJob(db: Database.Database, type = 'pr_analysis', status = 'pending'): number {
  const payload = JSON.stringify({
    platform: 'github',
    repo_name: 'test/repo',
    pr_number: '1'
  });

  const result = db.prepare(
    'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
  ).run(type, payload, status);

  return result.lastInsertRowid as number;
}

/**
 * 等待指定毫秒
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成随机字符串
 */
export function randomString(length = 10): string {
  return Math.random().toString(36).substring(2, length + 2);
}

/**
 * Hash password (matches AdminModel implementation)
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}