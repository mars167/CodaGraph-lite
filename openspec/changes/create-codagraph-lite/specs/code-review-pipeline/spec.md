## ADDED Requirements

### Requirement: Job Queue Integration for PR Review
The system SHALL use SQLite-based job queue for PR review processing.

#### Scenario: Submit PR review job
- **WHEN** webhook receives PR opened/synced event
- **THEN** the system creates job in SQLite job queue
- **THEN** the job includes PR metadata (platform, owner, repo, pr_number)
- **THEN** the job type is set to "code-review"
- **THEN** the system queues job for processing

#### Scenario: Process PR review job
- **WHEN** worker picks up PR review job
- **THEN** the system updates job status to "processing"
- **THEN** the system clones repository to workspace
- **THEN** the system indexes repository with git-ai
- **THEN** the system calls context agent for context gathering
- **THEN** the system calls review agent for code analysis

#### Scenario: Complete PR review job
- **WHEN** code review analysis completes
- **THEN** the system generates review comments
- **THEN** the system posts comments to platform (GitHub/Gitee/GitLab)
- **THEN** the system stores analysis results in database
- **THEN** the system updates job status to "completed"

### Requirement: In-Memory Caching for Job Data
The system SHALL use in-memory caching to reduce database queries.

#### Scenario: Cache job data
- **WHEN** a job is being processed
- **THEN** the system caches job metadata in memory
- **THEN** the system caches PR data in memory
- **THEN** the system uses cached data for job operations
- **THEN** the system avoids repeated database queries

#### Scenario: Cache expiration
- **WHEN** a job completes
- **THEN** the system clears cached job data from memory
- **THEN** the system frees memory resources
- **THEN** the system logs cache clearing

#### Scenario: Cache size limit
- **WHEN** in-memory cache exceeds configured size
- **THEN** the system evicts oldest cached entries
- **THEN** the system implements LRU (Least Recently Used) eviction
- **THEN** the system logs cache eviction events

### Requirement: Repository Cloning and Indexing
The system SHALL clone repositories and index with git-ai for analysis.

#### Scenario: Clone repository
- **WHEN** job starts processing
- **THEN** the system clones repository to workspace directory
- **THEN** the system uses workspace pattern: `/tmp/repos/{platform}/{owner}/{repo}/{pr_number}/{job_id}/`
- **THEN** the system uses OAuth token for authentication
- **THEN** the system verifies clone success

#### Scenario: Index repository with git-ai
- **WHEN** repository clone completes
- **THEN** the system runs git-ai index command
- **THEN** the system waits for indexing to complete
- **THEN** the system verifies index creation in `.git-ai/` directory
- **THEN** the system logs indexing success or failure

#### Scenario: Handle indexing failure
- **WHEN** git-ai indexing fails
- **THEN** the system logs error details
- **THEN** the system retries indexing with exponential backoff
- **THEN** the system marks job as failed after max retries
- **THEN** the system cleans up workspace directory

### Requirement: Context Agent Integration
The system SHALL integrate with context agent for intelligent context gathering.

#### Scenario: Call context agent
- **WHEN** code review needs context information
- **THEN** the system spawns context-agent Python process
- **THEN** the system sends analysis request via gRPC
- **THEN** the system includes repository path and PR details
- **THEN** the system waits for context collection to complete

#### Scenario: Context agent uses ReAct loop
- **WHEN** context agent is processing
- **THEN** the agent uses ReAct pattern (Reason-Act-Observe)
- **THEN** the agent queries git-ai for semantic understanding
- **THEN** the agent iterates up to max_iterations (default 5)
- **THEN** the agent collects relevant context for PR review

#### Scenario: Context agent timeout
- **WHEN** context agent exceeds timeout (default 5 minutes)
- **THEN** the system terminates context agent process
- **THEN** the system logs timeout event
- **THEN** the system proceeds with partial context or fails job
- **THEN** the system cleans up process resources

### Requirement: Review Agent Integration
The system SHALL integrate with review agent for LLM-powered code analysis.

#### Scenario: Call review agent
- **WHEN** context gathering completes
- **THEN** the system spawns review-agent Python process
- **THEN** the system sends review request via gRPC
- **THEN** the system includes context from context agent
- **THEN** the system includes PR diff and metadata

#### Scenario: Review agent per-file analysis
- **WHEN** review agent processes PR
- **THEN** the agent analyzes changed files individually
- **THEN** the agent generates review comments per file
- **THEN** the agent identifies potential issues and improvements
- **THEN** the agent formats comments for platform posting

#### Scenario: Review agent timeout
- **WHEN** review agent exceeds timeout (default 10 minutes)
- **THEN** the system terminates review agent process
- **THEN** the system logs timeout event
- **THEN** the system marks job as failed
- **THEN** the system notifies admin of analysis failure

### Requirement: Job Retry Mechanism
The system SHALL retry failed jobs with exponential backoff.

#### Scenario: Job fails with retryable error
- **WHEN** job fails with transient error (network, timeout)
- **THEN** the system increments attempts counter
- **THEN** the system sets job status back to "pending"
- **THEN** the system schedules retry with exponential backoff (2^attempts seconds)
- **THEN** the system logs retry event

#### Scenario: Job fails with non-retryable error
- **WHEN** job fails with permanent error (authentication, permission)
- **THEN** the system sets job status to "failed"
- **THEN** the system stores error message in job record
- **THEN** the system does not retry the job
- **THEN** the system notifies admin of failure

