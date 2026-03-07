# 变更日志 (CHANGELOG)

本文档记录 CodaGraph-lite 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [未发布]

### 计划中
- 完整的 Web 前端功能
- OAuth 集成（GitHub/Gitee/GitLab）
- 代码审查管道
- 详细的 API 文档

## [1.0.0] - 2026-03-01

### 新增
- 初始版本发布
- 项目基础架构（Next.js 14 + Express.js）
- SQLite 数据库支持
- 单管理员认证系统
- 基础 HTTP API
- Python Agent 子进程管理
- 完整的部署配置
- 2u2g 服务器优化

### 部署
- systemd 服务文件（前端/后端）
- PM2 配置文件
- Dockerfile（可选）
- 自动化部署脚本
- 卸载脚本
- 部署验证脚本
- 备份/恢复脚本
- 日志轮转配置
- 环境变量验证脚本

### 2u2g 优化
- Node.js 内存限制：`--max-old-space-size=200`
- 单并发作业强制：`WORKER_COUNT=1`
- 禁用并发任务：`ENABLE_CONCURRENT_JOBS=false`
- SQLite 缓存优化：`SQLITE_CACHE_SIZE=-2000`
- Python 内存限制：`PYTHON_MEMORY_LIMIT=300m`
- git-ai 内存限制：`GIT_AI_MAX_MEMORY=256m`
- Swap 设置脚本（2GB）
- 系统监控脚本

### 文档
- 完整的环境变量配置示例
- 部署指南
- 故障排除指南
- 安全策略
- 贡献指南

### 安全
- Session 安全（HttpOnly, Secure, SameSite）
- Webhook 签名验证
- 默认密码警告
- 环境变量验证

---

## 变更类型说明

- **新增** - 新功能
- **变更** - 现有功能的变更
- **弃用** - 即将移除的功能
- **移除** - 已移除的功能
- **修复** - Bug 修复
- **安全** - 安全相关的变更

## 版本说明

版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

格式为：`主版本.次版本.修订版本`

- **主版本**：不兼容的 API 变更
- **次版本**：向后兼容的新增功能
- **修订版本**：向后兼容的问题修复

---

## 如何贡献

请在提交 Pull Request 时，将变更记录在变更日志中：

```bash
# 格式：
[主版本.次版本.修订版本] - YYYY-MM-DD

### 新增
- 新功能的描述

### 变更
- 功能变更的描述

### 修复
- Bug 修复的描述

### 安全
- 安全相关的变更
```
