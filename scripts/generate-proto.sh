#!/bin/bash
#
# Proto Generation Script
# Generates gRPC code from agent.proto for both Python and Node.js
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PROTO_FILE="$PROJECT_ROOT/proto/agent.proto"

echo "=========================================="
echo "Proto Code Generation"
echo "=========================================="
echo "Proto file: $PROTO_FILE"
echo ""

# Check proto file exists
if [ ! -f "$PROTO_FILE" ]; then
    echo "Error: Proto file not found at $PROTO_FILE"
    exit 1
fi

# Generate Python proto code
echo ">>> Generating Python proto code..."

PYTHON_OUT="$PROJECT_ROOT/proto/python"
mkdir -p "$PYTHON_OUT"

# Python generation using grpcio-tools
python -m grpc_tools.protoc \
    -I"$PROJECT_ROOT/proto" \
    --python_out="$PYTHON_OUT" \
    --grpc_python_out="$PYTHON_OUT" \
    "$PROTO_FILE"

# Also copy to agent directories
cp "$PYTHON_OUT/agent_pb2.py" "$PROJECT_ROOT/context-agent/src/context_agent/"
cp "$PYTHON_OUT/agent_pb2_grpc.py" "$PROJECT_ROOT/context-agent/src/context_agent/"
cp "$PYTHON_OUT/agent_pb2.py" "$PROJECT_ROOT/review-agent/src/review_agent/"
cp "$PYTHON_OUT/agent_pb2_grpc.py" "$PROJECT_ROOT/review-agent/src/review_agent/"

echo "   Python proto files generated:"
echo "   - $PYTHON_OUT/agent_pb2.py"
echo "   - $PYTHON_OUT/agent_pb2_grpc.py"
echo ""

# Generate Node.js proto code
echo ">>> Generating Node.js proto code..."

NODE_OUT="$PROJECT_ROOT/proto/node"
mkdir -p "$NODE_OUT"

# Check if grpc-tools is installed
if ! command -v grpc_tools_node_protoc &> /dev/null; then
    echo "Warning: grpc-tools not found for Node.js"
    echo "Installing grpc-tools..."
    npm install -g grpc-tools
fi

# Check if grpc_tools_node_protoc_ts is available for TypeScript
if ! npm list -g grpc_tools_node_protoc_ts &> /dev/null; then
    echo "Note: grpc_tools_node_protoc_ts not found, using plain JS generation"
fi

# Node.js generation using grpc-tools
# Generate JS code
grpc_tools_node_protoc \
    -I"$PROJECT_ROOT/proto" \
    --js_out=import_style=commonjs,binary:"$NODE_OUT" \
    --grpc_out=generate_package_definition:"$NODE_OUT" \
    "$PROTO_FILE"

echo "   Node.js proto files generated:"
echo "   - $NODE_OUT/agent_pb.js"
echo "   - $NODE_OUT/agent_grpc_pb.js"
echo ""

# Generate TypeScript definitions if possible
if command -v protoc-gen-ts &> /dev/null; then
    grpc_tools_node_protoc \
        -I"$PROJECT_ROOT/proto" \
        --js_out=import_style=commonjs,binary:"$NODE_OUT" \
        --grpc_out=generate_package_definition:"$NODE_OUT" \
        --plugin=protoc-gen-ts="$(which protoc-gen-ts)" \
        --ts_out="$NODE_OUT" \
        "$PROTO_FILE"
    echo "   TypeScript definitions generated"
fi

# Copy Node.js proto files to server
SERVER_PROTO_DIR="$PROJECT_ROOT/server/src/proto"
mkdir -p "$SERVER_PROTO_DIR"
cp "$NODE_OUT"/*.js "$SERVER_PROTO_DIR/" 2>/dev/null || true
cp "$NODE_OUT"/*.d.ts "$SERVER_PROTO_DIR/" 2>/dev/null || true

echo ""
echo "=========================================="
echo "Proto generation complete!"
echo "=========================================="