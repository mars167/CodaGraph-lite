# CI/CD 工作流文档

本文档说明 CodaGraph 项目的 GitHub Actions CI/CD 工作流配置。

## 目录

- [工作流概览](#工作流概览)
- [触发条件](#触发条件)
- [环境变量配置](#环境变量配置)
- [Job 说明](#job-说明)
- [部署流程](#部署流程)
- [故障回滚](#故障回滚)
- [Secrets 配置](#secrets-配置)
- [本地测试](#本地测试)

---

## 工作流概览

CI/CD 工作流文件：`.github/workflows/ci-cd.yml`

该工作流提供了完整的持续集成和持续部署流水线，包括：

1. **代码质量检查** - Lint、格式检查
2. **前端构建** - Next.js 构建与优化
3. **后端构建** - TypeScript 编译与测试
4. **安全扫描** - npm audit 和 Trivy 漏洞扫描
5. **部署验证** - 健康检查
6. **生产部署** - 自动部署到生产环境
7. **Staging 部署** - 部署到预发布环境
8. **部署通知** - Slack 通知
9. **清理任务** - 清理旧的构建产物

---

## 触发条件

### 自动触发

```yaml
on:
  push:
    branches: [main, develop]    # 推送到 main 或 develop 分支
    tags: ['v*']                  # 创建以 v 开头的标签
  pull_request:
    branches: [main, develop]    # 针对 main 或 develop 的 PR
```

### 手动触发

通过 GitHub Actions UI 手动触发，支持选择：

- **环境选择**: production | staging | development
- **跳过测试**: 是否跳过测试步骤

---

## 环境变量配置

### GitHub Repository Variables

在 `Settings > Secrets and variables > Variables` 中配置：

| 变量名 | 说明 | 示例 |
|---------|------|--------|
| `API_URL` | 生产环境 API 地址 | `https://api.codagraph.com` |
| `FRONTEND_URL` | 生产环境前端地址 | `https://codagraph.com` |

### GitHub Repository Secrets

在 `Settings > Secrets and variables > Secrets` 中配置：

| 密钥名 | 说明 | 必须 |
|---------|------|------|
| `DEPLOY_HOST` | 部署目标主机地址 | 是 |
| `DEPLOY_USER` | 部署用户名 | 是 |
| `DEPLOY_PATH` | 部署目标路径 | 是 |
| `DEPLOY_SSH_KEY` | SSH 私钥（用于部署） | 是 |
| `SLACK_WEBHOOK_URL` | Slack 通知 Webhook URL | 否 |

---

## Job 说明

### 1. lint - 代码质量检查

**超时时间**: 10 分钟

**执行内容**:
- ESLint 检查 (Web & Server)
- Prettier 格式检查
- TypeScript 类型检查（在后端构建中）

**缓存策略**:
- Node modules 缓存基于 `package-lock.json` 哈希

### 2. build-frontend - 前端构建

**超时时间**: 20 分钟

**依赖**: lint

**执行内容**:
- Next.js 生产构建
- 构建产物大小分析
- 可选 E2E 测试

**缓存策略**:
- Next.js `.next/cache` 缓存
- Node modules 缓存

**构建产物**:
- `.next/` - Next.js 构建输出
- `public/` - 静态资源
- 保留时间: 7 天

### 3. build-backend - 后端构建

**超时时间**: 20 分钟

**依赖**: lint

**执行内容**:
- TypeScript 编译
- Prisma 迁移验证
- 单元测试（覆盖率）
- 构建打包

**测试覆盖率报告**:
- 保留时间: 7 天

### 4. security-scan - 安全扫描

**超时时间**: 15 分钟

**依赖**: build-frontend, build-backend

**触发条件**: 非 PR 事件

**执行内容**:
- npm audit (漏洞扫描)
- Trivy 文件系统漏洞扫描
- 上传 SARIF 结果到 GitHub

### 5. deploy-production - 生产部署

**超时时间**: 30 分钟

**依赖**: build-frontend, build-backend, security-scan

**触发条件**:
- 推送到 main 分支，或
- 手动触发选择 production 环境

**执行内容**:
1. 下载前端和后端构建产物
2. 设置 SSH 密钥
3. 创建部署备份点
4. 使用 rsync 同步文件到服务器
5. 重启 PM2 服务
6. 健康检查验证
7. 失败时自动回滚

### 6. deploy-staging - Staging 部署

**超时时间**: 20 分钟

**依赖**: build-frontend, build-backend

**触发条件**:
- 推送到 develop 分支，或
- 手动触发选择 staging 环境

### 7. notify - 部署通知

**执行内容**:
- Slack 通知（配置了 Webhook 时）
- 创建 GitHub Deployment 记录

### 8. cleanup - 清理任务

**执行内容**:
- 删除超过 7 天的构建产物

---

## 部署流程

### 生产环境部署流程

```
┌─────────────┐
│   代码提交   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   检查代码   │
│   lint job  │
└──────┬──────┘
       │ 通过
       ▼
┌────────────────────────┐
│  并行构建            │
│  - build-frontend   │
│  - build-backend    │
└──────┬─────────────┘
       │
       ▼
┌─────────────┐
│  安全扫描    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  创建备份点  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  部署文件    │
│  rsync     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  重启服务    │
│  pm2       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  健康检查    │
│  验证部署    │
└─────────────┘
```

---

## 故障回滚

### 自动回滚机制

当部署步骤失败时，工作流会自动执行回滚：

1. **回滚触发条件**:
   - rsync 同步失败
   - 服务重启失败
   - 健康检查失败

2. **回滚步骤**:
   ```bash
   # 回滚到备份点
   git checkout backup-YYYYMMDD-HHMMSS

   # 重启服务
   pm2 restart all
   ```

3. **回滚通知**:
   - 通过 Slack 发送失败和回滚通知
   - 创建 GitHub Deployment 失败记录

### 手动回滚

如需手动回滚，可执行：

```bash
# SSH 登录服务器
ssh user@server

# 进入项目目录
cd /path/to/codagraph

# 查看最近的备份标签
git tag | grep backup

# 回滚到指定备份
git checkout backup-20240101-120000

# 重启服务
pm2 restart all
```

---

## Secrets 配置

### 必需 Secrets

| Secret | 用途 | 获取方式 |
|--------|--------|----------|
| `DEPLOY_HOST` | 目标服务器地址 | 服务器 IP 或域名 |
| `DEPLOY_USER` | SSH 登录用户 | 如 `node`、`ubuntu` |
| `DEPLOY_PATH` | 部署目标路径 | 如 `/var/www/codagraph` |
| `DEPLOY_SSH_KEY` | SSH 私钥 | `ssh-keygen -t ed25519` 生成 |

### 可选 Secrets

| Secret | 用途 |
|--------|--------|
| `SLACK_WEBHOOK_URL` | 部署成功/失败通知 |

### SSH 密钥生成

```bash
# 生成 SSH 密钥对
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/codagraph_deploy

# 公钥添加到服务器 ~/.ssh/authorized_keys
cat ~/.ssh/codagraph_deploy.pub | ssh user@server "cat >> ~/.ssh/authorized_keys"

# 私钥添加到 GitHub Secrets
cat ~/.ssh/codagraph_deploy
```

---

## PM2 配置

PM2 生态系统配置文件：`ecosystem.config.cjs`

### 启动应用

```bash
# 启动所有应用
pm2 start ecosystem.config.cjs

# 启动特定应用
pm2 start ecosystem.config.cjs --only codagraph-server
```

### 管理命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs codagraph-server

# 重启
pm2 restart all
pm2 reload codagraph-server  # 零停机重启

# 停止
pm2 stop all

# 删除
pm2 delete all

# 保存当前进程列表
pm2 save
```

### 开机自启动

```bash
# 生成 startup 脚本
pm2 startup

# 根据提示执行生成的命令
```

---

## 本地测试

### 安装 Act（本地运行 GitHub Actions）

```bash
# macOS/Linux
brew install act

# 或使用 go install
go install github.com/nektos/act@latest
```

### 运行特定 Job

```bash
# 运行 lint job
act -j lint

# 运行构建
act -j build-frontend -j build-backend

# 运行完整工作流
act
```

### 查看可用 Jobs

```bash
act -l
```

---

## 故障排查

### 常见问题

1. **rsync 权限错误**
   - 检查 DEPLOY_USER 是否有目标目录写权限
   - 确保 SSH 密钥已正确添加到服务器

2. **PM2 启动失败**
   - 检查 Node.js 版本是否匹配
   - 确认所有依赖已安装
   - 查看 PM2 日志: `pm2 logs --lines 100`

3. **健康检查超时**
   - 确认防火墙允许访问端口
   - 检查服务是否已启动并监听正确端口
   - 增加健康检查等待时间

### 调试模式

在工作流文件中添加调试输出：

```yaml
- name: 调试信息
  run: |
    echo "Runner OS: ${{ runner.os }}"
    echo "Branch: ${{ github.ref }}"
    echo "Event: ${{ github.event_name }}"
```

---

## 参考资源

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [PM2 文档](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Next.js 部署](https://nextjs.org/docs/deployment)
- [Trivy 安全扫描](https://aquasecurity.github.io/trivy/)
