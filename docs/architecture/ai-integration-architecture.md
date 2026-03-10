# Code Context Engine runtime 与 Agents 交互架构设计

> Historical note: the standalone gRPC review-agent path described below is no longer part of the active implementation. The current shipped review flow executes in-process under `server/src/review/*`, with `context-agent` as the only remaining gRPC agent.

## 1. 架构概述

### 1.1 设计目标

设计 Python agents（Context Agent 和 Review Agent）如何通过 Code Context Engine runtime 进行交互，实现智能的代码上下文收集和代码审查功能。

### 1.2 关键约束

- **2u2g 资源限制**：
  - Python 进程内存限制：300m
  - Code Context Engine runtime 内存限制：256m
  - 任何时候只有一个 agent 进程运行

- **临时进程模式**：
  - Agents 按需启动，作业完成后立即终止
  - 不作为后台守护进程运行

- **超时保护**：
  - Context Agent：5 分钟
  - Review Agent：10 分钟
  - 5 秒超时后 SIGKILL 强制终止

---

## 2. 交互流程

### 2.1 完整的代码审查流程

```
┌─────────────────────────────────────────────────────────┐
│                                               │
│  Webhook 触发            │  → 作业队列     │
└─────────────────────────────────────────────────────────┘
                                               │
         ↓                              │  │
┌─────────────────┐                        ┌───────────────┐
│                 ↓                  │  │
│  仓库克隆     │  ┌─────────────┐ │
│                 ↓                  │  └──────────────┘ │
│         ↓                  │         │  │  ┌─────────────┐
│  Code Context Engine runtime │  │ Context Agent │ │ Review Agent │ │
│         ↓                  │  ←────────┘ │     ↓            │  ↓      │  │
│         ↓                  │   runtime API / CLI │   gRPC     │  gRPC   │ │   ↓      │
│         ↓                  │             │          │         │  │         ↓      │
│     上下文收集    │             │          │         │   审查结果  │   平台 API    │
│  ↓                  │             │          │         │   ↓      │    ─┘     │
│     代码审查结果  │             │          │         │   ↓      │    │  ──┘     │
│                                  └─────────────┘
└─────────────────────────────────────────────────────────┘
```

---

## 3. 核心组件设计

### 3.1 Python Agent Manager

**文件**：`server/src/agent/AgentManager.ts`

**职责**：
- 启动和终止 Python agent 进程
- 超时监控和强制终止
- 僵尸进程检测
- 单并发强制（任何时候只允许一个 agent）

**关键接口**：
```typescript
interface AgentManager {
  // 启动 Context Agent
  startContextAgent(jobId: string): Promise<void>

  // 启动 Review Agent
  startReviewAgent(jobId: string): Promise<void>

  // 终止 Agent
  terminateAgent(jobId: string, reason?: string): Promise<void>

  // 终止所有 Agents
  terminateAll(): Promise<void>

  // 检查状态
  isAgentRunning(jobId: string): boolean
  getActiveAgent(): AgentType | null
  getStats(): AgentStats
}
```

**2u2g 关键实现**：
- ✅ 单并发检查：启动前检查是否已有 agent 运行
- ✅ 超时保护：context 5min, review 10min
- ✅ 强制终止：SIGTERM → 等待 5 秒 → SIGKILL
- ✅ 僵尸进程：每 30 秒检测一次
- ✅ 内存限制：通过环境变量传递给 Python

### 3.2 gRPC 通信

**文件**：
- `server/src/agent/AgentClient.ts`

**职责**：
- Context Agent gRPC 客户端
- Review Agent gRPC 客户端
- 健康检查

**gRPC Proto 定义**：`proto/agent.proto`

**关键方法**：
```typescript
// Context Agent
interface ContextAgentClient {
  connect(): void
  collectContext(params: ContextRequestParams): Promise<ContextResponse>
  healthCheck(): Promise<HealthCheck>
}

// Review Agent
interface ReviewAgentClient {
  connect(): void
  reviewCode(params: ReviewRequestParams): Promise<ReviewResult>
  healthCheck(): Promise<HealthCheck>
}
```

**2u2g 特性**：
- 超时控制：客户端请求超时
- 自动重连（可选）
- 错误处理和重试

### 3.3 Git Service

**文件**：`server/src/git/GitService.ts`

**职责**：
- 仓库克隆
- Code Context Engine runtime 预热
- 文件差异获取
- 工作区清理

