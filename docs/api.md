# CodaGraph-lite API 文档

本文档说明 CodaGraph-lite 后端提供的所有 RESTful API 端点。

## 目录

- [API 概述](#api-概述)
- [通用规范](#通用规范)
- [认证系统 API](#认证系统-api)
- [健康检查 API](#健康检查-api)
- [OAuth 集成 API](#oauth-集成-api)
- [仓库管理 API](#仓库管理-api)
- [作业队列 API](#作业队列-api)
- [分析历史 API](#分析历史-api)
- [监控和状态 API](#监控和状态-api)
- [备份和恢复 API](#备份和恢复-api)

---

## API 概述

### 基础信息

| 项目 | 值 |
|------|-----|
| 协议 | HTTP/HTTPS |
| 主机 | `localhost` 或配置的域名 |
| 端口 | `7900`（可通过 `BACKEND_PORT` 配置） |
| 基础路径 | `/api` |
| 编码 | UTF-8 |
| 数据格式 | JSON |

### API 版本控制

API 版本通过路径前缀控制：
- 当前版本：`v1`
- 示例：`/api/v1/jobs`

### 认证方式

大多数 API 端点需要 Session 认证（除公开端点外）。

**认证方式**：
- Cookie-based Session
- Header: `Cookie: session_id=<session_id>`

**公开端点（无需认证）**：
- `POST /api/v1/auth/login`
- `GET /health`
- `POST /api/v1/oauth/*`
- `POST /api/v1/webhook/*`

---

## 通用规范

### 请求格式

所有 API 请求使用 JSON 格式：

```json
{
  "key": "value",
  "nested": {
    "key": "value"
  }
}
```

### 响应格式

成功响应：

```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

错误响应：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": { ... }
  }
}
```

### HTTP 状态码

| 状态码 | 说明 | 场景 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证或认证失败 |
| 403 | Forbidden | 无权限访问 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复提交） |
| 422 | Unprocessable Entity | 数据验证失败 |
| 429 | Too Many Requests | 请求过多（限流） |
| 500 | Internal Server Error | 服务器内部错误 |
| 503 | Service Unavailable | 服务不可用（如数据库断连） |

### 分页

列表端点支持分页：

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

**查询参数**：
- `page` - 页码（默认 1）
- `pageSize` - 每页数量（默认 20，最大 100）
- `sort` - 排序字段
- `order` - 排序方向（asc, desc）

---

## 认证系统 API

### 登录

管理员登录获取 Session。

```http
POST /api/v1/auth/login
```

**请求体**：
```json
{
  "username": "admin",
  "password": "your_password"
}
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123...",
    "user": {
      "id": 1,
      "username": "admin"
    },
    "expiresAt": "2024-03-01T12:00:00Z"
  }
}
```

**错误（401 Unauthorized）**：
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "用户名或密码错误"
  }
}
```

### 登出

结束当前 Session。

```http
POST /api/v1/auth/logout
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "已登出"
}
```

### 验证 Session

检查当前 Session 是否有效。

```http
GET /api/v1/auth/verify
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "valid": true,
    "user": {
      "id": 1,
      "username": "admin"
    }
  }
}
```

**错误（401 Unauthorized）**：
```json
{
  "success": false,
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Session 已过期"
  }
}
```

### 更新密码

更新管理员密码。

```http
PUT /api/v1/auth/password
```

**请求头**：
```
Cookie: session_id=<session_id>
Content-Type: application/json
```

**请求体**：
```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "密码已更新"
}
```

**错误（400 Bad Request）**：
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CURRENT_PASSWORD",
    "message": "当前密码错误"
  }
}
```

---

## 健康检查 API

### 服务健康检查

检查服务整体健康状态。

```http
GET /health
```

**响应（200 OK）**：
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2024-03-01T12:00:00Z",
  "services": {
    "database": "connected",
    "queue": "running",
    "agents": "idle"
  },
  "uptime": 12345
}
```

**响应（503 Service Unavailable）**：
```json
{
  "status": "degraded",
  "version": "1.0.0",
  "timestamp": "2024-03-01T12:00:00Z",
  "services": {
    "database": "disconnected",
    "queue": "stopped",
    "agents": "unavailable"
  },
  "errors": [
    "Database connection failed",
    "Worker is not running"
  ]
}
```

---

## OAuth 集成 API

### GitHub 授权

发起 GitHub OAuth 流程。

```http
GET /api/v1/oauth/github/authorize
```

**查询参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|--------|------|
| `redirect_uri` | string | 是 | 授权后重定向 URI |

**响应（302 Redirect）**：
重定向到 GitHub 授权页面。

### GitHub 回调

处理 GitHub OAuth 回调。

```http
GET /api/v1/oauth/github/callback
```

**查询参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|--------|------|
| `code` | string | 是 | GitHub 授权码 |
| `state` | string | 是 | CSRF 防护状态 |

**响应（302 Redirect）**：
重定向到前端并携带 Session。

### Gitee 授权

发起 Gitee OAuth 流程。

```http
GET /api/v1/oauth/gitee/authorize
```

**查询参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|--------|------|
| `redirect_uri` | string | 是 | 授权后重定向 URI |

### Gitee 回调

处理 Gitee OAuth 回调。

```http
GET /api/v1/oauth/gitee/callback
```

**查询参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|--------|------|
| `code` | string | 是 | Gitee 授权码 |
| `state` | string | 是 | CSRF 防护状态 |

### GitLab 授权

发起 GitLab OAuth 流程。

```http
GET /api/v1/oauth/gitlab/authorize
```

**查询参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|--------|------|
| `redirect_uri` | string | 是 | 授权后重定向 URI |

### GitLab 回调

处理 GitLab OAuth 回调。

```http
GET /api/v1/oauth/gitlab/callback
```

**查询参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|--------|------|
| `code` | string | 是 | GitLab 授权码 |
| `state` | string | 是 | CSRF 防护状态 |

### 获取安装列表

获取所有已授权的平台安装。

```http
GET /api/v1/oauth/installations
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "platform": "github",
      "account": "username",
      "repositoryCount": 5,
      "createdAt": "2024-01-01T00:00:00Z",
      "expiresAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### 断开 OAuth 连接

移除已授权的平台连接。

```http
DELETE /api/v1/oauth/installations/{id}
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 安装记录 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "已断开连接"
}
```

### 刷新 OAuth Token

刷新过期的 OAuth Token。

```http
POST /api/v1/oauth/refresh
```

**请求头**：
```
Cookie: session_id=<session_id>
Content-Type: application/json
```

**请求体**：
```json
{
  "platform": "github"
}
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "refreshedAt": "2024-03-01T12:00:00Z",
    "expiresAt": "2025-03-01T12:00:00Z"
  }
}
```

---

## 仓库管理 API

### 获取仓库列表

获取所有已连接的仓库。

```http
GET /api/v1/repositories
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**查询参数**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `platform` | string | - | 筛选平台（github, gitee, gitlab） |
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页数量 |

**响应（200 OK）**：
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "platform": "github",
      "owner": "owner",
      "repo": "repo",
      "url": "https://github.com/owner/repo",
      "isConnected": true,
      "webhookEnabled": true,
      "lastAnalysisAt": "2024-03-01T10:00:00Z",
      "analysisCount": 10
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

### 获取仓库详情

获取指定仓库的详细信息。

```http
GET /api/v1/repositories/{id}
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 仓库 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "platform": "github",
    "owner": "owner",
    "repo": "repo",
    "url": "https://github.com/owner/repo",
    "defaultBranch": "main",
    "webhookEnabled": true,
    "webhookUrl": "https://your-domain.com/webhook/github",
    "lastAnalysisAt": "2024-03-01T10:00:00Z",
    "analysisCount": 10
  }
}
```

### 同步仓库

手动触发仓库同步和分析。

```http
POST /api/v1/repositories/{id}/sync
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 仓库 ID |

