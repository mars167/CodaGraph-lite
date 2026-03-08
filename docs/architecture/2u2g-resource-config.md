# 2u2g 资源限制和并发配置

## 概述

本文档描述 CodaGraph 在 2u2g 服务器（2 cores, 2GB RAM）上的资源管理和并发策略。

---

## 1. 资源限制

### 1.1 硬件资源

| 资源 | 总量 | 分配 |
|------|------|------|
| CPU | 2 vCPU | Node.js + Agent 交互 |
| RAM | 2GB | Node.js: 200m<br>Context Agent: 300m<br>Review Agent: 300m<br>Code Context Engine: 256m |
| 剩余 | ~640MB | 系统开销 + 缓冲 |

### 1.2 内存分配策略

```
2GB 总内存
│
├── Node.js 后端
│   └── 200m (固定)
│
├── Python Agent (单并发)
│   ├── Context Agent
│   │   └── 300m (活动时)
│   └── Review Agent
│       └── 300m (活动时)
│
├── Code Context Engine runtime
│   └── 256m (活动时)
│
└── 系统开销 + 缓冲
    └── ~640m
```

### 1.3 环境变量

| 变量 | 默认值 | 说明 |
|------|----------|------|
| `PYTHON_MEMORY_LIMIT` | 300m | Python 进程内存限制 |
| `CODE_CONTEXT_ENGINE_MAX_MEMORY` | 256m | Code Context Engine runtime 内存限制 |
| `NODE_MEMORY_LIMIT` | 200m | Node.js 监控阈值 |
| `CONTEXT_AGENT_TIMEOUT` | 300000 | Context Agent 超时（5分钟）|
| `REVIEW_AGENT_TIMEOUT` | 600000 | Review Agent 超时（10分钟）|
| `WORKER_COUNT` | 1 | 单并发强制 |

---

## 2. 并发策略

### 2.1 单并发模式（推荐）

**原因**：2u2g 资源有限，多并发会导致：
- 内存竞争
- CPU 抢占
- 超时风险增加
- 2u2g 配额超限

**实现**：

```typescript
// AgentManager 中
if (this.activeAgent) {
  throw new Error(`无法启动 ${type}: 已有 ${this.activeAgent} 在运行`);
}
```

**流程**：

```
作业队列 (单线程 Worker)
     │
     ▼
┌──────────────┐
│  处理作业 A  │
│              │
│   启动 CA   │
│     ↓         │
│   上下文收集   │
│     ↓         │
│   停止 CA     │
│     ↓         │
│   启动 RA     │
│     ↓         │
│   代码审查     │
│     ↓         │
│   停止 RA     │
└──────────────┘
     │
     ▼
  处理作业 B
```

### 2.2 资源分配器

```typescript
interface ResourceAllocator {
  // 检查是否有足够资源启动 agent
  canStartAgent(type: AgentType): boolean;

  // 预留资源
  reserveResources(type: AgentType): void;

  // 释放资源
  releaseResources(type: AgentType): void;

  // 获取当前资源使用
  getCurrentUsage(): ResourceUsage;
}

interface ResourceUsage {
  activeAgent: AgentType | null;
  activeJobId: string | null;
  memoryUsedMB: number;
  memoryLimitMB: number;
}
```

### 2.3 内存监控

```typescript
// Node.js 端监控
setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;

  if (heapUsedMB > 180) {  // 200m 的 90%
    logger.warn(`内存使用过高: ${heapUsedMB}MB`);
    // 触发资源清理或告警
  }
}, 30000);  // 每 30 秒检查一次
```

---

## 3. 超时和错误恢复

### 3.1 超时层次

```
┌─────────────────────────────────────────────────────┐
│  第 1 层：请求超时                        │
│  - gRPC 请求超时: 60 秒                   │
│  - 自动重试（最多 3 次）                  │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  第 2 层：Agent 作业超时                   │
│  - Context Agent: 5 分钟                    │
│  - Review Agent: 10 分钟                   │
│  - 自动终止进程                             │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  第 3 层：强制终止                        │
│  - SIGTERM → 等待 5 秒                   │
│  - SIGKILL（如果还未退出）                  │
└─────────────────────────────────────────────────────┘
```

### 3.2 错误恢复策略

```typescript
// 重试配置
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  backoffMultiplier: 2,
  retryableErrors: [
    'DEADLINE_EXCEEDED',
    'UNAVAILABLE',
    'INTERNAL',
  ],
};

// 指数退避
const delays = [2000, 4000, 8000];  // 最多 14 秒总重试时间
```

---

## 4. 性能优化

### 4.1 增量处理

**目的**：避免一次性加载所有数据导致内存峰值

**实现**：
- 分批处理文件（每批 5-10 个）
- 流式传输 gRPC 消息
- 增量合并结果

### 4.2 缓存策略