**关键接口**：
```typescript
interface GitService {
  cloneRepository(options: CloneOptions): Promise<void>
  indexRepository(path: string): Promise<void>
  getFileDiff(options: DiffOptions): Promise<string>
  cleanupWorkspace(path: string): Promise<void>
}

interface CloneOptions {
  platform: string;
  owner: string;
  repo: string;
  branch?: string;
  token: string;
  workspace: string;
}

interface DiffOptions {
  filePath: string;
  baseBranch?: string;
  workspace: string;
}
```

**内存控制**：
- Code Context Engine 内存限制：256m（通过环境变量 `CODE_CONTEXT_ENGINE_MAX_MEMORY`）

### 3.4 Platform Client

**文件**：`server/src/platform/GitHubClient.ts`

**职责**：
- GitHub API 调用
- 评论发布
- Webhook 签名验证

**关键接口**：
```typescript
interface GitHubClient {
  constructor(accessToken: string)

  // 评论发布
  postComment(prInfo: PRInfo, comment: CommentContent): Promise<void>

  // 评论获取
  getComments(prInfo: PRInfo): Promise<Comment[]>

  // 状态检查
  healthCheck(): Promise<boolean>
}

interface CommentContent {
  body: string;
  filePath?: string;
  lineNumber?: number;
}

interface PRInfo {
  platform: 'github';
  owner: string;
  repo: string;
  prNumber: string;
}
```

---

## 4. 作业处理流程

### 4.1 PR 审查作业处理

```
┌─────────────────────────────────────────────────┐
│  Webhook 触发                    │
│  ──────────────────────────────────────┘ │
│         ↓                              │
│  创建作业                       │
│ ──────────────────────────────────────┘ │
│         ↓                              │
│         ↓                              │
│ ┌───────────────┐                        │
│ │  作业队列处理                         │
│ │ ──────────────┘                        │
│ ───┘                                    │ │  │
│ │ ↓                                      │  │  │ │
│ │ 添加到队列                            │ │ │ │ │ │
│ │ ──────────────┘                        │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │
│ │ Worker 轮询                              │ │ │ │ │ │ │ │
│ │ (单并发，每次 1 个)                   │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │
│ │ 获取作业                              │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │
│ │ ──────────────────────────────────────────┘ │ │ │ │ │ │ │ │
│ │ 克隆仓库                              │ │ │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │
│ │ Code Context Engine runtime                      │ │ │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │ │
│ │ Context Agent (gRPC)                  │ │ │ │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │ │ │
│ │ 持续收集                            │ │ │ │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │ │ │ │
│ │ 返回上下文                            │ │ │ │ │ │ │ │ │ │ │ │
│ │ ──────────────────────────────────────────┘ │ │ │ │ │ │ │ │ │ │
│ │                                       │ │ │ │ │ │ │ │ │ │
│ │ Review Agent (gRPC)                  │ │ │ │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │ │ │
│ │ 执行审查                              │ │ │ │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │ │ │ │
│ │ 返回审查结果                          │ │ │ │ │ │ │ │ │ │ │
│ │ ──────────────────────────────────────────┘ │ │ │ │ │ │ │ │ │ │
│ │                                       │ │ │ │ │ │ │ │ │ │
│ │ 格式化评论                            │ │ │ │ │ │ │ │ │ │ │
│ │ ↓                                      │ │ │ │ │ │ │ │ │ │
│ │ GitHub Client                           │ │ │ │ │ │ │ │ │ │ │ │ │
│ │ 发布评论                              │ │ │ │ │ │ │ │ │ │ │ │
│ │ ──────────────────────────────────────────┘ │ │ │ │ │ │ │ │ │ │ │ │
│ │                                       │ │ │ │ │ │ │ │ │ │ │ │
│ │ 更新作业状态                        │ │ │ │ │ │ │ │ │ │ │ │ │
│ │ ──────────────────────────────────────────┘ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │
│ │ 清理工作区                            │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │
│ │                                       │ │ │ │ │ │ │ │ │ │ │ │ │ │ │
│ │ ──────────────────────────────────────────┘ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │
│ │ 作业完成                              │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │
│ ──────────────────────────────────────────┘ │ │ │ │ │ │ │ │ │ │ │ │
└───────────────────────────────────────────────────┘
```

---

## 5. 数据流

### 5.1 Agent 上下文数据流

