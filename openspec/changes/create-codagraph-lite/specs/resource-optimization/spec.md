## ADDED Requirements

### Requirement: Memory Budget Enforcement
The system SHALL enforce strict memory limits on 2u2g servers.

#### Scenario: Enforce Node.js memory limit
- **WHEN** Node.js processes start (frontend and backend)
- **THEN** the system sets `--max-old-space-size=200` via environment variable
- **THEN** the system verifies memory limit is applied
- **THEN** the system logs the configured memory limit

#### Scenario: Enforce Python agent memory limit
- **WHEN** spawning a Python agent process
- **THEN** the system sets Python memory limit (e.g., via ulimit or resource module)
- **THEN** the system monitors agent memory usage
- **THEN** the system terminates agent if it exceeds limit

#### Scenario: Enforce SQLite cache limit
- **WHEN** initializing SQLite database
- **THEN** the system sets cache size to 2MB
- **THEN** the system uses PRAGMA cache_size=-2000
- **THEN** the system verifies cache configuration

### Requirement: Single Concurrent Job Processing
The system SHALL process jobs serially, never in parallel.

#### Scenario: Job queue with worker count 1
- **WHEN** the job worker starts
- **THEN** the system starts exactly 1 worker process
- **THEN** the system reads WORKER_COUNT environment variable
- **THEN** the system validates WORKER_COUNT is 1 (rejects higher values on 2u2g)
- **THEN** the system logs worker count configuration

#### Scenario: Job enters queue while another job processing
- **WHEN** a new job is submitted while a job is processing
- **THEN** the system queues the new job with status "pending"
- **THEN** the system does not spawn additional workers
- **THEN** the new job waits until current job completes

#### Scenario: Attempt to enable concurrent jobs
- **WHEN** ENABLE_CONCURRENT_JOBS is set to true
- **THEN** the system logs warning that concurrent jobs are not supported on 2u2g
- **THEN** the system ignores the setting and keeps worker count at 1
- **THEN** the system documents the limitation

### Requirement: Ephemeral Agent Processes
The system SHALL spawn agents on-demand and terminate immediately after completion.

#### Scenario: Spawn context agent
- **WHEN** a job requires context analysis
- **THEN** the system spawns context-agent Python subprocess
- **THEN** the system communicates via gRPC on localhost
- **THEN** the system waits for agent to complete
- **WHEN** context analysis completes
- **THEN** the system immediately terminates the agent process
- **THEN** the system waits for process cleanup
- **THEN** the system logs agent termination

#### Scenario: Spawn review agent
- **WHEN** a job requires code review
- **THEN** the system spawns review-agent Python subprocess
- **THEN** the system communicates via gRPC on localhost
- **THEN** the system waits for agent to complete
- **WHEN** code review completes
- **THEN** the system immediately terminates the agent process
- **THEN** the system waits for process cleanup
- **THEN** the system logs agent termination

#### Scenario: Agent fails to terminate
- **WHEN** agent process does not terminate within 5 seconds
- **THEN** the system sends SIGKILL signal
- **THEN** the system logs force termination
- **THEN** the system continues with job completion

### Requirement: Memory Monitoring and Alerts
The system SHALL monitor memory usage and alert on critical thresholds.

#### Scenario: Report memory usage
- **WHEN** admin requests `/api/status/memory`
- **THEN** the system returns total memory usage
- **THEN** the system returns memory usage per process
- **THEN** the system returns available memory
- **THEN** the system returns swap usage

#### Scenario: Memory usage warning
- **WHEN** memory usage exceeds 80% (1.6GB)
- **THEN** the system logs warning with current usage
- **THEN** the system includes process memory breakdown
- **THEN** the system may pause job queue if memory is critical

#### Scenario: Memory usage critical
- **WHEN** memory usage exceeds 95% (1.9GB)
- **THEN** the system logs critical error
- **THEN** the system stops accepting new jobs
- **THEN** the system notifies admin of memory exhaustion
- **THEN** the system may trigger GC if applicable

### Requirement: Swap Detection and Warning
The system SHALL detect swap availability and warn if absent.

#### Scenario: Detect swap on startup
- **WHEN** the backend service starts
- **THEN** the system checks for available swap space
- **THEN** the system logs swap availability status
- **THEN** the system logs recommended swap configuration if absent

#### Scenario: Warn about missing swap
- **WHEN** no swap is detected on 2GB server
- **THEN** the system logs warning that swap is recommended
- **THEN** the system provides setup instructions
- **THEN** the system does not prevent operation

