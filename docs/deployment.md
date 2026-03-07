# CodaGraph-lite 部署指南

本文档说明如何在生产环境中部署 CodaGraph-lite，包括 2u2g 服务器的优化配置。

## 目录

- [部署概述](#部署概述)
- [部署前准备](#部署前准备)
- [快速部署](#快速部署)
- [使用 systemd 部署](#使用-systemd-部署)
- [使用 PM2 部署](#使用-pm2-部署)
- [Docker 部署](#docker-部署)
- [2u2g 服务器优化](#2u2g-服务器优化)
- [HTTPS/TLS 配置](#httpstls-配置)
- [监控和日志](#监控和日志)
- [备份和恢复](#备份和恢复)
- [部署验证](#部署验证)
- [卸载](#卸载)

---

## 部署概述

CodaGraph-lite 提供以下部署方式：

| 部署方式 | 适用场景 | 优势 |
|-----------|-----------|------|
| systemd | Linux 生产服务器 | 自动启动、日志管理、故障自恢复 |
| PM2 | 跨平台 | 易于管理、监控面板、自动重启 |
| Docker | 容器化环境 | 隔离环境、易于迁移、版本控制 |

**推荐选择**：
- Linux 生产服务器：systemd
- 开发/测试环境：直接运行或 PM2
- 需要隔离环境：Docker

---

## 部署前准备

### 系统要求

| 资源 | 最低要求 | 推荐配置 |
|------|-----------|-----------|
| CPU | 2 核心 | 2-4 核心 |
| 内存 | 2GB RAM | 4GB RAM |
| 磁盘 | 10GB 可用空间 | 20GB SSD |
| 操作系统 | Ubuntu 20.04+, CentOS 8+, Debian 11+ | 最新稳定版本 |

### 软件依赖

```bash
# 检查 Node.js 版本（需要 18+）
node --version

# 检查 Python 版本（需要 3.11+）
python --version

# 检查 npm 版本
npm --version
```

**安装 Node.js**（如需要）：
```bash
# 使用 NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

**安装 Python 3.11+**（如需要）：
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3.11 python3-pip

# CentOS/RHEL
sudo yum install -y python3.11 python3-pip
```

### 防火墙配置

确保以下端口可访问：

| 端口 | 用途 | 外部访问 |
|------|------|-----------|
| 80/443 | 前端（HTTP/HTTPS） | 是 |
| 7900 | 后端 API | 否（仅前端需要） |
| 50051 | Review Agent gRPC | 否（仅内部） |
| 50052 | Context Agent gRPC | 否（仅内部） |

**UFW 防火墙配置**：
```bash
# 允许 HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 允许后端（如需外部访问）
sudo ufw allow 7900/tcp

# 启用防火墙
sudo ufw enable
```

---

## 快速部署

### 1. 克隆项目

```bash
# 克隆代码
cd /opt
sudo git clone https://github.com/your-org/codagraph-lite.git
cd codagraph-lite

# 设置所有者
sudo chown -R $USER:$USER /opt/codagraph-lite
```

### 2. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 Python 依赖
cd context-agent && pip install -r requirements.txt && cd ..
cd review-agent && pip install -r requirements.txt && cd ..
```

### 3. 配置环境

```bash
# 复制配置文件
cp .env.example .env

# 编辑配置
nano .env
```

**必须修改的配置**：
- `ADMIN_PASSWORD` - 设置强密码
- `LLM_PROVIDER` - 选择 LLM 提供商
- `LLM_API_KEY` - 设置 API 密钥
- `GIT_AI_BIN` - 设置 git-ai 路径
- `FRONTEND_PORT`/`BACKEND_PORT` - 如需修改默认端口

### 4. 构建前端

```bash
# 构建 Next.js 前端
cd web
npm run build
cd ..
```

### 5. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run start
```

---

## 使用 systemd 部署

systemd 是 Linux 系统的标准服务管理器，提供自动启动、日志管理和故障恢复。

### 创建服务文件

服务文件已预配置在 `deploy/` 目录：

```bash
# 查看服务文件
ls -la deploy/
# codagraph-lite-backend.service
# codagraph-lite-frontend.service
```

### 服务文件内容

**后端服务** (`deploy/codagraph-lite-backend.service`):
```ini
[Unit]
Description=CodaGraph-lite Backend Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/codagraph-lite
Environment="PATH=/usr/bin:/bin:/usr/local/bin"
EnvironmentFile=/opt/codagraph-lite/.env
ExecStart=/usr/bin/npm run start:backend
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=codagraph-lite-backend

[Install]
WantedBy=multi-user.target
```

**前端服务** (`deploy/codagraph-lite-frontend.service`):
```ini
[Unit]
Description=CodaGraph-lite Frontend Service
After=network.target codagraph-lite-backend.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/codagraph-lite/web
Environment="PATH=/usr/bin:/bin"
EnvironmentFile=/opt/codagraph-lite/.env
ExecStart=/usr/bin/npm run start:frontend
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=codagraph-lite-frontend

[Install]
WantedBy=multi-user.target
```

### 安装和启用服务

```bash
# 1. 创建用户（如不存在）
sudo useradd -r -s /bin/bash -d /opt/codagraph-lite www-data

# 2. 安装服务文件
sudo cp deploy/codagraph-lite-*.service /etc/systemd/system/

# 3. 重载 systemd 配置
sudo systemctl daemon-reload

# 4. 设置开机自启动
sudo systemctl enable codagraph-lite-backend
sudo systemctl enable codagraph-lite-frontend

# 5. 启动服务
sudo systemctl start codagraph-lite-backend
sudo systemctl start codagraph-lite-frontend

# 6. 检查服务状态
sudo systemctl status codagraph-lite-backend
sudo systemctl status codagraph-lite-frontend
```

### 服务管理命令

```bash
# 启动服务
sudo systemctl start codagraph-lite-backend
sudo systemctl start codagraph-lite-frontend

# 停止服务
sudo systemctl stop codagraph-lite-backend
sudo systemctl stop codagraph-lite-frontend

# 重启服务
sudo systemctl restart codagraph-lite-backend
sudo systemctl restart codagraph-lite-frontend

# 查看日志
sudo journalctl -u codagraph-lite-backend -f
sudo journalctl -u codagraph-lite-frontend -f

# 查看最近日志
sudo journalctl -u codagraph-lite-backend -n 100 --no-pager
```

### 服务故障排查

```bash
# 查看详细状态
sudo systemctl status codagraph-lite-backend

# 查看启动错误
sudo journalctl -xeu pid=1

# 重新加载配置后重启
sudo systemctl daemon-reload
sudo systemctl restart codagraph-lite-backend
```

---

## 使用 PM2 部署

PM2 是跨平台的进程管理器，适合需要简单管理界面的场景。

### 安装 PM2

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 启动 PM2 开机自启动
pm2 startup
```

### PM2 配置文件

`deploy/ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'codagraph-lite-backend',
      script: './server/index.js',
      cwd: '/opt/codagraph-lite',
      env_file: '/opt/codagraph-lite/.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      time: true
    },
    {
      name: 'codagraph-lite-frontend',
      script: './web/server.js',
      cwd: '/opt/codagraph-lite/web',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: '../logs/frontend-error.log',
      out_file: '../logs/frontend-out.log',
      time: true
    }
  ]
};
```

### 启动和管理服务

```bash
# 使用配置文件启动
pm2 start deploy/ecosystem.config.js

# 查看服务状态
pm2 status

# 查看日志
pm2 logs

# 查看后端日志
pm2 logs codagraph-lite-backend

# 查看前端日志
pm2 logs codagraph-lite-frontend

# 重启服务
pm2 restart codagraph-lite-backend
pm2 restart codagraph-lite-frontend

# 停止服务
pm2 stop codagraph-lite-backend
pm2 stop codagraph-lite-frontend

# 删除服务
pm2 delete codagraph-lite-backend
pm2 delete codagraph-lite-frontend
```

### PM2 监控面板

```bash
# 启动监控面板（端口 9615）
pm2 monit
```

---

## Docker 部署

Docker 部署提供环境隔离和易于迁移的优势。

### Dockerfile

前端 Dockerfile (`Dockerfile.frontend`):
```dockerfile
# 构建阶段
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web ./web
RUN cd web && npm run build

# 生产阶段
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/web/package*.json ./web/
COPY --from=builder /app/web/.next ./web/
COPY --from=builder /app/web/public ./web/public
RUN cd web && npm ci --production
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start:frontend"]
```

后端 Dockerfile (`Dockerfile.backend`):
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server ./server
COPY context-agent ./context-agent
COPY review-agent ./review-agent
COPY proto ./proto
COPY .env.example .env
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --no-cache-dir -r context-agent/requirements.txt && \
    pip3 install --no-cache-dir -r review-agent/requirements.txt
ENV NODE_ENV=production
EXPOSE 7900 50051 50052
CMD ["npm", "run", "start:backend"]
```

### Docker Compose（可选）

`docker-compose.yml`:
```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: codagraph-lite-backend
    ports:
      - "7900:7900"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./.env:/app/.env
    environment:
      - NODE_ENV=production
      - NODE_OPTIONS=--max-old-space-size=200
    restart: unless-stopped
    mem_limit: 200m

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: codagraph-lite-frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      - NODE_ENV=production
      - NODE_OPTIONS=--max-old-space-size=200
      - BACKEND_URL=http://backend:7900
    restart: unless-stopped
    mem_limit: 200m

volumes:
  data:
  logs:
```

### 构建和运行

```bash
# 构建镜像
docker build -f Dockerfile.backend -t codagraph-lite-backend .
docker build -f Dockerfile.frontend -t codagraph-lite-frontend .

# 运行容器
docker run -d \
  --name codagraph-lite-backend \
  -p 7900:7900 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.env:/app/.env:ro \
  --memory="200m" \
  --memory-swap="200m" \
  codagraph-lite-backend

docker run -d \
  --name codagraph-lite-frontend \
  -p 3000:3000 \
  --link codagraph-lite-backend:backend \
  -e BACKEND_URL=http://backend:7900 \
  --memory="200m" \
  --memory-swap="200m" \
  codagraph-lite-frontend
```

---

## 2u2g 服务器优化

### Swap 配置（必需）

在 2GB 内存服务器上，**必须配置 Swap** 作为安全网。

#### 检查当前 Swap 情况

```bash
free -h

# 预期输出：
#               total        used        free      shared  buff/cache   available
# Mem:           1.9Gi       800MiB      1.1GiB       12MiB       180MiB      1.0GiB
# Swap:            0B          0B          0B          0B          0B          0B
```

如果 Swap 为 `0B`，需要创建。

#### 创建 Swap 文件

```bash
# 创建 2GB swap 文件
sudo fallocate -l 2G /swapfile

# 设置权限
sudo chmod 600 /swapfile

# 设置为 swap
sudo mkswap /swapfile

# 启用 swap
sudo swapon /swapfile

# 验证
free -h
# Swap:            2.0Gi       0B          2.0GiB      0B          0B          2.0GiB
```

#### 持久化 Swap 配置

```bash
# 添加到 /etc/fstab
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 配置 swappiness（10 = 较少使用 swap）
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# 应用 sysctl 配置
sudo sysctl -p
```

#### Swap 监控

系统会自动监控 Swap 使用：
```bash
# 查看系统日志
journalctl -u codagraph-lite-backend -f

# Swap 警告示例：
# [WARN] Swap 使用超过 100MB，考虑增加内存
```

### 内存限制配置

#### Node.js 内存限制

在 `.env` 中：
```bash
# 限制每个 Node.js 进程 200MB
NODE_OPTIONS=--max-old-space-size=200
```

#### Python Agent 内存限制

在 `.env` 中：
```bash
# 限制 Python 进程 300MB
PYTHON_MEMORY_LIMIT=300m
```

#### git-ai 内存限制

在 `.env` 中：
```bash
# 限制 git-ai 进程 256MB
GIT_AI_MAX_MEMORY=256m
```

### SQLite 缓存优化

在 `.env` 中：
```bash
# SQLite 缓存限制为 2MB
SQLITE_CACHE_SIZE=-2000
```

### 串行作业处理

在 `.env` 中：
```bash
# 单 Worker（串行处理）
WORKER_COUNT=1

# 禁用并发
ENABLE_CONCURRENT_JOBS=false
```

### 系统级优化

#### 调整文件描述符限制

```bash
# 查看当前限制
ulimit -n

# 增加到 65535
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf
```

#### 禁用不必要的服务

```bash
# 查看运行服务
systemctl list-units --type=service --state=running

# 停止不必要的服务（根据实际需求）
# sudo systemctl stop service-name
```

---

## HTTPS/TLS 配置

### 使用 Let's Encrypt（推荐）

```bash
# 安装 Certbot
sudo apt install -y certbot

# 获取证书（需要域名已解析到服务器）
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# 证书位置：
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### 配置 .env 使用 HTTPS

```bash
# 启用 HTTPS
ENABLE_HTTPS=true

# 证书路径
HTTPS_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
HTTPS_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
```

### 自动续期

```bash
# 测试续期
sudo certbot renew --dry-run

# 设置自动续期（cron）
echo "0 0 * * * certbot renew --quiet" | sudo tee -a /etc/crontab
```

### Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:7900;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Webhook 回调
    location /webhook/ {
        proxy_pass http://localhost:7900;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

---

## 监控和日志

### 日志配置

日志文件位置：
```bash
logs/
├── backend.log         # 后端主日志
├── frontend.log        # 前端日志
├── agent.log           # Agent 进程日志
├── error.log           # 错误日志
└── access.log          # 访问日志
```

### 日志轮转配置

使用 logrotate 管理日志大小：

`/etc/logrotate.d/codagraph-lite`:
```
/opt/codagraph-lite/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 www-data www-data
    sharedscripts
        postrotate
            systemctl reload codagraph-lite-backend > /dev/null 2>&1 || true
        endscript
}
```

### 健康检查

```bash
# 端点检查
curl http://localhost:7900/health

# 预期响应：
# {"status":"ok","services":{"database":"connected","queue":"running","agents":"idle"},"uptime":12345}
```

### 资源监控

```bash
# 内存状态
curl http://localhost:7900/api/status/memory

# 完整资源状态
curl http://localhost:7900/api/status/resources
```

### Prometheus 指标

```bash
# 指标端点
curl http://localhost:7900/metrics

# 输出示例（Prometheus 格式）：
# codagraph_jobs_total{status="pending"} 5
# codagraph_jobs_total{status="processing"} 1
# codagraph_jobs_total{status="completed"} 100
# codagraph_memory_usage_bytes 1073741824
```

---

## 备份和恢复

### 自动备份配置

在 `.env` 中配置：
```bash
# 启用自动备份
ENABLE_AUTO_BACKUP=true

# 备份间隔（24小时）
BACKUP_INTERVAL_HOURS=24

# 备份目录
BACKUP_PATH=/opt/codagraph-lite/backups
```

### 手动备份

```bash
# 使用备份脚本
./deploy/scripts/backup.sh

# 或使用 API
curl -X POST http://localhost:7900/api/backup \
  -H "Content-Type: application/json" \
  -d '{"description":"手动备份"}'
```

### 恢复数据库

```bash
# 使用恢复脚本
./deploy/scripts/restore.sh /path/to/backup.db

# 或使用 API
curl -X POST http://localhost:7900/api/restore \
  -F "file=@/path/to/backup.db"
```

---

## 部署验证

### 功能检查清单

- [ ] 服务成功启动（systemctl status 正常）
- [ ] 前端可访问（HTTP 200）
- [ ] 后端健康检查正常（/health 返回 ok）
- [ ] 管理员可以登录
- [ ] OAuth 集成可以授权
- [ ] LLM 提供商连接正常
- [ ] git-ai CLI 可用
- [ ] 内存使用在限制内（<1.5GB）
- [ ] Swap 配置并检测到

### 端到端测试

```bash
# 健康检查
curl -f http://localhost:7900/health || echo "健康检查失败"

# 内存监控
curl -f http://localhost:7900/api/status/memory || echo "内存监控失败"

# 资源状态
curl -f http://localhost:7900/api/status/resources || echo "资源监控失败"
```

### 日志检查

```bash
# 查看启动日志
sudo journalctl -u codagraph-lite-backend -n 50 --no-pager

# 检查错误日志
sudo grep ERROR /opt/codagraph-lite/logs/error.log | tail -n 20
```

### PR 审查流程测试

1. 创建测试仓库并推送 PR
2. 等待 webhook 触发
3. 检查作业队列（/api/jobs）
4. 验证审查评论已发布

---

## 卸载

### 使用 systemd 卸载

```bash
# 1. 停止并禁用服务
sudo systemctl stop codagraph-lite-backend
sudo systemctl stop codagraph-lite-frontend
sudo systemctl disable codagraph-lite-backend
sudo systemctl disable codagraph-lite-frontend

# 2. 删除服务文件
sudo rm /etc/systemd/system/codagraph-lite-backend.service
sudo rm /etc/systemd/system/codagraph-lite-frontend.service

# 3. 重载 systemd
sudo systemctl daemon-reload

# 4. 删除项目文件
sudo rm -rf /opt/codagraph-lite

# 5. 可选：删除用户
sudo userdel -r www-data
```

### 使用 PM2 卸载

```bash
# 停止并删除服务
pm2 delete codagraph-lite-backend
pm2 delete codagraph-lite-frontend

# 从开机启动中移除
pm2 unstartup

# 删除项目文件
rm -rf /opt/codagraph-lite
```

### Docker 卸载

```bash
# 停止并删除容器
docker stop codagraph-lite-backend codagraph-lite-frontend
docker rm codagraph-lite-backend codagraph-lite-frontend

# 删除镜像
docker rmi codagraph-lite-backend codagraph-lite-frontend

# 删除卷（谨慎操作）
docker volume rm codagraph-lite_data codagraph-lite_logs
```

### 保留数据卸载

仅卸载服务和应用代码，保留数据：

```bash
# 停止服务
sudo systemctl stop codagraph-lite-backend codagraph-lite-frontend

# 备份数据
cd /opt/codagraph-lite
tar czf ~/codagraph-lite-backup-$(date +%Y%m%d).tar.gz data/

# 删除应用（保留 data 目录）
rm -rf context-agent review-agent server web deploy
```

---

## 相关文档

- [配置指南](configuration.md) - 环境变量详细说明
- [故障排除](troubleshooting.md) - 常见问题解决
- [架构文档](architecture.md) - 系统架构设计