```
┌─────────────────────────────────────────────────┐
│  Context Agent               │ Review Agent     │
└─────────────────────────────────────────────────┘
           ↓                              ↓
       Code Context Engine runtime 请求 ─────────────┼→
           ↓                              ───────────→┘
       符号定义查询                         │ 符号关系查询
       文件摘要查询                         │ 调用图查询
       Git 上下文                             │ PR 差异
           ↓                              ↓
       返回上下文对象                         │ 使用上下文审查
└─────────────────────────────────────────────────┘
```

### 5.2 代码审查数据流

```
Review Agent 接收：
  1. PR 差异文件列表
  2. 上下文对象（来自 Context Agent）
  3. 安全/性能/风格检查选项

Review Agent 处理：
  1. 调用 LLM API 分析文件
  2. 生成审查结果
  3. 格式化评论

返回：
  - 每个文件的问题列表
  - 整体摘要
```

---

## 6. 命令封装

### 6.1 Code Context Engine 调试命令

```bash
# 检查索引/运行状态
code-context-engine ai status --json

# 生成仓库地图
code-context-engine ai repo-map --max-files 20

# 强制重建索引（仅调试时使用）
code-context-engine ai index --overwrite

# 启动调试服务
code-context-engine ai serve
```

### 6.2 Node.js 命令封装

```typescript
class CodeContextRuntimeAdapter {
  private engineRoot: string;

  constructor(engineRoot: string) {
    this.engineRoot = engineRoot;
  }

  async prepare(workspacePath: string): Promise<void> {
    // 加载 runtime；如 dist 不存在则先执行 build
  }

  async reviewContextForDiff(diffText: string): Promise<any> {
    // 调用 runtime.tasks.reviewContextForDiff()
  }

  async collectImplementationContext(symbol: string): Promise<any> {
    // 调用 runtime.tasks.implementationContext()
  }
}
```

### 6.3 错误处理

```typescript
class CodeContextRuntimeError extends Error {
  constructor(message: string, operation?: string) {
    super(message);
    this.name = 'CodeContextRuntimeError';
    this.operation = operation;
  }
}
```

---

## 7. 超时和重试策略

### 7.1 Agent 超时配置

```typescript
const AGENT_TIMEOUTS = {
  context: 5 * 60 * 1000,  // 5 分钟
  review: 10 * 60 * 1000, // 10 分钟
  gracefulShutdown: 5 * 1000,      // 5 秒优雅关闭
} as const;

// AgentManager 使用
agentManager.startContextAgent(jobId);
setTimeout(() => {
  agentManager.terminateAgent(jobId, 'timeout');
}, AGENT_TIMEOUTS.context);
```

### 7.2 重试策略

```typescript
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 2000,  // 2 秒
  backoffMultiplier: 2,
};

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = RETRY_CONFIG.maxAttempts
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      // 指数退避
      const delay = RETRY_CONFIG.baseDelayMs * Math.pow(
        RETRY_CONFIG.backoffMultiplier,
        attempt - 1
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## 8. 安全考虑

### 8.1 命令注入防护

```typescript
import { spawnSync } from 'child_process';

function isSafeCommand(command: string): boolean {
  const dangerousPatterns = [
    /;/.*rm/,  // 危险删除
    /&&.*\\|/, // 管道命令
    /;.*wget/,  // 下载
  /;.*curl/, // 网络请求
  ];

  return !dangerousPatterns.some(pattern => pattern.test(command));
}

class SecurityError extends Error {
  constructor(command: string) {
    super(`不安全的命令: ${command}`);
    this.name = 'SecurityError';
  }
}

