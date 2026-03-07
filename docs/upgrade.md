# CodaGraph-lite 升级指南

本文档说明如何安全地将 CodaGraph-lite 从一个版本升级到另一个版本。

## 目录

- [升级概述](#升级概述)
- [升级前准备](#升级前准备)
- [版本兼容性](#版本兼容性)
- [升级步骤](#升级步骤)
- [数据库迁移](#数据库迁移)
- [配置更新](#配置更新)
- [升级后验证](#升级后验证)
- [回滚步骤](#回滚步骤)
- [破坏性变更](#破坏性变更)

---

## 升级概述

### 升级策略

CodaGraph-lite 支持两种升级方式：

| 方式 | 适用场景 | 优点 | 缺点 |
|------|-----------|------|------|
| 在线升级 | 小版本更新（patch）| 快速，零停机 | 风险较高 |
| 备份升级 | 主要版本更新（major/minor）| 安全，可回滚 | 需要停机 |

### 版本号格式

```
MAJOR.MINOR.PATCH

例如：1.0.0 → 1.0.1 → 1.1.0 → 2.0.0
```

| 部分 | 说明 | 升级影响 |
|------|------|-----------|
| MAJOR | 重大架构变更 | 可能需要数据迁移，仔细规划 |
| MINOR | 功能性新增 | 一般向下兼容 |
| PATCH | Bug 修复 | 向后兼容，安全升级 |

---

## 升级前准备

### 检查当前版本

```bash
# 检查当前安装的版本
npm list codagraph-lite

# 或检查 package.json
cat package.json | grep version

# 预期输出：
# "version": "1.0.0"
```

### 查看升级说明

在发布之前，仔细阅读：

- GitHub [Release Notes](https://github.com/your-org/codagraph-lite/releases)
- [CHANGELOG.md](../CHANGELOG.md)
- 本文档中关于数据库迁移和配置更新的部分

### 备份数据

```bash
# 1. 停止服务
sudo systemctl stop codagraph-lite-backend
sudo systemctl stop codagraph-lite-frontend

# 2. 备份数据库
./deploy/scripts/backup.sh

# 或使用 API 备份
curl -X POST http://localhost:7900/api/backup \
  -H "Cookie: session_id=$(cat .session_id)" \
  -H "Content-Type: application/json" \
  -d '{"description":"升级前备份"}'

# 3. 验证备份文件
ls -lh backups/ | tail -n 5
```

### 备份配置

```bash
# 备份环境配置
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 备份 systemd 服务文件
sudo cp /etc/systemd/system/codagraph-lite-*.service \
  ./backup/services/

# 备份 Nginx 配置（如使用）
sudo cp /etc/nginx/sites-available/codagraph-lite \
  ./backup/nginx.conf
```

### 检查系统资源

```bash
# 检查磁盘空间（至少 5GB 可用）
df -h

# 检查内存使用
free -h

# 检查 CPU 负载
uptime
```

---

## 版本兼容性

### v1.x.x 升级指南

| 从版本 | 到版本 | 兼容性 | 需要操作 |
|--------|--------|--------|----------|
| 1.0.0 | 1.0.1 | 完全兼容 | 无需额外操作 |
| 1.0.x | 1.1.0 | 可能需要配置更新 | 参考 CHANGELOG |
| 1.x.x | 2.0.0 | 需要数据库迁移 | 执行迁移脚本 |

### 数据库 Schema 版本

```bash
# 检查当前数据库版本
sqlite3 data/codagraph-lite.db "PRAGMA user_version;"

# 检查新版本需要的 schema 版本
npm run db:version

# 预期输出：
# Current schema version: 1
# Required schema version: 2
```

---

## 升级步骤

### 方式 1：在线升级（推荐用于小版本）

#### 步骤 1：停止服务

```bash
# 停止前端和后端
sudo systemctl stop codagraph-lite-frontend
sudo systemctl stop codagraph-lite-backend
```

#### 步骤 2：拉取最新代码

```bash
# 获取最新代码
git fetch origin

# 检查当前分支
git branch --show-current

# 切换到 main 分支（如果不是）
git checkout main

# 拉取最新更改
git pull origin main
```

#### 步骤 3：安装新依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 Python 依赖
pip install -r context-agent/requirements.txt
pip install -r review-agent/requirements.txt
```

#### 步骤 4：数据库迁移

```bash
# 执行数据库迁移
npm run db:migrate

# 或手动执行
node server/src/database/migrate.js

# 查看迁移日志
tail -n 50 logs/migration.log
```

#### 步骤 5：构建前端

```bash
# 构建生产版本
cd web
npm run build
cd ..
```

#### 步骤 6：启动服务

```bash
# 启动后端
sudo systemctl start codagraph-lite-backend

# 等待几秒确保后端启动
sleep 5

# 启动前端
sudo systemctl start codagraph-lite-frontend

# 检查服务状态
sudo systemctl status codagraph-lite-backend codagraph-lite-frontend
```

#### 步骤 7：验证升级

```bash
# 健康检查
curl http://localhost:7900/health

# 检查版本
npm list codagraph-lite

# 预期输出：新版本号
```

### 方式 2：备份升级（推荐用于主要版本）

#### 步骤 1-6：同在线升级

执行与在线升级相同的步骤 1-6。

#### 步骤 7：部署到新位置（可选）

```bash
# 如果需要部署到新服务器
# 1. 在新服务器上执行步骤 1-6
# 2. 从备份恢复数据库
curl -X POST http://new-server:7900/api/restore \
  -F "file=@backup-codagraph-lite.db.gz" \
  -F "confirm=RESTORE"

# 3. 验证新服务器功能
```

---

## 数据库迁移

### 迁移系统

```typescript
// 迁移框架
interface Migration {
  version: number;           // 迁移版本号
  name: string;             // 迁移名称
  up(sql: string): void;     // 升级 SQL
  down(sql: string): void;   // 降级 SQL
}

class MigrationManager {
  private currentVersion: number;

  async runMigrations(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        console.log(`Running migration: ${migration.name}`);
        await migration.up(this.db);
        await this.updateVersion(migration.version);
        currentVersion = migration.version;
      }
    }
  }
}
```

### 常见迁移

#### v1.0.0 → v1.1.0

```sql
-- 添加 webhook 签名字段
ALTER TABLE installation ADD COLUMN webhook_secret TEXT;

-- 更新现有记录（设置默认值）
UPDATE installation SET webhook_secret = NULL WHERE webhook_secret IS NULL;
```

#### v1.1.0 → v2.0.0

```sql
-- 重构分析表结构
-- 创建新表
CREATE TABLE analysis_v2 (...);
-- 迁移数据
INSERT INTO analysis_v2 (...)
SELECT * FROM analysis;
-- 重命名表
DROP TABLE analysis;
ALTER TABLE analysis_v2 RENAME TO analysis;
```

---

## 配置更新

### 检查新配置项

```bash
# 查看新的 .env.example
cat .env.example | grep -E "^# .* 配置"

# 与当前配置对比
diff .env.backup .env.example
```

### 更新配置文件

```bash
# 编辑 .env 文件
nano .env

# 常见新增配置：
# NEW_FEATURE_ENABLED=true
# NEW_API_ENDPOINT=http://new-endpoint.com
# UPDATED_THRESHOLD=80
```

### 移除废弃配置

```bash
# 如果某些配置项已废弃
# 在 .env 中注释或删除该行

# 示例：
# DEPRECATED_FEATURE=false  # 不再使用
```

---

## 升级后验证

### 功能验证清单

- [ ] 服务正常启动（systemctl status）
- [ ] 健康检查通过（/health 返回 ok）
- [ ] 可以正常登录
- [ ] OAuth 集成工作正常
- [ ] 仓库列表正确显示
- [ ] 可以创建新的分析作业
- [ ] 监控端点正常响应
- [ ] 日志中无严重错误

### 回归测试

```bash
# 运行现有测试套件
npm test

# 或运行端到端测试
npm run test:e2e

# 重点测试：
# - 用户登录流程
# - OAuth 授权
# - 作业提交和处理
# - 数据库 CRUD 操作
# - API 端点响应
```

### 性能验证

```bash
# 检查内存使用
curl http://localhost:7900/api/status/memory

# 预期：内存使用在限制内（<1.5GB）
```

### 数据完整性验证

```bash
# 验证数据库
sqlite3 data/codagraph-lite.db "PRAGMA integrity_check;"

# 预期输出：ok
```

---

## 回滚步骤

### 何时回滚

如果升级后出现以下问题，考虑回滚：

- 服务无法启动
- 关键功能不可用
- 数据损坏
- 严重性能下降
- 安全问题

### 回滚步骤

#### 步骤 1：停止服务

```bash
sudo systemctl stop codagraph-lite-frontend
sudo systemctl stop codagraph-lite-backend
```

#### 步骤 2：恢复数据库

```bash
# 从备份恢复
cp backups/backup-20240301-120000.db data/codagraph-lite.db

# 或使用 API
curl -X POST http://localhost:7900/api/restore \
  -F "file=@backups/backup-20240301-120000.db" \
  -F "confirm=RESTORE"
```

#### 步骤 3：恢复配置

```bash
# 恢复配置
cp .env.backup.$(date +%Y%m%d) .env

# 如已修改服务文件，恢复它们
sudo cp backup/services/*.service /etc/systemd/system/
```

#### 步骤 4：恢复代码（如需要）

```bash
# 回滚 Git 代码
git log --oneline -10

# 切换到升级前的提交
git checkout <commit-hash-before-upgrade>

# 或回滚整个分支
git reset --hard HEAD~1
```

#### 步骤 5：重新构建

```bash
# 重新构建前端
cd web && npm run build && cd ..

# 恢复依赖（如需要）
npm install
```

#### 步骤 6：启动服务

```bash
sudo systemctl start codagraph-lite-backend
sleep 5
sudo systemctl start codagraph-lite-frontend
```

---

## 破坏性变更

### v1.0.0 → v1.1.0

无破坏性变更。

### v1.0.0 → v2.0.0

| 变更 | 影响 | 迁移要求 |
|------|------|----------|
| 数据库 Schema 重大更新 | 自动迁移脚本处理 | 无需手动操作 |
| 作业队列状态重命名 | 自动处理 | 无需手动操作 |
| API 端点路径变更 | 更新前端 API 调用 | 参考升级指南 |

### v2.0.0 → v3.0.0

（待未来版本发布时更新）

---

## 故障处理

### 升级失败

如果升级过程中失败：

```bash
# 1. 检查错误日志
tail -n 100 logs/error.log

# 2. 查看迁移日志
tail -n 50 logs/migration.log

# 3. 执行回滚步骤
# 参考本文档的 [回滚步骤](#回滚步骤) 部分
```

### 端口冲突

```bash
# 检查端口占用
netstat -tulpn | grep -E "3000|7900"

# 如果端口被占用，修改 .env
# FRONTEND_PORT=3001
# BACKEND_PORT=7901
```

### 权限问题

```bash
# 检查文件权限
ls -la data/codagraph-lite.db

# 修复权限
chmod 644 data/codagraph-lite.db
chown www-data:www-data data/codagraph-lite.db
```

---

## 获取帮助

如果升级过程中遇到问题：

1. **查看故障排除指南**：[troubleshooting.md](troubleshooting.md)
2. **查看 Release Notes**：https://github.com/your-org/codagraph-lite/releases
3. **报告 Issue**：https://github.com/your-org/codagraph-lite/issues
4. **社区支持**：https://github.com/your-org/codagraph-lite/discussions

---

## 相关文档

- [配置指南](configuration.md) - 配置相关更新
- [部署指南](deployment.md) - 部署相关操作
- [架构文档](architecture.md) - 系统架构理解
- [API 文档](api.md) - API 端点变更说明
