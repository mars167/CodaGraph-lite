# CodaGraph-lite 贡献者指南

感谢你对 CodaGraph-lite 项目的兴趣！我们欢迎任何形式的贡献。

## 目录

- [行为准则](#行为准则)
- [开始之前](#开始之前)
- [开发环境设置](#开发环境设置)
- [代码规范](#代码规范)
- [提交信息规范](#提交信息规范)
- [Pull Request 流程](#pull-request-流程)
- [测试要求](#测试要求)
- [文档要求](#文档要求)
- [Issue 报告](#issue-报告)
- [发布流程](#发布流程)

---

## 行为准则

- 尊重所有贡献者
- 使用清晰、礼貌的语言
- 欢迎新贡献者并帮助指导
- 专注于项目最有益的改进
- 乐于接受反馈和建设性批评

---

## 开始之前

### Fork 项目

```bash
# 1. Fork 仓库到你的 GitHub 账户
# 在 https://github.com/your-org/codagraph-lite 点击 "Fork"

# 2. 克隆你的 fork
git clone https://github.com/your-username/codagraph-lite.git
cd codagraph-lite
```

### 创建功能分支

```bash
# 从主分支创建功能分支
git checkout -b feature/amazing-feature

# 或使用修复分支
git checkout -b fix/bug-description

# 或使用文档分支
git checkout -b docs/update-readme
```

### 安装依赖

```bash
# 安装所有依赖
npm install

# 安装 Python 依赖
cd context-agent && pip install -r requirements.txt && cd ..
cd review-agent && pip install -r requirements.txt && cd ..
```

---

## 开发环境设置

### 环境变量

```bash
# 复制示例配置
cp .env.example .env

# 根据需要修改配置
nano .env
```

### 开发模式运行

```bash
# 同时运行前端和后端
npm run dev

# 仅运行后端
cd server && npm run dev

# 仅运行前端
cd web && npm run dev
```

### 代码热重载

项目已配置热重载：
- Next.js 前端：自动热重载
- Express 后端：使用 `nodemon` 自动重启

---

## 代码规范

### JavaScript / TypeScript

#### ESLint 配置

项目使用 ESLint 进行代码检查。

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  rules: {
    'no-console': 'warn',
    'no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'warn'
  }
};
```

#### 运行 ESLint

```bash
# 检查所有文件
npm run lint

# 自动修复可修复的问题
npm run lint:fix

# 检查特定文件
npm run lint server/src/routes/auth.ts
```

#### TypeScript 规范

- 使用显式类型，避免 `any`
- 使用接口定义数据结构
- 导出类型供其他模块使用

```typescript
// 好的实践
interface User {
  id: number;
  username: string;
  createdAt: Date;
}

// 避免的实践
const user: any = getUser();
```

#### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `AuthService` |
| 接口名 | PascalCase | `IUser` |
| 函数名 | camelCase | `getUserById` |
| 常量名 | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| 私有成员 | camelCase 前缀 | `privateUserId` |
| 类型名 | PascalCase | `JobStatus` |

#### 文件组织

```
server/src/
├── routes/           # API 路由（按功能分组）
├── services/         # 业务逻辑层
├── database/         # 数据库访问层
├── queue/            # 作业队列
├── agents/           # Agent 集成
├── middleware/       # Express 中间件
└── types/           # TypeScript 类型定义
```

### Python

#### Black 格式化

项目使用 Black 进行代码格式化（100 字符行长度）。

```bash
# 格式化所有 Python 文件
black context-agent/ review-agent/

# 检查文件是否符合 Black 格式
black --check context-agent/review-agent/

# 设置为 Git pre-commit hook
pre-commit install --hook-formats 'black -s --'
```

#### Ruff Linter

项目使用 Ruff 进行快速 linting。

```bash
# 运行 Ruff
ruff check context-agent review-agent

# 自动修复可修复的问题
ruff check --fix context-agent review-agent

# 检查特定文件
ruff check context-agent/src/main.py
```

#### MyPy 类型检查

项目使用 MyPy 进行类型检查。

```bash
# 运行 MyPy 类型检查
mypy context-agent review-agent

# 生成类型报告
mypy context-agent review-agent --html-report mypy-report/
```

#### Python 规范

```python
# 好的实践
from typing import Optional, List
from dataclasses import dataclass

@dataclass
class User:
    """用户数据模型"""
    id: int
    username: str
    email: Optional[str] = None

async def get_user(user_id: int) -> Optional[User]:
    """根据 ID 获取用户"""
    return db.query(User).filter_by(id=user_id).first()
```

```python
# 避免的实践
def get_user(user_id):
    user = db.query("SELECT * FROM users WHERE id = ?", (user_id,))
    return user
```

---

## 提交信息规范

项目遵循 Conventional Commits 规范。

### 提交信息格式

```
<type>(<scope>): <subject>

<body>
```

### Type 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(auth): add GitHub OAuth support` |
| `fix` | Bug 修复 | `fix(database): resolve connection pool issue` |
| `docs` | 文档更新 | `docs(readme): update installation guide` |
| `style` | 代码格式调整 | `style(server): format code with Prettier` |
| `refactor` | 代码重构 | `refactor(queue): simplify job scheduling` |
| `test` | 添加测试 | `test(auth): add login validation tests` |
| `chore` | 构建/工具链更新 | `chore(deps): upgrade to Node 18` |
| `perf` | 性能优化 | `perf(db): add index for faster queries` |
| `ci` | CI 配置更新 | `ci(github): add workflow for tests` |

### Subject（主题）

- 使用简练的语言
- 使用祈使句
- 不超过 50 字符
- 不以句号结尾

### Body（正文）

- 详细说明 **什么**和 **为什么**做这些更改
- 关联相关 Issue（使用 `#123` 格式）
- 可以多行

### 示例

```
feat(oauth): add GitLab OAuth integration

- Implement GitLab OAuth 2.0 flow
- Add GitLab-specific webhook signature verification
- Update installation management UI to support GitLab

Closes #142
```

---

## Pull Request 流程

### PR 分支命名

| 分支类型 | 命名格式 | 示例 |
|-----------|-----------|------|
| 新功能 | `feature/feature-name` | `feature/dark-mode` |
| Bug 修复 | `fix/bug-description` | `fix/login-redirect` |
| 重构 | `refactor/component-name` | `refactor/auth-service` |
| 文档 | `docs/doc-name` | `docs/api-reference` |

### PR 标题格式

```
<type>(<scope>): <short description>
```

### PR 描述模板

```markdown
## 描述
<!-- 简短描述此 PR 的目的 -->

## 变更类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 代码重构
- [ ] 文档更新
- [ ] 性能优化

## 测试
- [ ] 单元测试已通过
- [ ] 集成测试已通过
- [ ] 手动测试已验证

## 检查清单
- [ ] 代码遵循项目规范
- [ ] 已添加必要的文档
- [ ] 已更新相关文档
- [ ] 无 console.log 或调试代码
- [ ] 所有测试通过

## 相关 Issue
Closes #(issue number)
```

### PR 审查流程

1. 自动 CI 检查通过
2. 至少一名维护者审查
3. 所有审查意见得到处理
4. CI 测试通过
5. 合并到主分支

---

## 测试要求

### 单元测试

#### 后端测试（Jest）

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- database/connection.test.ts

# 监听模式（自动重运行）
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

#### 前端测试

```bash
# 运行组件测试
npm run test

# E2E 测试
npm run test:e2e

# 覆盖率
npm run test:coverage
```

#### Python 测试（pytest）

```bash
# 运行所有测试
pytest

# 运行特定测试文件
pytest tests/test_context_agent.py

# 显示详细输出
pytest -v

# 覆盖率
pytest --cov=context-agent --cov-report=html
```

### 测试覆盖率要求

| 模块 | 最低覆盖率 | 目标覆盖率 |
|------|-----------|-------------|
| 后端核心逻辑 | 80% | 90% |
| 前端组件 | 80% | 90% |
| Python Agents | 80% | 90% |

### 测试编写指南

```typescript
// 好的测试示例
describe('AuthService', () => {
  describe('login', () => {
    it('should return session on valid credentials', async () => {
      const result = await authService.login('admin', 'password');
      expect(result.success).toBe(true);
      expect(result.data.sessionId).toBeDefined();
    });

    it('should reject on invalid credentials', async () => {
      const result = await authService.login('admin', 'wrong');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('password update', () => {
    it('should update password successfully', async () => {
      await authService.updatePassword('old', 'new');
      const user = await db.getUserById(1);
      const isValid = await bcrypt.compare('new', user.passwordHash);
      expect(isValid).toBe(true);
    });
  });
});
```

```python
# 好的测试示例
import pytest

class TestContextAgent:
    def test_analyze_should_return_summary(self):
        """测试 analyze 方法返回摘要"""
        request = AnalysisRequest(
            workspace_path='/tmp/test',
            file_pattern='*.py'
        )
        result = agent.analyze(request)

        assert result.success is True
        assert result.summary is not None
        assert len(result.files) > 0

    @pytest.mark.parametrize("platform", ["github", "gitee", "gitlab"])
    def test_webhook_platform(self, platform):
        """测试不同平台的 webhook 处理"""
        event = WebhookEvent(
            platform=platform,
            event_type='pull_request',
            payload='{"action":"opened"}'
        )
        # 测试不会抛出异常
        handler.handle_webhook(event)
```

---

## 文档要求

### JSDoc 注释

```typescript
/**
 * 认证服务
 * 负责处理用户登录、Session 管理和密码更新
 *
 * @example
 * ```typescript
 * const authService = new AuthService(db);
 * const session = await authService.login('admin', 'password');
 * ```
 */
export class AuthService {
  /**
   * 用户登录
   *
   * @param username - 管理员用户名
   * @param password - 管理员密码
   * @returns 包含 Session ID 的登录结果
   * @throws {InvalidCredentialsError} 当凭据无效时
   */
  async login(
    username: string,
    password: string
  ): Promise<LoginResult> {
    // 实现...
  }
}
```

### Python Docstrings

```python
"""Context Agent 模块

该模块负责执行代码上下文分析，使用 ReAct 循环
迭代收集代码结构和依赖关系信息。
"""

class ContextAgent:
    """上下文分析 Agent

    通过 ReAct 循环（推理-行动-观察）收集代码上下文，
    为后续的代码审查提供必要的代码结构信息。

    Attributes:
        workspace_path: 代码工作空间路径
        max_iterations: 最大 ReAct 迭代次数
        llm_client: LLM API 客户端

    Example:
        >>> agent = ContextAgent('/tmp/repo')
        >>> result = agent.analyze()
        >>> print(result.summary)
    """

    def __init__(self, workspace_path: str):
        """初始化 Context Agent

        Args:
            workspace_path: 代码仓库的本地路径

        Raises:
            ValueError: 当 workspace_path 不存在时
        """
        self.workspace_path = Path(workspace_path)
        if not self.workspace_path.exists():
            raise ValueError(f"Workspace not found: {workspace_path}")
```

### 文档更新

当修改代码时，请同步更新：

1. API 文档（如添加新端点）
2. 配置文档（如添加新环境变量）
3. README.md（如更改启动命令）
4. 架构文档（如添加新组件）

---

## Issue 报告

### Issue 模板

报告 Bug 或功能请求时，请使用以下模板：

```markdown
## 问题描述
<!-- 简短清晰描述问题 -->

## 复现步骤
1. 第一步
2. 第二步
3. ...

## 预期行为
<!-- 描述应该发生什么 -->

## 实际行为
<!-- 描述实际发生了什么 -->

## 环境信息
- CodaGraph-lite 版本:
- 操作系统:
- Node.js 版本:
- Python 版本:
- 数据库类型:
- 内存大小:

## 日志
<!-- 如有相关日志，请粘贴 -->

## 附加信息
<!-- 其他有用信息 -->
```

### Issue 类型

| 类型 | 说明 | 标签 |
|------|------|------|
| Bug | 功能不工作或产生错误 | `bug` |
| Feature | 新功能请求 | `enhancement`, `feature` |
| Performance | 性能问题 | `performance` |
| Documentation | 文档问题或改进 | `documentation` |
| Question | 使用疑问 | `question` |

---

## 发布流程

### 版本号规范

项目遵循语义化版本（Semantic Versioning）：

```
MAJOR.MINOR.PATCH

MAJOR: 不兼容的 API 变更
MINOR: 向后兼容的功能性新增
PATCH: 向后兼容的 Bug 修复
```

示例：
- `1.0.0` - 初始发布
- `1.1.0` - 添加新功能
- `1.1.1` - Bug 修复
- `2.0.0` - 重大更新

### 发布前检查清单

- [ ] 所有测试通过
- [ ] 代码审查完成
- [ ] 文档已更新
- [ ] CHANGELOG.md 已更新
- [ ] 版本号已更新
- [ ] Git 标签已创建
- [ ] npm 版本已发布

### 发布命令

```bash
# 1. 更新版本号
npm version patch

# 2. 运行所有测试
npm test

# 3. 构建生产版本
npm run build

# 4. 提交更改
git add .
git commit -m "chore(release): v1.1.0"

# 5. 创建 Git 标签
git tag -a v1.1.0 -m "Release v1.1.0"

# 6. 推送到远程
git push origin main --tags

# 7. 发布到 npm
npm publish
```

---

## 开发资源

### 官方文档

- [Next.js 文档](https://nextjs.org/docs)
- [Express.js 文档](https://expressjs.com/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [Python 类型提示](https://docs.python.org/3/library/typing.html)

### 工具

| 工具 | 用途 | 链接 |
|------|------|------|
| ESLint | JavaScript/TypeScript linting | https://eslint.org/ |
| Prettier | 代码格式化 | https://prettier.io/ |
| Black | Python 格式化 | https://black.readthedocs.io/ |
| Ruff | Python linting | https://docs.astral.sh/ruff/ |
| MyPy | Python 类型检查 | https://mypy.readthedocs.io/ |
| Jest | JavaScript/TypeScript 测试 | https://jestjs.io/ |
| pytest | Python 测试 | https://docs.pytest.org/ |

---

## 社区

- [GitHub Discussions](https://github.com/your-org/codagraph-lite/discussions)
- [GitHub Issues](https://github.com/your-org/codagraph-lite/issues)

---

感谢你的贡献！
