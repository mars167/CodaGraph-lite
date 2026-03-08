## 1. Project Setup

- [x] 1.1 Create `../CodaGraph-lite` directory structure
- [x] 1.2 Initialize Frontend project (Next.js 14) in `web/`
- [x] 1.3 Initialize Backend project (Express) in `server/`
- [x] 1.4 Create Context Agent module in `context-agent/`
- [x] 1.5 Create Review Agent module in `review-agent/`
- [x] 1.6 Set up root configuration files (package.json, README.md, LICENSE)
- [x] 1.7 Create `.env.example` file with all required environment variables
- [x] 1.8 Set up TypeScript configuration for all projects
- [x] 1.9 Create initial directory structure for each module

## 2. SQLite Database Layer ✅

- [x] 2.1 Design SQLite database schema (Prisma schema equivalent)
- [x] 2.2 Implement SQLite connection management with `better-sqlite3`
- [x] 2.3 Create database initialization script
- [x] 2.4 Implement database migration system
- [x] 2.5 Create data models (Analysis, Installation, Repository, AnalysisJob, WebhookEvent, UsageMetric)
- [x] 2.6 Implement database queries for CRUD operations
- [x] 2.7 Add database connection pooling
- [x] 2.8 Implement database backup/restore functionality
- [x] 2.9 Add database performance optimization (WAL mode, indexes)
- [x] 2.10 Implement database health monitoring

## 3. SQLite Job Queue ✅


- [x] 3.1 Design job queue schema (jobs table with status, priority, attempts)
- [x] 3.2 Implement job submission API endpoint
- [x] 3.3 Implement job polling worker
- [x] 3.4 Add job status tracking (pending, processing, completed, failed, dead)
- [x] 3.5 Implement job retry mechanism with exponential backoff
- [x] 3.6 Add job prioritization logic
- [x] 3.7 Implement job cancellation API
- [x] 3.8 Create dead letter queue for permanently failed jobs
- [x] 3.9 Add job timeout handling
- [x] 3.10 Implement job metrics and monitoring endpoints
- [x] 3.11 Add configurable worker count scaling

## 4. Single Admin Authentication

- [x] 4.1 Implement admin account creation on first startup
- [x] 4.2 Create admin login API endpoint (username/password)
- [x] 4.3 Implement session-based authentication
- [x] 4.4 Add session management with expiration
- [x] 4.5 Create protected route middleware
- [x] 4.6 Implement admin logout endpoint
- [x] 4.7 Add admin password update functionality
- [x] 4.8 Implement session security measures (HttpOnly, Secure, SameSite cookies)
- [x] 4.9 Add admin activity logging
- [x] 4.10 Create admin dashboard access control

## 5. OAuth Integration ✅

- [x] 5.1 Implement GitHub OAuth 2.0 flow
- [x] 5.2 Implement Gitee OAuth 2.0 flow
- [x] 5.3 Implement GitLab OAuth 2.0 flow
- [x] 5.4 Create OAuth callback endpoints for each platform
- [x] 5.5 Implement OAuth token storage in SQLite
- [x] 5.6 Add OAuth token refresh logic
- [x] 5.7 Create OAuth installation management API (list, disconnect, reauthorize)
- [x] 5.8 Implement webhook setup after OAuth authorization
- [x] 5.9 Add webhook signature verification for each platform
- [x] 5.10 Implement OAuth error handling and state parameter verification
- [x] 5.11 Simplify OAuth flow for single admin (no user selection)

## 6. Code Review Pipeline ✅

- [x] 6.1 Create webhook endpoints for PR events (GitHub, Gitee, GitLab)
- [x] 6.2 Implement PR review job submission to queue
- [x] 6.3 Add repository cloning to workspace
- [x] 6.4 Integrate Code Context Engine runtime for repository indexing
- [x] 6.5 Spawn context-agent subprocess via gRPC
- [x] 6.6 Implement context agent ReAct loop integration
- [x] 6.7 Spawn review-agent subprocess via gRPC
- [x] 6.8 Implement review agent per-file analysis
- [x] 6.9 Add review comment formatting for each platform
- [x] 6.10 Implement review comment posting to GitHub/Gitee/GitLab APIs
- [x] 6.11 Add analysis result storage in SQLite
- [x] 6.12 Implement workspace cleanup after job completion
- [x] 6.13 Add progress tracking for job stages
- [x] 6.14 Implement job timeout handling

## 7. Backend HTTP API ✅

- [x] 7.1 Create Express.js server setup
- [x] 7.2 Implement health check endpoint
- [x] 7.3 Create admin authentication API routes
- [x] 7.4 Create OAuth integration API routes
- [x] 7.5 Create repository management API routes
- [x] 7.6 Create job status and monitoring API routes
- [x] 7.7 Create analysis history API routes
- [x] 7.8 Add CORS configuration
- [x] 7.9 Implement error handling middleware
- [x] 7.10 Add request logging middleware
- [x] 7.11 Create API documentation (OpenAPI/Swagger)

## 8. Frontend Application ✅

- [x] 8.1 Set up Next.js 14 App Router structure
- [x] 8.2 Create admin login page
- [x] 8.3 Create admin dashboard layout
- [x] 8.4 Create OAuth integration management page
- [x] 8.5 Create repository management page
- [x] 8.6 Create job status monitoring page
- [x] 8.7 Create analysis history page
- [x] 8.8 Implement authentication state management
- [x] 8.9 Create API client for backend communication
- [x] 8.10 Add responsive design for mobile/desktop
- [x] 8.11 Implement error handling and user notifications

