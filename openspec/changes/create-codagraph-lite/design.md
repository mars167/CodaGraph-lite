## Context

CodaGraph currently uses a complex 5-service architecture with PostgreSQL, Redis, and Bull Queue designed for multi-tenant SaaS deployment. This architecture is overkill for individual users or small companies who want to deploy on private cloud servers with limited resources. The goal is to create CodaGraph-lite, a simplified version that maintains core code review functionality while dramatically reducing deployment complexity and infrastructure dependencies.

Current state constraints:
- Requires Docker Compose orchestration for PostgreSQL and Redis
- Multi-user authentication and permission system (overkill for single admin)
- Bull Queue for job processing (requires Redis)
- 5 separate services to manage and monitor
- Complex configuration with many environment variables

Stakeholders:
- Individual developers wanting personal code review tools
- Small companies wanting self-hosted review tools on private cloud
- DevOps teams with limited infrastructure resources

## Goals / Non-Goals

**Goals:**
- Create lightweight, single-admin version deployable on minimal infrastructure
- Reduce service count from 5 to 2 (Frontend + Backend)
- Replace PostgreSQL with SQLite for all data persistence
- Replace Redis/Bull Queue with SQLite-based job queue
- Maintain core code review functionality (Code Context Engine, semantic analysis, PR review)
- Keep OAuth integration for GitHub/Gitee/GitLab (simplified for single admin)
- Simplify deployment process (no Docker Compose required)
- Reduce deployment time and operational complexity
- **Support stable operation on 2u2g (2核2GB) servers with concurrent PR review**

**Non-Goals:**
- Support for multiple users/tenants
- High-concurrency job processing (SQLite limitations acceptable)
- Real-time job monitoring UI (Bull Board removal)
- Distributed system capabilities (single instance deployment)
- Horizontal scaling capabilities
- Advanced permission/rbac system
- Simultaneous processing of multiple PRs (single PR at a time is sufficient)

## Decisions

### 1. SQLite as Primary Database

**Decision:** Use SQLite with `better-sqlite3` driver for all data persistence.

**Rationale:**
- Zero configuration, single-file database
- Sufficient performance for single-admin workload
- No separate database server required
- Excellent ACID compliance
- Minimal memory footprint (~500KB for typical CodaGraph-lite workload)

**Alternatives Considered:**
- PostgreSQL: Too heavy for lightweight deployment, requires separate container
- MySQL: Similar overhead to PostgreSQL
- Other SQLite drivers (node-sqlite3, sql.js): `better-sqlite3` is fastest, synchronous API, well-maintained

### 2. SQLite-based Job Queue (No Redis/Bull)

**Decision:** Implement custom SQLite-based job queue using `better-sqlite3` with polling-based worker.

**Rationale:**
- Eliminates Redis dependency
- SQLite transactions ensure job processing guarantees
- Polling interval of 1-5 seconds is acceptable for single-admin workload
- Simpler deployment without separate message queue

**Architecture:**
- Jobs table: `id, type, payload, status, attempts, error, created_at, started_at, completed_at`
- Worker polls for pending jobs, updates status in transaction
- Retry logic with exponential backoff (max 3 attempts)
- Dead letter queue for failed jobs

**Alternatives Considered:**
- Keep Bull Queue: Requires Redis, too heavy
- In-memory queue: No persistence, jobs lost on restart
- External job queues (RabbitMQ, SQS): Too complex, additional infrastructure

### 3. Two-Service Architecture (Frontend + Backend)

**Decision:** Consolidate into 2 services: Frontend (Next.js) and Backend (Express + Python agents).

**Rationale:**
- Reduces deployment complexity from 5 to 2 services
- Backend can spawn Python agent processes as needed
- Simplifies configuration and monitoring
- Still maintains separation of concerns

**Backend Architecture:**
- Express.js HTTP server
- gRPC clients to Python agent services (or subprocess execution)
- SQLite database layer
- Job queue worker (integrated)
- OAuth authentication (single admin)