function executeSafe(command: string, args: string[]): void {
  if (!isSafeCommand(command)) {
    throw new SecurityError(command);
  }

  // 验证参数安全
  args.forEach(arg => {
    if (/["';'|'\\|'`\\`|'$'`\\|' <' ']' '\\].test(arg)) {
      throw new SecurityError(`不安全的参数: ${arg}`);
    }
  });
}
```

### 8.2 工作区隔离

```
/tmp/repos/{platform}/{owner}/{repo}/{pr_number}/{job_id}/
```

- 每个作业有独立的工作区
- 防止作业之间相互干扰
- 作业完成后清理

### 8.3 敏感数据处理

- 不会在日志中记录代码内容
- 只记录文件路径和操作

---

## 9. 性能优化

### 9.1 内存监控

```typescript
function checkMemoryUsage(): NodeJS.MemoryUsage {
  const usage = process.memoryUsage();
  const total = Math.round(usage.heapTotal / 1024 / 1024); // MB
  const external = Math.round(usage.heapUsed / 1024 / 1024); // MB

  return {
    total,
    used: external,
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
  };
}

// 作业前后检查内存
async function withMemoryCheck<T>(
  fn: () => Promise<T>,
  jobId: string
): Promise<T> {
  const before = checkMemoryUsage();

  try {
    return await fn();
  } finally {
    const after = checkMemoryUsage();
    logger.info(`作业 ${jobId} 内存使用: 前 ${before.total}MB, 后 ${after.total}MB`);
  }
}
```

### 9.2 并发控制

```typescript
const WORKER_COUNT = 1;  // 2u2g 单并发

// 在 AgentManager 中实现
if (activeAgent !== null) {
  throw new Error(`已有 ${activeAgent} 在运行，单并发限制`);
}
```

---

## 10. 监控和日志

### 10.1 结构化日志

```typescript
logger.debug('Context Agent 响应:', response);
logger.info('作业进度: ${progress}% - ${stage}');
logger.warn('Agent 超时，准备强制终止');
logger.error('作业失败:', error);
```

### 10.2 进度跟踪

```typescript
interface JobProgress {
  stage: string;
  progress: number;
  startTime: number;
}

const jobProgress: Map<string, JobProgress> = new Map();

function updateProgress(jobId: string, stage: string, progress: number): void {
  const progressData = jobProgress.get(jobId) || {
    stage: 'cloning',
    progress: 0,
    startTime: Date.now(),
  };
  jobProgress.set(jobId, progressData);

  logger.info(`作业 ${jobId}: ${progress}% - ${stage}`);
}
```

---

## 11. 实施建议

### 11.1 阶段 11.1: 实现 Agent 日志和调试工具

**需求**：
- Agent 进程 stdout/stderr 捕获和记录
- 结构化日志格式
- 优雅关闭时的调试信息保存

### 11.2 阶段 11.2: 实现 Agent 性能优化

**需求**：
- 内存使用监控和报告
- 分析性能瓶颈
- 优化内存占用

### 11.3: 阶段 11.3: 实现 Agent 测试框架

**需求**：
- 单元测试覆盖核心流程
- 集成测试：Agent + backend
- 性能测试：内存占用、处理时间

---

## 12. 与后端协作接口

### 12.1 数据库集成

```typescript
interface JobRepository {
  // 作业记录
  findById(id: number): Promise<Job>;
  findByStatus(status: JobStatus): Promise<Job[]>;
  create(jobData: JobCreateData): Promise<Job>;
  update(id: number, updates: Partial<Job>): Promise<void>;
  delete(id: number): Promise<void>;
}

// 进度更新
updateProgress(jobId: number, progress: number, stage: string): Promise<void>;
}

// 上下文数据存储
interface ContextDataRepository {
  save(jobId: number, contextData: any): Promise<void>;
  findByJobId(jobId: number): Promise<any>;
}

// 审查结果存储
interface ReviewRepository {
  save(jobId: number, reviewResult: ReviewResult): Promise<void>;
}
```

### 12.2 API 端点注册

```typescript
// 在 server/index.ts 中注册所有路由
app.use('/api/webhook/github', webhookRouter);
app.use('/api/jobs', jobRouter);
app.use('/api/platform', platformRouter);
app.use('/api/health', healthRouter);
```

---

## 13. 总结

### 13.1 架构优势

1. **资源效率**
   - Agents 按需启动，完成后立即释放
   - 严格内存限制（300m + 256m）
   - 单并发避免资源竞争

2. **可靠性**
   - 超时保护防止进程卡死
   - 强制终止确保资源释放
   - 僵尸进程清理防止泄漏

3. **可扩展性**
   - gRPC 通信便于未来扩展
   - 独立的 Agent 服务易于维护和升级
   - 清晰的接口定义便于测试

4. **可维护性**
   - 完整的日志和监控
   - 结构化错误处理
   - 清晰的代码组织

### 13.2 下一步工作

**待 backend-dev 完成作业队列后：**
1. 集成代码审查流程主协调服务
2. 注册所有 API 路由
3. 实现数据库集成到各个服务
4. 测试完整流程

**ai-integrator 可以并行进行的准备工作：**
1. Proto 代码生成脚本完善
2. Agent 日志和调试工具
3. Agent 性能监控
4. Agent 测试框架

---

**设计文档版本：** v1.0
**创建日期：** 2026-03-03
**作者：** ai-integrator
