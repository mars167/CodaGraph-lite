## ADDED Requirements

### Requirement: Two-Service Architecture
The system SHALL consist of exactly two services: Frontend and Backend.

#### Scenario: Service architecture overview
- **WHEN** the system is deployed
- **THEN** the system has exactly two services running
- **THEN** the frontend service serves the Next.js web application
- **THEN** the backend service handles API requests, background jobs, and agent integration

#### Scenario: Frontend service responsibilities
- **WHEN** the frontend service is running
- **THEN** the service provides the web UI and dashboard
- **THEN** the service handles client-side routing
- **THEN** the service communicates with backend via HTTP API
- **THEN** the service serves static assets

#### Scenario: Backend service responsibilities
- **WHEN** the backend service is running
- **THEN** the service handles HTTP API requests
- **THEN** the service processes background jobs
- **THEN** the service integrates with Python agents
- **THEN** the service manages SQLite database and job queue

### Requirement: Frontend-Backend Communication
The system SHALL use HTTP/HTTPS for communication between frontend and backend.

#### Scenario: Frontend makes API request
- **WHEN** the frontend makes an API request to backend
- **THEN** the request uses HTTP/HTTPS protocol
- **THEN** the request includes authentication session cookie
- **THEN** the request includes appropriate content type
- **THEN** the backend processes request and returns JSON response

#### Scenario: Backend responds to frontend
- **WHEN** the backend responds to frontend request
- **THEN** the response includes appropriate status code
- **THEN** the response includes JSON body with requested data or error
- **THEN** the response includes CORS headers if applicable
- **THEN** the response includes security headers

### Requirement: Backend Service Structure
The system SHALL organize backend service into logical modules.

#### Scenario: Backend service initialization
- **WHEN** the backend service starts
- **THEN** the service initializes database connection
- **THEN** the service initializes job queue
- **THEN** the service initializes Express.js HTTP server
- **THEN** the service starts job worker processes
- **THEN** the service loads Python agent integrations

#### Scenario: Backend service shutdown
- **WHEN** the backend service receives shutdown signal
- **THEN** the service stops accepting new HTTP requests
- **THEN** the service waits for in-flight requests to complete
- **THEN** the service stops job workers gracefully
- **THEN** the service stops Python agent processes
- **THEN** the service closes database connection
- **THEN** the service exits

### Requirement: Python Agent Integration
The system SHALL integrate Python agents via subprocess execution.

#### Scenario: Spawn context agent process
- **WHEN** the backend needs to run context analysis
- **THEN** the system spawns context-agent Python process
- **THEN** the system communicates via gRPC on localhost
- **THEN** the system sends analysis request
- **THEN** the system waits for response
- **THEN** the system terminates process after completion

#### Scenario: Spawn review agent process
- **WHEN** the backend needs to run code review
- **THEN** the system spawns review-agent Python process
- **THEN** the system communicates via gRPC on localhost
- **THEN** the system sends review request
- **THEN** the system waits for response
- **THEN** the system terminates process after completion

#### Scenario: Agent process timeout
- **WHEN** an agent process exceeds timeout
- **THEN** the system sends kill signal to process
- **THEN** the system logs the timeout event
- **THEN** the system marks job as failed
- **THEN** the system reports error to frontend

### Requirement: Service Configuration Management
The system SHALL use environment variables for service configuration.

#### Scenario: Load configuration on startup
- **WHEN** a service starts
- **THEN** the system reads environment variables from .env file or shell
- **THEN** the system validates required configuration values
- **THEN** the system applies defaults for optional values
- **THEN** the system logs configuration load status

#### Scenario: Configuration validation failure
- **WHEN** required configuration is missing or invalid
- **THEN** the system logs error with missing configuration
- **THEN** the system fails to start or uses safe defaults
- **THEN** the system may prompt for configuration interactively

### Requirement: Service Health Checks
The system SHALL provide health check endpoints for monitoring.

#### Scenario: Frontend health check
- **WHEN** monitoring system requests frontend health
- **THEN** the frontend returns 200 OK status
- **THEN** the response includes service name and version
- **THEN** the response includes timestamp

#### Scenario: Backend health check
- **WHEN** monitoring system requests backend health
- **THEN** the backend returns 200 OK status
- **THEN** the response includes service name and version
- **THEN** the response includes database connection status
- **THEN** the response includes job queue status
- **THEN** the response includes agent service status

#### Scenario: Backend health check with unhealthy component
- **WHEN** a backend component (database, agent) is unhealthy
- **THEN** the backend returns 503 Service Unavailable
- **THEN** the response includes details of unhealthy components
- **THEN** the response includes diagnostic information

