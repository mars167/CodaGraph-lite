## ADDED Requirements

### Requirement: The review system supports an improve mode
The system SHALL support an `improve` review mode that captures structured review traces for prompt, workflow, and toolchain tuning.

#### Scenario: Improve mode review trace
- **WHEN** a review job runs in `improve` mode
- **THEN** the system records stage transitions, stage timings, prompt version identifiers, tool invocations, evidence references, fallback decisions, and rationale summaries
- **THEN** the trace is persisted with the review result or a related debug artifact
- **THEN** operators can inspect the trace to understand why the review produced or suppressed findings

#### Scenario: Normal mode remains concise
- **WHEN** a review job runs in `normal` mode
- **THEN** the system records only the standard job logs and result metadata
- **THEN** improve-mode trace fields are omitted or minimized

### Requirement: Improve mode traces are governed and safe
The system SHALL treat improve-mode traces as structured diagnostics, not unrestricted raw internal reasoning dumps.

#### Scenario: Reasoning trace boundary
- **WHEN** improve-mode traces are generated
- **THEN** they include concise rationale summaries, evidence links, and suppression reasons
- **THEN** they SHALL NOT require unrestricted raw hidden chain-of-thought text to be persisted
- **THEN** they SHALL follow the same redaction rules as standard logs

#### Scenario: Trace redaction
- **WHEN** tool outputs, prompts, or evidence snippets contain tokens, secrets, or sensitive identifiers
- **THEN** the system redacts or truncates them before persistence
- **THEN** the trace remains useful for debugging without leaking credentials
