# CodaGraph-lite 前端 Dockerfile
# 适用于 2u2g 服务器优化的多阶段构建

# ============================================
# 阶段 1: 依赖构建
# ============================================
FROM node:18-alpine AS deps

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY web/package*.json ./web/

# 安装依赖
RUN npm ci

# ============================================
# 阶段 2: 构建阶段
# ============================================
FROM node:18-alpine AS build

WORKDIR /app

# 从依赖阶段复制 node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules

# 复制源代码
COPY . .

# 设置环境变量（2u2g 优化）
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=200
ENV NEXT_TELEMETRY_DISABLED=1

# 构建 Next.js 应用
RUN npm run build

# ============================================
# 阶段 3: 生产运行
# ============================================
FROM node:18-alpine AS runner

WORKDIR /app

# 创建非 root 用户（安全最佳实践）
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 设置环境变量
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=200
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 创建必要的目录
RUN mkdir -p /app/logs && \
    chown -R nextjs:nodejs /app

# 从构建阶段复制必要文件
COPY --from=build /app/web/public ./web/public
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./web/.next/static

# 切换到非 root 用户
USER nextjs

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if(r.statusCode !== 200) throw new Error(r.statusCode)})"

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "server.js"]