#### Scenario: Swap usage monitoring
- **WHEN** swap is being used (>100MB)
- **THEN** the system logs warning about swap usage
- **THEN** the system includes swap usage amount
- **THEN** the system recommends increasing RAM if swap is high

### Requirement: Agent Timeout Protection
The system SHALL enforce timeout limits for agent processes.

#### Scenario: Context agent timeout
- **WHEN** context agent runs longer than AGENT_TIMEOUT_CONTEXT (default 5 minutes)
- **THEN** the system sends SIGTERM to agent process
- **THEN** the system waits up to 5 seconds for graceful shutdown
- **THEN** the system sends SIGKILL if process doesn't terminate
- **THEN** the system logs the timeout event
- **THEN** the system marks job as failed with timeout error

#### Scenario: Review agent timeout
- **WHEN** review agent runs longer than AGENT_TIMEOUT_REVIEW (default 10 minutes)
- **THEN** the system sends SIGTERM to agent process
- **THEN** the system waits up to 5 seconds for graceful shutdown
- **THEN** the system sends SIGKILL if process doesn't terminate
- **THEN** the system logs the timeout event
- **THEN** the system marks job as failed with timeout error

### Requirement: git-ai Memory Optimization
The system SHALL configure git-ai CLI to use minimal memory.

#### Scenario: Configure git-ai memory limit
- **WHEN** running git-ai commands
- **THEN** the system sets GIT_AI_MAX_MEMORY=256m environment variable
- **THEN** the system passes memory limit to git-ai process
- **THEN** the system verifies git-ai respects the limit

#### Scenario: Optimize git-ai indexing
- **WHEN** git-ai indexes a repository
- **THEN** the system uses batch size limit to control memory
- **THEN** the system monitors git-ai memory usage
- **THEN** the system logs indexing progress and memory

#### Scenario: git-ai memory limit exceeded
- **WHEN** git-ai process exceeds memory limit
- **THEN** the system terminates git-ai process
- **THEN** the system logs memory limit violation
- **THEN** the system retries with reduced batch size

### Requirement: Memory Cleanup After Job
The system SHALL proactively clean up memory after each job completes.

#### Scenario: Cleanup after job success
- **WHEN** a job completes successfully
- **THEN** the system terminates all agent processes
- **THEN** the system removes workspace directory
- **THEN** the system calls Python garbage collection if applicable
- **THEN** the system logs memory usage before and after cleanup

#### Scenario: Cleanup after job failure
- **WHEN** a job fails
- **THEN** the system terminates all agent processes
- **THEN** the system removes workspace directory
- **THEN** the system logs cleanup status
- **THEN** the system prepares memory for next job

#### Scenario: Verify memory released
- **WHEN** cleanup completes
- **THEN** the system verifies agent processes are terminated
- **THEN** the system checks memory usage is reduced
- **THEN** the system logs final memory state

### Requirement: Process Health Monitoring
The system SHALL monitor process health and detect zombie processes.

#### Scenario: Check for zombie processes
- **WHEN** the system performs periodic health check
- **THEN** the system scans for zombie agent processes
- **THEN** the system logs zombie process detection
- **THEN** the system terminates zombie processes

#### Scenario: Orphaned process cleanup
- **WHEN** the system detects orphaned agent processes
- **THEN** the system terminates orphaned processes
- **THEN** the system logs cleanup details
- **THEN** the system checks for resource leaks

### Requirement: Resource Usage Reporting
The system SHALL provide comprehensive resource usage reports.

#### Scenario: Generate resource usage report
- **WHEN** admin requests `/api/status/resources`
- **THEN** the system returns current CPU usage
- **THEN** the system returns memory usage breakdown
- **THEN** the system returns disk usage
- **THEN** the system returns active process list
- **THEN** the system returns job queue status

#### Scenario: Historical resource usage
- **WHEN** admin requests resource history
- **THEN** the system returns resource usage trends
- **THEN** the system includes peak memory usage
- **THEN** the system includes average job duration
- **THEN** the system includes job success rate

### Requirement: Graceful Degradation
The system SHALL degrade gracefully when resources are constrained.

#### Scenario: Memory pressure detected
- **WHEN** available memory drops below 200MB
- **THEN** the system slows job processing
- **THEN** the system increases job queue polling interval
- **THEN** the system admin is notified of degraded performance

#### Scenario: CPU pressure detected
- **WHEN** CPU usage is sustained above 90%
- **THEN** the system may throttle non-critical operations
- **THEN** the system logs CPU pressure warning
- **THEN** the system continues accepting jobs but may process slower