### Requirement: Service Logging
The system SHALL implement structured logging for both services.

#### Scenario: Frontend logging
- **WHEN** an event occurs in the frontend service
- **THEN** the system logs event with timestamp
- **THEN** the system includes log level (info, warn, error)
- **THEN** the system includes relevant context (user, action, error)
- **THEN** the system outputs to console or configured log file

#### Scenario: Backend logging
- **WHEN** an event occurs in the backend service
- **THEN** the system logs event with timestamp
- **THEN** the system includes log level (info, warn, error)
- **THEN** the system includes request ID for tracing
- **THEN** the system includes component/module context

#### Scenario: Agent process logging
- **WHEN** an agent process executes
- **THEN** the system captures agent stdout/stderr
- **THEN** the system includes agent logs in backend logs with proper context
- **THEN** the system logs agent process lifecycle events (spawn, terminate)

### Requirement: Service Error Handling
The system SHALL implement graceful error handling across services.

#### Scenario: Frontend API error
- **WHEN** frontend receives error response from backend
- **THEN** the frontend displays user-friendly error message
- **THEN** the frontend logs the error details
- **THEN** the frontend may offer retry option if applicable
- **THEN** the frontend does not expose internal error details

#### Scenario: Backend unhandled exception
- **WHEN** backend encounters unhandled exception
- **THEN** the backend logs the exception with stack trace
- **THEN** the backend returns 500 Internal Server Error
- **THEN** the backend includes generic error message
- **THEN** the backend does not expose sensitive information

#### Scenario: Database connection error
- **WHEN** backend loses database connection
- **THEN** the backend logs the connection error
- **THEN** the backend attempts to reconnect
- **THEN** the backend returns 503 Service Unavailable during outage
- **THEN** the backend recovers automatically when connection restored

### Requirement: Service Startup Dependencies
The system SHALL manage startup dependencies between services.

#### Scenario: Frontend starts before backend
- **WHEN** the frontend service starts before backend is ready
- **THEN** the frontend displays loading state
- **THEN** the frontend attempts to connect to backend
- **THEN** the frontend retries connection with backoff
- **THEN** the frontend displays error if backend remains unavailable

#### Scenario: Backend starts independently
- **WHEN** the backend service starts
- **THEN** the backend does not wait for frontend
- **THEN** the backend initializes all required components
- **THEN** the backend begins accepting requests
- **THEN** the backend handles requests even if frontend is not running

### Requirement: Service Resource Management
The system SHALL manage resource usage efficiently across services.

#### Scenario: Frontend resource usage
- **WHEN** the frontend service handles requests
- **THEN** the system uses appropriate memory for Next.js
- **THEN** the system uses caching for static assets
- **THEN** the system implements code splitting for reduced bundle size
- **THEN** the system limits concurrent connections

#### Scenario: Backend resource usage
- **WHEN** the backend service handles requests and jobs
- **THEN** the system limits worker process count
- **THEN** the system uses connection pooling for database
- **THEN** the system implements request timeouts
- **THEN** the system cleans up completed job resources

#### Scenario: Agent process resource cleanup
- **WHEN** an agent process completes or times out
- **THEN** the system terminates the process
- **THEN** the system cleans up process handles
- **THEN** the system releases allocated memory
- **THEN** the system logs process termination

### Requirement: Service Deployment
The system SHALL support simple deployment without orchestration.

#### Scenario: Manual deployment
- **WHEN** deploying the system manually
- **THEN** the system can be started with `npm run dev` or `npm start`
- **THEN** the system can be run as systemd services
- **THEN** the system can be managed with PM2
- **THEN** the system does not require Docker Compose

#### Scenario: Production deployment
- **WHEN** deploying to production
- **THEN** the system supports building with `npm run build`
- **THEN** the system supports environment variable configuration
- **THEN** the system supports optional containerization with Dockerfile
- **THEN** the system provides health check endpoints for load balancers

### Requirement: Service Monitoring Integration
The system SHALL provide endpoints for external monitoring tools.

#### Scenario: Metrics endpoint
- **WHEN** monitoring system requests metrics
- **THEN** the system returns metrics in Prometheus format
- **THEN** the metrics include request counts and latencies
- **THEN** the metrics include job queue statistics
- **THEN** the metrics include resource usage

#### Scenario: Status dashboard
- **WHEN** admin views status dashboard
- **THEN** the system displays service uptime
- **THEN** the system displays recent error logs
- **THEN** the system displays job queue status
- **THEN** the system displays agent service status
