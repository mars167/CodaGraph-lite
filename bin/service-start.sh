#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$PROJECT_ROOT/.run"
PID_FILE="$RUN_DIR/dev.pid"
LOG_FILE="$RUN_DIR/dev.log"

mkdir -p "$RUN_DIR"

check_backend_signature() {
  local body
  body="$(curl -s --max-time 2 http://localhost:7900/health || true)"
  if [ -z "$body" ]; then
    return 1
  fi
  echo "$body" | grep -Eiq 'codagraph-lite'
}

detect_port_conflict() {
  local listener
  listener="$(lsof -nP -iTCP:7900 -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
  if [ -z "$listener" ]; then
    return 0
  fi
  if check_backend_signature; then
    return 0
  fi
  echo "端口 7900 已被其他服务占用 (PID: $listener)"
  ps -p "$listener" -o pid,command
  echo "请先停止占用 7900 的服务后重试"
  return 1
}

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "${EXISTING_PID:-}" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    if ! check_backend_signature; then
      echo "检测到当前后端不是 CodaGraph-lite，请先处理端口冲突"
      detect_port_conflict || true
      exit 1
    fi
    echo "服务已在运行 (PID: $EXISTING_PID)"
    echo "日志: $LOG_FILE"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

detect_port_conflict

echo "启动服务中..."
nohup npm run dev >"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"

sleep 2

if ! kill -0 "$NEW_PID" 2>/dev/null; then
  echo "启动失败，请检查日志: $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi

echo "启动成功 (PID: $NEW_PID)"
echo "前端: http://localhost:3000"
echo "后端: http://localhost:7900"
echo "日志: $LOG_FILE"
