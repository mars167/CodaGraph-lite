#!/bin/bash
# Proto 文件生成脚本
# 用于生成 Python 和 TypeScript 的 gRPC 代码

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROTO_DIR="$PROJECT_ROOT/proto"
PROTO_FILE="$PROTO_DIR/agent.proto"

echo "=========================================="
echo "  Proto 文件生成脚本"
echo "=========================================="
echo "项目根目录: $PROJECT_ROOT"
echo "Proto 文件: $PROTO_FILE"
echo ""

# 检查 proto 文件是否存在
if [ ! -f "$PROTO_FILE" ]; then
    echo "❌ 错误: Proto 文件不存在: $PROTO_FILE"
    exit 1
fi

# 生成 Python gRPC 代码
# 注意：独立 review-agent 已退役，Python stubs 只需要同步到 context-agent。
echo "📝 生成 Python gRPC 代码..."

# Context Agent
if [ -d "$PROJECT_ROOT/context-agent" ]; then
    python -m grpc_tools.protoc \
        -I"$PROTO_DIR" \
        --python_out="$PROJECT_ROOT/context-agent/src" \
        --grpc_python_out="$PROJECT_ROOT/context-agent/src" \
        "$PROTO_FILE"
    echo "✅ Context Agent Python 代码生成完成"
fi

# 生成 TypeScript gRPC 代码（需要 grpc-tools）
echo "📝 生成 TypeScript gRPC 代码..."

if [ -d "$PROJECT_ROOT/server" ]; then
    # 检查 protoc-gen-ts 是否安装
    if command -v protoc-gen-ts &> /dev/null; then
        python -m grpc_tools.protoc \
            -I"$PROTO_DIR" \
            --ts_out="$PROJECT_ROOT/server/src/proto" \
            --grpc_ts_out="$PROJECT_ROOT/server/src/proto" \
            "$PROTO_FILE"
        echo "✅ Server TypeScript 代码生成完成"
    else
        echo "⚠️  警告: protoc-gen-ts 未安装，跳过 TypeScript 生成"
        echo "   安装方法: npm install -g grpc-tools protoc-gen-ts"
    fi
fi

echo ""
echo "=========================================="
echo "  ✅ Proto 文件生成完成"
echo "=========================================="