**请求头**：
```
Cookie: session_id=<session_id>
Content-Type: application/json
```

**请求体**：
```json
{
  "force": false
}
```

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "同步任务已提交",
  "data": {
    "jobId": "123",
    "status": "pending"
  }
}
```

### 断开仓库

断开并移除仓库连接。

```http
DELETE /api/v1/repositories/{id}
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 仓库 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "仓库已断开"
}
```

---

## 作业队列 API

### 获取作业列表

获取所有作业的状态。

```http
GET /api/v1/jobs
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**查询参数**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `status` | string | - | 筛选状态（pending, processing, completed, failed） |
| `platform` | string | - | 筛选平台 |
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页数量 |

**响应（200 OK）**：
```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "type": "code-review",
      "platform": "github",
      "owner": "owner",
      "repo": "repo",
      "prNumber": 42,
      "status": "processing",
      "progress": 45,
      "stage": "review_agent",
      "attempts": 1,
      "createdAt": "2024-03-01T10:00:00Z",
      "startedAt": "2024-03-01T10:05:00Z",
      "estimatedDuration": 600
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 获取作业详情

获取指定作业的详细信息。

```http
GET /api/v1/jobs/{id}
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 作业 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "id": "123",
    "type": "code-review",
    "platform": "github",
    "owner": "owner",
    "repo": "repo",
    "prNumber": 42,
    "title": "Fix memory leak in auth module",
    "status": "completed",
    "progress": 100,
    "stage": "completed",
    "attempts": 1,
    "payload": {
      "prUrl": "https://github.com/owner/repo/pull/42",
      "branch": "feature/fix-memory"
      "baseBranch": "main"
    },
    "result": {
      "commentsCount": 5,
      "filesReviewed": 12,
      "issuesFound": 8
    },
    "createdAt": "2024-03-01T10:00:00Z",
    "startedAt": "2024-03-01T10:05:00Z",
    "completedAt": "2024-03-01T10:15:00Z",
    "duration": 600,
    "error": null
  }
}
```

### 重试失败作业

手动重试失败的作业。

```http
POST /api/v1/jobs/{id}/retry
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 作业 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "作业已重新提交到队列",
  "data": {
    "jobId": "123",
    "status": "pending"
  }
}
```

### 取消作业

取消待处理的作业。

```http
DELETE /api/v1/jobs/{id}
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 作业 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "作业已取消"
}
```

### 获取队列统计

获取作业队列统计信息。

```http
GET /api/v1/jobs/stats
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "total": 1000,
    "pending": 5,
    "processing": 1,
    "completed": 950,
    "failed": 44,
    "successRate": "95.6%",
    "avgDuration": 480,
    "totalProcessingTime": 76000
  }
}
```

---

## 分析历史 API

### 获取分析记录

获取 PR 审查分析历史记录。

```http
GET /api/v1/analyses
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**查询参数**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `repositoryId` | number | - | 筛选仓库 ID |
| `platform` | string | - | 筛选平台 |
| `status` | string | - | 筛选状态 |
| `startDate` | string | - | 开始日期（ISO 8601） |
| `endDate` | string | - | 结束日期（ISO 8601） |
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页数量 |