#### Scenario: Job exceeds max retry limit
- **WHEN** job fails and attempts reach max limit (default 3)
- **THEN** the system sets job status to "dead"
- **THEN** the system moves job to dead letter queue
- **THEN** the system logs permanent failure
- **THEN** the system notifies admin of permanent failure

### Requirement: Review Comment Posting
The system SHALL post review comments to the platform.

#### Scenario: Post review comments to GitHub
- **WHEN** code review analysis completes for GitHub PR
- **THEN** the system formats comments for GitHub API
- **THEN** the system posts comments via GitHub REST API
- **THEN** the system uses OAuth token for authentication
- **THEN** the system handles API rate limits with retry

#### Scenario: Post review comments to Gitee
- **WHEN** code review analysis completes for Gitee PR
- **THEN** the system formats comments for Gitee API
- **THEN** the system posts comments via Gitee REST API
- **THEN** the system uses OAuth token for authentication
- **THEN** the system handles API rate limits with retry

#### Scenario: Post review comments to GitLab
- **WHEN** code review analysis completes for GitLab MR
- **THEN** the system formats comments for GitLab API
- **THEN** the system posts comments via GitLab REST API
- **THEN** the system uses OAuth token for authentication
- **THEN** the system handles API rate limits with retry

### Requirement: Analysis Result Storage
The system SHALL store analysis results in SQLite database.

#### Scenario: Store completed analysis
- **WHEN** code review completes successfully
- **THEN** the system stores analysis record in database
- **THEN** the system includes PR metadata (platform, owner, repo, pr_number)
- **THEN** the system includes review comments and suggestions
- **THEN** the system includes analysis duration and timestamp
- **THEN** the system includes job status

#### Scenario: Retrieve analysis history
- **WHEN** admin requests analysis history
- **THEN** the system queries database for analysis records
- **THEN** the system supports filtering by repository and date range
- **THEN** the system returns paginated results
- **THEN** the system sorts by creation date descending

### Requirement: Job Priority and Ordering
The system SHALL support job prioritization for processing order.

#### Scenario: High priority job
- **WHEN** a job is submitted with high priority
- **THEN** the system sets job priority to 0
- **THEN** the system processes job before normal priority jobs
- **THEN** the system is suitable for urgent manual reviews

#### Scenario: Normal priority job
- **WHEN** a webhook creates a job
- **THEN** the system sets job priority to 5 (normal)
- **THEN** the system processes job in FIFO order with other normal jobs

#### Scenario: Low priority job
- **WHEN** a job is submitted with low priority
- **THEN** the system sets job priority to 10
- **THEN** the system processes job after higher priority jobs

### Requirement: Workspace Management
The system SHALL manage isolated workspace directories for each job.

#### Scenario: Create workspace directory
- **WHEN** a job starts processing
- **THEN** the system creates workspace directory at `/tmp/repos/{platform}/{owner}/{repo}/{pr_number}/{job_id}/`
- **THEN** the system ensures directory is writable
- **THEN** the system sets appropriate permissions

#### Scenario: Cleanup workspace directory
- **WHEN** a job completes (success or failure)
- **THEN** the system cleans up workspace directory
- **THEN** the system removes all cloned repository files
- **THEN** the system removes `.git-ai/` index directory
- **THEN** the system logs workspace cleanup

#### Scenario: Workspace cleanup failure
- **WHEN** workspace cleanup fails (permissions, locked files)
- **THEN** the system logs the cleanup failure
- **THEN** the system schedules background cleanup retry
- **THEN** the system does not fail the job due to cleanup issues

### Requirement: Progress Tracking
The system SHALL track and report job progress.

#### Scenario: Update job progress
- **WHEN** a job processing stage completes
- **THEN** the system updates job progress percentage
- **THEN** the system stores current processing stage
- **THEN** the system logs progress update
- **THEN** the system may emit progress event for real-time updates

#### Scenario: Query job progress
- **WHEN** admin requests job status
- **THEN** the system returns job progress percentage
- **THEN** the system returns current processing stage
- **THEN** the system returns estimated time remaining
- **THEN** the system returns job status (pending, processing, completed, failed)

### Requirement: Job Timeout Handling
The system SHALL enforce timeout limits for job execution.

#### Scenario: Job execution timeout
- **WHEN** a job runs longer than configured timeout (default 30 minutes)
- **THEN** the system terminates the job process
- **THEN** the system increments attempts counter
- **THEN** the system sets job status to "pending" or "failed"
- **THEN** the system logs the timeout event

#### Scenario: Individual stage timeout
- **WHEN** a job stage (clone, index, context, review) exceeds stage timeout
- **THEN** the system terminates the stage process
- **THEN** the system increments attempts counter
- **THEN** the system may retry just the failed stage
- **THEN** the system logs the stage timeout

### Requirement: Error Notification
The system SHALL notify admin of job failures.

#### Scenario: Job fails with error
- **WHEN** a job fails after all retries
- **THEN** the system logs the failure with full error details
- **THEN** the system stores error in job record
- **THEN** the system displays error in admin dashboard
- **THEN** the system may send notification if configured

#### Scenario: Multiple jobs fail
- **WHEN** multiple jobs fail in short period
- **THEN** the system aggregates failure notifications
- **THEN** the system notifies admin of systematic issues
- **THEN** the system may pause job processing if many failures
- **THEN** the system logs the failure pattern
