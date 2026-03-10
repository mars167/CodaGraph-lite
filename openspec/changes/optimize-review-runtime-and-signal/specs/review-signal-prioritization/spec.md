## ADDED Requirements

### Requirement: Review prioritizes impact, security, and logic analysis
The system SHALL prioritize findings about call-chain impact, data flow, security boundaries, logic correctness, and failure behavior above style-only feedback.

#### Scenario: Signal-first ranking
- **WHEN** the review system ranks findings for publication
- **THEN** impact, security, correctness, and logic findings receive higher priority than style-only findings
- **THEN** the review summary and inline publication focus on the highest-priority findings first

#### Scenario: Style noise suppression
- **WHEN** a finding is style-only and does not materially affect correctness, security, or maintainability risk
- **THEN** the system suppresses it from default publication
- **THEN** the finding MAY remain available in improve mode or a secondary report section

### Requirement: Review performs multi-pass reasoning over changed code
The system SHALL analyze changed code through explicit impact, security, logic, and synthesis passes instead of relying on a single flat heuristic pass.

#### Scenario: Call-chain and dependency impact analysis
- **WHEN** a PR changes a symbol, function, API boundary, or shared module
- **THEN** the system analyzes impacted callers, callees, dependent modules, or related tests when evidence is available
- **THEN** the resulting findings explain the likely blast radius or dependency implications

#### Scenario: Logic and partial-failure analysis
- **WHEN** the changed code introduces state changes, null/error branches, retries, ordering assumptions, or partial-failure paths
- **THEN** the system attempts to reason about those paths explicitly
- **THEN** findings include concrete failure-mode explanations or invariants at risk

#### Scenario: Security-focused review
- **WHEN** the changed code touches authentication, authorization, secrets, dynamic execution, untrusted input, or data exposure paths
- **THEN** the system raises the security analysis depth for those files or findings
- **THEN** the review output explains the boundary or trust assumption that may be violated
