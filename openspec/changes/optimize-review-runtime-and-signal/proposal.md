## Why

The active review path in CodaGraph-lite now produces materially better results than the original diff-only implementation, but it still has four structural weaknesses:

- Review execution is expensive and opaque: each job prepares a fresh repository workspace, there is no explicit improve/debug mode for prompt and workflow tuning, and failure analysis remains log-fragmented.
- Review output still carries too much low-signal noise: security, logic correctness, and change-impact issues are mixed with low-value style findings that dilute trust.
- The review report and publication flow do not clearly communicate skipped files, fallback behavior, evidence quality, or what the reviewer should do next.
- A drifted legacy gRPC review-agent path still exists in the repository even though the worker uses `CodeReviewWorker -> ReviewExecutionService -> AdvancedReviewEngine`, creating maintenance risk and false implementation options.

## What Changes

- Rework review runtime preparation around a repository mirror + `git worktree` model, with explicit execution budgets, cancellation, and credential-safe git access.
- Add an `improve` review mode that records a structured review trace: prompt version, review stages, tool invocations, evidence references, fallback decisions, and rationale summaries for workflow tuning.
- Redesign review scoring and workflow to prioritize impact analysis, call-chain reasoning, security analysis, and logic correctness while suppressing low-value style noise by default.
- Refresh the review report template and publication workflow to surface risk, confidence, skipped/unsupported files, fallback status, evidence quality, and concrete next actions.
- Audit the legacy `CodeReviewService` / gRPC review-agent path and remove it completely if it is confirmed unused by active routes, workers, and deployment scripts.

## Capabilities

### New Capabilities
- `review-runtime-efficiency`: Execute review jobs with repository mirrors, detached worktrees, explicit timeouts, and credential-safe git operations.
- `review-improve-mode`: Capture structured review traces for prompt/workflow tuning without relying on ad hoc logs.
- `review-signal-prioritization`: Score and rank findings by impact, security, logic, and correctness with noise suppression for weak style findings.
- `review-report-presentation`: Produce clearer review reports and summary comments with evidence and fallback transparency.
- `legacy-review-path-removal`: Remove the drifted unused review path after an explicit reference audit.

### Modified Capabilities
- `repository-backed-review-runtime`: Change workspace preparation from full per-job clone behavior to reusable mirror/worktree behavior.
- `semantic-pr-review`: Shift review emphasis from generic heuristics toward impact/security/logic reasoning and reduce low-value style weight.
- `inline-review-commenting`: Improve summary/fallback presentation and publication metadata.

## Impact

**Affected code:**
- `server/src/review/`
- `server/src/services/ReviewExecutionService.ts`
- `server/src/jobs/CodeReviewWorker.ts`
- `server/src/review/reportPresentation.ts`
- `server/src/routes/`
- Removal candidates under `server/src/services/CodeReviewService.ts`, `server/src/agent/ReviewAgentClient.ts`, `review-agent/`, and related dead tests/docs

**Affected systems:**
- Workspace lifecycle and repository checkout behavior
- Job logging and analysis payload size / structure
- Prompt iteration workflow and operator observability
- PR comment publication and report rendering
- Deployment footprint if the legacy Python review-agent is retired

**Dependencies / configuration:**
- Reuses existing git, platform OAuth, and LLM integrations
- Adds a new review mode / trace configuration surface
- Requires log redaction and retention rules for improve-mode traces
