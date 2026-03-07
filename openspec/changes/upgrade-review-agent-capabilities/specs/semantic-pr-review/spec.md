## ADDED Requirements

### Requirement: File review uses semantic and file-content context
The system SHALL review each supported changed file using the diff, real file content when available, and semantic context derived from changed symbols and repository search.

#### Scenario: File review with semantic context
- **WHEN** a supported source file is changed in a PR
- **THEN** the system extracts changed symbols from the diff
- **THEN** the system gathers related symbol, caller, callee, or text-search context from the repository
- **THEN** the system combines that context with the file diff and file content for review
- **THEN** the file review output includes zero or more structured findings and a file summary

#### Scenario: Rule-only fallback
- **WHEN** no valid LLM configuration is available or the LLM call fails
- **THEN** the system still runs deterministic review rules
- **THEN** the system still produces structured findings and a file summary
- **THEN** the report marks that the review used fallback mode

### Requirement: Review output is structured and actionable
The system SHALL normalize review output into actionable findings that can be rendered inline or in summary comments.

#### Scenario: Structured finding fields
- **WHEN** the system records a finding
- **THEN** the finding includes file path, severity, category, title, description, and actionable suggestion
- **THEN** line-aware findings include a single target line number in the head file
- **THEN** the finding MAY include a code-level suggestion snippet when available

#### Scenario: Finding deduplication
- **WHEN** multiple review sources report materially identical findings for the same file and line
- **THEN** the system deduplicates them before publishing comments
- **THEN** the highest-severity version is retained
- **THEN** the final report includes the deduplicated findings only

### Requirement: The system performs PR-level synthesis
The system SHALL generate a PR-level summary that reasons across file-level findings and cross-file change patterns.

#### Scenario: Multi-file PR summary
- **WHEN** a PR contains multiple changed files
- **THEN** the system generates a PR-level summary after file reviews complete
- **THEN** the summary includes an overall risk level and cross-file observations
- **THEN** the summary is stored in the analysis result payload

#### Scenario: Missing tests or cross-file consistency issues
- **WHEN** the PR introduces new logic paths, API changes, or inconsistent patterns across files
- **THEN** the PR-level review may produce cross-file findings even when no single file fully explains the issue
- **THEN** those findings are included in the top-level summary comment
