## ADDED Requirements

### Requirement: Review reports communicate trust and coverage clearly
The system SHALL produce review reports that make review coverage, evidence quality, and fallback conditions explicit.

#### Scenario: Coverage and fallback summary
- **WHEN** a review report is generated
- **THEN** it includes the number of reviewed files and the number of skipped, unsupported, or patchless files
- **THEN** it states whether semantic context was available
- **THEN** it states whether the job used LLM enhancement, rule-only fallback, or partial review behavior

#### Scenario: Risk and confidence presentation
- **WHEN** a review report is generated
- **THEN** it presents an overall risk level
- **THEN** it presents a confidence or evidence-quality indicator for the review outcome
- **THEN** it highlights the highest-value impact, security, and logic findings before lower-priority notes

### Requirement: Summary comments are concise but loss-aware
The system SHALL publish summary comments that are short enough for platform readability while preserving visibility into overflow and fallback findings.

#### Scenario: Summary comment structure
- **WHEN** a review completes successfully
- **THEN** the summary comment includes overall risk, key findings, inline-comment publication counts, and a link or reference to the stored report
- **THEN** the summary comment notes if some findings were suppressed, skipped, or moved to fallback sections

#### Scenario: Actionable next steps
- **WHEN** the report or summary presents findings
- **THEN** it includes concrete next actions or investigation prompts instead of only descriptive issue text
