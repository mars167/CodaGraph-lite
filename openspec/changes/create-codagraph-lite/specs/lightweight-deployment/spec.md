## ADDED Requirements

### Requirement: Simple Installation
The system SHALL provide simple installation without complex dependencies.

#### Scenario: Install on fresh server
- **WHEN** user installs CodaGraph-lite on a fresh server
- **THEN** the system requires only Node.js 18+ and Python 3.11+
- **THEN** the system does not require Docker
- **THEN** the system does not require PostgreSQL
- **THEN** the system does not require Redis
- **THEN** the installation completes within 5 minutes

#### Scenario: Installation verification
- **WHEN** installation completes
- **THEN** the system runs health checks
- **THEN** the system verifies all dependencies are installed
- **THEN** the system provides clear success or error message

### Requirement: Configuration via Environment Variables
The system SHALL use a single environment variable file for configuration.

#### Scenario: Load configuration from .env file
- **WHEN** the system starts
- **THEN** the system reads configuration from .env file in project root
- **THEN** the system loads all required configuration values
- **THEN** the system uses sensible defaults for optional values
- **THEN** the system logs loaded configuration (excluding secrets)

#### Scenario: Missing configuration values
- **WHEN** required configuration values are missing
- **THEN** the system fails to start with clear error message
- **THEN** the system lists all missing required values
- **THEN** the system provides example configuration

### Requirement: Optional Containerization
The system SHALL support optional Docker containerization but not require it.

#### Scenario: Run with Docker
- **WHEN** user chooses to run with Docker
- **THEN** the system provides Dockerfile for frontend
- **THEN** the system provides Dockerfile for backend
- **THEN** the system does not require Docker Compose
- **THEN** each service runs in separate containers

#### Scenario: Run without Docker
- **WHEN** user chooses to run without Docker
- **THEN** the system runs natively on host system
- **THEN** the system uses system Node.js and Python
- **THEN** the system manages processes via systemd or PM2

### Requirement: Process Management Options
The system SHALL support multiple process management options.

#### Scenario: Use systemd for process management
- **WHEN** user deploys with systemd
- **THEN** the system provides systemd service files
- **THEN** the services start automatically on boot
- **THEN** the services restart on failure
- **THEN** the logs are accessible via journalctl

#### Scenario: Use PM2 for process management
- **WHEN** user deploys with PM2
- **THEN** the system provides PM2 configuration file
- **THEN** the services are managed by PM2 daemon
- **THEN** the services restart on failure
- **THEN** the logs are accessible via PM2

#### Scenario: Run in development mode
- **WHEN** user runs in development mode
- **THEN** the system uses `npm run dev` for hot reload
- **THEN** the system runs in foreground
- **THEN** the logs output to console

### Requirement: Minimal System Requirements
The system SHALL have minimal system requirements for deployment.

#### Scenario: System resource requirements
- **WHEN** deploying CodaGraph-lite
- **THEN** the system requires minimum 1GB RAM
- **THEN** the system requires minimum 10GB disk space
- **THEN** the system requires 1 vCPU (can run on shared hosting)
- **THEN** the system runs on Linux, macOS, or Windows

#### Scenario: Software requirements
- **WHEN** deploying CodaGraph-lite
- **THEN** the system requires Node.js 18 or higher
- **THEN** the system requires Python 3.11 or higher
- **THEN** the system requires git-ai CLI installed
- **THEN** the system optionally requires SQLite command-line tool

### Requirement: Zero-Dependency Deployment
The system SHALL not require external database or messaging servers.

#### Scenario: First-time startup without dependencies
- **WHEN** the system starts for the first time
- **THEN** the system creates SQLite database file automatically
- **THEN** the system initializes job queue in SQLite
- **THEN** the system does not connect to PostgreSQL
- **THEN** the system does not connect to Redis

#### Scenario: Dependency-free operation
- **WHEN** the system runs normally
- **THEN** the system operates without PostgreSQL
- **THEN** the system operates without Redis
- **THEN** the system operates without message queue server
- **THEN** all persistence uses SQLite

### Requirement: Simple Update Process
The system SHALL provide simple update mechanism.

#### Scenario: Update to new version
- **WHEN** user updates CodaGraph-lite
- **THEN** the system runs `git pull` or downloads new version
- **THEN** the system runs `npm install` to update dependencies
- **THEN** the system runs database migrations automatically
- **THEN** the system restarts services

