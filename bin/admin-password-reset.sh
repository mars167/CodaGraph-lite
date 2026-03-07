#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

USERNAME="${1:-${ADMIN_USERNAME:-admin}}"
NEW_PASSWORD="${2:-${ADMIN_PASSWORD:-}}"

if [ -z "${NEW_PASSWORD:-}" ]; then
  echo "缺少新密码。用法: $0 [username] [new_password]"
  exit 1
fi

DB_PATH="${DATABASE_PATH:-./data/codagraph-lite.db}"
if [[ "$DB_PATH" = /* ]]; then
  RESOLVED_DB_PATH="$DB_PATH"
elif [ -f "$PROJECT_ROOT/$DB_PATH" ]; then
  RESOLVED_DB_PATH="$PROJECT_ROOT/$DB_PATH"
else
  RESOLVED_DB_PATH="$PROJECT_ROOT/server/$DB_PATH"
fi

if [ ! -f "$RESOLVED_DB_PATH" ]; then
  echo "数据库文件不存在: $RESOLVED_DB_PATH"
  exit 1
fi

export TARGET_USERNAME="$USERNAME"
export TARGET_PASSWORD="$NEW_PASSWORD"
export TARGET_DB_PATH="$RESOLVED_DB_PATH"

node <<'EOF'
const crypto = require('crypto');
const Database = require('./server/node_modules/better-sqlite3');

const username = process.env.TARGET_USERNAME;
const password = process.env.TARGET_PASSWORD;
const dbPath = process.env.TARGET_DB_PATH;

const db = new Database(dbPath);
const hash = crypto.createHash('sha256').update(password).digest('hex');
const stmt = db.prepare('UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?');
const result = stmt.run(hash, username);

if (result.changes === 0) {
  console.error(`未找到管理员用户: ${username}`);
  process.exit(2);
}

console.log(`管理员密码已重置: ${username}`);
console.log(`数据库: ${dbPath}`);
EOF
