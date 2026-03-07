## ADDED Requirements

### Requirement: Findings are mapped back to diff positions
The system SHALL attempt to map line-aware findings to inline PR review comment positions.

#### Scenario: Inline comment on modified or added line
- **WHEN** a finding references a line that exists on the right side of a diff hunk
- **THEN** the system maps the finding to the platform comment position for that file and line
- **THEN** the system posts an inline review comment for that finding

#### Scenario: Unmappable finding fallback
- **WHEN** a finding cannot be mapped to an inline diff position
- **THEN** the system does not discard the finding
- **THEN** the finding is appended to the summary or fallback comment body
- **THEN** the final report records that the finding was published as fallback instead of inline

### Requirement: Review publication is bounded and predictable
The system SHALL bound comment publication to avoid spamming the platform while preserving the highest-value findings.

#### Scenario: Inline comment limit
- **WHEN** the total number of inline-capable findings exceeds the configured publication cap
- **THEN** the system publishes the highest-priority findings inline first
- **THEN** remaining findings are summarized in the top-level comment
- **THEN** the report records how many findings were published inline versus fallback

#### Scenario: Top-level summary comment
- **WHEN** a review completes successfully
- **THEN** the system posts a top-level summary comment containing the overall risk level
- **THEN** the summary comment includes cross-file findings and any inline comment fallback items
- **THEN** the summary comment links the result back to the stored analysis record ID
