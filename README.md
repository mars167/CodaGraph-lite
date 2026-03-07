# CodaGraph-lite

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node.js](https://img.shields.io/badge/node-18%2B-brightgreen)
![Python](https://img.shields.io/badge/python-3.11%2B-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

**轻量级代码审查平台 - 专为 2u2g 服务器优化**

让代码审查更简单，更高效

</div>

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [2u2g 服务器适配](#2u2g-服务器适配)
- [快速开始](#快速开始)
- [系统要求](#系统要求)
- [项目结构](#项目结构)
- [功能演示](#功能演示)
- [配置说明](#配置说明)
- [部署指南](#部署指南)
- [故障排除](#故障排除)
- [架构文档](#架构文档)
- [贡献指南](#贡献指南)
- [升级指南](#升级指南)

---

## 项目简介

CodaGraph-lite 是 CodaGraph 的轻量级版本，专为个人开发者或小型团队在私有云服务器（2u2g）上部署而设计。它保留了核心的智能代码审查功能，同时大幅简化了部署复杂性和基础设施依赖。

### 与完整版 CodaGraph 的区别

| 特性 | CodaGraph | CodaGraph-lite |
|--------|-----------|----------------|
| 服务数量 | 5 个独立服务 | 2 个服务（前端+后端） |
| 数据库 | PostgreSQL + Redis | SQLite（单文件） |
| 消息队列 | Bull Queue + Redis | 自研 SQLite 队列 |
| 用户系统 | 多用户 + RBAC | 单管理员 |
| 部署要求 | Docker Compose | 直接运行或 systemd/PM2 |
| 内存需求 | ≥4GB | 2GB（含 swap） |
| 适用场景 | 企业 SaaS | 个人/小团队私有部署 |

---

## 核心特性

### 智能代码审查
- 集成 **git-ai** 进行语义代码分析
- 基于 LLM 的智能审查建议
- 支持多平台：**GitHub、Gitee、GitLab**
- 自动 Webhook 触发，无需手动操作

### 轻量级架构
- **双服务架构**：前端 (Next.js 14) + 后端 (Express.js)
- **零配置数据库**：SQLite 单文件存储，无需额外服务
- **简化的认证**：单管理员模式，无需复杂权限系统

### 2u2g 服务器优化
- 严格的内存限制和控制
- 串行作业处理，避免并发内存峰值
- Ephemeral Agent 进程（用完即销毁）
- 内置内存监控和 Swap 检测
- 优化的 SQLite 缓存配置

### 易于部署
- 无需 Docker Compose 编排
- 支持 systemd 和 PM2 进程管理
- 提供完整的环境变量配置
- 一键安装脚本

### Web 管理界面
- 直观的仪表板界面
- OAuth 集成管理（GitHub/Gitee/GitLab）
- 仓库管理
- 审查历史和作业状态监控
- 实时内存和资源使用查看

---

## 技术栈

### 前端
- **框架**: Next.js 14 (App Router)
- **UI 库**: React 18 + Tailwind CSS
- **状态管理**: React Context API
- **HTTP 客户端**: fetch API

### 后端
- **框架**: Express.js
- **语言**: TypeScript
- **数据库**: SQLite3 (better-sqlite3)
- **作业队列**: 自研 SQLite 队列
- **认证**: Session-based + 密码哈希

### AI 服务
- **Context Agent**: Python 3.11+ (gRPC)
- **Review Agent**: Python 3.11+ (gRPC)
- **代码分析**: git-ai CLI
- **LLM 支持**: OpenAI, Anthropic, DeepSeek 等

### 部署
- **进程管理**: systemd / PM2
- **日志**: Winston + 结构化日志
- **监控**: 内置健康检查和指标端点

---

## 2u2g 服务器适配

CodaGraph-lite 专为 2 核 2GB 内存的服务器优化，确保在资源受限环境下稳定运行。

### 内存预算分配（2GB 总量）

| 组件 | 目标内存 | 限制配置 |
|--------|-----------|-----------|
| 操作系统 + 基础进程 | ~400MB | 系统预留 |
| Next.js 前端服务 | 150-200MB | `NODE_OPTIONS=--max-old-space-size=200` |
| Express 后端服务 | 150-200MB | `NODE_OPTIONS=--max-old-space-size=200` |
| SQLite 数据库 | 50-100MB | `cache_size=-2000` (2MB) |
| Python Context Agent | 200-300MB | `PYTHON_MEMORY_LIMIT=300m` |
| Python Review Agent | 200-300MB | `PYTHON_MEMORY_LIMIT=300m` |
| git-ai CLI | 100-200MB | `GIT_AI_MAX_MEMORY=256m` |
| **峰值总计** | ~1350MB | < 2GB (含 swap) |

### 关键配置项（2u2g 必选）

```bash
# .env 中必须配置以下项

# Node.js 内存限制（各 200MB）
NODE_OPTIONS=--max-old-space-size=200

# 限制同时只处理 1 个任务（串行处理）
WORKER_COUNT=1
ENABLE_CONCURRENT_JOBS=false

# Python 进程内存限制
PYTHON_MEMORY_LIMIT=300m

# git-ai 内存限制
GIT_AI_MAX_MEMORY=256m

# SQLite 缓存限制（2MB）
SQLITE_CACHE_SIZE=-2000

# 启用 Swap 警告
ENABLE_SWAP_WARNING=true
```

### Swap 配置建议

在 2GB 内存服务器上，**强烈建议配置 2GB swap** 作为安全网：

```bash
# 检查当前 swap 情况
free -h

# 创建 2GB swap 文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 持久化配置
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 验证 swap 生效
free -h
```

### 内存监控

系统内置以下监控端点：

- `/api/status/memory` - 内存使用报告
- `/api/status/resources` - 完整资源状态
- `/health` - 服务健康检查

**警告阈值**：
- 80% (1.6GB) → 记录警告
- 95% (1.9GB) → 停止接受新作业

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-org/codagraph-lite.git
cd codagraph-lite
```

### 2. 安装依赖

```bash
# 安装 Node.js 依赖（前端 + 后端）
npm install

# 安装 Python 依赖
cd context-agent && pip install -r requirements.txt && cd ..
cd review-agent && pip install -r requirements.txt && cd ..
```

### 3. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置文件
nano .env
```

**必须配置项**：
- `ADMIN_USERNAME` - 管理员用户名
- `ADMIN_PASSWORD` - 管理员密码
- `LLM_PROVIDER` - LLM 提供商
- `LLM_API_KEY` - LLM API 密钥
- `GIT_AI_BIN` - git-ai CLI 路径

### 4. 安装 git-ai CLI

```bash
# 从官方仓库安装 git-ai
npm install -g git-ai-cli

# 或使用预编译二进制文件
# 参考: https://github.com/git-ai/git-ai/releases
```

### 5. 启动服务

**开发模式**（前端 + 后端同时启动）：
```bash
npm run dev
```

**快速后台启动/重启**：
```bash
# 后台启动（日志写入 .run/dev.log）
npm run service:start

# 停止服务
npm run service:stop

# 重启服务
npm run service:restart

# 重置管理员密码（默认使用 .env 的 ADMIN_USERNAME / ADMIN_PASSWORD）
npm run admin:password:reset

# 指定用户名和新密码
bash ./bin/admin-password-reset.sh admin NewStrongPassword123
```

**生产模式**：
```bash
# 构建前端
cd web && npm run build && cd ..

# 启动服务
npm run start
```

### 6. 访问应用

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端界面 | http://localhost:3000 | 管理仪表板 |
| 后端 API | http://localhost:7900 | RESTful API |
| 健康检查 | http://localhost:7900/health | 服务状态 |

### 7. 初始化管理员账户

首次访问 `http://localhost:3000`，系统会引导你：
1. 创建管理员账户
2. 配置 LLM 提供商
3. 授权 Git 平台（GitHub/Gitee/GitLab）

---

## 系统要求

### 最低配置（2u2g ）

| 资源 | 要求 | 说明 |
|------|------|------|
| CPU | 2 核心 | 支持虚拟化云服务器 |
| 内存 | 2GB RAM | 推荐 +2GB Swap |
| 磁盘 | 10GB 可用空间 | 包含数据库和日志 |
| 操作系统 | Linux (Ubuntu 20.04+) | 也支持 macOS / Windows |
| 网络 | 公网 IP | 用于 Webhook 回调 |

### 软件依赖

```bash
# Node.js 版本
node --version  # 18.0.0 或更高

# Python 版本
python --version  # 3.11 或更高

# git-ai CLI
git-ai --version  # 最新版本
```

### 推荐配置

| 资源 | 推荐 | 说明 |
|------|------|------|
| CPU | 2-4 核心 | 更快的 LLM 处理 |
| 内存 | 4GB RAM | 无需 Swap，更稳定 |
| 磁盘 | 20GB+ SSD | 更快的数据库访问 |

---

## 项目结构

```
codagraph-lite/
├── web/                    # Next.js 前端应用
│   ├── app/               # App Router 页面
│   ├── components/         # React 组件
│   └── lib/               # 工具函数
├── server/                  # Express.js 后端服务
│   ├── src/               # 源代码
│   │   ├── database/      # SQLite 数据库层
│   │   ├── queue/          # 作业队列
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务逻辑
│   │   └── agents/         # Python Agent 集成
│   └── tests/            # 单元测试
├── context-agent/          # Python Context Agent
│   ├── src/
│   └── tests/
├── review-agent/           # Python Review Agent
│   ├── src/
│   └── tests/
├── proto/                 # gRPC 协议定义
├── deploy/                # 部署脚本
│   ├── *.service          # systemd 服务文件
│   └── ecosystem.config.js # PM2 配置
├── docs/                 # 项目文档
├── data/                 # SQLite 数据库文件
├── logs/                 # 日志文件
└── .env.example          # 环境变量示例
```

---

## 功能演示

### 1. 管理员登录

首次使用时创建管理员账户，后续使用用户名/密码登录。

### 2. OAuth 集成

一键授权连接到：
- **GitHub** - 点击"授权 GitHub"按钮
- **Gitee** - 点击"授权 Gitee"按钮
- **GitLab** - 点击"授权 GitLab"按钮

授权后系统自动配置 Webhook。

### 3. 仓库管理

查看已连接的仓库列表：
- 平台图标
- 仓库路径
- 最后审查时间
- 连接/断开操作

### 4. PR 审查流程

1. 开发者在 Git 平台创建/更新 Pull Request
2. Webhook 触发 CodaGraph-lite 后端
3. 作业入队等待处理
4. Worker 克隆仓库到工作区
5. 调用 git-ai 索引代码
6. 启动 Context Agent 收集上下文
7. 启动 Review Agent 执行审查
8. 格式化审查评论
9. 发布评论到原平台

### 5. 作业监控

实时查看：
- 当前处理中的作业
- 队列中的待处理作业
- 作业历史和状态
- 错误信息和重试次数

### 6. 资源监控

查看实时：
- 内存使用（总量/各进程）
- CPU 使用率
- 磁盘使用
- Swap 使用情况

---

## 配置说明

详细配置说明请参考：

- [配置指南](docs/configuration.md) - 完整环境变量说明
- [.env.example](.env.example) - 配置示例文件

### 关键配置速查

| 配置项 | 默认值 | 说明 |
|--------|---------|------|
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | `changeme` | 管理员密码（必须更改） |
| `WORKER_COUNT` | `1` | 作业 Worker 数量（2u2g 必须为 1） |
| `LLM_PROVIDER` | `openai` | LLM 提供商 |
| `LLM_API_KEY` | - | LLM API 密钥 |
| `GIT_AI_BIN` | `/usr/local/bin/git-ai` | git-ai CLI 路径 |

---

## 部署指南

详细的部署说明请参考：

- [部署指南](docs/deployment.md) - 完整部署步骤
- [systemd 配置](docs/deployment.md#使用-systemd) - 系统服务部署
- [PM2 配置](docs/deployment.md#使用-pm2) - 进程管理部署
- [2u2g 优化](docs/deployment.md#2u2g-服务器优化) - 资源优化配置

### 部署脚本

CodaGraph-lite 提供完整的部署脚本，位于 `deploy/` 目录：

| 脚本 | 功能 | 使用方式 |
|------|------|---------|
| `deploy.sh` | 一键部署 | `sudo bash deploy/deploy.sh [systemd\|pm2]` |
| `uninstall.sh` | 完全卸载 | `sudo bash deploy/uninstall.sh [--remove-data]` |
| `verify.sh` | 部署验证 | `bash deploy/verify.sh [--verbose]` |
| `validate-env.sh` | 环境变量验证 | `bash deploy/validate-env.sh [--strict] [--fix]` |
| `setup-swap.sh` | Swap 配置（2GB） | `sudo bash deploy/setup-swap.sh` |
| `backup.sh` | 数据备份 | `bash deploy/backup.sh [--full]` |
| `restore.sh` | 数据恢复 | `sudo bash deploy/restore.sh <backup_file>` |
| `monitor.sh` | 系统监控 | `bash deploy/monitor.sh [--continuous]` |

### 快速部署（systemd）

```bash
# 1. 一键部署（推荐）
sudo bash deploy/deploy.sh systemd

# 2. 或手动部署
npm install
cd context-agent && pip install -r requirements.txt && cd ..
cd review-agent && pip install -r requirements.txt && cd ..
cp .env.example .env
nano .env  # 编辑配置
cd web && npm run build && cd ..
sudo cp deploy/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now codagraph-lite-backend codagraph-lite-frontend
```

### 系统监控

```bash
# 单次检查
bash deploy/monitor.sh

# 持续监控（按 Ctrl+C 退出）
bash deploy/monitor.sh --continuous --interval=5
```

监控显示内容包括：
- 系统信息（主机、操作系统、运行时间）
- CPU 使用率和负载
- 内存使用率（RAM + Swap）
- 磁盘使用情况
- 服务状态（前端/后端）
- 进程信息（Node.js / Python）
- 2u2g 合规性检查
- 作业队列状态
- 告警信息

---

## 故障排除

常见问题和解决方案请参考：

- [故障排除指南](docs/troubleshooting.md)

### 常见问题速查

| 问题 | 可能原因 | 解决方案 |
|------|-----------|---------|
| 服务无法启动 | 端口被占用 | 检查 `FRONTEND_PORT` / `BACKEND_PORT` |
| OAuth 失败 | 回调 URL 错误 | 检查 `*_CALLBACK_URL` 配置 |
| 内存不足 (OOM) | Worker 数量过多 | 确保 `WORKER_COUNT=1` |
| Agent 超时 | 仓库过大 | 增加 `AGENT_TIMEOUT_*` 值 |
| 数据库锁定 | SQLite 文件损坏 | 运行数据库恢复或从备份恢复 |

---

## 架构文档

详细的架构说明请参考：

- [架构文档](docs/architecture.md) - 系统设计和数据流

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                   浏览器/客户端                         │
└────────────────────┬────────────────────────────────────────┘
                 │ HTTPS
┌────────────────▼────────────────────────────────────────┐
│                  Next.js 前端                   │
│            (端口 3000, 静态文件)            │
└────────────────┬────────────────────────────────────────┘
                 │ HTTP API
┌────────────────▼────────────────────────────────────────┐
│               Express.js 后端                      │
│     (端口 7900, API + Worker)               │
│                                                  │
│  ┌────────────┬──────────┬───────────┐       │
│  │ SQLite 数据库 │ 作业队列  │ Auth 中间件│       │
│  └────────────┴──────────┴───────────┘       │
│                                                  │
│  ┌──────────────┬──────────────────────┐          │
│  │ gRPC 客户端   │ gRPC 客户端        │
│  └──────┬───────┴───────┬──────┘          │
│         │                 │                     │
│  ┌──────▼──────┐   ┌───▼──────────┐          │
│  │Context Agent  │   │ Review Agent │          │
│  │Python 3.11+  │   │Python 3.11+ │          │
│  │ (临时进程)    │   │ (临时进程)    │          │
│  └──────┬───────┘   └───┬───────┘          │
│         │                   │                     │
│         └─────────┬─────────┘                    │
│                   ▼                             │
│            git-ai CLI (索引)                    │
└────────────────────────────────────────────────────────┘

           外部平台
    ┌────────┬────────┬────────┐
    │GitHub  │ Gitee  │GitLab │
    │OAuth+  │ OAuth+ │ OAuth+ │
    │Webhook │ Webhook │Webhook │
    └────────┴────────┴────────┘
```

---

## 贡献指南

欢迎贡献！请参考：

- [贡献指南](docs/contributing.md)

### 开发流程

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码规范

- **JavaScript/TypeScript**: ESLint + Prettier
- **Python**: Black + Ruff + MyPy
- **提交信息**: Conventional Commits 格式

---

## 升级指南

详细的升级说明请参考：

- [升级指南](docs/upgrade.md) - 版本升级步骤

### 升级检查清单

- [ ] 备份数据库文件
- [ ] 备份 `.env` 配置
- [ ] 停止服务
- [ ] 拉取最新代码
- [ ] 安装新依赖
- [ ] 运行数据库迁移
- [ ] 启动服务
- [ ] 验证功能正常

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [配置指南](docs/configuration.md) | 完整环境变量说明 |
| [部署指南](docs/deployment.md) | 部署步骤和优化 |
| [故障排除](docs/troubleshooting.md) | 常见问题解决方案 |
| [架构文档](docs/architecture.md) | 系统架构设计 |
| [API 文档](docs/api.md) | RESTful API 参考 |
| [贡献指南](docs/contributing.md) | 开发和贡献流程 |
| [升级指南](docs/upgrade.md) | 版本升级步骤 |

---

## 许可证

[MIT License](LICENSE)

---

## 支持

- 📖 [文档中心](docs/)
- 🐛 [问题反馈](https://github.com/your-org/codagraph-lite/issues)
- 💬 [讨论区](https://github.com/your-org/codagraph-lite/discussions)
- 📧 邮件支持: support@codagraph.com

---

<div align="center">

**让代码审查更简单，更高效**

Made with ❤️ by the CodaGraph team

</div>
