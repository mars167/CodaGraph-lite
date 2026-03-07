## ADDED Requirements

### Requirement: Job Queue Initialization
The system SHALL initialize the SQLite-based job queue on startup.

#### Scenario: Job queue initialization
- **WHEN** the backend service starts
- **THEN** the system creates the `jobs` table if it doesn't exist
- **THEN** the system creates indexes on status, created_at, and priority columns
- **THEN** the system starts the job worker process
- **THEN** the system sets worker to poll for jobs at configured interval

#### Scenario: Job table already exists
- **WHEN** the backend service starts and `jobs` table exists
- **THEN** the system verifies table structure matches expected schema
- **THEN** the system applies any schema migrations if needed
- **THEN** the system resumes processing of pending jobs

### Requirement: Job Submission
The system SHALL allow submission of jobs to the queue.

#### Scenario: Submit a new job
- **WHEN** a client submits a job via API
- **THEN** the system validates the job type and payload
- **THEN** the system inserts the job into the `jobs` table with status "pending"
- **THEN** the system sets created_at timestamp
- **THEN** the system assigns a unique job ID
- **THEN** the system returns the job ID to the client

#### Scenario: Submit job with invalid payload
- **WHEN** a client submits a job with invalid payload
- **THEN** the system returns a 400 error
- **THEN** the system includes validation error details
- **THEN** the system does not create a job record

### Requirement: Job Polling and Processing
The system SHALL poll for pending jobs and process them in order.

#### Scenario: Worker polls for pending jobs
- **WHEN** the worker poll interval elapses
- **THEN** the system queries for jobs with status "pending" ordered by priority and created_at
- **THEN** the system uses SELECT FOR UPDATE to prevent race conditions
- **THEN** the system limits results to configured batch size

#### Scenario: Worker processes a job
- **WHEN** a pending job is found
- **THEN** the system updates job status to "processing"
- **THEN** the system sets started_at timestamp
- **THEN** the system executes the job handler based on job type
- **THEN** the system updates job status to "completed" or "failed"

#### Scenario: No pending jobs available
- **WHEN** no pending jobs are found during polling
- **THEN** the system waits for the next poll interval
- **THEN** the system does not process any jobs

### Requirement: Job Retry Mechanism
The system SHALL retry failed jobs with exponential backoff.

#### Scenario: Job fails on first attempt
- **WHEN** a job execution fails
- **THEN** the system increments the attempts counter
- **THEN** the system stores the error message and stack trace
- **THEN** the system checks if attempts are less than max retry limit
- **THEN** the system sets job status to "pending" with backoff delay
- **THEN** the system schedules retry with exponential backoff (2^attempts seconds)

#### Scenario: Job exceeds max retry limit
- **WHEN** a job fails and attempts reach max retry limit
- **THEN** the system sets job status to "dead"
- **THEN** the system stores final error message
- **THEN** the system logs the job as permanently failed
- **THEN** the system does not retry the job

#### Scenario: Job fails with non-retryable error
- **WHEN** a job fails with a non-retryable error (validation, permission)
- **THEN** the system sets job status to "failed"
- **THEN** the system stores the error message
- **THEN** the system does not schedule retry

### Requirement: Job Prioritization
The system SHALL support job prioritization for processing order.

#### Scenario: Submit high priority job
- **WHEN** a client submits a job with priority "high"
- **THEN** the system inserts the job with priority value 0
- **THEN** the system processes high priority jobs before normal priority jobs

#### Scenario: Submit normal priority job
- **WHEN** a client submits a job without specifying priority
- **THEN** the system inserts the job with priority value 5
- **THEN** the system processes normal priority jobs after high priority jobs

#### Scenario: Submit low priority job
- **WHEN** a client submits a job with priority "low"
- **THEN** the system inserts the job with priority value 10
- **THEN** the system processes low priority jobs last

### Requirement: Job Status Tracking
The system SHALL track job status throughout lifecycle.

