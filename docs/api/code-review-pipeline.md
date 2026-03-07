# 代码审查管道 API 文档

本文档说明 CodaGraph-lite 代码审查管道相关的 API 端点。

## 目录

- [概述](#概述)
- [PR 事件 API](#pr-事件-api)
- [作业提交 API](#作业提交-api)
- [分析结果 API](#分析结果-api)
- [审查评论 API](#审查评论-api)
- [进度跟踪 API](#进度跟踪-api)
- [作业状态 API](#作业状态-api)

---

## 概述

代码审查管道 API 用于：
- 接收 Git 平台（GitHub/Gitee/GitLab）的 Webhook 事件
- 将 PR 审查任务提交到作业队列
- 获取分析进度和结果
- 获取审查评论
- 管理作业状态

**基础路径**: `/api/v1`

**认证方式**: Session-based（参考 [认证系统 API](../../api.md#认证系统-api)）

---

## PR 事件 API

### 接收 GitHub Webhook

```http
POST /webhook/github
```

**请求头**：
```
Content-Type: application/json
X-Hub-Signature-256: <signature_hex>
X-GitHub-Event: pull_request
X-GitHub-Delivery: <delivery_id>
```

**请求体**：
```json
{
  "action": "opened",
  "repository": {
    "id": 123456,
    "name": "test-repo",
    "full_name": "owner/test-repo",
    "private": false
  },
  "pull_request": {
    "number": 42,
    "title": "Add new feature",
    "state": "open",
    "user": {
      "login": "testuser",
      "id": 456
    },
    "head": {
      "sha": "abc123def",
      "ref": "refs/heads/main"
    },
    "base": {
      "ref": "refs/heads/main",
      "sha": "def456abc"
    },
    "html_url": "https://github.com/owner/test-repo/pull/42",
    "diff_url": "https://github.com/owner/test-repo/pull/42.diff",
    "patch_url": "https://github.com/owner/test-repo/pull/42.patch",
    "commits_url": "https://github.com/owner/test-repo/pull/42/commits"
    },
    "created_at": "2024-03-01T10:00:00Z",
    "updated_at": "2024-03-01T10:05:00Z"
  },
  "sender": {
    "login": "testuser",
    "id": 456,
    "type": "User"
    }
  },
  "installation": {
    "id": 123,
    "node_id": "codagraph-lite-server"
  }
}
```

**成功响应（200 OK）**：
```json
{
  "success": true,
  "message": "Webhook 已接收"
}
```

**错误响应（422 Unprocessable Entity）**：
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PLATFORM",
    "message": "不支持的平台"
  }
}
```

**错误响应（401 Unauthorized）**：
```json
{
  "success": false,
  "error": {
    "code": "WEBHOOK_SIGNATURE_INVALID",
    "message": "Webhook 签名验证失败"
  }
}
```

---

### 接收 Gitee Webhook

```http
POST /webhook/gitee
```

**请求头**：
```
Content-Type: application/json
X-Gitee-Token: <token>
X-Gitee-Timestamp: <timestamp>
X-Gitee-Event: Pull Request
```

**请求体**：
```json
{
  "action": "opened",
  "repository": {
    "id": 123456,
    "name": "test-repo",
    "path": "testuser/test-repo",
    "path_namespace": 0,
    "url": "https://gitee.com/testuser/test-repo.git"
    "default_branch": "main"
    "visibility_level": 0
    "owner": {
      "id": 123,
      "login": "testuser",
      "name": "Test User"
    },
    "html_url": "https://gitee.com/testuser/test-repo/pulls/42",
    "diff_url": "https://gitee.com/testuser/test-repo/pulls/42.diff",
    "patch_url": "https://gitee.com/testuser/test-repo/pulls/42.patch",
    "created_at": "2024-03-01T10:00:00Z",
    "updated_at": "2024-03-01T10:05:00Z"
  },
  "pull_request": {
    "id": 42,
    "title": "Add new feature",
    "state": "open",
    "user": {
      "login": "testuser",
      "id": 456
    },
    "head": {
      "sha": "abc123def",
      "ref": "refs/heads/main"
    },
    "base": {
      "ref": "refs/heads/main",
      "sha": "def456abc"
    },
    "html_url": "https://gitee.com/testuser/test-repo/pull/42",
    "diff_url": "https://gitee.com/testuser/test-repo/pull/42.diff",
    "patch_url": "https://gitee.com/testuser/test-repo/pull/42.patch",
    "created_at": "2024-03-01T10:00:00Z",
    "updated_at": "2024-03-01T10:05:00Z"
  },
  "sender": {
    "login": "testuser",
      "id": 456,
      "type": "User"
    }
  },
  "installation": {
    "id": 123,
    "node_id": "codagraph-lite-server"
    }
}
}
```

---

### 接收 GitLab Webhook

```http
POST /webhook/gitlab
```

**请求头**：
```
Content-Type: application/json
X-Gitlab-Token: <token>
X-Gitlab-Event: Merge Request Hook
```

**请求体**：
```json
{
  "object_kind": "merge_request",
  "event_type": "merge_request",
  "project": {
    "id": 123456,
    "name": "test-repo",
    "path_with_namespace": "testuser/test-repo",
    "web_url": "https://gitlab.com/testuser/test-repo",
    "description": "Project description",
    "default_branch": "main"
    "visibility_level": 0
  },
  "object_attributes": {
    "iid": "abc123def456",
    "url": "https://gitlab.com/testuser/test-repo/-/merge_requests/42",
    "state": "opened",
    "source_branch": "feature/add-new-feature",
    "target_branch": "main",
    "author": {
      "id": 456,
      "name": "testuser",
      "username": "testuser",
      "email": "test@example.com"
    },
    "title": "Add new feature",
    "description": "Feature description",
    "created_at": "2024-03-01T10:00:00Z",
    "updated_at": "2024-03-01T10:05:00Z",
    "assignee_ids": [123, 456],
    "reviewers": []
  },
  "repository": {
    "id": 123456,
    "name": "test-repo",
    "url": "https://gitlab.com/testuser/test-repo.git",
    "visibility": "public",
    "ssh_url_to_repo": "git@gitlab.com:testuser/test-repo.git"
  },
  "changes": [],
    "actions": []
  }
}
```

---

## 作业提交 API

### 提交 PR 审查作业

```http
POST /api/v1/jobs/submit
```

**请求头**：
```
Content-Type: application/json
Cookie: session_id=<session_id>
```

**请求体**：
```json
{
  "platform": "github",
  "owner": "owner",
  "repo": "repo",
  "pr_number": 42,
  "pr_url": "https://github.com/owner/repo/pull/42",
  "pr_title": "Add new feature",
  "action": "opened",
  "head_sha": "abc123def",
  "base_sha": "def456abc"
  "diff_url": "https://github.com/owner/repo/pull/42.diff"
}
```

**成功响应（201 Created）**：
```json
{
  "success": true,
  "data": {
    "job_id": 123
  },
  "message": "作业已提交到队列"
}
```

**错误响应（401 Unauthorized）**：
```json
{
  "success": false,
  "error": {
    "code": "NOT_AUTHENTICATED",
    "message": "未认证或 Session 已过期"
  }
}
```

**错误响应（422 Unprocessable Entity）**：
```json
{
  "success": false,
  "error": {
    "code": "REPOSITORY_NOT_FOUND",
    "message": "仓库未连接"
  }
}
```

---

## 分析结果 API

### 获取分析详情

```http
GET /api/v1/analyses/{id}
```

**路径参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | number | 是 | 分析记录 ID |

**请求头**：
```
Cookie: session_id=<session_id>
```

**成功响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "repository_id": 5,
    "platform": "github",
    "owner": "owner",
    "repo": "repo",
    "pr_number": 42,
    "pr_title": "Add new feature",
    "status": "completed",
    "progress": 100,
    "stage": "completed",
    "context": {
      "summary": "这是一个关于 PR 的上下文信息...",
      "files": 12,
      "functions": 45
      "duration": 180
    },
    "review": {
      "summary": "代码整体质量良好...",
      "comments_count": 5,
      "files_reviewed": 10
      "issues_found": {
        "critical": 2,
        "high": 3,
        "medium": 2,
        "low": 1
      },
      "duration": 420
    },
    "duration": 600,
    "comments": [
      {
        "file": "src/auth.ts",
        "line": 45,
        "severity": "high",
        "message": "潜在内存泄漏...",
        "suggestion": "添加 token.release() 调用"
      }
    ],
    "created_at": "2024-03-01T10:00:00Z",
    "started_at": "2024-03-01T10:05:00Z",
    "completed_at": "2024-03-01T10:15:00Z"
  }
}
```

**错误响应（404 Not Found）**：
```json
{
  "success": false,
  "error": {
    "code": "ANALYSIS_NOT_FOUND",
    "message": "分析记录不存在"
  }
}
```

---

### 获取分析列表

```http
GET /api/v1/analyses
```

**请求头**：
```
Cookie: session_id=<session_id>
```

**查询参数**：
| 参数 | 默认值 | 说明 |
|------|---------|------|------|
| `repository_id` | - | 按仓库 ID 筛选 |
| `platform` | - | 按平台（github, gitee, gitlab） |
| `status` | - | 状态筛选（pending, processing, completed, failed） |
| `page` | 1 | 页码 |
| `pageSize` | 20 | 每页数量 |

**成功响应（200 OK）**：
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

## 审查评论 API

### 获取审查评论

```http
GET /api/v1/analyses/{id}/comments
```

**成功响应（200 OK）**：
```json
{
  "success": true,
  "data": [
    {
      "file": "src/auth.ts",
      "line": 45,
      "severity": "high",
      "message": "潜在内存泄漏",
      "suggestion": "添加 token.release() 调用"
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

---

## 进度跟踪 API

### 获取分析进度

```http
GET /api/v1/jobs/{id}/progress
```

**路径参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | number | 是 | 作业 ID |

**成功响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "job_id": 123,
    "progress": 45,
    "stage": "context_agent",
    "stage_detail": "正在收集文件结构...",
    "started_at": "2024-03-01T10:05:00Z",
    "estimated_duration": 600
  },
  "timeline": [
    {
      "timestamp": "2024-03-01T10:05:00Z",
      "stage": "context_agent",
      "detail": "开始索引代码"
    }
  ]
}
```

**错误响应（404 Not Found）**：
```json
{
  "success": false,
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "作业不存在"
  }
}
```

---

## 作业状态 API

### 获取作业列表

```http
GET /api/v1/jobs
```

**查询参数**：
| 参数 | 默认值 | 说明 |
|------|---------|------|------|
| `status` | - | 状态筛选（pending, processing, completed, failed） |
| `page` | 1 | 页码 |
| `pageSize` | 20 | 每页数量 |
| `platform` | - | 平台筛选 |

**成功响应（200 OK）**：
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### 获取作业详情

```http
GET /api/v1/jobs/{id}
```

参考 [分析结果 API](#获取分析详情-api) 中的响应格式。

### 重试失败作业

```http
POST /api/v1/jobs/{id}/retry
```

**成功响应（200 OK）**：
```json
{
  "success": true,
  "data": {
    "job_id": 123,
    "status": "pending"
  },
  "message": "作业已重新提交到队列"
}
```

### 取消作业

```http
DELETE /api/v1/jobs/{id}
```

**成功响应（200 OK）**：
```json
{
  "success": true,
  "message": "作业已取消"
}
```

---

## 通用规范

### 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `INVALID_REQUEST` | 400 | 请求参数错误 |
| `UNAUTHORIZED` | 401 | 未认证 |
| `NOT_AUTHENTICATED` | 401 | Session 无效 |
| `REPOSITORY_NOT_FOUND` | 404 | 仓库不存在 |
| `JOB_NOT_FOUND` | 404 | 作业不存在 |
| `ANALYSIS_NOT_FOUND` | 404 | 分析记录不存在 |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | Webhook 签名无效 |
| `INVALID_PLATFORM` | 422 | 不支持的平台 |

### 分页参数

| 参数 | 默认值 | 说明 |
|------|---------|------|
| `page` | 1 | 页码（从 1 开始） |
| `pageSize` | 20 | 每页数量（最大 100） |
| `sort` | - | 排序字段 |
| `order` | - | 排序方向（asc, desc） |

---

## 平台特定格式

### GitHub 审查评论格式

GitHub 支持 Markdown 格式的评论：

```markdown
## 审查建议：潜在内存泄漏

**文件**: `src/auth.ts:45`

**位置**: 第 45 行

**建议**：
添加 `token.release()` 调用来释放内存。

**行内代码**：
```typescript
// 当前代码
const token = req.session.token;
```

**修改后的代码**：
```typescript
// 修复内存泄漏
const token = req.session.token;
token.release(); // 释放 token
```

### Gitee 审查评论格式

Gitee 支持 Markdown 格式的评论，格式类似 GitHub。

### GitLab 审查评论格式

GitLab 支持 Markdown 格式的评论，但建议使用行内 Diff 格式：

```diff
```diff
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -45,7 +1,6
- const token = req.session.token;
+ const token = req.session.token;
 token.release();
```

# 审查建议
建议添加 `token.release()` 调用。
```

---

## 相关文档

- [配置指南](configuration.md) - 配置说明
- [API 文档](api.md) - 完整 API 参考
- [架构文档](architecture.md) - 系统架构理解