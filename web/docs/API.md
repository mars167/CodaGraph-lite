# CodaGraph Lite 前端 API 调用指南

## 目录

- [API 客户端概述](#api-客户端概述)
- [认证 API](#认证-api)
- [OAuth 集成 API](#oauth-集成-api)
- [仓库管理 API](#仓库管理-api)
- [分析 API](#分析-api)
- [作业 API](#作业-api)
- [系统状态 API](#系统状态-api)
- [错误处理](#错误处理)
- [类型定义](#类型定义)

## API 客户端概述

前端使用封装好的 API 客户端 (`src/lib/api-client.ts`) 与后端通信。

### 导入

```tsx
import { apiClient } from '@/lib/api-client';
import type {
  Admin,
  OAuthInstallation,
  Repository,
  Analysis,
  AnalysisJob,
  SystemStatus,
  LoginRequest,
  LoginResponse
} from '@/types';
```

### 配置

API 客户端自动从环境变量读取后端地址：

```env
NEXT_PUBLIC_API_URL=http://localhost:7900  # 本地开发
NEXT_PUBLIC_API_URL=https://api.example.com  # 生产环境
```

### 认证机制

API 客户端自动处理认证：
- 自动从 `localStorage` 读取 token
- 自动添加 `Authorization: Bearer {token}` 请求头
- 401 响应时自动清除 token 并跳转登录页

## 认证 API

### 管理员登录

```tsx
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      const response: LoginResponse = await apiClient.login({
        username,
        password
      });

      if (response.success && response.admin) {
        // 登录成功
        // login() 方法已自动处理 token 存储
        // 可以跳转到仪表板
      }
    } catch (error) {
      // 登录失败
      const message = error instanceof Error ? error.message : '登录失败';
      // 显示错误提示
    }
  };

  return (
    <form onSubmit={handleLogin}>
      {/* 表单内容 */}
    </form>
  );
}
```

**请求参数 (LoginRequest):**
```typescript
{
  username: string;  // 用户名
  password: string;  // 密码
}
```

**响应 (LoginResponse):**
```typescript
{
  success: boolean;
  admin?: {
    id: string;
    username: string;
    createdAt: string;
  };
  message?: string;
}
```

### 管理员登出

```tsx
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

function DashboardHeader() {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      // logout() 方法已自动清除 token 和会话
      // 可以跳转到登录页或首页
      window.location.href = '/login';
    } catch (error) {
      // 登出失败（非关键错误）
    }
  };

  return (
    <button onClick={handleLogout}>登出</button>
  );
}
```

### 获取当前管理员信息

```tsx
import { apiClient } from '@/lib/api-client';

async function fetchCurrentAdmin() {
  try {
    const response = await apiClient.getCurrentAdmin();
    if (response.success) {
      const admin = response.data.admin;
      // 使用管理员信息
    }
  } catch (error) {
    // 处理错误
  }
}
```

### 更新管理员密码

```tsx
import { apiClient } from '@/lib/api-client';

function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = async () => {
    try {
      await apiClient.updatePassword({
        currentPassword,
        newPassword
      });
      // 密码更新成功
    } catch (error) {
      // 处理错误
    }
  };

  return <form onSubmit={handleSubmit}>{/* ... */}</form>;
}
```

**请求参数:**
```typescript
{
  currentPassword: string;
  newPassword: string;
}
```

## OAuth 集成 API

### 获取 OAuth 授权 URL

```tsx
import { apiClient } from '@/lib/api-client';

function OAuthConnectButton({ platform }: { platform: 'github' | 'gitee' | 'gitlab' }) {
  const handleAuthorize = async () => {
    try {
      const response = await apiClient.getOAuthAuthorizationUrl(platform);
      if (response.success) {
        // 跳转到授权页面
        window.location.href = response.data.authorizationUrl;
      }
    } catch (error) {
      // 处理错误
    }
  };

  return (
    <button onClick={handleAuthorize}>
      连接 {platform.toUpperCase()}
    </button>
  );
}
```

**响应:**
```typescript
{
  success: true;
  data: {
    authorizationUrl: string;  // OAuth 授权 URL
  };
}
```

### 获取所有 OAuth 安装

```tsx
import { apiClient } from '@/lib/api-client';
import type { OAuthInstallation } from '@/types';

function OAuthListPage() {
  const [installations, setInstallations] = useState<OAuthInstallation[]>([]);

  useEffect(() => {
    apiClient.getOAuthInstallations()
      .then(response => {
        if (response.success) {
          setInstallations(response.data.installations);
        }
      });
  }, []);

  return (
    <div>
      {installations.map(installation => (
        <div key={installation.id}>
          <h3>{installation.platformUsername}</h3>
          <p>{installation.platform}</p>
        </div>
      ))}
    </div>
  );
}
```

**响应:**
```typescript
{
  success: true;
  data: {
    installations: OAuthInstallation[];
  };
}
```

### 断开 OAuth 连接

```tsx
import { apiClient } from '@/lib/api-client';

function OAuthCard({ installation }: { installation: OAuthInstallation }) {
  const handleDisconnect = async () => {
    if (!confirm('确定要断开此连接吗？')) {
      return;
    }

    try {
      await apiClient.disconnectOAuth(installation.id);
      // 刷新列表
    } catch (error) {
      // 处理错误
    }
  };

  return (
    <div>
      <h3>{installation.platformUsername}</h3>
      <button onClick={handleDisconnect}>断开</button>
    </div>
  );
}
```

### 刷新 OAuth Token

```tsx
import { apiClient } from '@/lib/api-client';

function RefreshTokenButton({ installationId }: { installationId: string }) {
  const handleRefresh = async () => {
    try {
      await apiClient.refreshOAuthToken(installationId);
      // Token 刷新成功
    } catch (error) {
      // 处理错误
    }
  };

  return <button onClick={handleRefresh}>刷新 Token</button>;
}
```

### 仓库读取与缓存

`GET /api/repositories` 会在返回列表前实时读取当前活跃的 OAuth 集成，拉取平台仓库，并把关键仓库信息缓存到数据库。

## 仓库管理 API

### 获取仓库列表

```tsx
import { apiClient } from '@/lib/api-client';
import type { Repository } from '@/types';

function RepositoryListPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const loadRepositories = async (currentPage = 1) => {
    try {
      const response = await apiClient.getRepositories({
        page: currentPage,
        pageSize
      });

      setRepositories(response.data);
      setTotal(response.total);
      setPage(currentPage);
    } catch (error) {
      // 处理错误
    }
  };

  useEffect(() => {
    loadRepositories();
  }, []);

  return (
    <div>
      {/* 仓库列表 */}
      <button onClick={() => loadRepositories(page + 1)} disabled={page * pageSize >= total}>
        下一页
      </button>
    </div>
  );
}
```

**请求参数:**
```typescript
{
  platform?: 'github' | 'gitee' | 'gitlab';  // 可选，按平台筛选
  page?: number;     // 页码，默认 1
  pageSize?: number; // 每页数量，默认 20
}
```

**响应 (PaginatedResponse<Repository>):**
```typescript
{
  success: true;
  data: Repository[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

### 获取仓库详情

```tsx
import { apiClient } from '@/lib/api-client';

async function fetchRepositoryDetails(repositoryId: string) {
  try {
    const response = await apiClient.getRepository(repositoryId);
    if (response.success) {
      const repository = response.data;
      // 使用仓库详情
    }
  } catch (error) {
    // 处理错误
  }
}
```

## 分析 API

### 获取分析列表

```tsx
import { apiClient } from '@/lib/api-client';
import type { Analysis } from '@/types';

function AnalysisListPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [filter, setFilter] = useState('all');

  const loadAnalyses = async () => {
    try {
      const response = await apiClient.getAnalyses({
        status: filter === 'all' ? undefined : filter
      });
      setAnalyses(response.data);
    } catch (error) {
      // 处理错误
    }
  };

  return (
    <div>
      <select onChange={(e) => setFilter(e.target.value)}>
        <option value="all">全部</option>
        <option value="pending">等待中</option>
        <option value="completed">已完成</option>
        <option value="failed">失败</option>
      </select>
      <button onClick={loadAnalyses}>刷新</button>
    </div>
  );
}
```

**请求参数:**
```typescript
{
  repositoryId?: string;  // 可选，按仓库筛选
  platform?: 'github' | 'gitee' | 'gitlab';  // 可选，按平台筛选
  status?: 'pending' | 'processing' | 'completed' | 'failed';  // 可选，按状态筛选
  page?: number;
  pageSize?: number;
}
```

### 获取分析详情

```tsx
import { apiClient } from '@/lib/api-client';

function AnalysisDetailPage({ analysisId }: { analysisId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  useEffect(() => {
    apiClient.getAnalysis(analysisId)
      .then(response => {
        if (response.success) {
          setAnalysis(response.data);
        }
      });
  }, [analysisId]);

  return (
    <div>
      {analysis && (
        <>
          <h2>{analysis.prTitle}</h2>
          <p>PR #{analysis.platformPrNumber}</p>
          <p>状态: {analysis.status}</p>
        </>
      )}
    </div>
  );
}
```

### 重新触发分析

```tsx
import { apiClient } from '@/lib/api-client';

function RetryButton({ analysisId }: { analysisId: string }) {
  const handleRetry = async () => {
    if (!confirm('确定要重新触发此分析吗？')) {
      return;
    }

    try {
      const response = await apiClient.retryAnalysis(analysisId);
      // 重新触发成功
    } catch (error) {
      // 处理错误
    }
  };

  return <button onClick={handleRetry}>重试分析</button>;
}
```

## 作业 API

### 获取作业列表

```tsx
import { apiClient } from '@/lib/api-client';
import type { AnalysisJob } from '@/types';

function JobListPage() {
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [filter, setFilter] = useState('all');

  const loadJobs = async () => {
    try {
      const response = await apiClient.getJobs({
        status: filter === 'all' ? undefined : filter
      });
      setJobs(response.data);
    } catch (error) {
      // 处理错误
    }
  };

  return (
    <div>
      <select onChange={(e) => setFilter(e.target.value)}>
        <option value="all">全部</option>
        <option value="pending">等待中</option>
        <option value="processing">处理中</option>
        <option value="completed">已完成</option>
        <option value="failed">失败</option>
      </select>
    </div>
  );
}
```

**请求参数:**
```typescript
{
  type?: 'analyze_pr' | 'sync_repository' | 'refresh_oauth';
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  page?: number;
  pageSize?: number;
}
```

### 获取作业统计

```tsx
import { apiClient } from '@/lib/api-client';

function JobStatsCard() {
  const [stats, setStats] = useState<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    apiClient.getJobStats()
      .then(response => {
        if (response.success) {
          setStats(response.data);
        }
      });
  }, []);

  return stats && (
    <div>
      <div>等待中: {stats.pending}</div>
      <div>处理中: {stats.processing}</div>
      <div>已完成: {stats.completed}</div>
      <div>失败: {stats.failed}</div>
    </div>
  );
}
```

**响应:**
```typescript
{
  success: true;
  data: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}
```

### 取消作业

```tsx
import { apiClient } from '@/lib/api-client';

function CancelButton({ jobId }: { jobId: string }) {
  const handleCancel = async () => {
    if (!confirm('确定要取消此作业吗？')) {
      return;
    }

    try {
      await apiClient.cancelJob(jobId);
      // 取消成功，刷新列表
    } catch (error) {
      // 处理错误
    }
  };

  return <button onClick={handleCancel}>取消作业</button>;
}
```

## 系统状态 API

### 获取系统状态

```tsx
import { apiClient } from '@/lib/api-client';
import type { SystemStatus } from '@/types';

function SystemStatusCard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    // 每 30 秒刷新一次
    const loadStatus = () => {
      apiClient.getSystemStatus()
        .then(response => {
          if (response.success) {
            setStatus(response);
          }
        });
    };

    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return status && (
    <div>
      <div>系统状态: {status.status}</div>
      <div>数据库: {status.database}</div>
      <div>作业处理器: {status.worker}</div>
      <div>运行时间: {status.uptime} 秒</div>
    </div>
  );
}
```

**响应 (SystemStatus):**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: 'connected' | 'disconnected';
  worker: 'running' | 'stopped' | 'error';
  memoryUsage?: {
    total: number;      // 总内存 (字节)
    used: number;       // 已使用 (字节)
    available: number;   // 可用 (字节)
    percentage: number;  // 使用百分比
    swapTotal?: number;
    swapUsed?: number;
    swapPercentage?: number;
  };
  uptime: number;  // 运行时间 (秒)
  version: string;
}
```

### 获取内存信息

```tsx
import { apiClient } from '@/lib/api-client';

function MemoryUsageCard() {
  const [memoryInfo, setMemoryInfo] = useState<{
    total: number;
    used: number;
    available: number;
    percentage: number;
  } | null>(null);

  useEffect(() => {
    apiClient.getMemoryInfo()
      .then(response => {
        if (response.success) {
          setMemoryInfo(response.data);
        }
      });
  }, []);

  return memoryInfo && (
    <div>
      <div>总内存: {(memoryInfo.total / 1024 / 1024).toFixed(1)} MB</div>
      <div>已使用: {(memoryInfo.used / 1024 / 1024).toFixed(1)} MB</div>
      <div>使用率: {memoryInfo.percentage.toFixed(1)}%</div>
    </div>
  );
}
```

### 获取资源统计

```tsx
import { apiClient } from '@/lib/api-client';

async function fetchResourceStats() {
  try {
    const response = await apiClient.getResourceStats();
    if (response.success) {
      const stats = response.data;
      console.log('已处理作业:', stats.jobsProcessed);
      console.log('失败作业:', stats.jobsFailed);
      console.log('平均处理时间:', stats.avgProcessingTime);
    }
  } catch (error) {
    // 处理错误
  }
}
```

**响应:**
```typescript
{
  success: true;
  data: {
    jobsProcessed: number;
    jobsFailed: number;
    avgProcessingTime: number;
    currentMemory: {
      total: number;
      used: number;
      available: number;
      percentage: number;
    };
    peakMemory: number;
  };
}
```

### 健康检查

```tsx
import { apiClient } from '@/lib/api-client';

async function healthCheck() {
  try {
    const response = await apiClient.healthCheck();
    if (response.success) {
      console.log('系统健康:', response.data.status);
    }
  } catch (error) {
    // 健康检查失败
  }
}
```

## 错误处理

### 标准错误处理

```tsx
import { apiClient } from '@/lib/api-client';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

function MyComponent() {
  const { error, success } = useNotificationHelpers();

  const handleAction = async () => {
    try {
      const response = await apiClient.someApiCall();
      // 处理成功响应
      success('操作成功', '数据已保存');
    } catch (err) {
      // API 客户端已自动转换错误
      const message = err instanceof Error ? err.message : '请求失败';
      error('操作失败', message);
    }
  };

  return <button onClick={handleAction}>执行操作</button>;
}
```

### 自动错误处理

API 客户端自动处理以下错误：

1. **401 未授权**: 自动清除 token 并跳转到 `/login`
2. **网络错误**: 抛出包含详细信息的错误
3. **API 错误响应**: 提取并显示 `error` 字段

## 类型定义

所有类型定义位于 `src/types/index.ts`。

### 主要类型

```typescript
// 认证
interface Admin {
  id: string;
  username: string;
  createdAt: string;
}

// OAuth
type Platform = 'github' | 'gitee' | 'gitlab';

interface OAuthInstallation {
  id: string;
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
  accessToken: string;
  scope: string;
  expiresAt?: string;
  webhookUrl?: string;
}

// 仓库
interface Repository {
  id: string;
  installationId: string;
  platform: Platform;
  platformRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  language?: string;
  webhookUrl?: string;
}

// 分析
type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface Analysis {
  id: string;
  repositoryId: string;
  platform: Platform;
  platformPrId: string;
  platformPrNumber: number;
  prTitle: string;
  prAuthor: string;
  prUrl: string;
  status: AnalysisStatus;
  reviewCommentCount: number;
  fileAnalysisCount: number;
  createdAt: string;
  updatedAt: string;
}

// 作业
type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
type JobType = 'analyze_pr' | 'sync_repository' | 'refresh_oauth';

interface AnalysisJob {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  createdAt: string;
}
```

## 最佳实践

### 1. 错误处理

始终使用 try-catch 处理 API 调用：

```tsx
try {
  const response = await apiClient.someApiCall();
  // 处理响应
} catch (error) {
  // 显示错误提示
}
```

### 2. 加载状态

使用加载状态提升用户体验：

```tsx
const [isLoading, setIsLoading] = useState(false);

const handleSubmit = async () => {
  setIsLoading(true);
  try {
    await apiClient.someApiCall();
  } finally {
    setIsLoading(false);
  }
};
```

### 3. 防抖/节流

对于频繁的操作，使用防抖或节流：

```tsx
import { useEffect, useCallback } from 'react';

function SearchComponent() {
  const [query, setQuery] = useState('');

  const debouncedSearch = useCallback(
    debounce(async (q: string) => {
      const response = await apiClient.someApi(q);
      // 处理响应
    }, 500),
    []
  );

  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);
}
```

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-01