#### Scenario: Query job status
- **WHEN** a client requests job status by ID
- **THEN** the system retrieves the job from database
- **THEN** the system returns job status (pending, processing, completed, failed, dead)
- **THEN** the system includes timestamps (created_at, started_at, completed_at)
- **THEN** the system includes attempts counter if job failed

#### Scenario: List all jobs
- **WHEN** a client requests list of all jobs
- **THEN** the system queries jobs from database
- **THEN** the system supports filtering by status and date range
- **THEN** the system supports pagination (limit, offset)
- **THEN** the system returns sorted by created_at descending

### Requirement: Job Cancellation
The system SHALL allow cancellation of pending jobs.

#### Scenario: Cancel pending job
- **WHEN** a client requests cancellation of a pending job
- **THEN** the system verifies job status is "pending"
- **THEN** the system updates job status to "cancelled"
- **THEN** the system includes cancellation timestamp
- **THEN** the system returns success response

#### Scenario: Cancel processing job
- **WHEN** a client requests cancellation of a processing job
- **THEN** the system sends abort signal to the worker
- **THEN** the system waits for worker to gracefully stop
- **THEN** the system updates job status to "cancelled" if worker stops
- **THEN** the system returns success response

#### Scenario: Cancel completed job
- **WHEN** a client requests cancellation of a completed job
- **THEN** the system returns 400 error
- **THEN** the system includes message that job is already completed

### Requirement: Dead Letter Queue
The system SHALL maintain a dead letter queue for permanently failed jobs.

#### Scenario: Job moves to dead letter queue
- **WHEN** a job exceeds max retry limit
- **THEN** the system sets job status to "dead"
- **THEN** the system moves job metadata to dead letter queue table
- **THEN** the system logs the job ID for admin review

#### Scenario: Admin reviews dead jobs
- **WHEN** the admin requests list of dead jobs
- **THEN** the system queries dead letter queue table
- **THEN** the system returns list of dead jobs with error details
- **THEN** the system includes option to retry dead jobs

#### Scenario: Admin retries dead job
- **WHEN** the admin requests retry of a dead job
- **THEN** the system resets attempts counter to 0
- **THEN** the system updates job status to "pending"
- **THEN** the system clears error message
- **THEN** the system returns success response

### Requirement: Job Timeout Handling
The system SHALL enforce timeout limits for job execution.

#### Scenario: Job execution timeout
- **WHEN** a job runs longer than configured timeout
- **THEN** the system terminates the job process
- **THEN** the system increments attempts counter
- **THEN** the system sets job status to "pending" or "failed" based on retry limit
- **THEN** the system logs the timeout event

#### Scenario: Worker heartbeat timeout
- **WHEN** a worker doesn't update job status within heartbeat interval
- **THEN** the system marks job as abandoned
- **THEN** the system resets job status to "pending"
- **THEN** the system increments attempts counter
- **THEN** the system logs the abandonment event

### Requirement: Job Metrics and Monitoring
The system SHALL track and report job queue metrics.

#### Scenario: Query job queue metrics
- **WHEN** the admin requests job queue metrics
- **THEN** the system returns count of jobs by status
- **THEN** the system returns average processing time by job type
- **THEN** the system returns success/failure rate
- **THEN** the system returns oldest pending job age

#### Scenario: Monitor job queue health
- **WHEN** pending job count exceeds threshold
- **THEN** the system logs warning about job queue backlog
- **THEN** the system includes current pending count
- **THEN** the system may increase worker count if configured

### Requirement: Job Worker Scaling
The system SHALL support configurable worker count for job processing.

#### Scenario: Configure worker count
- **WHEN** the admin sets worker count via environment variable
- **THEN** the system starts the configured number of worker processes
- **THEN** the system coordinates workers to avoid duplicate job processing
- **THEN** the system distributes jobs among workers

#### Scenario: Auto-scale workers based on backlog
- **WHEN** pending job backlog exceeds threshold and auto-scale enabled
- **THEN** the system increases worker count up to max limit
- **WHEN** backlog decreases below threshold
- **THEN** the system reduces worker count to base level
