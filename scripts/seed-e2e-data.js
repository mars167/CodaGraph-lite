const path = require('path');
const crypto = require('crypto');
const Database = require(require.resolve('better-sqlite3', {
  paths: [path.join(__dirname, '..', 'server')],
}));

const dbPath = path.join(__dirname, '..', 'server', 'data', 'codagraph-lite.db');
const db = new Database(dbPath);
// Keep fixture data ahead of existing rows so the e2e smoke tests can locate it deterministically.
const seededTimestamp = "datetime('now', 'localtime', '+1 day')";
const seededAdminPasswordHash = crypto
  .createHash('sha256')
  .update('changeme')
  .digest('hex');
const seededReportPayload = {
  generatedAt: new Date().toISOString(),
  jobId: 9301,
  riskLevel: 'low',
  confidence: 'low',
  reviewMode: 'normal',
  summary: 'E2E report with low-signal structured metadata keeps markdown visible.',
  reportMarkdown: [
    '# E2E Raw Markdown',
    '',
    'E2E raw markdown body should be visible by default.',
    '',
    '<script>window.__codagraphXss = true</script>',
    '',
    '[unsafe link](javascript:alert(1))',
  ].join('\n'),
  files: [
    {
      path: 'src/e2e-low.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      changes: 1,
    },
  ],
  fileReviews: [
    {
      filePath: 'src/e2e-low.ts',
      status: 'modified',
      language: 'typescript',
      fileSummary: 'Metadata-only file context used by report-page E2E.',
      findings: [],
      patch: '@@ -1,1 +1,2 @@\n export const value = 1;\n+export const lowSignal = true;\n',
      semanticContext: {
        changedSymbols: [],
        relatedSnippets: [],
        impactReferences: [],
        relatedTests: [],
        contextEngineAvailable: false,
      },
      usedFallback: true,
    },
  ],
  findings: [
    {
      filePath: 'src/e2e-low.ts',
      lineNumber: 2,
      severity: 'low',
      category: 'style',
      title: 'Low-signal E2E finding',
      description: 'This low-severity finding should not collapse the raw markdown by default.',
      suggestion: 'Keep the raw markdown visible unless high-signal findings exist.',
      source: 'e2e',
    },
  ],
  coverage: {
    totalFiles: 1,
    reviewedFiles: 1,
    skippedFiles: [],
    partialReview: false,
  },
  nextActions: [],
  suppressedFindings: [],
  trace: {
    mode: 'normal',
    promptVersion: 'e2e',
    generatedAt: new Date().toISOString(),
    entries: [],
  },
};

try {
  db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    last_login_at TEXT
  );

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

  INSERT OR REPLACE INTO admin (
    id, username, password_hash, created_at, updated_at, last_login_at
  ) VALUES (
    1, 'admin', '${seededAdminPasswordHash}', ${seededTimestamp}, ${seededTimestamp}, NULL
  );

  INSERT OR REPLACE INTO oauth_installations (
    id, platform, auth_type, account_id, account_name, access_token, permissions, is_active, created_at, updated_at
  ) VALUES (
    9001, 'github', 'oauth', 'mars167-e2e', 'mars167 E2E', 'e2e-token', 'repo', 1, ${seededTimestamp}, ${seededTimestamp}
  );

  INSERT OR REPLACE INTO repository (
    id, platform, owner, name, full_name, installation_id, webhook_url, is_active, created_at, updated_at, last_analyzed_at
  ) VALUES (
    9101, 'github', 'mars167', 'codagraph-lite-e2e-fixture', 'mars167/codagraph-lite-e2e-fixture',
    9001, 'https://example.com/webhook', 1, ${seededTimestamp}, ${seededTimestamp}, ${seededTimestamp}
  );

  INSERT OR REPLACE INTO analysis (
    id, platform, owner, repo_name, pr_number, pr_title, pr_author, base_commit, head_commit,
    status, analysis_result, comment_count, file_count, issue_count, started_at, completed_at,
    error_message, created_at, updated_at
  ) VALUES (
    9201, 'github', 'mars167', 'codagraph-lite-e2e-fixture', 42, 'E2E validation PR', 'mars167',
    'main', 'feature/e2e', 'completed', '{}', 3, 5, 1, ${seededTimestamp}, ${seededTimestamp},
    NULL, ${seededTimestamp}, ${seededTimestamp}
  );

  INSERT OR REPLACE INTO jobs (
    id, type, payload, status, priority, attempts, max_attempts,
    error_message, created_at, updated_at, started_at, completed_at
  ) VALUES (
    9301, 'pr_analysis', '{"platform":"github","repo_name":"codagraph-lite-e2e-fixture","pr_number":"42"}',
    'completed', 3, 1, 3, NULL, ${seededTimestamp}, ${seededTimestamp}, ${seededTimestamp}, ${seededTimestamp}
  );
  `);

  db.prepare(`
    UPDATE analysis
    SET analysis_result = ?, comment_count = ?, file_count = ?, issue_count = ?
    WHERE id = 9201
  `).run(JSON.stringify(seededReportPayload), 3, 1, seededReportPayload.findings.length);

  console.log(`Seeded E2E data into ${dbPath}`);
} finally {
  db.close();
}
