# 发布说明 (RELEASES)

本文档记录 CodaGraph-lite 各版本的发布内容和升级说明。

## 版本列表

### [1.0.0] - 2026-03-01

#### 🎉 初始版本发布

CodaGraph-lite 首个稳定版本，针对 2u2g 低资源服务器优化设计。

#### ✨ 新功能

##### 核心功能
- **轻量级架构**
  - 无需 PostgreSQL，使用 SQLite 数据库
  - 无需 Redis，使用内置作业队列
  - 独立运行，无外部依赖

- **单管理员认证**
  - 首次启动自动创建管理员账户
  - 基于会话的认证系统
  - Session 过期管理（默认 24 小时）
  - 密码更新功能

- **HTTP API**
  - Express.js 后端框架
  - RESTful API 设计
  - CORS 支持
  - 健康检查端点

- **前端应用**
  - Next.js 14 App Router
  - 响应式设计
  - 管理员仪表板

##### 部署功能
- **多种部署方式**
  - systemd 服务管理
  - PM2 进程管理
  - Docker 支持（可选）
  - 原生部署支持

- **自动化脚本**
  - 一键部署脚本
  - 卸载脚本
  - 部署验证脚本
  - 备份/恢复脚本
  - Swap 设置脚本（2GB）

- **日志和监控**
  - 日志轮转配置
  - 系统监控脚本
  - 环境变量验证脚本
  - 实时资源监控

#### 🔒 安全特性

- Session 安全
  - HttpOnly cookies
  - Secure 标志
  - SameSite 策略
  - 随机 Session Secret

- Webhook 验证
  - GitHub/Gitee/GitLab 签名验证
  - 防重放攻击
  - 时间戳验证

- 环境变量验证
  - 默认密码警告
  - 敏感信息检查
  - 配置完整性验证

#### ⚡ 2u2g 优化

##### 内存限制
- Node.js: `--max-old-space-size=200`
- Python agents: `300m`
- Code Context Engine runtime: `256m`
- SQLite cache: `2MB`
- 峰值内存: `<1.5GB`

##### 并发控制
- 单工作进程: `WORKER_COUNT=1`
- 禁用并发任务: `ENABLE_CONCURRENT_JOBS=false`
- Agent 子进程立即终止
- 僵尸进程检测和清理

##### 系统优化
- Swap 配置建议（2GB）
- 日志轮转（保留 14 天）
- 磁盘空间监控
- 内存压力检测和警告

#### 📚️ 文档

- 环境变量配置示例
- 部署指南
- API 文档
- 故障排除指南
- 贡献指南
- 安全策略

#### 🔧️ 开发者工具

- ESLint 配置（前端/后端）
- Ruff 配置（Python agents）
- Prettier 配置（前端）
- Black 配置（Python agents）
- TypeScript 类型检查

#### 🐛 已知问题

- Web UI 功能尚未完全实现（待后续版本）
- OAuth 集成尚未实现（待后续版本）
- 代码审查管道尚未实现（待后续版本）

#### 📦 依赖版本

| 组件 | 版本 |
|--------|------|
| Node.js | 18+ |
| Python | 3.11+ |
| Next.js | 14 |
| Express | 5 |
| SQLite | 3.x |
| grpcio | 1.60+ |

#### 🚀 升级说明

##### 从测试版本升级

```bash
# 1. 备份现有数据
bash deploy/backup.sh --full

# 2. 拉取新版本
git pull origin main

# 3. 更新依赖
npm install

# 4. 构建项目
cd server && npm run build
cd ../web && npm run build

# 5. 验证配置
bash deploy/validate-env.sh

# 6. 重启服务
systemctl restart codagraph-lite-backend codagraph-lite-frontend
# 或使用 PM2
pm2 restart all
```

##### 验证升级

```bash
# 运行验证脚本
bash deploy/verify.sh
```

#### 📝 变更日志

详细变更请查看 [CHANGELOG.md](CHANGELOG.md)

---

## 版本说明

版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)：

- **主版本**：不兼容的 API 变更
- **次版本**：向后兼容的新增功能
- **修订版本**：向后兼容的问题修复

## 升级检查清单

升级前请确认：

- [ ] 已备份数据库和配置
- [ ] 已阅读本版本的升级说明
- [ ] 检查系统要求是否满足
- [ ] 查看是否有不兼容的变更
- [ ] 准备回滚方案

升级后请验证：

- [ ] 服务正常运行
- [ ] 数据库连接正常
- [ ] API 健康检查通过
- [ ] 日志无严重错误
- [ ] 内存使用正常
- [ ] 功能测试通过

## 获取更新

- **GitHub Releases**: https://github.com/codagraph/codagraph-lite/releases
- **NPM**: `npm install codagraph-lite`
- **Git**: `git pull origin main`

## 报告问题

如遇到升级问题，请：

1. 查看 [故障排除指南](docs/TROUBLESHOOTING.md)
2. 搜索 [Issues](https://github.com/codagraph/codagraph-lite/issues)
3. 创建新的 Issue 并附上日志
4. 联系支持：`support@codagraph.io`

---

感谢使用 CodaGraph-lite！