**响应（200 OK）**：
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "repositoryId": 5,
      "platform": "github",
      "owner": "owner",
      "repo": "repo",
      "prNumber": 42,
      "prTitle": "Fix memory leak",
      "prUrl": "https://github.com/owner/repo/pull/42",
      "status": "completed",
      "commentsCount": 5,
      "filesReviewed": 12,
      "issuesFound": {
        "critical": 2,
        "high": 3,
        "medium": 2,
        "low": 1
      },
      "duration": 600,
      "createdAt": "2024-03-01T10:00:00Z",
      "completedAt": "2024-03-01T10:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### 获取分析详情

获取指定分析的完整详情。

```http
GET /api/v1/analyses/{id}
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 分析 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "repository": {
      "id": 5,
      "platform": "github",
      "owner": "owner",
      "repo": "repo"
    },
    "prNumber": 42,
    "prTitle": "Fix memory leak",
    "prUrl": "https://github.com/owner/repo/pull/42",
    "status": "completed",
    "context": {
      "summary": "这是一个修复内存泄漏的 PR...",
      "files": 12,
      "functions": 45,
      "duration": 180
    },
    "review": {
      "summary": "代码整体质量良好...",
      "comments": [
        {
          "file": "src/auth.js",
          "line": 45,
          "severity": "high",
          "message": "潜在内存泄漏：未释放 token",
          "suggestion": "添加 token.release() 调用"
        }
      ]
    },
    "duration": 600,
    "createdAt": "2024-03-01T10:00:00Z",
    "completedAt": "2024-03-01T10:15:00Z"
  }
}
```

