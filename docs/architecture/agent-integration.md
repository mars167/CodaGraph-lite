# Agent 集成文档

> Historical note: the legacy gRPC review-agent path has been removed from the active product. This document is retained for historical reference only.

## 概述

本文档描述了 CodaGraph 中 Python AI Agents 与 Node.js 后端的集成方式，包括通信协议、生命周期管理和调试工具。

---

## 1. 架构概述

### 1.1 组件

| 组件 | 语言 | 端口 | 职责 |
|------|--------|------|--------|
| Context Agent | Python 3.11+ | 50052 | 使用 Code Context Engine 收集代码上下文 |
| Review Agent | Python 3.11+ | 50051 | 使用 LLM 进行代码审查 |
| Agent Manager | TypeScript (Node.js) | - | 管理子进程生命周期 |
| Agent Client | TypeScript (Node.js) | - | gRPC 客户端通信 |

### 1.2 通信流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        Node.js 后端                            │
├─────────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐           │
│  │Agent Manager │────────▶│ Agent Client │           │
│  └──────────────┘         └──────┬───────┘           │
│                                    │                        │
│                            ┌─────────▼─────────┐         │
│                            │     gRPC          │         │
│                            │  (50051/50052)    │         │
│                            └─────────┬─────────┘         │
│                                      │                   │
│         ┌───────────────────────────────┴──────────┐     │
│         │                                      │     │
│   ┌─────▼─────┐                          ┌───▼─────┐│
│   │Context     │                          │Review    ││
│   │Agent       │                          │Agent     ││
│   │:50052      │                          │:50051     ││
│   └────────────┘                          └───────────┘│
│                                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. gRPC 协议

### 2.1 Proto 定义

Proto 文件位于 `proto/agent.proto`，定义了两个服务：

#### ContextAgentService

