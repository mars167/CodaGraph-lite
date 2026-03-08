## Why

CodaGraph is currently designed for multi-tenant SaaS deployment with heavy infrastructure dependencies (PostgreSQL, Redis, Bull Queue), making it complex and costly to deploy for individual users or small companies on private cloud servers. There's a significant opportunity to create a lightweight, simplified version that maintains core code review functionality while dramatically reducing deployment complexity and resource requirements.

## What Changes

- Create new project at `../CodaGraph-lite` with simplified architecture
- **BREAKING**: Remove PostgreSQL, replace with SQLite for all data persistence
- **BREAKING**: Remove Redis, replace with in-memory or SQLite-based caching
- **BREAKING**: Remove Bull Queue, implement SQLite-based job queue or similar mechanism
- **BREAKING**: Remove multi-user management system, implement single admin account model
- **BREAKING**: Consolidate Python agent services (Context Agent, Review Agent) into backend or maintain as separate lightweight modules
- Reduce from 5 services (web, server, context-agent, review-agent, code-context-engine) to 2 services: Frontend and Backend
- Keep GitHub/Gitee/GitLab OAuth account association logic unchanged
- Keep core code review functionality (Code Context Engine runtime, semantic analysis, PR review)
- Keep agent services integration (simplified deployment model)

## Capabilities

### New Capabilities

- `sqlite-database`: SQLite-based data persistence layer replacing PostgreSQL
- `sqlite-job-queue`: SQLite-based job queue replacing Bull Queue
- `single-admin-auth`: Single administrator account authentication and management
- `simplified-architecture`: Two-service architecture (Frontend + Backend) with integrated agent services
- `lightweight-deployment`: Simplified deployment configuration without Docker Compose dependencies
- `resource-optimization`: Memory and concurrency optimization for stable operation on 2u2g (2核2GB) servers

### Modified Capabilities

- `oauth-integration`: OAuth integration will be simplified for single admin account usage
- `code-review-pipeline`: Code review pipeline will be adapted to use SQLite-based job queue and in-memory caching

## Impact

**Affected Code:**
- Server: Complete rewrite of database layer (PostgreSQL → SQLite)
- Server: Job queue implementation (Bull → SQLite-based)
- Server: Authentication system (multi-user → single admin)
- Server: Service architecture (Express backend + Python agents)
- Frontend: Dashboard UI simplified for single admin view

**Affected Dependencies:**
- Remove: `pg`, `bull`, `bull-board`, `ioredis`, `@prisma/client` (PostgreSQL)
- Add: `better-sqlite3` or similar SQLite driver
- Keep: Next.js, Express, Code Context Engine runtime, Python agent services

**Affected Systems:**
- Infrastructure: No PostgreSQL/Redis containers required
- Deployment: Simplified to two services instead of five
- Configuration: Reduced environment variables and configuration files
- Monitoring: Simplified logging and monitoring without Bull Board