---

## 监控和状态 API

### 内存状态报告

获取系统内存使用情况。

```http
GET /api/v1/status/memory
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "total": 2147483648,
    "used": 1207959552,
    "available": 939524096,
    "percentage": 56.3,
    "swap": {
      "total": 2147483648,
      "used": 524288000,
      "available": 1623195648,
      "percentage": 2.4
    },
    "processes": [
      {
        "pid": 1234,
        "name": "node",
        "memory": 199229440,
        "percentage": 9.3
      },
      {
        "pid": 5678,
        "name": "python",
        "memory": 268435456,
        "percentage": 12.5
      }
    ],
    "warningThreshold": 80,
    "criticalThreshold": 95,
    "status": "normal"
  }
}
```

### 完整资源状态

获取完整的系统资源使用情况。

```http
GET /api/v1/status/resources
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "cpu": {
      "usage": 25.3,
      "cores": 2,
      "loadAverage": [0.45, 0.52, 0.48]
    },
    "memory": {
      "total": 2147483648,
      "used": 1207959552,
      "available": 939524096,
      "percentage": 56.3
    },
    "disk": {
      "total": 536870912000,
      "used": 21474836480,
      "available": 32202173520,
      "percentage": 40.0
    },
    "queue": {
      "pending": 5,
      "processing": 1,
      "completed": 100,
      "failed": 3
    },
    "agents": {
      "context": {
        "status": "idle",
        "lastUsedAt": "2024-03-01T10:15:00Z"
      },
      "review": {
        "status": "running",
        "startedAt": "2024-03-01T10:20:00Z",
        "currentJob": "123"
      }
    }
  }
}
```

### Prometheus 指标

获取 Prometheus 格式的系统指标。

```http
GET /metrics
```

**响应（200 OK，text/plain）**：
```
# HELP
# TYPE codagraph_jobs_total counter
codagraph_jobs_total Total number of jobs

# TYPE codagraph_jobs_created gauge
codagraph_jobs_created Number of jobs created in the last hour

# TYPE codagraph_memory_usage_bytes gauge
codagraph_memory_usage_bytes Current memory usage in bytes

# TYPE codagram_queue_length gauge
codagram_queue_length Current queue length

codagraph_jobs_total{status="pending"} 5
codagraph_jobs_total{status="processing"} 1
codagraph_jobs_total{status="completed"} 100
codagraph_jobs_total{status="failed"} 3
codagraph_memory_usage_bytes 1207959552
codagram_queue_length 6
```

---

## 备份和恢复 API

### 创建备份

手动创建数据库备份。

```http
POST /api/v1/backup
```

**请求头**：
```
Cookie: session_id=<session_id>
Content-Type: application/json
```