**Alternatives Considered:**
- Keep 5 services: Too complex for target users
- Single service: Too tightly coupled, hard to maintain
- 3 services (Frontend, Backend, Agents): Still more complexity than needed

### 4. Single Admin Account Model

**Decision:** Hardcoded or configuration-based single admin account, no user management UI.

**Rationale:**
- Eliminates multi-user complexity
- Simplifies OAuth flow (admin authorizes platforms for themselves)
- No need for user registration/login pages
- Database schema simplified (no User table, just Installation)

**Implementation:**
- Admin credentials in environment variables (username/password) or SSH key
- Session-based authentication with in-memory storage
- OAuth tokens stored per platform (GitHub/Gitee/GitLab)

**Alternatives Considered:**
- Keep multi-user system: Overkill, adds unnecessary complexity
- No authentication: Security risk, OAuth tokens need protection

### 5. Python Agent Integration Options

**Decision:** Maintain Python agents as separate modules but integrate closely with backend. Two deployment options:

**Option A (Recommended):** Backend spawns Python agent processes via subprocess
- Execute `context-agent` and `review-agent` as subprocesses with gRPC
- Simple deployment (just need Python installed)
- Communication via localhost gRPC

**Option B (Fallback):** Python agents as separate services
- Still 2 services from perspective (Backend bundles agents)
- Or keep as separate processes started by backend

**Rationale for Option A:**
- Single backend process to manage
- Agents run on-demand, no resource waste when idle
- Simplifies deployment (no separate process management)

**2u2g Server Optimization:**
- **Critical:** Agents must NOT run as background daemons
- **Critical:** Spawn agents only when processing a job, terminate immediately after completion
- **Critical:** Limit to 1 active job at a time (serial processing)
- Agent processes are ephemeral: start → process → terminate → release memory

**Alternatives Considered:**
- Port agents to Node.js: Too much work, Python is better for AI services
- Keep as separate services: Adds deployment complexity, wastes memory when idle

### 6. OAuth Integration Simplification

**Decision:** Keep OAuth flow but simplify for single admin account.

**Changes:**
- Admin authorizes GitHub/Gitee/GitLab app once
- No multi-user authorization UI
- Single session for admin (no logout/login management)
- Tokens stored in SQLite `Installation` table (simplified)

**What Stays:**
- OAuth 2.0 flow implementation
- Platform-specific OAuth integration (GitHub, Gitee, GitLab)
- Webhook setup and handling
- Token refresh logic

**What Changes:**
- No user permission model (admin has full access)
- Simplified Installation model (one admin, multiple platforms)

### 8. Memory and Concurrency Optimization for 2u2g Servers

**Decision:** Implement strict memory limits and single-threaded job processing for 2u2g servers.

**Memory Budget Allocation (2GB total):**

| Component | Target Memory | Limit |
|-----------|--------------|-------|
| 操作系统 + 基础进程 | 400MB | Fixed |
| Next.js 前端服务 | 150-200MB | NODE_OPTIONS="--max-old-space-size=200" |
| Express 后端服务 | 150-200MB | NODE_OPTIONS="--max-old-space-size=200" |
| SQLite 数据库 | 50-100MB | cache_size=-2000 (2MB) |
| Python Context Agent | 200-300MB | Process limit |
| Python Review Agent | 200-300MB | Process limit |
| Code Context Engine runtime 索引 | 100-200MB | CODE_CONTEXT_ENGINE_MAX_MEMORY=256m |
| **Total (峰值)** | ~1350MB | < 2GB with swap |

**Configuration Requirements:**

```bash
# .env 必须配置项
NODE_OPTIONS=--max-old-space-size=200
WORKER_COUNT=1                    # 限制同时只处理1个任务
ENABLE_CONCURRENT_JOBS=false       # 禁用并发任务
CODE_CONTEXT_ENGINE_MAX_MEMORY=256m            # Code Context Engine 内存限制
SQLITE_CACHE_SIZE=-2000           # SQLite 缓存 2MB
PYTHON_MEMORY_LIMIT=300m           # Python 进程内存限制
ENABLE_SWAP_WARNING=true           # 启用 swap 警告
```

