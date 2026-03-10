## ADDED Requirements

### Requirement: Drifted unused review paths are removed after audit
The system SHALL remove the legacy gRPC review-agent path if an audit confirms it is not required by active workers, routes, deployment scripts, or supported operations.

#### Scenario: Reference audit confirms the path is unused
- **WHEN** the implementation audit shows the active product path does not depend on `CodeReviewService`, the gRPC review-agent client/server pair, or dead webhook routes
- **THEN** the system removes those files and their dead tests/docs in the same change
- **THEN** the active review flow remains `CodeReviewWorker -> ReviewExecutionService -> AdvancedReviewEngine`

#### Scenario: Residual dependency is discovered
- **WHEN** the audit reveals a remaining dependency on the legacy path
- **THEN** that dependency is migrated to the active review flow first
- **THEN** the legacy path is not partially deleted until the migration is complete

### Requirement: Documentation reflects the single supported review path
The system SHALL update architecture and troubleshooting documentation to describe the supported review path only.

#### Scenario: Post-removal documentation update
- **WHEN** the legacy gRPC review-agent path is removed
- **THEN** architecture, deployment, and troubleshooting docs are updated to remove or replace obsolete references
- **THEN** supported operator guidance references only the active review runtime and its improve/debug surfaces