#### Scenario: Update with database migration
- **WHEN** new version requires database migration
- **THEN** the system detects schema version mismatch
- **THEN** the system applies migrations automatically
- **THEN** the system backs up database before migration
- **THEN** the system rolls back on migration failure

### Requirement: Documentation for Deployment
The system SHALL provide comprehensive deployment documentation.

#### Scenario: Read deployment guide
- **WHEN** user reads deployment documentation
- **THEN** the guide explains system requirements
- **THEN** the guide provides step-by-step installation
- **THEN** the guide includes common configuration options
- **THEN** the guide includes troubleshooting section

#### Scenario: Troubleshoot deployment issues
- **WHEN** user encounters deployment issue
- **THEN** the documentation includes common issues
- **THEN** the documentation includes error resolution steps
- **THEN** the documentation includes log location instructions
- **THEN** the documentation includes how to get help

### Requirement: Health and Status Monitoring
The system SHALL provide built-in health monitoring.

#### Scenario: Check service health
- **WHEN** admin requests health status
- **THEN** the system returns status of frontend service
- **THEN** the system returns status of backend service
- **THEN** the system returns status of database
- **THEN** the system returns status of job queue

#### Scenario: Service failure detection
- **WHEN** a service becomes unhealthy
- **THEN** the system logs the failure event
- **THEN** the system may attempt automatic restart
- **THEN** the system exposes failure status via health endpoint
- **THEN** the system may send notification if configured

### Requirement: Backup and Restore
The system SHALL provide backup and restore functionality.

#### Scenario: Create backup
- **WHEN** admin initiates backup
- **THEN** the system creates backup of SQLite database
- **THEN** the system includes backup of configuration
- **THEN** the system compresses backup file
- **THEN** the system stores backup with timestamp

#### Scenario: Restore from backup
- **WHEN** admin initiates restore
- **THEN** the system validates backup file
- **THEN** the system stops all services
- **THEN** the system restores database from backup
- **THEN** the system restarts services

### Requirement: Logging and Debugging
The system SHALL provide comprehensive logging for debugging.

#### Scenario: View application logs
- **WHEN** admin views logs
- **THEN** logs are accessible via standard logging location
- **THEN** logs include timestamps and severity levels
- **THEN** logs include request ID for tracing
- **THEN** logs include context for debugging

#### Scenario: Enable debug logging
- **WHEN** admin enables debug mode
- **THEN** the system outputs verbose logs
- **THEN** the logs include detailed operation traces
- **THEN** the logs include external API calls
- **THEN** the logs include SQL queries (with parameterized values)

### Requirement: Quick Start
The system SHALL provide quick start for immediate evaluation.

#### Scenario: Quick start installation
- **WHEN** user runs quick start script
- **THEN** the system installs all dependencies
- **THEN** the system initializes default configuration
- **THEN** the system starts both services
- **THEN** the system opens admin dashboard in browser

#### Scenario: Quick start configuration
- **WHEN** using quick start mode
- **THEN** the system uses development-friendly defaults
- **THEN** the system creates test admin account
- **THEN** the system provides instructions for production deployment
- **THEN** the system notes that quick start is for evaluation only

### Requirement: Deployment Verification
The system SHALL include deployment verification tools.

#### Scenario: Run deployment verification
- **WHEN** admin runs verification script
- **THEN** the script checks Node.js version
- **THEN** the script checks Python version
- **THEN** the script checks git-ai CLI installation
- **THEN** the script checks environment configuration
- **THEN** the script tests database connectivity
- **THEN** the script reports any issues found

### Requirement: Uninstallation
The system SHALL provide clean uninstallation process.

#### Scenario: Uninstall CodaGraph-lite
- **WHEN** user runs uninstallation
- **THEN** the system stops all services
- **THEN** the system removes service files
- **THEN** the system removes systemd or PM2 configuration
- **THEN** the system offers to remove data (database, logs)
- **THEN** the system provides summary of removed items

### Requirement: Port Configuration
The system SHALL use standard ports but allow customization.

#### Scenario: Use default ports
- **WHEN** deploying with default configuration
- **THEN** the frontend service runs on port 3000
- **THEN** the backend service runs on port 7900

#### Scenario: Customize ports
- **WHEN** admin configures custom ports via environment variables
- **THEN** the frontend uses configured FRONTEND_PORT
- **THEN** the backend uses configured BACKEND_PORT
- **THEN** the system validates ports are available
- **THEN** the system logs port binding on startup
