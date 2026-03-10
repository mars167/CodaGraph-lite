## ADDED Requirements

### Requirement: Review jobs use repository mirrors and detached worktrees
The system SHALL execute active PR review jobs from a reusable repository mirror and a per-job detached worktree instead of cloning a fresh repository for every review job.

#### Scenario: Prepare review workspace from mirror
- **WHEN** a review job starts
- **THEN** the system ensures a reusable repository mirror exists for that repository
- **THEN** the system fetches the required refs or SHAs into the mirror
- **THEN** the system creates a detached worktree for the specific review job
- **THEN** the review job analyzes the detached worktree and removes it when the job ends

#### Scenario: Preserve mirror while cleaning the job workspace
- **WHEN** a review job completes, fails, or is cancelled
- **THEN** the system removes the detached worktree
- **THEN** the system keeps the repository mirror for reuse
- **THEN** cleanup failure SHALL be logged without overwriting the final job result

### Requirement: Review execution uses credential-safe git access
The system SHALL avoid exposing repository access tokens in child-process arguments or unredacted logs.

#### Scenario: Authenticated git execution
- **WHEN** the review runtime executes authenticated git commands
- **THEN** it uses a credential-safe mechanism such as temporary credential helpers, request headers, or askpass
- **THEN** access tokens SHALL NOT appear in process arguments
- **THEN** access tokens SHALL be redacted from logs and persisted traces

### Requirement: Review execution is bounded and cancellable
The system SHALL enforce explicit execution budgets for repository preparation, context gathering, LLM review, and publication.

#### Scenario: Stage timeout
- **WHEN** a review stage exceeds its configured time budget
- **THEN** the system aborts or degrades that stage
- **THEN** the system records the timeout in job logs or trace metadata
- **THEN** the final result indicates whether the review completed partially or failed

#### Scenario: Manual cancellation
- **WHEN** an operator cancels a running review job
- **THEN** the system stops pending review work
- **THEN** the system cleans up the detached worktree
- **THEN** the final analysis state is marked cancelled instead of hanging indefinitely
