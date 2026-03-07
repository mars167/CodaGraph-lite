# CodaGraph Lite 前端使用指南

## 目录

- [项目概述](#项目概述)
- [快速开始](#快速开始)
- [开发环境设置](#开发环境设置)
- [项目结构](#项目结构)
- [功能说明](#功能说明)
- [组件使用](#组件使用)
- [状态管理](#状态管理)
- [API 调用](#api-调用)
- [样式开发](#样式开发)
- [构建和部署](#构建和部署)

## 项目概述

CodaGraph Lite 前端是一个基于 Next.js 14 的单页面应用，提供简洁的管理界面用于：

- 管理员登录和认证
- OAuth 平台集成管理（GitHub、Gitee、GitLab）
- 代码仓库管理
- PR 审查作业状态监控
- 分析历史查看

### 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript 5+
- **样式**: Tailwind CSS v4
- **状态管理**: React Context API
- **HTTP 客户端**: 原生 Fetch API

### 系统要求

- Node.js 18.17 或更高版本
- npm 9 或更高版本

## 快速开始

### 1. 安装依赖

```bash
cd web
npm install
```

### 2. 配置环境变量

复制环境变量模板：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local` 文件：

```env
# 后端 API 地址
NEXT_PUBLIC_API_URL=http://localhost:7900

# 应用信息
NEXT_PUBLIC_APP_NAME=CodaGraph Lite
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 3. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动。

## 开发环境设置

### 推荐工具

- **IDE**: VSCode（推荐）或 WebStorm
- **浏览器**: Chrome、Firefox、Edge（推荐 Chrome DevTools）
- **Node 版本管理**: nvm 或 fnm

### VSCode 扩展推荐

- ESLint - 代码检查
- Prettier - 代码格式化
- Tailwind CSS IntelliSense - Tailwind 类名提示
- TypeScript Vue Plugin (Volar) - TypeScript 支持

### 开发命令

| 命令 | 说明 |
|-------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产环境构建 |
| `npm start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint 检查 |

## 项目结构

```
web/
├── app/                      # Next.js App Router 目录
│   ├── dashboard/            # 仪表板页面
│   │   ├── layout.tsx        # 仪表板布局
│   │   ├── page.tsx          # 仪表板首页
│   │   ├── oauth/page.tsx     # OAuth 管理页
│   │   ├── repositories/     # 仓库管理
│   │   ├── jobs/             # 作业状态
│   │   └── history/          # 分析历史
│   ├── login/                # 登录页面
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 首页
│   └── globals.css           # 全局样式
├── src/
│   ├── components/           # 可复用组件
│   │   ├── auth/            # 认证相关组件
│   │   ├── layout/          # 布局组件
│   │   └── ui/             # UI 组件库
│   ├── contexts/            # React Context Providers
│   ├── lib/                # 工具函数
│   └── types/              # TypeScript 类型定义
└── public/                 # 静态资源目录
```

## 功能说明

### 认证功能

- **登录页** (`/login`): 用户名/密码登录
- **会话管理**: 基于 localStorage 的会话存储
- **自动过期**: 24 小时会话过期
- **受保护路由**: 自动重定向未认证用户

### 仪表板功能

#### 仪表板首页 (`/dashboard`)
- 系统状态概览
- 内存使用监控
- 资源统计信息
- 快捷操作入口

#### OAuth 集成管理 (`/dashboard/oauth`)
- GitHub/Gitee/GitLab 授权
- 已连接账户列表
- 断开连接、刷新 Token

#### 仓库管理 (`/dashboard/repositories`)
- 仓库列表展示（读取时自动刷新并缓存）
- 分页功能
- 仓库详细信息

#### 作业状态 (`/dashboard/jobs`)
- 作业队列展示
- 状态筛选
- 作业取消功能
- 实时状态更新

#### 分析历史 (`/dashboard/history`)
- PR 分析记录
- 状态筛选
- 重试分析功能
- PR 详情查看

## 组件使用

### UI 组件库

所有 UI 组件位于 `src/components/ui/` 目录。

#### Button

```tsx
import { Button } from '@/components/ui/Button';

<Button variant="primary" size="md" onClick={handleClick}>
  点击按钮
</Button>

<Button variant="danger" loading={isLoading} disabled={disabled}>
  提交
</Button>
```

**Props:**
- `variant`: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
- `size`: 'sm' | 'md' | 'lg'
- `loading`: boolean
- `fullWidth`: boolean

#### Input

```tsx
import { Input } from '@/components/ui/Input';

<Input
  id="username"
  label="用户名"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
  placeholder="请输入用户名"
/>
```

**Props:**
- `label`: string
- `value`: string
- `error`: string
- `helperText`: string

#### PasswordInput

```tsx
import { PasswordInput } from '@/components/ui/Input';

<PasswordInput
  id="password"
  label="密码"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
```

#### Card

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

<Card>
  <CardHeader>
    <CardTitle>卡片标题</CardTitle>
  </CardHeader>
  <CardContent>
    卡片内容
  </CardContent>
</Card>
```

#### Badge

```tsx
import { Badge } from '@/components/ui/Badge';

<Badge variant="success" size="md">
  已完成
</Badge>
```

**Props:**
- `variant`: 'default' | 'success' | 'warning' | 'error' | 'info'
- `size`: 'sm' | 'md'

#### Loading

```tsx
import { Loading, PageLoading } from '@/components/ui/Loading';

<Loading size="md" text="加载中..." />

<PageLoading />
```

### 认证组件

#### ProtectedRoute

```tsx
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

<ProtectedRoute>
  {/* 受保护的内容 */}
</ProtectedRoute>
```

### 布局组件

#### Navbar

导航栏组件，自动在仪表板布局中使用。

## 状态管理

### 认证状态 (AuthContext)

```tsx
'use client';
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { admin, isAuthenticated, isLoading, login, logout } = useAuth();

  const handleLogin = async () => {
    try {
      await login(username, password);
      // 登录成功
    } catch (error) {
      // 登录失败
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  // ...
}
```

**提供的值和方法：**
- `admin`: 当前登录的管理员信息
- `isAuthenticated`: 是否已认证
- `isLoading`: 是否正在加载
- `login(username, password)`: 登录方法
- `logout()`: 登出方法
- `refreshAdmin()`: 刷新管理员信息

### 通知状态 (NotificationContext)

```tsx
'use client';
import { useNotifications, useNotificationHelpers } from '@/contexts/NotificationContext';

function MyComponent() {
  const { addNotification, removeNotification, clearNotifications } = useNotifications();
  const { success, error, warning, info } = useNotificationHelpers();

  const showSuccess = () => {
    success('操作成功', '数据已保存');
  };

  const showError = () => {
    error('操作失败', '请稍后重试');
  };
}
```

**提供的值和方法：**
- `notifications`: 当前通知列表
- `addNotification(notification)`: 添加通知
- `removeNotification(id)`: 移除通知
- `clearNotifications()`: 清除所有通知
- `success(title, message)`: 成功通知便捷方法
- `error(title, message)`: 错误通知便捷方法
- `warning(title, message)`: 警告通知便捷方法
- `info(title, message)`: 信息通知便捷方法

## API 调用

### API 客户端使用

```tsx
import { apiClient } from '@/lib/api-client';

// 认证 API
await apiClient.login({ username, password });
await apiClient.logout();
await apiClient.getCurrentAdmin();

// OAuth API
await apiClient.getOAuthInstallations();
await apiClient.getOAuthAuthorizationUrl('github');
await apiClient.disconnectOAuth(installationId);

// 仓库 API
await apiClient.getRepositories({ page: 1, pageSize: 20 });
await apiClient.getRepository(repositoryId);

// 分析 API
await apiClient.getAnalyses({ status: 'completed' });
await apiClient.getAnalysis(analysisId);
await apiClient.retryAnalysis(analysisId);

// 作业 API
await apiClient.getJobs({ status: 'pending' });
await apiClient.getJob(jobId);
await apiClient.cancelJob(jobId);
await apiClient.getJobStats();

// 系统状态 API
await apiClient.getSystemStatus();
await apiClient.getMemoryInfo();
await apiClient.getResourceStats();
await apiClient.healthCheck();
```

### 错误处理

```tsx
try {
  const response = await apiClient.someApiCall();
  // 处理成功响应
} catch (error) {
  // 处理错误
  const message = error instanceof Error ? error.message : '请求失败';
  // 显示错误提示
}
```

### 认证处理

API 客户端自动处理认证 token：
- 从 `localStorage` 读取 token
- 自动添加到请求头 `Authorization: Bearer {token}`
- 401 响应时自动清除 token 并跳转到登录页

## 样式开发

### Tailwind CSS 使用

项目使用 Tailwind CSS v4 作为样式系统。

#### 响应式断点

| 断点 | 宽度 |
|-------|------|
| `sm:` | >= 640px |
| `md:` | >= 768px |
| `lg:` | >= 1024px |

#### 深色模式

```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  浅色/深色模式适配
</div>
```

### 自定义样式

全局样式在 `app/globals.css` 中定义，包括：
- CSS 变量
- 滚动条样式
- 动画定义
- Toast 容器样式

## 构建和部署

### 开发构建

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

构建输出位于 `.next` 目录。

### 生产服务器启动

```bash
npm start
```

### 环境变量

生产环境需要配置以下环境变量：

```env
NEXT_PUBLIC_API_URL=https://your-api-domain.com
NEXT_PUBLIC_APP_NAME=CodaGraph Lite
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 性能优化

- Next.js 自动进行代码分割和优化
- 图片使用 Next.js Image 组件优化
- 使用 React.memo 优化组件重渲染（根据需要）

## 常见问题

### Q: 如何添加新页面？

在 `app/` 目录下创建新文件或目录：

```tsx
// app/new-page/page.tsx
export default function NewPage() {
  return <div>新页面内容</div>;
}
```

### Q: 如何添加新组件？

在 `src/components/ui/` 目录下创建新组件：

```tsx
// src/components/ui/NewComponent.tsx
export function NewComponent({ ...props }: Props) {
  return <div>组件内容</div>;
}
```

### Q: 如何修改 API 地址？

修改 `.env.local` 文件中的 `NEXT_PUBLIC_API_URL`。

### Q: 登录后为什么仍然跳转到登录页？

检查：
1. API 地址配置是否正确
2. Token 是否正确存储在 localStorage
3. 后端 API 是否正常运行

## 故障排除

### 开发服务器启动失败

```bash
# 清除缓存并重新安装
rm -rf node_modules package-lock.json .next
npm install
npm run dev
```

### 样式不生效

1. 确认 Tailwind 配置正确
2. 清除 `.next` 缓存：`rm -rf .next`
3. 重启开发服务器

### TypeScript 错误

1. 运行 `npm run build` 查看完整错误信息
2. 检查 `tsconfig.json` 配置
3. 确保类型定义正确

## 获取帮助

如需帮助，请：
1. 查看项目 GitHub Issues
2. 联系团队成员
3. 查看相关文档

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-01
