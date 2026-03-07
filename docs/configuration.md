# CodaGraph-lite 配置指南

本文档详细说明 CodaGraph-lite 的所有配置选项。

## 目录

- [快速配置](#快速配置)
- [服务器配置](#服务器配置)
- [数据库配置](#数据库配置)
- [作业队列配置](#作业队列配置)
- [认证配置](#认证配置)
- [OAuth 集成配置](#oauth-集成配置)
- [Python Agent 配置](#python-agent-配置)
- [git-ai 配置](#git-ai-配置)
- [LLM 配置](#llm-配置)
- [资源监控配置](#资源监控配置)
- [日志配置](#日志配置)
- [安全配置](#安全配置)
- [Webhook 配置](#webhook-配置)
- [CORS 配置](#cors-配置)
- [2u2g 服务器关键配置](#2u2g-服务器关键配置)
- [配置验证](#配置验证)

---

## 快速配置

### 最小配置要求

启动 CodaGraph-lite 至少需要配置以下环境变量：

```bash
# 必须配置项
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
LLM_PROVIDER=openai
LLM_API_KEY=your_api_key
GIT_AI_BIN=/usr/local/bin/git-ai
```

### 配置步骤

1. 复制示例配置文件：
   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env` 文件：
   ```bash
   nano .env
   # 或使用其他编辑器
   ```

3. 根据需要修改配置项

4. 重启服务使配置生效

---

## 服务器配置

### 端口配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `FRONTEND_PORT` | `3000` | Next.js 前端服务端口 |
| `BACKEND_PORT` | `7900` | Express.js 后端服务端口 |

**配置示例**：
```bash
FRONTEND_PORT=3000
BACKEND_PORT=7900
```

### Node.js 内存限制

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `NODE_OPTIONS` | `--max-old-space-size=200` | Node.js V8 堆内存限制 |

**配置示例**：
```bash
# 限制每个 Node.js 进程最大 200MB 内存
NODE_OPTIONS=--max-old-space-size=200
```

**2u2g 服务器要求**：
- 必须设置为 `200`
- 超过 200 可能导致 OOM（内存溢出）

---

## 数据库配置

### SQLite 路径和缓存

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `DATABASE_PATH` | `./data/codagraph-lite.db` | SQLite 数据库文件路径 |
| `SQLITE_CACHE_SIZE` | `-2000` | SQLite 缓存大小（负数=KB） |

**配置示例**：
```bash
# 数据库文件路径
DATABASE_PATH=/opt/codagraph-lite/data/codagraph-lite.db

# 缓存大小 2MB
SQLITE_CACHE_SIZE=-2000
```

**缓存大小说明**：
- `-2000` = 2MB
- 2u2g 服务器推荐使用 `-2000` (2MB)
- 较大服务器可适当增加

### 数据库备份配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `BACKUP_PATH` | `./backups` | 备份文件存储目录 |
| `ENABLE_AUTO_BACKUP` | `true` | 是否启用自动备份 |
| `BACKUP_INTERVAL_HOURS` | `24` | 自动备份间隔（小时） |

**配置示例**：
```bash
# 备份目录
BACKUP_PATH=/opt/codagraph-lite/backups

# 启用自动备份
ENABLE_AUTO_BACKUP=true

# 每 24 小时备份一次
BACKUP_INTERVAL_HOURS=24
```

---

## 作业队列配置

### Worker 配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `WORKER_COUNT` | `1` | 作业处理进程数量 |
| `ENABLE_CONCURRENT_JOBS` | `false` | 是否启用并发作业 |
| `JOB_QUEUE_POLL_INTERVAL` | `2` | Worker 轮询间隔（秒） |

**配置示例**：
```bash
# 单 Worker（2u2g 必须为 1）
WORKER_COUNT=1

# 禁用并发（2u2g 必须为 false）
ENABLE_CONCURRENT_JOBS=false

# 每 2 秒轮询一次
JOB_QUEUE_POLL_INTERVAL=2
```

### 2u2g 服务器要求

| 配置项 | 2u2g 要求值 | 说明 |
|--------|--------------|------|
| `WORKER_COUNT` | 必须为 `1` | 串行处理，避免并发内存峰值 |
| `ENABLE_CONCURRENT_JOBS` | 必须为 `false` | 禁用并发作业 |

**重要提示**：
- 在 2u2g 服务器上，违反以上配置可能导致 OOM
- 系统启动时会验证这些配置

---

## 认证配置

### 管理员账户

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | `changeme` | 管理员密码 |

**配置示例**：
```bash
# 管理员用户名
ADMIN_USERNAME=admin

# 管理员密码（生产环境必须更改）
ADMIN_PASSWORD=YourSecurePassword123!
```

### Session 配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `SESSION_TIMEOUT` | `86400` | Session 过期时间（秒，24小时） |
| `SESSION_SECRET` | `changeme` | Session 加密密钥 |

**配置示例**：
```bash
# Session 过期时间（86400秒 = 24小时）
SESSION_TIMEOUT=86400

# Session 密钥（生产环境必须更改）
SESSION_SECRET=your_secure_random_secret_key_at_least_32_chars
```

**Session 密钥生成**：
```bash
# 生成安全的 Session 密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## OAuth 集成配置

### GitHub OAuth

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `GITHUB_CLIENT_ID` | - | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | - | GitHub OAuth App Client Secret |
| `GITHUB_CALLBACK_URL` | `http://localhost:7900/api/oauth/github/callback` | GitHub OAuth 回调 URL |

**配置示例**：
```bash
# GitHub OAuth App 配置
GITHUB_CLIENT_ID=iv1l2l3j4k5m6n7o8p9q
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_CALLBACK_URL=http://localhost:7900/api/oauth/github/callback
```

**GitHub OAuth App 创建**：
1. 访问 https://github.com/settings/developers
2. 点击 "New OAuth App"
3. 配置：
   - Application name: `CodaGraph-lite`
   - Homepage URL: `http://your-domain.com`
   - Authorization callback URL: `http://your-domain.com/api/oauth/github/callback`
4. 保存并获取 Client ID 和 Secret

### Gitee OAuth

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `GITEE_CLIENT_ID` | - | Gitee OAuth App Client ID |
| `GITEE_CLIENT_SECRET` | - | Gitee OAuth App Client Secret |
| `GITEE_CALLBACK_URL` | `http://localhost:7900/api/oauth/gitee/callback` | Gitee OAuth 回调 URL |

**配置示例**：
```bash
# Gitee OAuth App 配置
GITEE_CLIENT_ID=your_gitee_client_id
GITEE_CLIENT_SECRET=your_gitee_client_secret
GITEE_CALLBACK_URL=http://localhost:7900/api/oauth/gitee/callback
```

**Gitee OAuth App 创建**：
1. 访问 https://gitee.com/oauth/applications
2. 点击 "创建应用"
3. 配置：
   - 应用名称: `CodaGraph-lite`
   - 应用主页: `http://your-domain.com`
   - 应用回调: `http://your-domain.com/api/oauth/gitee/callback`
4. 保存并获取 Client ID 和 Secret

### GitLab OAuth

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `GITLAB_CLIENT_ID` | - | GitLab OAuth App Client ID |
| `GITLAB_CLIENT_SECRET` | - | GitLab OAuth App Client Secret |
| `GITLAB_CALLBACK_URL` | `http://localhost:7900/api/oauth/gitlab/callback` | GitLab OAuth 回调 URL |

**配置示例**：
```bash
# GitLab OAuth App 配置
GITLAB_CLIENT_ID=your_gitlab_application_id
GITLAB_CLIENT_SECRET=your_gitlab_secret
GITLAB_CALLBACK_URL=http://localhost:7900/api/oauth/gitlab/callback
```

**GitLab OAuth App 创建**：
1. 访问 https://gitlab.com/-/profile/applications
2. 点击 "New application"
3. 配置：
   - Name: `CodaGraph-lite`
   - Redirect URI: `http://your-domain.com/api/oauth/gitlab/callback`
4. 保存并获取 Application ID 和 Secret

---

## Python Agent 配置

### Context Agent 配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `CONTEXT_AGENT_PORT` | `50052` | Context Agent gRPC 服务端口 |
| `CONTEXT_AGENT_HOST` | `localhost` | Context Agent 主机地址 |
| `AGENT_TIMEOUT_CONTEXT` | `300000` | Context Agent 超时（毫秒，5分钟） |

**配置示例**：
```bash
# Context Agent 配置
CONTEXT_AGENT_PORT=50052
CONTEXT_AGENT_HOST=localhost
AGENT_TIMEOUT_CONTEXT=300000  # 5分钟
```

### Review Agent 配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `REVIEW_AGENT_PORT` | `50051` | Review Agent gRPC 服务端口 |
| `REVIEW_AGENT_HOST` | `localhost` | Review Agent 主机地址 |
| `AGENT_TIMEOUT_REVIEW` | `600000` | Review Agent 超时（毫秒，10分钟） |

**配置示例**：
```bash
# Review Agent 配置
REVIEW_AGENT_PORT=50051
REVIEW_AGENT_HOST=localhost
AGENT_TIMEOUT_REVIEW=600000  # 10分钟
```

### Python 内存限制

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `PYTHON_MEMORY_LIMIT` | `300m` | Python Agent 进程内存限制 |

**配置示例**：
```bash
# Python 进程内存限制（300MB）
PYTHON_MEMORY_LIMIT=300m
```

**2u2g 服务器要求**：
- 必须设置为 `300m` 或更小
- 超过 300m 可能导致 OOM

---

## git-ai 配置

### git-ai CLI 路径

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `GIT_AI_BIN` | `/usr/local/bin/git-ai` | git-ai CLI 可执行文件路径 |

**配置示例**：
```bash
# git-ai CLI 路径
GIT_AI_BIN=/usr/local/bin/git-ai

# 或使用自定义安装路径
GIT_AI_BIN=/opt/git-ai/bin/git-ai
```

### git-ai 内存限制

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `GIT_AI_MAX_MEMORY` | `256m` | git-ai 进程内存限制 |

**配置示例**：
```bash
# git-ai 内存限制（256MB）
GIT_AI_MAX_MEMORY=256m
```

**2u2g 服务器要求**：
- 必须设置为 `256m` 或更小
- 超过 256m 可能导致 OOM

### 工作空间配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `WORKSPACE_ROOT` | `/tmp/repos` | 仓库克隆和索引工作区 |

**配置示例**：
```bash
# 工作空间路径
WORKSPACE_ROOT=/tmp/repos

# 或使用持久化存储
WORKSPACE_ROOT=/opt/codagraph-lite/workspace
```

---

## LLM 配置

### LLM 提供商

| 环境变量 | 默认值 | 可选值 |
|-----------|---------|--------|
| `LLM_PROVIDER` | `openai` | `openai`, `anthropic`, `deepseek`, `自定义` |

**配置示例**：
```bash
# 使用 OpenAI
LLM_PROVIDER=openai

# 使用 Anthropic
LLM_PROVIDER=anthropic

# 使用 DeepSeek
LLM_PROVIDER=deepseek
```

### LLM API 密钥

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `LLM_API_KEY` | - | LLM API 访问密钥 |

**配置示例**：
```bash
# LLM API 密钥
LLM_API_KEY=sk-your-api-key-here
```

**API 密钥获取**：
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- DeepSeek: https://platform.deepseek.com/

### LLM 模型配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `LLM_MODEL` | `gpt-4` | 使用的 LLM 模型名称 |

**配置示例**：
```bash
# OpenAI 模型
LLM_MODEL=gpt-4

# Anthropic 模型
LLM_MODEL=claude-3-sonnet-20240229

# DeepSeek 模型
LLM_MODEL=deepseek-chat
```

### LLM API 自定义端点

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `LLM_API_BASE_URL` | - | 自定义 LLM API 端点 |

**配置示例**：
```bash
# 自定义 API 端点（例如使用代理）
LLM_API_BASE_URL=https://your-proxy.com/v1
```

### LLM 重试配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `LLM_MAX_RETRIES` | `3` | LLM API 调用最大重试次数 |

**配置示例**：
```bash
# 最大重试 3 次
LLM_MAX_RETRIES=3
```

---

## 资源监控配置

### Swap 警告

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `ENABLE_SWAP_WARNING` | `true` | 是否启用 Swap 缺失警告 |

**配置示例**：
```bash
# 启用 Swap 警告
ENABLE_SWAP_WARNING=true
```

### 内存阈值

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `MEMORY_WARNING_THRESHOLD` | `80` | 内存警告阈值（百分比） |
| `MEMORY_CRITICAL_THRESHOLD` | `95` | 内存严重阈值（百分比） |

**配置示例**：
```bash
# 80% 内存使用时警告（约 1.6GB）
MEMORY_WARNING_THRESHOLD=80

# 95% 内存使用时停止接受新作业（约 1.9GB）
MEMORY_CRITICAL_THRESHOLD=95
```

**阈值行为**：
| 级别 | 内存值 | 行为 |
|------|---------|------|
| 警告 | ≥80% (1.6GB) | 记录警告，继续运行 |
| 严重 | ≥95% (1.9GB) | 停止接受新作业，记录严重错误 |

---

## 日志配置

### 日志级别

| 环境变量 | 默认值 | 可选值 |
|-----------|---------|--------|
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

**配置示例**：
```bash
# 日志级别：debug > info > warn > error
LOG_LEVEL=info
```

### 日志文件路径

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `LOG_PATH` | `./logs` | 日志文件存储目录 |

**配置示例**：
```bash
# 日志目录
LOG_PATH=/var/log/codagraph-lite
```

### 请求日志

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `ENABLE_REQUEST_LOGGING` | `true` | 是否启用 HTTP 请求日志 |

**配置示例**：
```bash
# 启用请求日志
ENABLE_REQUEST_LOGGING=true
```

---

## 安全配置

### HTTPS 配置

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `ENABLE_HTTPS` | `false` | 是否启用 HTTPS |
| `HTTPS_CERT_PATH` | - | HTTPS 证书文件路径 |
| `HTTPS_KEY_PATH` | - | HTTPS 私钥文件路径 |

**配置示例**：
```bash
# 启用 HTTPS（生产环境推荐）
ENABLE_HTTPS=true

# 证书路径
HTTPS_CERT_PATH=/etc/ssl/cert.pem
HTTPS_KEY_PATH=/etc/ssl/key.pem
```

**HTTPS 证书生成**：
```bash
# 使用 Let's Encrypt
sudo certbot certonly --standalone -d your-domain.com

# 或自签名证书（仅用于测试）
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

---

## Webhook 配置

### Webhook 密钥

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `WEBHOOK_SECRET` | `changeme` | Webhook 签名验证密钥 |

**配置示例**：
```bash
# Webhook 密钥（生产环境必须更改）
WEBHOOK_SECRET=your_random_webhook_secret_here
```

**密钥生成**：
```bash
# 生成安全的 Webhook 密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## CORS 配置

### CORS 源

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `CORS_ORIGINS` | `http://localhost:3000` | 允许的 CORS 源（逗号分隔） |

**配置示例**：
```bash
# 开发环境
CORS_ORIGINS=http://localhost:3000

# 生产环境（多个域名）
CORS_ORIGINS=https://app1.com,https://app2.com

# 允许所有（不推荐生产环境）
CORS_ORIGINS=*
```

### CORS 方法

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `CORS_METHODS` | `GET,POST,PUT,DELETE,OPTIONS` | 允许的 HTTP 方法 |

**配置示例**：
```bash
# 允许的 HTTP 方法
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
```

---

## 2u2g 服务器关键配置

### 必须配置项（检查清单）

以下配置项在 2u2g 服务器上**必须**按以下值设置：

| 配置项 | 必须值 | 原因 |
|--------|---------|------|
| `NODE_OPTIONS` | `--max-old-space-size=200` | 限制 Node.js 内存为 200MB |
| `WORKER_COUNT` | `1` | 单 Worker 串行处理 |
| `ENABLE_CONCURRENT_JOBS` | `false` | 禁用并发作业 |
| `PYTHON_MEMORY_LIMIT` | `300m` | 限制 Python 进程内存为 300MB |
| `GIT_AI_MAX_MEMORY` | `256m` | 限制 git-ai 内存为 256MB |
| `SQLITE_CACHE_SIZE` | `-2000` | 限制 SQLite 缓存为 2MB |
| `ENABLE_SWAP_WARNING` | `true` | 启用 Swap 警告 |

### 完整的 2u2g 配置示例

```bash
# ============================================
# 2u2g 服务器优化配置
# ============================================

# Node.js 内存限制
NODE_OPTIONS=--max-old-space-size=200

# 作业队列（串行处理）
WORKER_COUNT=1
ENABLE_CONCURRENT_JOBS=false

# Python Agent 内存限制
PYTHON_MEMORY_LIMIT=300m

# git-ai 内存限制
GIT_AI_MAX_MEMORY=256m

# SQLite 缓存
SQLITE_CACHE_SIZE=-2000

# 资源监控
ENABLE_SWAP_WARNING=true
MEMORY_WARNING_THRESHOLD=80
MEMORY_CRITICAL_THRESHOLD=95

# ============================================
# 其他必需配置
# ============================================

# 管理员账户
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# LLM 配置
LLM_PROVIDER=openai
LLM_API_KEY=sk-your-api-key
LLM_MODEL=gpt-4

# git-ai 路径
GIT_AI_BIN=/usr/local/bin/git-ai
```

### 配置验证

启动时系统会验证以下配置：

```bash
# 检查 2u2g 配置是否合规
npm start

# 预期输出：
# ✓ Node.js 内存限制: 200MB
# ✓ Worker 数量: 1 (串行处理)
# ✓ Python 内存限制: 300m
# ✓ git-ai 内存限制: 256m
# ✓ SQLite 缓存: 2MB
# ✓ Swap 警告: 启用
```

如果配置不符合 2u2g 要求，系统会输出警告并拒绝启动。

---

## 配置验证

### 启动时配置检查

系统启动时会执行以下验证：

1. **必需配置检查**
   - 管理员用户名和密码
   - LLM 提供商和 API 密钥
   - git-ai CLI 路径

2. **2u2g 配置验证**
   - 内存限制配置
   - Worker 数量配置
   - Swap 检测

3. **文件路径验证**
   - 数据库目录可写
   - 日志目录可写
   - 备份目录可写

### 配置测试命令

```bash
# 测试数据库连接
npm run test:db

# 测试 LLM 连接
npm run test:llm

# 测试 git-ai 安装
npm run test:gitai

# 验证完整配置
npm run validate:config
```

### 配置修复建议

如果配置验证失败：

| 问题 | 建议修复 |
|------|-----------|
| `ADMIN_PASSWORD` 使用默认值 | 修改为强密码 |
| `SESSION_SECRET` 使用默认值 | 生成随机密钥 |
| `GIT_AI_BIN` 路径不存在 | 安装 git-ai CLI |
| `LLM_API_KEY` 缺失 | 配置有效的 API 密钥 |
| 端口被占用 | 修改 `FRONTEND_PORT` 或 `BACKEND_PORT` |

---

## 配置参考

### 环境变量速查表

| 分类 | 变量 | 默认值 | 2u2g 必须值 |
|------|------|---------|--------------|
| 服务器 | `FRONTEND_PORT` | `3000` | - |
| 服务器 | `BACKEND_PORT` | `7900` | - |
| 服务器 | `NODE_OPTIONS` | `--max-old-space-size=200` | ✅ |
| 数据库 | `DATABASE_PATH` | `./data/codagraph-lite.db` | - |
| 数据库 | `SQLITE_CACHE_SIZE` | `-2000` | ✅ |
| 队列 | `WORKER_COUNT` | `1` | ✅ |
| 队列 | `ENABLE_CONCURRENT_JOBS` | `false` | ✅ |
| 队列 | `JOB_QUEUE_POLL_INTERVAL` | `2` | - |
| 认证 | `ADMIN_USERNAME` | `admin` | - |
| 认证 | `ADMIN_PASSWORD` | `changeme` | - |
| 认证 | `SESSION_SECRET` | `changeme` | - |
| OAuth | `GITHUB_CLIENT_ID` | - | - |
| OAuth | `GITHUB_CLIENT_SECRET` | - | - |
| Agent | `PYTHON_MEMORY_LIMIT` | `300m` | ✅ |
| Agent | `AGENT_TIMEOUT_CONTEXT` | `300000` | - |
| Agent | `AGENT_TIMEOUT_REVIEW` | `600000` | - |
| git-ai | `GIT_AI_BIN` | `/usr/local/bin/git-ai` | - |
| git-ai | `GIT_AI_MAX_MEMORY` | `256m` | ✅ |
| git-ai | `WORKSPACE_ROOT` | `/tmp/repos` | - |
| LLM | `LLM_PROVIDER` | `openai` | - |
| LLM | `LLM_API_KEY` | - | - |
| LLM | `LLM_MODEL` | `gpt-4` | - |
| 监控 | `ENABLE_SWAP_WARNING` | `true` | ✅ |
| 监控 | `MEMORY_WARNING_THRESHOLD` | `80` | - |
| 监控 | `MEMORY_CRITICAL_THRESHOLD` | `95` | - |
| 日志 | `LOG_LEVEL` | `info` | - |
| 日志 | `LOG_PATH` | `./logs` | - |
| 安全 | `ENABLE_HTTPS` | `false` | - |
| 安全 | `WEBHOOK_SECRET` | `changeme` | - |

---

## 相关文档

- [部署指南](deployment.md) - 部署和优化配置
- [故障排除](troubleshooting.md) - 配置相关问题解决
- [架构文档](architecture.md) - 配置与系统架构的关系
