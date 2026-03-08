## ADDED Requirements

### Requirement: Review jobs use a real repository workspace
The system SHALL execute active PR review jobs against a checked-out repository workspace that includes both the PR head commit and the PR base commit.

#### Scenario: Create review workspace
- **WHEN** a review job starts processing
- **THEN** the system creates an isolated workspace under the configured workspace root
- **THEN** the system clones the repository using the installation access token
- **THEN** the system fetches both the PR head SHA and the PR base SHA into the workspace
- **THEN** the system checks out the PR head SHA before analysis

#### Scenario: Load real file contents
- **WHEN** the system analyzes a changed file
- **THEN** it reads the head version of the file from the checked-out workspace when the file still exists
- **THEN** it reads the base version of the file from the base SHA when previous content is needed
- **THEN** it records file status, patch, additions, deletions, and changed symbol metadata in the review payload

#### Scenario: Workspace cleanup
- **WHEN** the review job completes, fails, or is cancelled
- **THEN** the system attempts to remove the workspace directory
- **THEN** workspace cleanup failure SHALL be logged
- **THEN** workspace cleanup failure SHALL NOT overwrite the final review job result

### Requirement: Review runtime degrades safely when repository context is partial
The system SHALL continue producing a review result when repository-aware analysis cannot fully complete.

#### Scenario: Git checkout partially fails
- **WHEN** the repository can be cloned but a specific base/head file read fails
- **THEN** the system continues review using the available diff and file metadata
- **THEN** the missing context is recorded in logs or report metadata
- **THEN** the job is not failed solely because one file could not be hydrated

#### Scenario: Semantic index is unavailable
- **WHEN** `Code Context Engine runtime` is not installed or runtime preparation fails
- **THEN** the system continues review using changed symbol extraction and repository text search fallback
- **THEN** the system records that semantic indexing was unavailable
- **THEN** the job result remains valid and publishable