**Job Processing Strategy (Critical for 2u2g):**

1. **串行处理**：始终只有一个 job 在处理中
2. **Agent 生命周期**：
   - Job 开始 → 启动 Context Agent → 处理完成 → **立即终止** → 释放内存
   - 启动 Review Agent → 处理完成 → **立即终止** → 释放内存
   - Agent 不作为后台服务运行
3. **内存清理**：每个 job 完成后，主动调用 Python GC
4. **超时保护**：每个 agent 超时 5 分钟自动终止

**Rationale:**
- 2GB 内存非常紧张，必须严格控制峰值内存
- 串行处理保证任何时候只有 1 个 agent 在运行
- Agent 立即终止释放内存给后续任务
- 避免 OOM（内存溢出）导致系统崩溃
- 允许使用 swap 作为安全网（虽然会慢，但不会崩溃）

**Alternatives Considered:**
- 增加 server 配置到 4GB：更稳定，但用户明确要求 2u2g
- 使用云函数处理 agents：引入复杂度和延迟
- 放持并发处理：2GB 内存无法支持，会导致 OOM

### 7. Deployment Configuration

**Decision:** Single environment variable file, no Docker Compose.

**Configuration:**
- `.env` file for all settings
- Optional systemd service files or PM2 configuration
- No container orchestration required
- Optional Dockerfile for containerized deployment (single container)

**Why no Docker Compose:**
- Target users may not have Docker installed
- Simpler deployment with just Node.js and Python
- Containerization is optional, not required

## Risks / Trade-offs

### Risk 1: SQLite Performance Under Load
**Risk:** SQLite may become bottleneck with high job throughput
**Mitigation:**
- Use WAL mode for better concurrency
- Optimize queries with proper indexes
- Single-admin workload expected to be manageable
- Document expected limits (e.g., 10 jobs/minute)

### Risk 2: Job Queue Reliability Without Redis
**Risk:** Polling-based queue may have delays or missed jobs
**Mitigation:**
- Implement robust transaction handling
- Use SELECT FOR UPDATE to prevent race conditions
- Implement job timeouts and heartbeat monitoring
- Logging for failed jobs with detailed error context

### Risk 3: Security with Single Admin Model
**Risk:** No permission model, admin has unrestricted access
**Mitigation:**
- This is acceptable for target use case (personal/private cloud)
- Document security best practices (HTTPS, secure credentials)
- Add optional basic auth for additional protection
- Consider adding admin password hashing

### Risk 4: Python Agent Process Management
**Risk:** Subprocess management complexity, zombie processes
**Mitigation:**
- Use proper child process cleanup on shutdown
- Implement process timeout and monitoring
- Add health checks for agent processes
- Consider PM2 or similar for production

### Risk 5: Migration Path from CodaGraph
**Risk:** No migration path for existing CodaGraph users
**Mitigation:**
- Document that CodaGraph-lite is a separate project
- Create migration scripts for PostgreSQL → SQLite (optional)
- Consider export/import functionality for existing data

### Trade-off: No Real-time Job Monitoring
**Trade-off:** Removing Bull Board means no nice job monitoring UI
**Acceptable because:**
- Single admin can check logs directly
- Can implement simple job status API
- Admin can query database directly for job status
- Simplicity outweighs the monitoring benefit

### Trade-off: No Horizontal Scaling
**Trade-off:** Cannot scale horizontally (only single instance)
**Acceptable because:**
- Target workload is single admin, low concurrency
- SQLite file-level locks prevent true horizontal scaling anyway
- Vertical scaling is sufficient (add resources to single server)

### Risk 6: Memory Exhaustion on 2u2g Servers
**Risk:** 2GB memory may be insufficient during peak load, causing OOM kills
**Mitigation:**
- **Critical:** Implement strict memory limits for all processes (Node.js, Python)
- **Critical:** Serial job processing (never more than 1 agent running)
- **Critical:** Immediate agent termination after job completion
- **Critical:** SQLite cache limited to 2MB
- **Critical:** Node.js limited to 200MB per service
- Recommend enabling 2GB swap as safety net
- Implement memory monitoring and warnings
- Log memory usage before/after each job

