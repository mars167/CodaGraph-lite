# CodaGraph-lite 实施计划

## 项目概述

创建 CodaGraph-lite - 轻量级代码审查平台，针对 2u2g 服务器优化。

## 实施阶段划分

### 阶段 1: 项目基础 ✅ 已完成 (9/169)
- 创建项目目录结构
- 初始化前端 (Next.js 14) 和后端 (Express)
- 设置 Python agents (Context Agent, Review Agent)
- 配置环境变量和 TypeScript/Python 配置

### 阶段 2: 核心基础设施 (10 任务)
**负责人:** Backend Agent

#### 数据库层
1. 设计 SQLite 数据库 schema
2. 实现 SQLite 连接管理 (better-sqlite3)
3. 创建数据库初始化脚本
4. 实现数据库迁移系统
5. 创建数据模型 (Analysis, Installation, Repository, AnalysisJob, WebhookEvent, UsageMetric)
6. 实现数据库 CRUD 查询
7. 添加数据库连接池
8. 实现数据库备份/恢复功能
9. 添加数据库性能优化 (WAL mode, indexes)
10. 实现数据库健康监控

### 阶段 3: 作业队列系统 (11 任务)
**负责人:** Backend Agent

1. 设计作业队列 schema (jobs 表)
2. 实现作业提交 API 端点
3. 实现作业轮询 worker
4. 添加作业状态跟踪
5. 实现作业重试机制 (指数退避)
6. 添加作业优先级逻辑
7. 实现作业取消 API
8. 创建死信队列
9. 添加作业超时处理
10. 实现作业指标和监控端点
11. **CRITICAL:** 实现单并发作业强制 (WORKER_COUNT=1)

### 阶段 4: 认证系统 (10 任务)
**负责人:** Backend Agent

1. 实现首次启动时的管理员账户创建
2. 创建管理员登录 API 端点
3. 实现基于会话的认证
4. 添加会话管理和过期
5. 创建受保护路由中间件
6. 实现管理员登出端点
7. 添加管理员密码更新功能
8. 实现 session 安全措施
9. 添加管理员活动日志
10. 创建管理员仪表板访问控制

### 阶段 5: OAuth 集成 (11 任务)
**负责人:** Backend Agent

1. 实现 GitHub OAuth 2.0 流程
2. 实现 Gitee OAuth 2.0 流程
3. 实现 GitLab OAuth 2.0 流程
4. 创建各平台的 OAuth 回调端点
5. 实现OAuth token 在 SQLite 中的存储
6. 添加 OAuth token 刷新逻辑
7. 创建 OAuth 安装管理 API
8. 在 OAuth 授权后设置 webhook
9. 为各平台添加 webhook 签名验证
10. 实现 OAuth 错误处理和状态参数验证
11. **CRITICAL:** 简化 OAuth 流程用于单管理员 (无用户选择)

### 阶段 6: 代码审查管道 (14 任务)
**负责人:** Backend Agent + AI Integration Agent

1. 创建 PR 事件的 webhook 端点
2. 实现 PR 审查作业提交到队列
3. 添加仓库克隆到工作区
4. 集成 git-ai CLI 进行仓库索引
5. 通过 gRPC 启动 context-agent 子进程
6. 实现 context agent ReAct 循环集成
7. 通过 gRPC 启动 review-agent 子进程
8. 实现 review agent 逐文件分析
9. 为各平台添加审查评论格式化
10. 实现审查评论发布到 GitHub/Gitee/GitLab APIs
11. 在 SQLite 中添加分析结果存储
12. 实现作业完成后工作区清理
13. 添加作业阶段的进度跟踪
14. 实现作业超时处理

### 阶段 7: 后端 HTTP API (11 任务)
**负责人:** Backend Agent

1. 设置 Express.js 服务器
2. 实现健康检查端点
3. 创建管理员认证 API 路由
4. 创建 OAuth 集成 API 路由
5. 创建仓库管理 API 路由
6. 创建作业状态和监控 API 路由
7. 创建分析历史 API 路由
8. 添加 CORS 配置
9. 实现错误处理中间件
10. 添加请求日志中间件
11. 创建 API 文档 (OpenAPI/Swagger)

