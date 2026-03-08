# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodaGraph-lite is a lightweight code review platform designed for individual developers or small teams deploying on resource-constrained servers (optimized for 2u2g - 2 core, 2GB RAM). It's a simplified version of CodaGraph, reducing from 5 services to 2 (Frontend + Backend) and replacing PostgreSQL/Redis with SQLite.

**Core Features:**
- Smart code review via Code Context Engine integration
- Multi-platform support: GitHub, Gitee, GitLab
- OAuth 2.0 authentication
- SQLite-based job queue (no Redis)
- Single-admin authentication model
- Python agents (Context Agent + Review Agent) via gRPC

## Project Structure

```
codagraph-lite/
├── web/                    # Next.js 14 Frontend (Port 3000)
│   ├── app/               # App Router pages
│   ├── components/        # React components
│   ├── contexts/          # React contexts (auth state)
│   ├── lib/               # API client, utilities
│   └── types/             # TypeScript types
├── server/                 # Express.js Backend (Port 7900)
│   ├── src/
│   │   ├── agent/         # Python agent subprocess management
│   │   ├── auth/          # Session-based authentication
│   │   ├── database/      # SQLite + better-sqlite3
│   │   ├── jobs/          # SQLite job queue
│   │   ├── middleware/    # Express middleware
│   │   ├── models/        # Data models (Admin, Job, Repository, etc.)
│   │   ├── oauth/         # OAuth 2.0 handlers
│   │   ├── routes/        # API routes (auth, jobs, webhook, admin)
│   │   ├── webhook/       # Webhook handlers + signature validation
│   │   └── utils/         # Logger, config
│   └── tests/             # Jest tests
├── context-agent/          # Python Context Agent (gRPC Port 50052)
│   ├── src/
│   └── tests/
├── review-agent/           # Python Review Agent (gRPC Port 50051)
│   ├── src/
│   └── tests/
├── proto/                  # gRPC protobuf definitions
├── deploy/                 # Deployment scripts (systemd, PM2)
├── docs/                   # Documentation
├── data/                   # SQLite database file
├── logs/                   # Log files
└── openspec/               # OpenSpec change tracking
```

## Key Commands

### Root Level
```bash
# Install all dependencies (root + web + server)
npm install

# Development (runs both frontend + backend)
npm run dev

# Build all
npm run build

# Start production
npm run start

# Run single service
npm run dev:web    # Frontend only
npm run dev:server # Backend only
```

### Server (`server/`)
```bash
npm install
npm run dev       # nodemon with 200MB memory limit
npm run build     # TypeScript compile
npm run start     # Production with memory limit
npm run test      # Jest tests
npm run typecheck # Type check only
```

### Web (`web/`)
```bash
npm install
npm run dev   # Next.js dev server
npm run build # Production build
npm run start # Production server
npm run lint  # ESLint
```

### Python Agents
```bash
# Context Agent
cd context-agent
pip install -r requirements.txt

# Review Agent
cd review-agent
pip install -r requirements.txt
```

## Architecture Patterns

### Backend Service Layers

1. **Routes** (`src/routes/`) - Express routers for HTTP endpoints
2. **Models** (`src/models/`) - SQLite data access layer using better-sqlite3
3. **Services** (`src/services/`) - Business logic layer
4. **Agents** (`src/agent/`) - Python subprocess management via gRPC
5. **Jobs** (`src/jobs/`) - SQLite-based job queue with polling worker
6. **Auth** (`src/auth/`) - Session-based authentication with cookies
7. **OAuth** (`src/oauth/`) - OAuth 2.0 handlers for GitHub/Gitee/GitLab
8. **Webhook** (`src/webhook/`) - Platform webhook receivers with signature validation

### Data Flow (PR Review)

```
1. GitHub/Gitee/GitLab webhook → /webhook/*
2. Webhook handler validates signature → creates job in SQLite queue
3. Job queue worker polls for pending jobs
4. Worker spawns Context Agent (gRPC) → collects code context
5. Worker spawns Review Agent (gRPC) → analyzes and generates comments
6. Review comments posted back to platform API
7. Job status updated in SQLite
```

