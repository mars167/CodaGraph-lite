## Context

The production review path is:

- `CodeReviewWorker -> ReviewExecutionService.execute() -> AdvancedReviewEngine.review()`

The repository still also contains a drifted legacy path:

- `CodeReviewService -> ContextAgentClient/ReviewAgentClient -> review-agent/`

The worker path is the only path that processes queued review jobs today. The legacy path is not part of the active worker execution path and has already diverged from the current review contract and protocol assumptions.

The next optimization step should therefore improve the active worker path and remove dead branches, instead of reviving the legacy gRPC stack.

## Goals / Non-Goals

**Goals:**
- Reduce repository-preparation cost and improve job cancellation behavior.
- Add a first-class improve mode for tuning prompts, tooling, and workflow stages.
- Increase the signal quality of findings by prioritizing impact, security, and logic analysis.
- Make reports and summary comments easier to trust and act on.
- Remove the drifted legacy review path if the audit confirms it is not part of active product behavior.

**Non-Goals:**
- Expose unrestricted raw hidden chain-of-thought logs.
- Rebuild the old Python gRPC review-agent as a second production path.
- Turn style-only lint feedback into a primary review signal.

## Decisions

### 1. Use repository mirrors with detached worktrees

Review jobs should stop cloning entire repositories into one-off workspaces. Instead, the runtime should:

1. Maintain a reusable bare mirror per repository under the workspace root.
2. Fetch the required refs/SHA into the mirror.
3. Create a detached worktree for each review job.
4. Remove the worktree at job end while retaining the mirror cache.

This reduces network and disk churn, improves 2u2g behavior, and makes it easier to bound cleanup cost.

Alternatives considered:
- Keep per-job clone/fetch behavior. Rejected because it is the current cost center.
- Share a mutable working copy between jobs. Rejected because it is fragile and unsafe under cancellation/failure.

### 2. Replace token-in-URL git auth with credential-safe execution

The runtime should not embed access tokens directly in clone URLs passed to child-process arguments. Instead it should use a safer mechanism such as temporary credential helpers, environment-backed askpass, or request headers, with strict redaction in all logs.

Alternatives considered:
- Keep tokenized clone URLs and rely on log redaction. Rejected because process arguments are still exposed.

### 3. Add an `improve` mode as a structured trace, not raw free-form reasoning dump

The improve mode should record:

- review mode and prompt version
- stage transitions and timings
- tool / git / context-engine / LLM invocations
- evidence references used for each finding
- fallback reasons
- concise rationale summaries for why a finding was produced or suppressed

It should not record unrestricted hidden chain-of-thought text. The goal is workflow tuning and debuggability, not leaking raw internal reasoning.

Alternatives considered:
- No improve mode, only existing job logs. Rejected because prompt/workflow tuning remains guesswork.
- Persist full raw reasoning traces. Rejected because it is high-risk, noisy, and hard to govern.

### 4. Move from generic heuristic review to signal-first multi-pass review

The active review workflow should become explicitly multi-pass:

1. Change inventory pass: classify files, risk areas, skipped items, and reviewability.
2. Impact pass: changed symbols, callers/callees, dependent modules, tests, and API surface.
3. Security pass: auth, secrets, injection, privilege boundaries, data exposure, unsafe execution.
4. Logic pass: invariants, state transitions, null/error paths, concurrency/order assumptions, partial-failure handling.
5. Synthesis pass: rank findings, remove noise, assign risk/confidence, and generate comments/report sections.

Style findings remain available but should be low-weight and hidden from default publication unless:

- they indicate correctness or maintainability risk, or
- repo policy explicitly enables style emphasis.

Alternatives considered:
- Keep a flat list of findings without weighting. Rejected because it keeps noise high and trust low.

### 5. Refresh the report and publication template around trust signals

The report should communicate:

- review mode (`normal` / `improve`)
- overall risk and confidence
- reviewed files vs skipped / unsupported / patchless files
- whether semantic context was available
- whether LLM enhancement succeeded or the job fell back
- inline comments posted vs fallback findings
- top impact/security/logic findings
- concrete next actions

The summary comment should be shorter than the stored report and optimized for platform readability, while the persisted report remains the detailed artifact.

### 6. Remove the legacy gRPC review path after an explicit audit

The removal should happen only after an explicit audit confirms:

- active workers do not call the gRPC path
- active routes do not depend on it
- deployment scripts / docs / tests do not require it

If the audit reveals residual dependencies, they must be migrated first. Dead files, dead tests, and dead docs should then be removed in the same change to avoid leaving a partial zombie path behind.

## Risks / Trade-offs

- [Improve mode increases payload size] -> Gate it behind mode/setting, redact aggressively, and define retention limits.
- [Mirror cache becomes stale or corrupted] -> Add mirror validation and forced refresh behavior.
- [Impact/security/logic passes increase latency] -> Add hard per-stage budgets and degrade gracefully to lower-depth analysis instead of hanging.
- [Suppressing style findings hides useful cleanup notes] -> Keep them available in improve mode / report appendix, but not default publication.
- [Legacy-path removal breaks hidden integrations] -> Require explicit reference audit before deletion.

## Migration Plan

1. Add mirror/worktree runtime utilities and execution-budget helpers.
2. Introduce review trace schema and improve-mode persistence.
3. Refactor the review workflow into multi-pass impact/security/logic/synthesis stages.
4. Update report rendering and summary publication.
5. Audit and remove the legacy gRPC review path.
6. Update tests, docs, and task status.

Rollback:
- Revert the runtime refactor and keep the existing `AdvancedReviewEngine` behavior.
- Keep improve-mode schema additions backward-compatible so trace fields can simply stop being written.
- If legacy-path removal must be rolled back, restore deleted files before the next release cut.

## Open Questions

- Whether improve-mode traces should be stored inside `analysis_result`, a separate debug payload, or job-log attachments.
- Whether repository policy should support per-repo weighting overrides for style findings and comment caps.