**请求体**：
```json
{
  "description": "升级前的备份",
  "include": ["database", "logs"]
}
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "backupId": "backup-20240301-120000",
    "path": "/opt/codagraph-lite/backups/backup-20240301-120000.tar.gz",
    "size": 52428800,
    "createdAt": "2024-03-01T12:00:00Z"
  }
}
```

### 获取备份列表

获取所有备份文件列表。

```http
GET /api/v1/backups
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**响应（200 OK）**：
```json
{
  "success": true,
  "data": [
    {
      "backupId": "backup-20240301-120000",
      "path": "/opt/codagraph-lite/backups/backup-20240301-120000.tar.gz",
      "size": 52428800,
      "createdAt": "2024-03-01T12:00:00Z"
    },
    {
      "backupId": "backup-20240228-120000",
      "path": "/opt/codagraph-lite/backups/backup-20240228-120000.tar.gz",
      "size": 52428800,
      "createdAt": "2024-02-28T12:00:00Z"
    }
  ]
}
```

### 恢复备份

从备份文件恢复数据。

```http
POST /api/v1/restore
```

**请求头**：
```
Cookie: session_id=<session_id>
Content-Type: multipart/form-data
```

**请求体**：
| 字段 | 类型 | 必需 | 说明 |
|------|------|--------|------|
| `file` | file | 是 | 备份文件 |
| `confirm` | string | 是 | 确认短语（如 "RESTORE"） |

**响应（200 OK）**：
```json
{
  "success": true,
  "message": "备份恢复成功，服务将重启",
  "data": {
    "backupId": "backup-20240301-120000",
    "restoredAt": "2024-03-01T13:00:00Z"
  }
}
```

---

## Webhook API（内部）

### GitHub Webhook

处理来自 GitHub 的 Webhook 事件。

```http
POST /webhook/github
```

**请求头验证**：
- `X-Hub-Signature-256` - HMAC 签名
- `X-GitHub-Event` - 事件类型
- `X-GitHub-Delivery` - 交付 ID

**事件类型**：
- `pull_request` - PR 打开、更新、关闭
- `push` - 代码推送

### Gitee Webhook

处理来自 Gitee 的 Webhook 事件。

```http
POST /webhook/gitee
```

**请求头验证**：
- `X-Gitee-Token` - Token 验证
- `X-Gitee-Timestamp` - 时间戳
- `X-Gitee-Event` - 事件类型

### GitLab Webhook

处理来自 GitLab 的 Webhook 事件。

```http
POST /webhook/gitlab
```

**请求头验证**：
- `X-Gitlab-Token` - Token 验证
- `X-Gitlab-Event` - 事件类型

---

## 错误码参考

| 错误码 | HTTP 状态 | 说明 |
|---------|-----------|------|
| `INVALID_REQUEST` | 400 | 请求格式错误 |
| `INVALID_CREDENTIALS` | 401 | 认证凭据无效 |
| `SESSION_EXPIRED` | 401 | Session 已过期 |
| `SESSION_NOT_FOUND` | 401 | Session 不存在 |
| `UNAUTHORIZED` | 403 | 无权限访问 |
| `RESOURCE_NOT_FOUND` | 404 | 资源不存在 |
| `RESOURCE_CONFLICT` | 409 | 资源冲突 |
| `VALIDATION_ERROR` | 422 | 数据验证失败 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求过多 |
| `INTERNAL_ERROR` | 500 | 内部服务器错误 |
| `DATABASE_ERROR` | 500 | 数据库错误 |
| `EXTERNAL_API_ERROR` | 500 | 外部 API 错误 |
| `AGENT_TIMEOUT` | 500 | Agent 超时 |
| `LLM_API_ERROR` | 500 | LLM API 错误 |
| `CODE_CONTEXT_ENGINE_ERROR` | 500 | Code Context Engine runtime 错误 |

---

## 相关文档

- [配置指南](configuration.md) - API 配置相关说明
- [部署指南](deployment.md) - API 部署相关说明
- [故障排除](troubleshooting.md) - API 错误排查
