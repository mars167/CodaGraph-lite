## ADDED Requirements

### Requirement: SQLite Database Initialization
The system SHALL initialize an SQLite database on first startup with all required tables.

#### Scenario: First-time database initialization
- **WHEN** the backend service starts for the first time
- **THEN** the system creates an SQLite database file at the configured path
- **THEN** the system creates all required tables (analysis, installation, repository, analysis_job, webhook_event, usage_metric)
- **THEN** the system applies all database indexes
- **THEN** the system enables WAL mode for improved concurrency

#### Scenario: Database file already exists
- **WHEN** the backend service starts and the database file already exists
- **THEN** the system opens the existing database file
- **THEN** the system verifies schema version matches expected version
- **THEN** the system applies any pending migrations if schema version is older

### Requirement: Database Schema Migration
The system SHALL support schema migrations to evolve the database over time.

#### Scenario: New migration available
- **WHEN** the database schema version is older than the expected version
- **THEN** the system applies migrations in sequential order
- **THEN** the system updates the schema version after each successful migration
- **THEN** the system rolls back if a migration fails
- **THEN** the system logs migration results

#### Scenario: Schema version is current
- **WHEN** the database schema version matches the expected version
- **THEN** the system skips migrations
- **THEN** the system proceeds with normal startup

### Requirement: SQLite Data Persistence for Analysis
The system SHALL persist pull request analysis data in SQLite.

#### Scenario: Storing PR analysis result
- **WHEN** a PR analysis completes successfully
- **THEN** the system stores the analysis record in the `analysis` table
- **THEN** the system includes PR metadata (platform, owner, repo, pr_number)
- **THEN** the system stores review comments and suggestions
- **THEN** the system stores analysis status and completion timestamp

#### Scenario: Retrieving PR analysis history
- **WHEN** the admin requests analysis history for a repository
- **THEN** the system queries the `analysis` table filtered by repository
- **THEN** the system returns paginated results sorted by creation date
- **THEN** the system includes analysis status, duration, and comment count

### Requirement: SQLite Data Persistence for Installations
The system SHALL persist OAuth installation data in SQLite.

#### Scenario: Storing GitHub OAuth installation
- **WHEN** the admin authorizes a GitHub app installation
- **THEN** the system stores the installation record in the `installation` table
- **THEN** the system includes platform type (GitHub/Gitee/GitLab)
- **THEN** the system stores access token and refresh token
- **THEN** the system stores installation metadata (account, permissions)

#### Scenario: Refreshing OAuth token
- **WHEN** an OAuth token is expired or near expiration
- **THEN** the system retrieves the installation record from SQLite
- **THEN** the system refreshes the token using platform-specific flow
- **THEN** the system updates the installation record with new token
- **THEN** the system updates token expiration timestamp

### Requirement: SQLite Job Queue Data Structure
The system SHALL use SQLite tables to manage job queue data.

#### Scenario: Creating a job record
- **WHEN** a job is submitted for processing
- **THEN** the system inserts a record into the `jobs` table
- **THEN** the system includes job type (context-analysis, code-review)
- **THEN** the system stores job payload as JSON
- **THEN** the system sets status to "pending" and created_at timestamp
- **THEN** the system initializes attempts to 0

#### Scenario: Updating job status
- **WHEN** a worker processes a job
- **THEN** the system updates the job status to "processing"
- **THEN** the system sets started_at timestamp
- **WHEN** the job completes successfully
- **THEN** the system updates the job status to "completed"
- **THEN** the system sets completed_at timestamp

#### Scenario: Recording job failure
- **WHEN** a job fails
- **THEN** the system updates the job status to "failed"
- **THEN** the system increments attempts counter
- **THEN** the system stores error message and stack trace
- **THEN** the system sets failed_at timestamp

### Requirement: Database Connection Pooling
The system SHALL use SQLite connection pooling for efficient database access.

#### Scenario: Multiple concurrent database queries
- **WHEN** multiple API requests require database access simultaneously
- **THEN** the system uses a connection pool with configured size
- **THEN** the system obtains connections from the pool
- **THEN** the system returns connections to the pool after queries complete
- **THEN** the system handles connection timeouts gracefully

#### Scenario: Database connection error
- **WHEN** a database connection fails
- **THEN** the system logs the error with context
- **THEN** the system returns a 500 error to the client
- **THEN** the system attempts to reconnect for subsequent requests

### Requirement: Database Backup and Restore
The system SHALL support database backup and restore operations.

#### Scenario: Admin requests database backup
- **WHEN** the admin initiates a database backup
- **THEN** the system creates a backup of the SQLite database file
- **THEN** the system includes timestamp in backup filename
- **THEN** the system compresses the backup file
- **THEN** the system provides download link for the backup

#### Scenario: Admin restores database from backup
- **WHEN** the admin uploads a backup file for restoration
- **THEN** the system validates the backup file format
- **THEN** the system stops all database operations
- **THEN** the system replaces the database file with the backup
- **THEN** the system restarts database operations

### Requirement: Database Performance Optimization
The system SHALL optimize SQLite database performance.

#### Scenario: Slow query detected
- **WHEN** a query exceeds the configured timeout threshold
- **THEN** the system logs the slow query with execution time
- **THEN** the system includes query plan in the log
- **THEN** the system suggests missing indexes if applicable

#### Scenario: Database file size grows large
- **WHEN** the database file size exceeds configured threshold
- **THEN** the system runs VACUUM operation to reclaim space
- **THEN** the system runs ANALYZE to update query optimizer statistics
- **THEN** the system logs the operation results

### Requirement: Database Health Monitoring
The system SHALL monitor database health and report issues.

#### Scenario: Database file corruption detected
- **WHEN** SQLite detects database corruption
- **THEN** the system logs critical error
- **THEN** the system attempts recovery using SQLite's RECOVER command
- **THEN** the system notifies the admin of the issue
- **THEN** the system continues operation if recovery succeeds

#### Scenario: Database connection pool exhaustion
- **WHEN** all connections in the pool are in use
- **THEN** the system logs a warning about pool exhaustion
- **THEN** the system queues new requests until connections become available
- **THEN** the system increases pool size if configured to do so
