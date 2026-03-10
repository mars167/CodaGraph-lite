# CodaGraph-lite 后端 Dockerfile
# 适用于 2u2g 服务器优化的多阶段构建

# ============================================
# 阶段 1: 依赖安装
# ============================================
FROM node:18-alpine AS deps

WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY server/package*.json ./server/

# 安装依赖（包括 better-sqlite3 的原生依赖）
RUN apk add --no-cache python3 make g++ && \
    npm ci --only=production && \
    apk del python3 make g++

# ============================================
# 阶段 2: 构建阶段
# ============================================
FROM node:18-alpine AS build

WORKDIR /app

# 从依赖阶段复制 node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules

# 复制源代码
COPY . .

# 设置环境变量（2u2g 优化）
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=200

# 构建 TypeScript
RUN npm run build

# ============================================
# 阶段 3: 生产运行
# ============================================
FROM node:18-alpine AS runner

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache sqlite3

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# 设置环境变量
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=200
ENV BACKEND_PORT=7900

# 创建必要的目录
RUN mkdir -p /app/data /app/logs /app/backups /tmp/repos && \
    chown -R nodejs:nodejs /app

# 从构建阶段复制必要文件
COPY --from=build /app/server/package*.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules

# 复制 Python context runtime helpers（如存在）
COPY --from=build /app/context-agent ./context-agent

# 安装 Python 3.11 运行时
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --no-cache-dir grpcio grpcio-tools

# 切换到非 root 用户
USER nodejs

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:7900/api/health', (r) => {if(r.statusCode !== 200) throw new Error(r.statusCode)})"

# 暴露端口
EXPOSE 7900

# 暴露内部辅助端口
EXPOSE 50052

# 启动应用
CMD ["node", "server/dist/index.js"]
