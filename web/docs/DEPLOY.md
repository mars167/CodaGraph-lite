# CodaGraph Lite 前端部署指南

## 目录

- [部署概述](#部署概述)
- [系统要求](#系统要求)
- [构建准备](#构建准备)
- [部署方式](#部署方式)
- [环境配置](#环境配置)
- [验证部署](#验证部署)
- [性能优化](#性能优化)
- [故障排除](#故障排除)

## 部署概述

CodaGraph Lite 前端是一个基于 Next.js 14 的单页面应用（SPA），可以部署到多种环境：

1. **本地开发** - 开发和测试
2. **自托管** - 部署到自己的服务器
3. **容器化部署** - 使用 Docker 部署
4. **CDN 部署** - 部署到 Vercel、Netlify 等

## 系统要求

### 开发环境

- **Node.js**: 18.17 或更高版本
- **npm**: 9.0 或更高版本
- **内存**: 建议 4GB+
- **磁盘**: 建议 10GB+ 可用空间

### 生产环境

#### 最低配置（适用于 2u2g 服务器）
- **CPU**: 2 核心
- **内存**: 2GB
- **磁盘**: 5GB 可用空间
- **Node.js**: 18.17

#### 推荐配置
- **CPU**: 2+ 核心
- **内存**: 4GB+
- **磁盘**: 10GB+ 可用空间
- **Node.js**: LTS 版本
- **反向代理**: Nginx 或 Caddy（可选）

## 构建准备

### 1. 克隆代码

```bash
git clone <repository-url>
cd CodaGraph-lite/web
```

### 2. 安装依赖

```bash
npm install
```

**生产环境提示**：使用 `npm ci` 代替 `npm install`，确保使用 package-lock.json 中的确切版本。

```bash
npm ci --production=false
```

### 3. 配置环境变量

创建 `.env.local` 或 `.env.production` 文件：

```env
# 后端 API 地址（必须）
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# 应用信息（可选）
NEXT_PUBLIC_APP_NAME=CodaGraph Lite
NEXT_PUBLIC_APP_VERSION=1.0.0
```

**重要**：所有以 `NEXT_PUBLIC_` 开头的变量将在构建时被内联到客户端代码中，因此请勿包含敏感信息。

### 4. 构建项目

```bash
npm run build
```

构建成功后，将生成以下内容：
```
.next/
├── static/           # 静态资源
└── server/           # 服务器文件
```

## 部署方式

### 方式 1: 直接运行（适用于测试）

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

**默认端口**: 3000

**修改端口**：设置 `PORT` 环境变量：

```bash
PORT=8080 npm start
```

### 方式 2: PM2 进程管理

PM2 是 Node.js 应用的进程管理器，适合生产环境。

#### 安装 PM2

```bash
npm install -g pm2
```

#### 启动应用

```bash
cd /path/to/CodaGraph-lite/web
pm2 start npm --name "codagraph-lite-frontend" -- start
```

#### PM2 配置文件（推荐）

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'codagraph-lite-frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/path/to/CodaGraph-lite/web',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
```

使用配置文件启动：

```bash
pm2 start ecosystem.config.js
```

#### PM2 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs codagraph-lite-frontend

# 重启
pm2 restart codagraph-lite-frontend

# 停止
pm2 stop codagraph-lite-frontend

# 删除
pm2 delete codagraph-lite-frontend

# 查看详细信息
pm2 show codagraph-lite-frontend
```

### 方式 3: Systemd 服务

Systemd 是 Linux 系统的标准服务管理器。

#### 创建服务文件

创建 `/etc/systemd/system/codagraph-lite-frontend.service`:

```ini
[Unit]
Description=CodaGraph Lite Frontend
After=network.target

[Service]
Type=simple
User=codagraph
WorkingDirectory=/opt/codagraph-lite/web
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 启用并启动服务

```bash
# 重载 systemd
sudo systemctl daemon-reload

# 启用开机自启
sudo systemctl enable codagraph-lite-frontend

# 启动服务
sudo systemctl start codagraph-lite-frontend

# 查看状态
sudo systemctl status codagraph-lite-frontend

# 查看日志
sudo journalctl -u codagraph-lite-frontend -f
```

#### Systemd 常用命令

```bash
# 停止服务
sudo systemctl stop codagraph-lite-frontend

# 启动服务
sudo systemctl start codagraph-lite-frontend

# 重启服务
sudo systemctl restart codagraph-lite-frontend

# 禁用开机自启
sudo systemctl disable codagraph-lite-frontend
```

### 方式 4: Docker 容器化部署

#### Dockerfile

项目根目录的 Dockerfile 用于前端构建：

```dockerfile
FROM node:18-alpine AS base

# 依赖阶段
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 构建阶段
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 生产运行阶段
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### 构建镜像

```bash
docker build -t codagraph-lite-frontend .
```

#### 运行容器

```bash
docker run -d \
  --name codagraph-lite-frontend \
  -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:7900 \
  codagraph-lite-frontend
```

#### Docker Compose

如果同时部署前端和后端，可以使用 Docker Compose：

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: codagraph-lite-frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:7900
      - NODE_ENV=production
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - codagraph

  backend:
    build:
      context: ./server
    container_name: codagraph-lite-backend
    ports:
      - "7900:7900"
    environment:
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - codagraph

networks:
  codagraph:
    driver: bridge
```

启动：

```bash
docker-compose up -d
```

### 方式 5: Nginx 反向代理

配置 Nginx 作为反向代理，提供静态文件服务并处理 API 请求。

#### Nginx 配置

创建 `/etc/nginx/sites-available/codagraph-lite`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 静态文件服务
    location /_next/static {
        alias /opt/codagraph-lite/web/.next/static;
        expires 365d;
        access_log off;
    }

    location /static {
        alias /opt/codagraph-lite/web/public/static;
        expires 365d;
        access_log off;
    }

    # Next.js 服务
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API 代理到后端
    location /api {
        proxy_pass http://localhost:7900;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /oauth {
        proxy_pass http://localhost:7900;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/codagraph-lite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 环境配置

### 开发环境变量

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:7900
NEXT_PUBLIC_APP_NAME=CodaGraph Lite
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 生产环境变量

```env
# .env.production
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_APP_NAME=CodaGraph Lite
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 2u2g 服务器优化配置

对于 2u2g 服务器，建议以下配置：

```env
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=200
PORT=3000
```

PM2 配置限制内存：

```javascript
module.exports = {
  apps: [{
    name: 'codagraph-lite-frontend',
    max_memory_restart: '200M',
    // ...
  }]
};
```

## 验证部署

### 1. 检查服务状态

```bash
# PM2
pm2 status codagraph-lite-frontend

# Systemd
sudo systemctl status codagraph-lite-frontend

# Docker
docker ps | grep codagraph-lite-frontend
```

### 2. 检查端口监听

```bash
netstat -tlnp | grep :3000
# 或
ss -tlnp | grep :3000
```

### 3. 测试应用访问

```bash
# 本地测试
curl http://localhost:3000

# 远程测试
curl https://your-domain.com
```

### 4. 检查日志

```bash
# PM2
pm2 logs codagraph-lite-frontend --lines 100

# Systemd
sudo journalctl -u codagraph-lite-frontend -n 100

# Docker
docker logs --tail 100 codagraph-lite-frontend
```

## 性能优化

### 1. Next.js 优化

Next.js 已内置以下优化：
- 代码分割
- 图片优化
- 字体优化
- 预渲染

### 2. 构建优化

生产构建时使用以下优化：

```bash
# 使用 V8 内存限制
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### 3. 运行时优化

```bash
# 启用 Node.js 生产优化
NODE_ENV=production npm start

# 设置内存限制（2u2g 服务器）
NODE_OPTIONS=--max-old-space-size=200 npm start
```

### 4. Nginx 优化

```nginx
# 启用 gzip 压缩
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml;

# 缓存静态资源
location /_next/static {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

## 故障排除

### 应用无法启动

**问题**: `npm start` 失败

**解决方案**:
1. 清除缓存重新构建：
```bash
rm -rf .next node_modules
npm install
npm run build
npm start
```

2. 检查端口占用：
```bash
lsof -i :3000
```

3. 检查 Node.js 版本：
```bash
node --version  # 需要 18.17+
```

### 页面 404

**问题**: 访问页面返回 404

**解决方案**:
1. 确认生产环境重新构建
2. 检查 Nginx 配置是否正确代理
3. 查看应用日志

### API 请求失败

**问题**: 前端无法连接后端 API

**解决方案**:
1. 检查 `NEXT_PUBLIC_API_URL` 配置
2. 确认后端服务正在运行
3. 检查网络连通性
4. 查看浏览器控制台网络错误

### 内存不足

**问题**: 2u2g 服务器内存不足导致崩溃

**解决方案**:
1. 设置 Node.js 内存限制：
```bash
NODE_OPTIONS=--max-old-space-size=200
```

2. PM2 限制内存：
```javascript
max_memory_restart: '200M'
```

3. 启用系统 Swap

### 权限错误

**问题**: EACCES 权限错误

**解决方案**:
1. 确保文件权限正确：
```bash
chmod -R 755 /opt/codagraph-lite/web
```

2. 使用正确的用户运行服务

## 更新部署

### 0 停服务

```bash
# PM2
pm2 stop codagraph-lite-frontend

# Systemd
sudo systemctl stop codagraph-lite-frontend

# Docker
docker stop codagraph-lite-frontend
```

### 2. 拉取最新代码

```bash
git pull origin main
```

### 3. 重新构建

```bash
npm ci --production=false
npm run build
```

### 4. 启动服务

```bash
# PM2
pm2 restart codagraph-lite-frontend

# Systemd
sudo systemctl start codagraph-lite-frontend

# Docker
docker-compose up -d --build
```

## 安全建议

1. **HTTPS** - 生产环境必须使用 HTTPS
2. **CSP** - 配置内容安全策略
3. **CORS** - 正确配置 CORS
4. **环境变量** - 敏感信息使用环境变量
5. **日志保护** - 确保日志文件权限正确

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-01