```typescript
class ContextCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string): any | null;
  set(key: string, value: any, ttl: number): void;
  cleanup(): void;  // 清理过期条目
}
```

**缓存策略**：
- LRU（最近最少使用）淘汰
- TTL（生存时间）5 分钟
- 最大缓存条目数 100

### 4.3 优先级队列

```typescript
interface PriorityJob {
  priority: 'critical' | 'high' | 'normal' | 'low';
  jobId: string;
  timestamp: number;
}

// 作业调度器按优先级处理
queue.sort((a, b) => {
  // 1. 优先级高的在前
  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
  return priorityOrder[a.priority] - priorityOrder[b.priority];
});
```

---

## 5. 资源监控和告警

### 5.1 监控指标

| 指标 | 阈值 | 告警 |
|------|--------|------|
| 内存使用率 | > 90% | WARN |
| 内存使用率 | > 95% | CRITICAL |
| 活跃进程数 | > 1 | ERROR |
| 作业队列积压 | > 10 | WARN |
| Agent 超时率 | > 10% | WARN |

### 5.2 告警实现

```typescript
class ResourceMonitor {
  check(): void {
    const usage = this.getCurrentUsage();

    if (usage.memoryUsagePercent > 95) {
      this.alert('CRITICAL', '内存使用超过 95%');
    }

    if (usage.activeProcesses > 1) {
      this.alert('ERROR', '检测到多个活跃 Agent');
    }
  }
}
```

---

## 6. 配置文件

### 6.1 环境配置

```bash
# server/.env
WORKER_COUNT=1                    # 单并发
PYTHON_MEMORY_LIMIT=300m           # Python 内存限制
CODE_CONTEXT_ENGINE_MAX_MEMORY=256m            # Code Context Engine 内存限制
CONTEXT_AGENT_TIMEOUT=300000         # Context Agent 5 分钟
REVIEW_AGENT_TIMEOUT=600000         # Review Agent 10 分钟
NODE_MEMORY_LIMIT=200m             # Node.js 监控阈值
ENABLE_CACHE=true                  # 启用缓存
CACHE_TTL=300000                   # 缓存 5 分钟
BATCH_SIZE=5                      # 每批 5 个文件
```

### 6.2 TypeScript 配置

```typescript
// server/src/config/resource.ts
export const RESOURCE_CONFIG = {
  // 并发控制
  workerCount: 1,                  // 单并发强制
  maxConcurrentAgents: 1,            // 同时最多 1 个 agent

  // 内存限制 (MB)
  nodeMemoryLimit: 200,
  pythonMemoryLimit: 300,
  codeContextRuntimeMemoryLimit: 256,

  // 超时 (ms)
  contextAgentTimeout: 300000,        // 5 分钟
  reviewAgentTimeout: 600000,         // 10 分钟
  grpcRequestTimeout: 60000,          // 60 秒
  killGracePeriod: 5000,              // 5 秒

  // 缓存配置
  enableCache: true,
  cacheTtl: 300000,                   // 5 分钟
  maxCacheEntries: 100,

  // 批处理配置
  batchSize: 5,
  parallelFiles: 3,               // 单 agent 内并文件数

  // 重试配置
  maxRetries: 3,
  retryBaseDelay: 2000,
  retryBackoffMultiplier: 2,

  // 监控配置
  healthCheckInterval: 30000,       // 30 秒
  zombieCheckInterval: 30000,        // 30 秒
  memoryCheckInterval: 30000,          // 30 秒
} as const;
```

---

## 7. 故障排查

### 7.1 内存不足

**症状**：进程被 OOM Killer 终止

**检查**：
```bash
# 查看 OOM 日志
dmesg | grep -i "killed process"

# 查看进程内存
ps aux | grep -E "(python|node)" | sort -k4 -rn
```

**解决方案**：
1. 降低内存限制（如 200m）
2. 减少批处理大小
3. 启用更激进的缓存清理

### 7.2 Agent 无响应

**症状**：AgentManager 报告超时但 agent 进程仍在运行

**检查**：
```bash
# 检查进程状态
ps aux | grep python

# 检查 gRPC 端口
lsof -i :50051
lsof -i :50052
```

**解决方案**：
1. 重启 agent 服务
2. 检查 gRPC proto 是否同步
3. 检查网络连接

---

## 8. 总结

### 8.1 关键原则

1. **单并发优先** - 2u2g 资源有限，避免竞争
2. **严格内存限制** - 每个进程有明确上限
3. **超时保护** - 多层超时确保资源释放
4. **增量处理** - 避免内存峰值
5. **监控告警** - 及时发现问题

### 8.2 下一步

- 等待 backend-dev 完成作业队列
- 集成 ResourceMonitor 到主服务
- 实现完整的资源监控面板
- 编写性能基准测试

---

**文档版本**：v1.0
**创建日期**：2026-03-03
**作者**：ai-integrator
