# 贡献指南

感谢您对 CodaGraph-lite 项目的关注！我们欢迎任何形式的贡献。

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境设置](#开发环境设置)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)

## 行为准则

- 尊重所有贡献者
- 使用包容性语言
- 专注于对社区最有帮助的事情
- 对不同的观点持开放态度

## 如何贡献

### 报告 Bug

如果您发现了 Bug，请：

1. 检查 [Issue](https://github.com/codagraph/codagraph-lite/issues) 是否已报告
2. 如果没有，创建新的 Issue，包含：
   - 清晰的标题
   - 复现步骤
   - 预期行为
   - 实际行为
   - 环境信息（操作系统、版本）

### 提出新功能

1. 检查 [Issue](https://github.com/codagraph/codagraph-lite/issues) 是否已提议
2. 如果没有，创建新的 Issue，讨论您的想法
3. 等待维护者的反馈
4. 实现功能并提交 Pull Request

### 改进文档

- 修正错别字或错误
- 添加更多示例
- 改进说明清晰度
- 翻译文档到其他语言

## 开发环境设置

### 环境要求

- Node.js 18+
- Python 3.11+
- npm 8+
- Code Context Engine runtime

### 克隆仓库

```bash
git clone https://github.com/codagraph/codagraph-lite.git
cd codagraph-lite
```

### 安装依赖

```bash
# 根目录
npm install

# 后端
cd server
npm install

# 前端
cd ../web
npm install

# Context Agent
cd ../context-agent
pip install -e ".[dev]"
```

### 运行开发服务器

```bash
# 后端（在 server/ 目录）
npm run dev

# 前端（在 web/ 目录）
npm run dev
```

## 代码规范

### TypeScript/JavaScript

- 使用 TypeScript 类型
- 使用 ESLint 进行代码检查
- 遵循项目现有的代码风格
- 添加 JSDoc 注释到公共 API

```bash
# 运行代码检查
npm run lint

# 自动修复可修复的问题
npm run lint --fix
```

### Python

- 遵循 PEP 8
- 使用类型提示
- 使用 Black 进行格式化
- 使用 Ruff 进行 linting
- 添加 docstring 到公共函数

```bash
# 运行代码检查
make lint

# 格式化代码
make format

# 类型检查
make type-check
```

### 命名约定

| 类型 | 约定 | 示例 |
|------|--------|------|
| 文件 | kebab-case | `database-manager.ts` |
| 类/接口 | PascalCase | `DatabaseManager` |
| 函数 | camelCase | `getConnection()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| 私有成员 | `_camelCase` | `_connection` |

## 提交规范

我们使用 [约定式提交](https://www.conventionalcommits.org/zh-hans/)。

格式：

```
<类型>[可选的作用域]: <描述>

[可选的正文]

[可选的脚注]
```

### 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档变更
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构（既不修复 Bug 也不添加功能）
- `perf`: 性能优化
- `test`: 添加测试
- `chore`: 构建过程或辅助工具的变动
- `ci`: CI 配置文件和脚本的变动

### 示例

```bash
feat(auth): 添加 GitHub OAuth 2.0 集成

实现 GitHub OAuth 流程，支持用户授权和 token 刷新。

Closes #123
```

```bash
fix(database): 修复 SQLite 连接泄漏

在连接池管理中添加正确的连接释放逻辑。

Fixes #456
```

## Pull Request 流程

### 1. 分支策略

- 主分支：`main`
- 开发分支：从 `main` 创建新分支
- 分支命名：`类型/描述`（例如：`feat/oauth-integration`）

### 2. 提交 PR

1. 确保代码通过所有检查
2. 更新相关文档
3. 在 PR 描述中：
   - 引用相关的 Issue
   - 描述变更内容
   - 添加截图（如适用）
4. 等待代码审查

### 3. 审查标准

- 代码风格符合项目规范
- 所有测试通过
- 新功能有测试覆盖
- 文档已更新
- 没有引入新的安全漏洞

### 4. 自动化检查

PR 会自动运行以下检查：

- ESLint（前端/后端）
- Ruff（Python agents）
- 类型检查
- 单元测试
- 集成测试

## 2u2g 优化注意事项

CodaGraph-lite 针对低资源服务器（2u2g）进行了优化，贡献时请注意：

### 内存限制

- Node.js: `--max-old-space-size=200`
- Python agents: `300m`
- Code Context Engine: `256m`
- SQLite cache: `-2000`

### 并发控制

- 始终保持单并发作业：`WORKER_COUNT=1`
- 禁用并发任务：`ENABLE_CONCURRENT_JOBS=false`

### 资源监控

- 添加内存使用日志
- 实现资源清理
- 避免内存泄漏

## 获取帮助

- 查看现有 [Issue](https://github.com/codagraph/codagraph-lite/issues)
- 加入 [Discussions](https://github.com/codagraph/codagraph-lite/discussions)
- 联系维护者：`support@codagraph.io`

## 许可证

通过贡献代码，您同意您的贡献将在 [MIT License](LICENSE) 下发布。
