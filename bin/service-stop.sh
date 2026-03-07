#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$PROJECT_ROOT/.run"
PID_FILE="$RUN_DIR/dev.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "未找到运行中的服务 PID 文件"
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -z "${PID:-}" ]; then
  rm -f "$PID_FILE"
  echo "PID 文件为空，已清理"
  exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "进程不存在，已清理 PID 文件"
  exit 0
fi

echo "停止服务 (PID: $PID)..."
kill "$PID" 2>/dev/null || true
sleep 1

if kill -0 "$PID" 2>/dev/null; then
  kill -9 "$PID" 2>/dev/null || true
  sleep 1
fi

rm -f "$PID_FILE"
echo "服务已停止"