### 阶段 8: 前端应用 (11 任务)
**负责人:** Frontend Agent

1. 设置 Next.js 14 App Router 结构
2. 创建管理员登录页面
3. 创建管理员仪表板布局
4. 创建 OAuth 集成管理页面
5. 创建仓库管理页面
6. 创建作业状态监控页面
7. 创建分析历史页面
8. 实现认证状态管理
9. 创建与后端通信的 API 客户端
10. 添加移动/桌面响应式设计
11. 实现错误处理和用户通知

### 阶段 9: Python Agent 集成 (13 任务)
**负责人:** AI Integration Agent

1. 创建 Python agents 子进程管理模块
2. 实现 context agent 的 gRPC 客户端
3. 实现 review agent 的 gRPC 客户端
4. **CRITICAL:** 实现作业完成后立即终止 agent
5. **CRITICAL:** 添加 agent 进程超时处理 (context: 5min, review: 10min)
6. **CRITICAL:** 实现 5 秒超时后的 SIGTERM/SIGKILL 强制终止
7. 实现 agent 进程健康监控
8. 添加后端关闭时的 agent 进程清理
9. **CRITICAL:** 添加 Python 内存限制强制执行 (300m)
10. **CRITICAL:** 实现僵尸进程检测和清理
11. 创建 agent 配置模块
12. 添加 agent 错误日志和传播
13. **CRITICAL:** 确保 agents 不作为后台守护进程运行

### 阶段 10: 部署配置 (10 任务)
**负责人:** DevOps Agent

1. 为前端和后端创建 systemd 服务文件
2. 创建 PM2 配置文件
3. 为前端创建 Dockerfile (可选)
4. 为后端创建 Dockerfile (可选)
5. 创建部署脚本
6. 创建卸载脚本
7. 创建部署验证脚本
8. 创建备份/恢复脚本
9. 创建日志轮转配置
10. 添加环境变量验证脚本

### 阶段 11: 配置管理 (10+ 任务)
**负责人:** Backend Agent

1. 创建包含所有配置选项的 `.env.example`
2. **CRITICAL:** 添加 2u2g 特定配置 (WORKER_COUNT=1, memory limits)
3. **CRITICAL:** 为 2u2g 要求添加环境变量验证
4. 实现从环境变量加载配置
5. 添加启动时配置验证
6. **CRITICAL:** 拒绝无效的 2u2g 配置 (如并发作业)
7. 创建配置文档
8. **CRITICAL:** 添加 2u2g 部署指南和 swap 设置说明
9. 添加默认配置值 (为 2u2g 优化)
10. 实现配置热重载 (可选)

### 阶段 12: 2u2g 资源优化 (12 任务)
**负责人:** Backend Agent

1. **CRITICAL:** 实现 Node.js 内存限制 (NODE_OPTIONS=--max-old-space-size=200)
2. **CRITICAL:** 实现 SQLite 缓存限制 (2MB)
3. **CRITICAL:** 实现 git-ai 内存限制 (256m)
4. **CRITICAL:** 实现单并发作业强制 (WORKER_COUNT=1)
5. **CRITICAL:** 添加内存监控端点 `/api/status/memory`
6. **CRITICAL:** 添加 swap 检测和警告系统
7. **CRITICAL:** 实现作业完成后内存清理
8. 添加资源使用报告端点 `/api/status/resources`
9. 实现内存压力下的优雅降级
10. 为 2u2g 服务器创建 swap 设置脚本
11. 添加内存使用日志 (每个作业前后)
12. 实现内存警报 (80% 警告, 95% 严重)

### 阶段 13: 日志和监控 (7 任务)
**负责人:** Backend Agent

1. 为前端实现结构化日志
2. 为后端实现结构化日志
3. 添加 agent 进程日志
4. 创建日志文件轮转配置
5. 添加 Prometheus 指标端点
6. 创建监控状态仪表板
7. 实现关键错误警报 (可选)

### 阶段 14: 测试 (10 任务)
**负责人:** QA Agent