### 2u2g Resource Constraints

All components are optimized for 2GB RAM servers:

| Component | Memory Limit | Key Config |
|-----------|-------------|------------|
| Frontend (Next.js) | 200MB | `NODE_OPTIONS=--max-old-space-size=200` |
| Backend (Express) | 200MB | `NODE_OPTIONS=--max-old-space-size=200` |
| Python Agents | 300MB | `PYTHON_MEMORY_LIMIT=300m` |
| Code Context Engine runtime | 256MB | `CODE_CONTEXT_ENGINE_MAX_MEMORY=256m` |
| SQLite Cache | 2MB | `SQLITE_CACHE_SIZE=-2000` |
| Job Workers | 1 | `WORKER_COUNT=1`, `ENABLE_CONCURRENT_JOBS=false` |

**Critical:** Jobs are processed serially (one at a time). Agents are ephemeral - spawned per job and terminated immediately after completion to release memory.

## Configuration

Key environment variables from `.env`:

```bash
# Server
BACKEND_PORT=7900
FRONTEND_PORT=3000
NODE_OPTIONS=--max-old-space-size=200

# Database
DATABASE_PATH=./data/codagraph-lite.db
SQLITE_CACHE_SIZE=-2000

# Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
SESSION_SECRET=changeme_to_secure_random_string

# OAuth (per platform)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:7900/api/oauth/github/callback

# Agents
CONTEXT_AGENT_PORT=50052
REVIEW_AGENT_PORT=50051
AGENT_TIMEOUT_CONTEXT=300000  # 5 minutes
AGENT_TIMEOUT_REVIEW=600000   # 10 minutes
PYTHON_MEMORY_LIMIT=300m

# Code Context Engine
CODE_CONTEXT_ENGINE_ROOT=../CodeContextEngine
CODE_CONTEXT_ENGINE_MAX_MEMORY=256m
WORKSPACE_ROOT=/tmp/repos

# Job Queue
WORKER_COUNT=1
ENABLE_CONCURRENT_JOBS=false
JOB_QUEUE_POLL_INTERVAL=2
```

## Development Guidelines

### Adding New API Routes

1. Create route file in `src/routes/` or extend existing
2. Use Express router pattern
3. Add authentication middleware for protected routes
4. Update `.env.example` if new config needed

### Adding New Models

1. Add model in `src/models/`
2. Update database schema in `src/database/`
3. Add migration if changing existing schema

### Python Agent Integration

Agents are spawned as subprocesses, not daemon services:
- Use `src/agent/` module for subprocess management
- Always terminate agents after job completion
- Implement SIGTERM handler for graceful shutdown
- Force kill (SIGKILL) after 5 second timeout

### Testing

```bash
# Server tests
cd server
npm run test

# Run specific test file
npm run test -- tests/path/to/test.test.ts
```

## OpenSpec Workflow

This project uses OpenSpec for change tracking. Key commands:

```bash
# List available changes
openspec list

# View change status
openspec status --change "<name>"

# Get implementation instructions
openspec instructions apply --change "<name>"

# Apply changes (use /opsx:apply skill)
/opsx:apply <change-name>

# Archive completed change
/opsx:archive <change-name>
```

Current active change: `create-codagraph-lite` (59/169 tasks complete)

## Team Rules

This project has agent team rules configured in `.claude/rules/teamwork.md`:

- Development tasks should be assigned to agent teammates (backend-dev, frontend-dev, ai-dev, etc.)
- OAuth/backend tasks → backend-dev
- Frontend/UI tasks → frontend-dev
- gRPC/Python agent tasks → ai-dev
- Test tasks → test-dev
- Deployment tasks → devops-dev

## Security Rules

Follow `.claude/rules/SECURITY.md` for:
- log and error redaction
- handling authenticated Git URLs and tokens
- command execution safety checks

## Key Files

- `README.md` - Comprehensive project documentation
- `.env.example` - All environment variables with comments
- `server/src/index.ts` - Backend entry point
- `ecosystem.config.cjs` - PM2 configuration
- `deploy/` - Deployment scripts for systemd/PM2