## 9. Python Agent Integration (2u2g Optimized) ✅

- [x] 9.1 Create subprocess management module for Python agents
- [x] 9.2 Implement gRPC client for context agent communication
- [x] 9.3 Implement gRPC client for review agent communication
- [x] 9.4 **CRITICAL**: Implement immediate agent termination after job completion
- [x] 9.5 **CRITICAL**: Add agent process timeout handling (context: 5min, review: 10min)
- [x] 9.6 **CRITICAL**: Implement SIGTERM/SIGKILL force termination after 5 second timeout
- [x] 9.7 Implement agent process health monitoring
- [x] 9.8 Add agent process cleanup on backend shutdown
- [x] 9.9 **CRITICAL**: Add Python memory limit enforcement (300m)
- [x] 9.10 **CRITICAL**: Implement zombie process detection and cleanup
- [x] 9.11 Create agent configuration module
- [x] 9.12 Add agent error logging and propagation
- [x] 9.13 **CRITICAL**: Ensure agents are NOT run as background daemons

## 10. Deployment Configuration

- [x] 10.1 Create systemd service files for frontend and backend
- [x] 10.2 Create PM2 configuration files
- [x] 10.3 Create Dockerfile for frontend (optional)
- [x] 10.4 Create Dockerfile for backend (optional)
- [x] 10.5 Create deployment script
- [x] 10.6 Create uninstallation script
- [x] 10.7 Create deployment verification script
- [x] 10.8 Create backup/restore scripts
- [x] 10.9 Create log rotation configuration
- [x] 10.10 Add environment variable validation script

## 11. Configuration Management (2u2g Optimized) ✅

- [x] 11.1 Create `.env.example` with all configuration options
- [x] 11.2 **CRITICAL**: Add 2u2g-specific configuration (WORKER_COUNT=1, memory limits)
- [x] 11.3 **CRITICAL**: Add environment variable validation for 2u2g requirements
- [x] 11.4 Implement configuration loading from environment variables
- [x] 11.5 Add configuration validation on startup
- [x] 11.6 **CRITICAL**: Reject invalid 2u2g configurations (e.g., concurrent jobs)
- [x] 11.7 Create configuration documentation
- [x] 11.8 **CRITICAL**: Add 2u2g deployment guide with swap setup instructions
- [x] 11.9 Add default configuration values (optimized for 2u2g)
- [x] 11.10 Implement configuration hot reload (optional)

## 11.5. Resource Optimization for 2u2g (NEW) ✅

- [x] 11.5.1 **CRITICAL**: Implement Node.js memory limit (NODE_OPTIONS=--max-old-space-size=200)
- [x] 11.5.2 **CRITICAL**: Implement SQLite cache limit (2MB)
- [x] 11.5.3 **CRITICAL**: Implement Code Context Engine memory limit (256m)
- [x] 11.5.4 **CRITICAL**: Implement single concurrent job enforcement (WORKER_COUNT=1)
- [x] 11.5.5 **CRITICAL**: Add memory monitoring endpoint `/api/status/memory`
- [x] 11.5.6 **CRITICAL**: Add swap detection and warning system
- [x] 11.5.7 **CRITICAL**: Implement memory cleanup after job completion
- [x] 11.5.8 Add resource usage reporting endpoint `/api/status/resources`
- [x] 11.5.9 Implement graceful degradation under memory pressure
- [x] 11.5.10 Create swap setup script for 2u2g servers
- [x] 11.5.11 Add memory usage logging (before/after each job)
- [x] 11.5.12 Implement memory alerting (80% warning, 95% critical)

## 12. Logging and Monitoring ✅

- [x] 12.1 Implement structured logging for frontend
- [x] 12.2 Implement structured logging for backend
- [x] 12.3 Add agent process logging
- [x] 12.4 Create log file rotation configuration
- [x] 12.5 Add metrics endpoint for Prometheus
- [x] 12.6 Create status dashboard for monitoring
- [x] 12.7 Implement alerting for critical errors (optional)

## 13. Testing

- [x] 13.1 Create unit tests for database layer
- [x] 13.2 Create unit tests for job queue
- [x] 13.3 Create unit tests for authentication
- [x] 13.4 Create unit tests for OAuth integration
- [x] 13.5 Create unit tests for code review pipeline
- [x] 13.6 Create integration tests for API endpoints
- [x] 13.7 Create end-to-end tests for PR review flow
- [x] 13.8 Create frontend component tests
- [x] 13.9 Set up test coverage reporting
- [x] 13.10 Create performance tests for job queue

## 14. Documentation ✅

- [x] 14.1 Create main README.md with project overview
- [x] 14.2 Write installation guide
- [x] 14.3 Write configuration guide
- [x] 14.4 Write deployment guide
- [x] 14.5 Write troubleshooting guide
- [x] 14.6 Write API documentation
- [x] 14.7 Write architecture documentation
- [x] 14.8 Write developer guide for contributions
- [x] 14.9 Add inline code documentation (JSDoc/Python docstrings)
- [x] 14.10 Create upgrade guide for future versions

## 15. Final Polish

- [x] 15.1 Add license file
- [x] 15.2 Create changelog
- [x] 15.3 Add contribution guidelines
- [x] 15.4 Create issue templates
- [x] 15.5 Add security policy
- [x] 15.6 Set up CI/CD (optional)
- [x] 15.7 Add code linting (ESLint, Pylint)
- [x] 15.8 Add code formatting (Prettier, Black)
- [x] 15.9 Create release notes
- [x] 15.10 Perform end-to-end testing of complete system