### Risk 7: Performance Degradation with Swap
**Risk:** Using swap may cause significant performance degradation
**Mitigation:**
- Swap is emergency fallback, not primary memory
- Optimize to avoid swap usage during normal operation
- Monitor swap usage and alert if >100MB
- Document that swap usage = need more RAM
- Configure swappiness to 10 (prefer RAM over swap)

### Trade-off: Serial Processing Only
**Trade-off:** Can only process 1 PR at a time, no parallel processing
**Acceptable because:**
- Single admin use case typically doesn't need concurrent processing
- Serial processing is predictable and stable
- Reduces complexity and memory requirements
- Most PRs complete in 5-10 minutes, queue wait is acceptable
- Admin can monitor job queue status

### Risk 8: Agent Process Termination Race Conditions
**Risk:** Agent process may not terminate cleanly, leaving zombie processes
**Mitigation:**
- Implement SIGTERM handler for graceful shutdown
- Force kill (SIGKILL) after 5 second timeout
- Use process tree termination to kill child processes
- Monitor and log zombie process detection
- Add periodic zombie process cleanup job

## Migration Plan

### Phase 1: Setup (Day 1)
1. Create `../CodaGraph-lite` directory structure
2. Initialize projects (Next.js for Frontend, Express for Backend)
3. Set up SQLite database with schema migration system
4. Implement basic project structure

### Phase 2: Core Features (Days 2-5)
1. Implement SQLite database layer (schema, migrations, models)
2. Implement SQLite-based job queue
3. Migrate OAuth integration (simplified for single admin)
4. Integrate Python agents (subprocess approach)
5. Basic API endpoints for job submission and monitoring

### Phase 3: Frontend (Days 6-8)
1. Simplified dashboard UI for single admin
2. Repository management interface
3. Job status and review display
4. OAuth authorization flow UI

### Phase 4: Testing & Refinement (Days 9-10)
1. End-to-end testing of PR review pipeline
2. Performance testing with realistic workload
3. Documentation (installation, configuration, usage)
4. Bug fixes and refinement

### Rollback Strategy
- Keep CodaGraph as separate project, not modified
- No data to roll back (new project from scratch)
- Can always deploy full CodaGraph if needed

## Open Questions

1. **Agent Process Management**: Should we use PM2, systemd, or custom process management for Python agents?
   - **Tentative Decision**: PM2 for cross-platform compatibility
   - **For 2u2g**: Agents run as ephemeral subprocesses, not PM2-managed services

2. **Database Migration Path**: Should we provide migration scripts from CodaGraph to CodaGraph-lite?
   - **Tentative Decision**: Yes, but as separate tool/feature after initial release

3. **Containerization**: Should we provide Dockerfile even though Docker Compose is not required?
   - **Tentative Decision**: Yes, optional Dockerfile for users who prefer containers

4. **Admin Authentication**: Should admin auth be session-based or JWT-based?
   - **Tentative Decision**: Session-based with in-memory storage (simpler, sufficient)

5. **Job Queue Polling Interval**: What polling interval is optimal for job queue?
   - **Tentative Decision**: 2 seconds, configurable via environment variable

6. **Memory Swap Strategy**: Should swap be auto-configured or documented as manual step?
   - **Tentative Decision**: Document as manual step, but provide setup script
   - Provide warning if no swap detected on 2GB server

7. **Agent Timeout Values**: What timeout values are appropriate for context and review agents?
   - **Tentative Decision**: Context agent 5 minutes, Review agent 10 minutes
   - Configurable via environment variables (AGENT_TIMEOUT_*)

8. **Memory Monitoring**: Should we include built-in memory monitoring and alerts?
   - **Tentative Decision**: Yes, simple endpoint `/api/status/memory` and log warnings
