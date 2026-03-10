# 2u2g 服务器部署指南

本文档提供在 2 核 2GB 内存服务器上部署 CodaGraph-lite 的详细指南。

## 目录

1. [系统要求](#系统要求)
2. [Swap 配置](#swap-配置)
3. [资源限制说明](#资源限制说明)
4. [部署步骤](#部署步骤)
5. [监控和维护](#监控和维护)
6. [故障排除](#故障排除)

## 系统要求

### 最低配置

| 资源 | 要求 |
|------|------|
| CPU | 2 核 |
| 内存 | 2 GB RAM |
| 存储 | 10 GB 可用空间 |
| Swap | 2 GB（必需） |
| 操作系统 | Linux (Ubuntu 20.04+, CentOS 8+, Debian 11+) |

### 推荐配置

| 资源 | 要求 |
|------|------|
| CPU | 2 核 |
| 内存 | 2 GB RAM + 2 GB Swap |
| 存储 | 20 GB SSD |
| Swap | 2 GB（SSD 存储） |

## Swap 配置

**关键：** 2u2g 服务器必须配置 Swap，否则在内存峰值时会导致进程被 OOM Killer 终止。

### 自动配置 Swap

使用项目提供的脚本自动配置：

```bash
# 需要 root 权限
sudo bash deploy/setup-swap.sh --size=2G

# 仅检查当前 Swap 状态
sudo bash deploy/setup-swap.sh --check-only
```

### 手动配置 Swap

```bash
# 1. 创建 2GB Swap 文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 2. 配置开机自动挂载
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. 优化 Swap 使用策略
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 验证 Swap 配置

```bash
# 查看 Swap 状态
free -h

# 预期输出
#               total        used        free      shared  buff/cache   available
# Mem:          1.9Gi       500Mi       1.2Gi        10Mi       200Mi       1.3Gi
# Swap:         2.0Gi          0B       2.0Gi
```

## 资源限制说明

### Node.js 内存限制

```bash
# 必须设置 Node.js 内存限制为 200MB
export NODE_OPTIONS="--max-old-space-size=200"
```

**原因：** 2GB 内存需要分配给多个进程：
- Node.js Frontend: 200MB
- Node.js Backend: 200MB
- Python Context Agent: 300MB
- Python Review Agent: 300MB
- Code Context Engine runtime: 256MB
- 系统 + 其他: ~500MB
- 剩余内存作为缓冲

### SQLite 缓存限制

```bash
# SQLite 缓存限制为 2MB
export SQLITE_CACHE_SIZE=-2000  # 负数表示 KB
```

### 并发控制

```bash
# 强制单并发
export WORKER_COUNT=1
export ENABLE_CONCURRENT_JOBS=false
```

**原因：** 任何时刻只能运行一个 Agent 进程，否则会导致内存溢出。

## 部署步骤

### 1. 安装依赖

```bash
# 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 Python 3.10+
sudo apt-get install -y python3 python3-pip python3-venv

# 安装 Code Context Engine runtime (如果有)
# 参考 Code Context Engine 官方文档
```

### 2. 克隆项目

```bash
git clone <repository-url>
cd CodaGraph-lite
```

### 3. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置
nano .env
```

**关键配置项：**

```bash
# 2u2g 强制配置（不可更改）
NODE_OPTIONS=--max-old-space-size=200
SQLITE_CACHE_SIZE=-2000
WORKER_COUNT=1
ENABLE_CONCURRENT_JOBS=false

# 安全配置（必须更改）
ADMIN_PASSWORD=your_strong_password_here
SESSION_SECRET=your_random_secret_here
WEBHOOK_SECRET=your_webhook_secret_here

# 资源监控
ENABLE_SWAP_WARNING=true
MEMORY_WARNING_THRESHOLD=80
MEMORY_CRITICAL_THRESHOLD=95
```

### 4. 验证配置

```bash
# 验证环境变量
bash deploy/validate-env.sh --strict

# 预期输出
# ✅ 所有检查通过！环境配置正确。
```

### 5. 安装项目依赖

```bash
# 安装所有依赖
npm install

# 安装 Python 依赖
cd context-agent && pip install -r requirements.txt && cd ..
```

### 6. 启动服务

使用 PM2 管理：

```bash
# 使用 PM2 配置启动
pm2 start ecosystem.config.cjs

# 查看状态
pm2 status

# 查看日志
pm2 logs
```

或使用 systemd：

```bash
# 复制服务文件
sudo cp deploy/systemd/codagraph-frontend.service /etc/systemd/system/
sudo cp deploy/systemd/codagraph-backend.service /etc/systemd/system/

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable codagraph-frontend codagraph-backend
sudo systemctl start codagraph-frontend codagraph-backend
```

### 7. 验证部署

```bash
# 健康检查
curl http://localhost:7900/health

# 内存状态检查
curl http://localhost:7900/api/status/memory

# 2u2g 配置检查
curl http://localhost:7900/api/status/2u2g
```

## 监控和维护

### 内存监控

```bash
# 实时内存监控
watch -n 5 'free -h && echo "---" && curl -s http://localhost:7900/api/status/memory | jq ".data.memory"'

# 查看 Node.js 内存使用
curl -s http://localhost:7900/api/status/memory | jq '.data.memory.node'
```

### 日志查看

```bash
# PM2 日志
pm2 logs

# 日志文件
tail -f logs/codagraph-$(date +%Y-%m-%d).log
```

### 定期维护

```bash
# 数据库备份（每日自动）
bash deploy/backup.sh

# 清理旧日志
find logs/ -name "*.log" -mtime +7 -delete

# 检查僵尸进程
ps aux | grep python | grep agent
```

## 故障排除

### 内存不足 (OOM)

**症状：** 进程意外终止，dmesg 显示 `Out of memory`

**解决方案：**

1. 检查 Swap 是否启用：
   ```bash
   free -h
   sudo swapon --show
   ```

2. 检查 Node.js 内存限制：
   ```bash
   curl http://localhost:7900/api/status/memory
   ```

3. 临时解决：
   ```bash
   # 重启服务
   pm2 restart all

   # 或使用 systemd
   sudo systemctl restart codagraph-frontend codagraph-backend
   ```

### Swap 使用率过高

**症状：** Swap 使用率持续 > 50%，系统响应缓慢

**解决方案：**

1. 检查内存使用：
   ```bash
   curl http://localhost:7900/api/status/resources
   ```

2. 清理内存：
   ```bash
   curl -X POST http://localhost:7900/api/status/memory/cleanup
   ```

3. 减少并发：
   ```bash
   # 确保 WORKER_COUNT=1
   grep WORKER_COUNT .env
   ```

### Agent 进程卡死

**症状：** Agent 进程运行超过超时时间

**解决方案：**

1. 检查 Agent 状态：
   ```bash
   curl http://localhost:7900/api/status/resources | jq '.data.usage'
   ```

2. 手动终止 Agent：
   ```bash
   # 查找 Agent 进程
   ps aux | grep "python.*agent"

   # 终止进程
   kill -9 <PID>
   ```

3. 重启后端服务：
   ```bash
   pm2 restart codagraph-backend
   ```

### 数据库锁定

**症状：** SQLite 错误 `database is locked`

**解决方案：**

1. 检查 WAL 模式：
   ```bash
   sqlite3 data/codagraph-lite.db "PRAGMA journal_mode;"
   # 应该输出 "wal"
   ```

2. 检查是否有长时间运行的事务：
   ```bash
   curl http://localhost:7900/api/jobs/stats
   ```

## 性能优化建议

### 1. 使用 SSD 存储

Swap 文件和数据库文件应放在 SSD 上，可显著提升性能。

### 2. 调整 swappiness

```bash
# 减少系统使用 Swap 的倾向
sudo sysctl vm.swappiness=10
```

### 3. 禁用不必要的服务

```bash
# 查看运行的服务
systemctl list-units --type=service --state=running

# 禁用不必要的服务（示例）
sudo systemctl disable bluetooth
sudo systemctl disable cups
```

### 4. 定期重启

建议每周重启一次服务以释放内存：

```bash
# 设置每周重启
sudo crontab -e
# 添加：0 4 * * 0 /usr/bin/pm2 restart all
```

## API 端点参考

| 端点 | 描述 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /api/status/memory` | 内存状态 |
| `GET /api/status/resources` | 资源使用报告 |
| `GET /api/status/config` | 配置摘要 |
| `GET /api/status/2u2g` | 2u2g 配置检查 |
| `POST /api/status/memory/cleanup` | 执行内存清理 |

## 联系支持

如果遇到无法解决的问题，请：

1. 收集诊断信息：
   ```bash
   # 系统信息
   uname -a > diagnostics.txt
   free -h >> diagnostics.txt
   df -h >> diagnostics.txt

   # 服务状态
   pm2 status >> diagnostics.txt

   # 内存状态
   curl -s http://localhost:7900/api/status/resources >> diagnostics.txt

   # 最近日志
   tail -100 logs/codagraph-$(date +%Y-%m-%d).log >> diagnostics.txt
   ```

2. 提交 Issue 并附上 diagnostics.txt 内容。