```protobuf
service ContextAgentService {
  rpc CollectContext(ContextRequest) returns (ContextResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

#### ReviewAgentService

```protobuf
service ReviewAgentService {
  rpc ReviewCode(ReviewRequest) returns (ReviewResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

### 2.2 代码生成

运行以下命令生成 TypeScript 和 Python gRPC 代码：

```bash
bash scripts/generate_proto.sh
```

这会生成：
- `server/src/proto/agent_pb2.ts` - TypeScript 消息定义
- `server/src/proto/agent_pb2_grpc.ts` - TypeScript 服务客户端
- `context-agent/proto/agent_pb2.py` - Python 消息定义
- `context-agent/proto/agent_pb2_grpc.py` - Python 服务定义
- `review-agent/proto/agent_pb2.py` - Python 消息定义
- `review-agent/proto/agent_pb2_grpc.py` - Python 服务定义

---

## 3. Agent Manager

### 3.1 职责

Agent Manager 负责 Python agent 子进程的完整生命周期：

1. **按需启动** - 只在需要时启动 agent 进程
2. **超时监控** - Context Agent: 5分钟, Review Agent: 10分钟
3. **强制终止** - SIGTERM → 等待 5 秒 → SIGKILL
4. **单并发强制** - 任何时候只允许一个 agent 运行
5. **僵尸进程检测** - 每 30 秒检测一次
6. **优雅关闭** - 后端关闭时终止所有 agents

### 3.2 配置

```typescript
const config: AgentConfig = {
  contextAgentPath: './context-agent/src/context_agent/grpc_server.py',
  reviewAgentPath: './review-agent/src/review_agent/grpc_server.py',
  contextTimeout: 300000,    // 5 分钟
  reviewTimeout: 600000,     // 10 分钟
  killTimeout: 5000,          // 5 秒
  pythonPath: 'python',
};
```

### 3.3 API

```typescript
// 启动 agent
await agentManager.startContextAgent(jobId);
await agentManager.startReviewAgent(jobId);

// 终止 agent
await agentManager.terminateAgent(jobId, 'timeout');

// 终止所有
await agentManager.terminateAll('shutdown');

// 查询状态
agentManager.isAgentRunning(jobId);
agentManager.getActiveAgent();

// 获取统计
const stats = agentManager.getStats();
```

---

## 4. Agent 客户端

### 4.1 ContextAgentClient

```typescript
const client = new ContextAgentClient('localhost', 50052);
await client.connect();

// 收集上下文
const context = await client.collectContext({
  jobId: 'job-123',
  workspacePath: '/tmp/repos/github/owner/repo/1/job-123',
  files: ['src/main.ts', 'src/utils.ts'],
  prInfo: { platform: 'github', owner: 'owner', repo: 'repo', prNumber: '1' },
});

// 健康检查
const health = await client.healthCheck();

client.close();
```

### 4.2 ReviewAgentClient

```typescript
const client = new ReviewAgentClient('localhost', 50051);
await client.connect();

// 代码审查
const result = await client.reviewCode({
  jobId: 'job-123',
  workspacePath: '/tmp/repos/github/owner/repo/1/job-123',
  files: [
    { path: 'src/main.ts', status: 'modified', content: '...' }
  ],
  context: { symbols: [...] },  // 来自 Context Agent
  options: {
    checkSecurity: true,
    checkPerformance: true,
    checkStyle: true,
    checkBugs: true,
  },
});

// 健康检查
const health = await client.healthCheck();

client.close();
```

---

## 5. 日志和调试

### 5.1 AgentLogger

AgentLogger 提供：

1. **实时日志捕获** - 捕获 stdout/stderr 并写入文件
2. **内存缓冲** - 保存最近的 1000 条日志到内存
3. **快照查询** - 获取完整的调试快照
4. **日志统计** - 按级别统计日志条目
5. **自动清理** - 7 天后自动清理旧日志

### 5.2 日志目录

```
/tmp/codagraph-logs/
├── job-123-context-agent.log
├── job-123-context-agent.buffer.json
├── job-123-review-agent.log
└── job-123-review-agent.buffer.json
```

### 5.3 使用示例

```typescript
const agentLogger = getAgentLogger();

// 开始捕获日志
await agentLogger.startLogging(
  jobId,
  'context-agent',
  process.stdout,
  process.stderr
);

// 停止捕获
await agentLogger.stopLogging(jobId);

// 调试快照
const snapshot = await agentLogger.getDebugSnapshot(jobId, 'context-agent');
console.log(snapshot.stats);
// { totalLogs: 123, errorCount: 2, warnCount: 5, ... }

// 获取日志摘要
const summary = await agentLogger.getLogSummary();
console.log(`总日志文件: ${summary.totalFiles}, 总大小: ${summary.totalSizeBytes} bytes`);
```

---

## 6. 2u2g 资源限制

### 6.1 内存限制

| 进程 | 限制 | 实现 |
|------|------|------|
| Context Agent | 300m | `PYTHON_MEMORY_LIMIT` 环境变量 |
| Review Agent | 300m | `PYTHON_MEMORY_LIMIT` 环境变量 |
| Code Context Engine | 256m | `CODE_CONTEXT_ENGINE_MAX_MEMORY` 环境变量 |
| Node.js | 200m | 代码监控 |

### 6.2 并发控制

```typescript
// AgentManager 内部检查
if (this.activeAgent) {
  throw new Error(`无法启动 ${type}: 已有 ${this.activeAgent} 在运行`);
}
```

### 6.3 超时保护

```typescript
// 超时配置
const AGENT_TIMEOUTS = {
  context: 5 * 60 * 1000,      // 5 分钟
  review: 10 * 60 * 1000,     // 10 分钟
  gracefulShutdown: 5 * 1000,   // 5 秒
} as const;

// 超时处理
process.kill('SIGTERM');
await this.waitForExit(process, killTimeout);
// 如果还未退出
process.kill('SIGKILL');
```

---

## 7. 错误处理

### 7.1 gRPC 错误

```typescript
try {
  const response = await client.collectContext(params);
} catch (error) {
  if (error.code === grpc.status.DEADLINE_EXCEEDED) {
    logger.error('请求超时');
  } else if (error.code === grpc.status.UNAVAILABLE) {
    logger.error('Agent 服务不可用');
  } else {
    logger.error(`未知错误: ${error.message}`);
  }
}
```

### 7.2 进程错误

```typescript
spawnedProcess.on('error', (error: Error) => {
  logger.error(`Agent 进程错误: ${error.message}`);
  // 标记为非活跃并清理
  agentInfo.active = false;
  this.activeAgent = null;
});
```

---

## 8. 集成步骤

### 8.1 后端集成

1. 在 `server/index.ts` 中初始化：

```typescript
import { getAgentManager } from './agent/AgentManager';

const agentManager = getAgentManager();
```

2. 在关闭时清理：

```typescript
process.on('SIGTERM', async () => {
  await agentManager.terminateAll('shutdown');
  process.exit(0);
});
```

### 8.2 Worker 集成

```typescript
// 在作业处理中使用
async function processJob(job: Job) {
  // 启动 Context Agent
  await agentManager.startContextAgent(job.id);

  const contextClient = new ContextAgentClient('localhost', 50052);
  await contextClient.connect();

  const context = await contextClient.collectContext({
    jobId: job.id,
    // ...
  });

  // 启动 Review Agent
  await agentManager.startReviewAgent(job.id);

  const reviewClient = new ReviewAgentClient('localhost', 50051);
  await reviewClient.connect();

  const result = await reviewClient.reviewCode({
    jobId: job.id,
    context,
    // ...
  });

  // 终止 agents
  await agentManager.terminateAgent(job.id);
}
```

---

## 9. 故障排查

### 9.1 Agent 启动失败

**症状**：Agent Manager 无法启动进程

**检查**：
1. Python 路径是否正确
2. Python 版本是否 >= 3.11
3. 文件权限是否正确

**解决方案**：
```bash
# 验证 Python 版本
python --version

# 手动测试启动
python context-agent/src/context_agent/grpc_server.py
```

### 9.2 gRPC 连接失败

**症状**：客户端无法连接到 agent

**检查**：
1. Agent 是否在指定端口运行
2. 防火墙是否阻止连接
3. Proto 代码是否生成

**解决方案**：
```bash
# 检查端口
lsof -i :50051
lsof -i :50052

# 重新生成 proto
bash scripts/generate_proto.sh
```

### 9.3 内存使用过高

**症状**：进程因内存限制被终止

**检查**：
```bash
# 查看进程内存
ps aux | grep python

# 查看系统内存
free -h
```

**解决方案**：
1. 调整 `PYTHON_MEMORY_LIMIT`
2. 减少并发处理
3. 优化 Python 代码内存使用

---

## 10. 测试

### 10.1 单元测试

```bash
# Agent Manager 测试
npm test -- agent/AgentManager.test.ts

# 客户端测试
npm test -- agent/ContextAgentClient.test.ts
npm test -- agent/ReviewAgentClient.test.ts
```

### 10.2 集成测试

```bash
# 启动 agents
cd context-agent && make run
cd review-agent && review-agent

# 运行集成测试
npm run test:integration
```

---

## 附录 A: 环境变量

| 变量 | 默认值 | 描述 |
|------|----------|------|
| `PYTHON_MEMORY_LIMIT` | 300m | Python 进程内存限制 |
| `CODE_CONTEXT_ENGINE_MAX_MEMORY` | 256m | Code Context Engine runtime 内存限制 |
| `CONTEXT_AGENT_PORT` | 50052 | Context Agent gRPC 端口 |
| `REVIEW_AGENT_PORT` | 50051 | Review Agent gRPC 端口 |
| `WORKSPACE_ROOT` | /tmp/repos | Git 工作区根目录 |

---

**文档版本**：v1.0
**创建日期**：2026-03-03
**作者**：ai-integrator
