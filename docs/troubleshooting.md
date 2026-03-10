# CodaGraph-lite 故障排除指南

本文档提供常见问题的诊断和解决方案。

## 目录

- [快速诊断](#快速诊断)
- [服务启动问题](#服务启动问题)
- [数据库问题](#数据库问题)
- [认证问题](#认证问题)
- [OAuth 集成问题](#oauth-集成问题)
- [Agent 进程问题](#agent-进程问题)
- [内存不足问题](#内存不足问题)
- [Webhook 问题](#webhook-问题)
- [LLM API 问题](#llm-api-问题)
- [Code Context Engine runtime 问题](#code-context-engine-runtime-问题)
- [性能问题](#性能问题)

---

## 快速诊断

### 健康检查

首先运行健康检查确定问题范围：

```bash
# 检查后端服务
curl http://localhost:7900/health

# 检查内存使用
curl http://localhost:7900/api/status/memory

# 检查完整资源状态
curl http://localhost:7900/api/status/resources
```

### 服务状态检查

```bash
# 检查进程是否运行
ps aux | grep -E "node|python" | grep -v grep

# 检查端口监听
netstat -tulpn | grep -E "3000|7900|50051|50052"

# 检查磁盘空间
df -h

# 检查内存使用
free -h
```

### 日志分析

```bash
# 查看最近的错误
tail -n 50 logs/error.log

# 实时查看日志
tail -f logs/backend.log

# 搜索特定错误
grep "ERROR" logs/*.log | tail -n 20

# systemd 服务日志
sudo journalctl -u codagraph-lite-backend -n 100 --no-pager
```

---

## 服务启动问题

### 问题：服务无法启动

**症状**：
- `npm start` 或 `systemctl start` 失败
- 服务立即退出
- 健康检查失败

**可能原因和解决方案**：

#### 1. 端口被占用

```bash
# 检查端口占用
netstat -tulpn | grep -E "3000|7900"

# 或使用 lsof
lsof -i :3000 -i :7900

# 解决方案：修改 .env 中的端口号
# FRONTEND_PORT=3001
# BACKEND_PORT=7901
```

#### 2. Node.js 版本过低

```bash
# 检查 Node.js 版本
node --version  # 需要 18+

# 升级 Node.js
# 使用 nvm
nvm install 18
nvm use 18
```

#### 3. 依赖未安装

```bash
# 检查 node_modules
ls node_modules/

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# Python 依赖
pip install -r context-agent/requirements.txt
```

#### 4. 配置文件缺失

```bash
# 检查 .env 文件
ls -la .env

# 创建配置文件
cp .env.example .env
nano .env
```

#### 5. 数据库初始化失败

```bash
# 检查数据库目录
ls -la data/

# 检查目录权限
ls -ld data/

# 解决方案：设置正确权限
chmod 755 data/
chown www-data:www-data data/
```

### 问题：服务频繁重启

**症状**：
- 服务不断退出和重启
- 日志显示错误后重启

**可能原因和解决方案**：

#### 1. 内存不足 (OOM)

```bash
# 检查 OOM 日志
sudo dmesg | grep -i "out of memory"

# 解决方案：参考 [内存不足问题](#内存不足问题)
```

#### 2. Node.js 堆溢出

```bash
# 检查日志中的 FATAL 错误
grep "FATAL ERROR" logs/backend.log

# 解决方案：增加 NODE_OPTIONS 内存限制
# NODE_OPTIONS=--max-old-space-size=300
```

---

## 数据库问题

### 问题：数据库连接失败

**症状**：
- 启动日志显示 "Database connection failed"
- API 返回 503 Service Unavailable

**诊断和解决方案**：

```bash
# 检查数据库文件
ls -la data/codagraph-lite.db

# 检查文件权限
stat data/codagraph-lite.db

# 尝试手动打开数据库
sqlite3 data/codagraph-lite.db ".tables"

# 解决方案：修复权限
chmod 644 data/codagraph-lite.db
chown www-data:www-data data/codagraph-lite.db
```

### 问题：数据库锁定

**症状**：
- 错误日志显示 "database is locked"
- 作业处理停滞

**解决方案**：

```bash
# 1. 停止服务
sudo systemctl stop codagraph-lite-backend

# 2. 检查锁文件
ls -la data/*.db-shm data/*.db-wal

# 3. 删除锁文件（谨慎操作）
rm -f data/*.db-shm data/*.db-wal

# 4. 验证数据库完整性
sqlite3 data/codagraph-lite.db "PRAGMA integrity_check;"

# 5. 重新启动服务
sudo systemctl start codagraph-lite-backend
```

### 问题：数据库损坏

**症状**：
- 错误日志显示 "database disk image is malformed"
- 无法查询数据

**解决方案**：

```bash
# 1. 停止服务
sudo systemctl stop codagraph-lite-backend

# 2. 备份现有数据库（如果可能）
cp data/codagraph-lite.db data/codagraph-lite.db.backup

# 3. 尝试恢复
sqlite3 data/codagraph-lite.db.backup ".recover codagraph-lite.db"

# 4. 或从最近备份恢复
ls -lt backups/
cp backups/codagraph-lite-latest.db data/codagraph-lite.db

# 5. 重新启动服务
sudo systemctl start codagraph-lite-backend
```

### 问题：数据库文件过大

**症状**：
- `data/codagraph-lite.db` 文件超过 100MB
- 查询变慢

**解决方案**：

```bash
# 1. 停止服务
sudo systemctl stop codagraph-lite-backend

# 2. 运行 VACUUM（清理空间）
sqlite3 data/codagraph-lite.db "VACUUM;"

# 3. 运行 ANALYZE（更新统计）
sqlite3 data/codagraph-lite.db "ANALYZE;"

# 4. 检查文件大小
ls -lh data/codagraph-lite.db

# 5. 重新启动服务
sudo systemctl start codagraph-lite-backend
```

### 问题：数据库迁移失败

**症状**：
- 启动后日志显示 "Migration failed"
- 新功能不可用

**解决方案**：

```bash
# 1. 检查迁移日志
grep "Migration" logs/backend.log

# 2. 查看当前数据库版本
sqlite3 data/codagraph-lite.db "PRAGMA user_version;"

# 3. 手动运行迁移（如有提供）
npm run migrate:force

# 4. 或从备份恢复
cp backups/codagraph-lite-pre-migration.db data/codagraph-lite.db
```

---

## 认证问题

### 问题：无法登录

**症状**：
- 登录表单返回 "Invalid credentials"
- Session 立即过期

**诊断和解决方案**：

```bash
# 检查管理员配置
grep -E "ADMIN_USERNAME|ADMIN_PASSWORD" .env

# 解决方案：重置密码
# 方法 1：修改 .env
nano .env
# ADMIN_PASSWORD=new_secure_password

# 方法 2：使用 API（如果已登录）
curl -X POST http://localhost:7900/api/admin/password \
  -H "Content-Type: application/json" \
  -d '{"current":"old_password","new":"new_password"}'
```

### 问题：Session 频繁过期

**症状**：
- 需要频繁重新登录
- Session 不到 1 小时就过期

**解决方案**：

```bash
# 检查 Session 配置
grep SESSION_TIMEOUT .env

# 延长 Session 时间（单位：秒）
# 86400 = 24 小时
# 604800 = 7 天
SESSION_TIMEOUT=604800
```

### 问题：CSRF 错误

**症状**：
- API 返回 "Invalid CSRF token"
- 表单提交失败

**解决方案**：

```bash
# 清除浏览器 Cookie
# 或使用隐私模式

# 检查 SESSION_SECRET 配置
grep SESSION_SECRET .env

# 确保使用随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## OAuth 集成问题

### 问题：OAuth 授权失败

**症状**：
- 点击授权后返回错误页面
- 回调 URL 未触发

**诊断和解决方案**：

#### 1. 回调 URL 配置错误

```bash
# 检查回调 URL 配置
grep -E "CALLBACK_URL" .env

# 解决方案：确保回调 URL 可从外网访问
# 开发环境：
# http://your-public-ip:7900/api/oauth/github/callback

# 生产环境：
# https://your-domain.com/api/oauth/github/callback
```

#### 2. Client ID 或 Secret 错误

```bash
# 检查 OAuth 配置
grep -E "CLIENT_ID|CLIENT_SECRET" .env

# 解决方案：在平台控制台重新生成凭据
# GitHub: https://github.com/settings/developers
# Gitee: https://gitee.com/oauth/applications
# GitLab: https://gitlab.com/-/profile/applications
```

#### 3. Webhook 未设置

**症状**：
- OAuth 授权成功但 PR 不触发审查

**诊断**：

```bash
# 检查平台 webhook 配置
# 1. 访问仓库设置
# GitHub: Settings -> Webhooks
# Gitee: 管理 -> WebHooks
# GitLab: Settings -> Webhooks

# 2. 验证 webhook URL
# http://your-domain.com/webhook/github
# http://your-domain.com/webhook/gitee
# http://your-domain.com/webhook/gitlab
```

#### 4. Webhook 签名验证失败

**症状**：
- 平台显示 "Webhook delivery failed"
- 后端日志显示签名验证错误

**解决方案**：

```bash
# 检查 Webhook 密钥配置
grep WEBHOOK_SECRET .env

# 解决方案：确保平台与后端使用相同密钥
# 在平台 webhook 配置中设置相同的 Secret
```

### 问题：Token 过期

**症状**：
- API 调用返回 401 Unauthorized
- Token 失效

**解决方案**：

```bash
# 检查 Token 存储
sqlite3 data/codagraph-lite.db "SELECT platform, expires_at FROM installation;"

# 手动刷新 Token（通过 UI 重新授权）
# 或使用 API
curl -X POST http://localhost:7900/api/oauth/refresh \
  -H "Content-Type: application/json" \
  -d '{"platform":"github"}'
```

---

## Agent 进程问题

### 问题：Agent 无法启动

**症状**：
- 日志显示 "Failed to spawn agent"
- 作业状态一直为 "pending"

**诊断和解决方案**：

```bash
# 检查 Python 是否安装
python --version  # 需要 3.11+

# 检查依赖是否安装
pip list | grep -E "grpc|protobuf"

# 解决方案：安装依赖
pip install -r context-agent/requirements.txt
```

### 问题：Agent 超时

**症状**：
- 作业状态为 "failed"，错误为 "Agent timeout"
- 大型仓库审查超时

**解决方案**：

```bash
# 检查超时配置
grep -E "AGENT_TIMEOUT" .env

# 延长超时时间（单位：毫秒）
# AGENT_TIMEOUT_CONTEXT=600000    # 10 分钟
# AGENT_TIMEOUT_REVIEW=1200000    # Review Runtime 20 分钟
```

### 问题：Agent 进程残留（僵尸进程）

**症状**：
- 内存未释放
- 多个 Python 进程同时运行

**诊断**：

```bash
# 检查 Python 进程
ps aux | grep python | grep -v grep

# 解决方案：手动清理僵尸进程
pkill -9 -f python

# 重启后端服务
sudo systemctl restart codagraph-lite-backend
```

### 问题：gRPC 连接失败

**症状**：
- 日志显示 "gRPC connection refused"
- Agent 无响应

**解决方案**：

```bash
# 检查端口监听
netstat -tulpn | grep 50052

# 解决方案：确保端口配置正确
# CONTEXT_AGENT_PORT=50052
```

---

## 内存不足问题

### 问题：系统内存不足

**症状**：
- 系统频繁 OOM killer 触发
- 服务被意外终止

**诊断**：

```bash
# 检查 OOM 日志
sudo dmesg | grep -i "out of memory" | tail -n 10

# 检查当前内存使用
free -h
```

**解决方案**：

#### 1. 配置 Swap（必需）

```bash
# 创建 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 持久化
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### 2. 验证 2u2g 配置

```bash
# 检查关键配置项
grep -E "NODE_OPTIONS|WORKER_COUNT|PYTHON_MEMORY_LIMIT|CODE_CONTEXT_ENGINE_MAX_MEMORY" .env

# 必须确保：
# NODE_OPTIONS=--max-old-space-size=200
# WORKER_COUNT=1
# ENABLE_CONCURRENT_JOBS=false
# PYTHON_MEMORY_LIMIT=300m
# CODE_CONTEXT_ENGINE_MAX_MEMORY=256m
```

#### 3. 监控内存使用

```bash
# 使用内置监控
curl http://localhost:7900/api/status/memory

# 手动检查进程内存
ps aux --sort=-%mem | head -n 10
```

### 问题：Node.js 堆溢出

**症状**：
- 日志显示 "JavaScript heap out of memory"
- FATAL ERROR: Ineffective mark-compacts

**解决方案**：

```bash
# 增加 Node.js 内存限制（谨慎操作）
# 在 .env 中：
NODE_OPTIONS=--max-old-space-size=300

# 但在 2u2g 服务器上建议：
# - 减少 Worker 数量（已设为 1）
# - 处理更小的仓库
# - 增加 swap
```

---

## Webhook 问题

### 问题：Webhook 未接收

**症状**：
- 平台显示 webhook 已发送
- 后端无日志记录

**诊断**：

```bash
# 检查端口是否开放
sudo ufw status
# 确保端口 80/443 开放

# 检查 Nginx/反向代理配置
# 确保 webhook 路由正确
```

**解决方案**：

#### 1. 检查 URL 可访问性

```bash
# 从外部测试 webhook URL
curl -v http://your-domain.com/webhook/github

# 或使用 ngrok（开发环境）
# ngrok http 7900
```

#### 2. 检查平台配置

```bash
# 确保 Webhook 配置中：
# - 正确的 Content-Type（application/json）
# - 启用的触发事件（pull_request, synchronize）
# - 正确的 Secret（如启用签名验证）
```

### 问题：Webhook 重复触发

**症状**：
- 同一 PR 触发多次审查
- 作业队列中有重复作业

**解决方案**：

```bash
# 检查 Webhook 去重逻辑
grep "dedup" logs/backend.log

# 解决方案：在代码中实现去重
# 基于 (platform, owner, repo, pr_number) 的去重键
```

---

## LLM API 问题

### 问题：LLM API 调用失败

**症状**：
- 作业失败，错误为 "LLM API error"
- 审查结果为空

**诊断**：

```bash
# 检查 LLM 配置
grep -E "LLM_PROVIDER|LLM_API_KEY|LLM_MODEL" .env

# 手动测试 API 连接
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**解决方案**：

#### 1. API 密钥无效

```bash
# 验证 API 密钥
# 在平台控制台检查密钥状态

# 更新 .env
# LLM_API_KEY=your_valid_api_key

# 重启服务
sudo systemctl restart codagraph-lite-backend
```

#### 2. API 配额用尽

**症状**：错误显示 "Rate limit exceeded"

**解决方案**：

```bash
# 增加重试间隔
LLM_MAX_RETRIES=3

# 或升级 API 计划
# OpenAI: https://platform.openai.com/account/limits
# Anthropic: https://console.anthropic.com/settings/usage
```

#### 3. 模型不可用

**症状**：错误显示 "Model not found"

**解决方案**：

```bash
# 更新模型名称
# 检查平台最新模型列表
# OpenAI: gpt-4, gpt-4-turbo
# Anthropic: claude-3-sonnet-20240229

# 在 .env 中更新
LLM_MODEL=gpt-4-turbo
```

---

## Code Context Engine runtime 问题

### 问题：Code Context Engine 未找到

**症状**：
- 作业失败，错误为 "Code Context Engine runtime not available"
- 无法初始化代码检索 runtime

**解决方案**：

```bash
# 检查 runtime 根目录是否存在
echo "$CODE_CONTEXT_ENGINE_ROOT"
ls -la "$CODE_CONTEXT_ENGINE_ROOT"

# 构建 runtime
npm --prefix "$CODE_CONTEXT_ENGINE_ROOT" install
npm --prefix "$CODE_CONTEXT_ENGINE_ROOT" run build

# 可选：检查调试 CLI
which code-context-engine
```

### 问题：Code Context Engine runtime 准备失败

**症状**：
- 日志显示 runtime preparation failed
- 分析结果不完整

**诊断和解决方案**：

```bash
# 1. 检查仓库克隆
ls -la /tmp/repos/

# 2. 检查工作空间权限
ls -ld /tmp/repos/

# 3. 重新构建 runtime
npm --prefix "$CODE_CONTEXT_ENGINE_ROOT" run build

# 4. 可选：在目标仓库里做调试检查
cd /tmp/repos/platform/owner/repo
code-context-engine ai status --json
```

### 问题：Code Context Engine 内存溢出

**症状**：
- Code Context Engine 进程被 OOM killer 终止

**解决方案**：

```bash
# 检查内存限制配置
grep CODE_CONTEXT_ENGINE_MAX_MEMORY .env

# 减少内存限制（如果当前值过高）
CODE_CONTEXT_ENGINE_MAX_MEMORY=128m

# 或缩小仓库工作空间 / 分批处理目标文件
```

---

## 性能问题

### 问题：响应速度慢

**症状**：
- API 响应时间长（>1 秒）
- 前端加载慢

**诊断**：

```bash
# 检查 CPU 使用
top -bn1 | head -n 5

# 检查磁盘 I/O
iostat -x 1

# 检查网络延迟
ping -c 5 api.openai.com
```

**解决方案**：

#### 1. SQLite 性能优化

```bash
# 运行 ANALYZE
sqlite3 data/codagraph-lite.db "ANALYZE;"

# 创建索引（如果缺失）
sqlite3 data/codagraph-lite.db ".indexes"
```

#### 2. 减少日志级别

```bash
# 从 debug 改为 info
LOG_LEVEL=info

# 或完全禁用请求日志
ENABLE_REQUEST_LOGGING=false
```

#### 3. 启用 CDN（静态资源）

```nginx
# 配置 Nginx 缓存静态资源
location /_next/static {
    proxy_pass http://localhost:3000;
    proxy_cache_valid 200 1d;
}
```

---

## 获取帮助

如果以上解决方案无法解决问题：

1. **收集诊断信息**：
   ```bash
   # 创建诊断报告
   ./deploy/scripts/diagnose.sh > diagnostic-report.txt
   ```

2. **查看日志**：
   ```bash
   # 导出完整日志
   tar czf logs-$(date +%Y%m%d).tar.gz logs/
   ```

3. **报告问题**：
   - GitHub Issues: https://github.com/your-org/codagraph-lite/issues
   - 包含诊断信息和错误日志

---

## 相关文档

- [配置指南](configuration.md) - 配置相关问题的解决
- [部署指南](deployment.md) - 部署相关问题的解决
- [架构文档](architecture.md) - 系统架构理解
