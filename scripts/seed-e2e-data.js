const path = require('path');
const Database = require('../server/node_modules/better-sqlite3');

const dbPath = path.join(__dirname, '..', 'server', 'data', 'codagraph-lite.db');
const db = new Database(dbPath);

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
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_analyzed_at TEXT
  );

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
    status TEXT NOT NULL DEFAULT 'pending',
    analysis_result TEXT NOT NULL DEFAULT '{}',
    comment_count INTEGER NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    issue_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    failed_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR REPLACE INTO repository (
    id, platform, owner, name, full_name, installation_id, webhook_url, is_active, created_at, updated_at, last_analyzed_at
  ) VALUES (
    9101, 'github', 'mars167', 'codagraph-lite', 'mars167/codagraph-lite',
    9001, 'https://example.com/webhook', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT OR REPLACE INTO analysis (
    id, platform, owner, repo_name, pr_number, pr_title, pr_author, base_commit, head_commit,
    status, analysis_result, comment_count, file_count, issue_count, started_at, completed_at,
    error_message, created_at, updated_at
  ) VALUES (
    9201, 'github', 'mars167', 'codagraph-lite', 42, 'E2E validation PR', 'mars167',
    'main', 'feature/e2e', 'completed', '{}', 3, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT OR REPLACE INTO jobs (
    id, type, payload, status, priority, attempts, max_attempts,
    error_message, created_at, updated_at, started_at, completed_at
  ) VALUES (
    9301, 'pr_analysis', '{"platform":"github","repo_name":"codagraph-lite","pr_number":"42"}',
    'completed', 3, 1, 3, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
`);

console.log(`Seeded E2E data into ${dbPath}`);
db.close();
