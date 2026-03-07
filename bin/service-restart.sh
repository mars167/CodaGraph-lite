#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "重启服务..."
"$SCRIPT_DIR/service-stop.sh"
"$SCRIPT_DIR/service-start.sh"