1. 为数据库层创建单元测试
2. 为作业队列创建单元测试
3. 为认证创建单元测试
4. 为 OAuth 集成创建单元测试
5. 为代码审查管道创建单元测试
6. 为 API 端点创建集成测试
7. 为 PR 审查流程创建端到端测试
8. 创建前端组件测试
9. 设置测试覆盖率报告
10. 为作业队列创建性能测试

### 阶段 15: 文档 (10 任务)
**负责人:** Documentation Agent

1. 创建包含项目概述的主 README.md
2. 编写安装指南
3. 编写配置指南
4. 编写部署指南
5. 编写故障排除指南
6. 编写 API 文档
7. 编写架构文档
8. 编写贡献者指南
9. 添加内联代码文档 (JSDoc/Python docstrings)
10. 创建未来版本升级指南

### 阶段 16: 最终完善 (10 任务)
**负责人:** DevOps Agent

1. 添加许可文件
2. 创建变更日志
3. 添加贡献指南
4. 创建 issue 模板
5. 添加安全策略
6. 设置 CI/CD (可选)
7. 添加代码检查 (ESLint, Pylint)
8. 添加代码格式化 (Prettier, Black)
9. 创建发布说明
10. 执行完整系统的端到端测试

## Agent Team 结构

```
CodaGraph-lite Implementation Team
├── Team Lead (总体协调)
├── Backend Agent (阶段 2-7, 11-13)
│   ├── 数据库层
│   ├── 作业队列
│   ├── 认证系统
│   ├── OAuth 集成
│   ├── 后端 API
│   ├── 配置管理
│   └── 日志监控
├── Frontend Agent (阶段 8)
│   ├── 页面开发
│   ├── 状态管理
│   └── 响应式设计
├── AI Integration Agent (阶段 6, 9)
│   ├── Python agents 集成
│   ├── gRPC 通信
│   └── 内存优化
├── DevOps Agent (阶段 10, 16)
│   ├── 部署脚本
│   ├── Docker 配置
│   └── 最终完善
└── Documentation Agent (阶段 14, 15)
    ├── 文档编写
    ├── 测试编写
    └── 指南制作
```

## 关键里程碑

1. **Milestone 1: 核心基础设施完成** (阶段 1-3)
   - 数据库 + 作业队列可用
   - 可创建和管理作业

2. **Milestone 2: 认证和 OAuth 完成** (阶段 4-5)
   - 管理员可登录
   - 可连接 GitHub/Gitee/GitLab

3. **Milestone 3: 代码审查管道完成** (阶段 6-7)
   - Webhook 可接收
   - 可处理 PR 审查

4. **Milestone 4: 前端和 AI 集成完成** (阶段 8-9)
   - 完整 UI 可用
   - Agents 可调用

5. **Milestone 5: 部署和优化完成** (阶段 10-13)
   - 可部署
   - 2u2g 优化验证

6. **Milestone 6: 测试和文档完成** (阶段 14-15)
   - 测试通过
   - 文档完整

7. **Milestone 7: 发布就绪** (阶段 16)
   - 所有功能完成
   - 可发布 v1.0.0

## 2u2g 服务器关键配置验证

必须在部署前验证：

- [x] NODE_OPTIONS=--max-old-space-size=200
- [x] WORKER_COUNT=1
- [x] ENABLE_CONCURRENT_JOBS=false
- [x] GIT_AI_MAX_MEMORY=256m
- [x] SQLITE_CACHE_SIZE=-2000
- [x] PYTHON_MEMORY_LIMIT=300m
- [ ] 内存监控端点工作
- [ ] Swap 检测工作
- [ ] Agent 进程立即终止
- [ ] 内存使用 <1.5GB (峰值)

## 实施检查清单

### 每个阶段完成前验证
- [ ] 所有任务标记为完成
- [ ] 代码通过 lint
- [ ] 相关测试通过
- [ ] 文档已更新

### 最终发布前验证
- [ ] 所有 169 任务完成
- [ ] 端到端测试通过
- [ ] 2u2g 压力测试通过
- [ ] 文档完整
- [ ] 安全审计通过
- [ ] 性能基准测试通过
