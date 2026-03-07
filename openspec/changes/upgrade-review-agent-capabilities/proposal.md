## Why

The active `CodeReviewWorker -> ReviewExecutionService` path in CodaGraph-lite still behaves like a patch scanner: it does not clone the repository, read real file contents, gather semantic context, run PR-level reasoning, or post inline review comments. This leaves the shipped review flow substantially behind the original CodaGraph review agent and makes the current "review agent" label inaccurate in practice.

## What Changes

- Upgrade the active worker review path from regex-only diff scanning to repository-backed review execution.
- Add a semantic review engine that reads checked-out file content, derives changed symbols, gathers surrounding code context, and combines rule-based checks with LLM analysis when configured.
- Add PR-level synthesis so the review can reason across files and generate a top-level decision/summary in addition to file findings.
- Add diff line mapping and inline review comment posting, with automatic fallback to summary comments when a finding cannot be placed inline.
- Unify review reporting so analysis results persist the richer review payload, including inline comments, fallback comments, context metadata, and summary decisions.

## Capabilities

### New Capabilities
- `repository-backed-review-runtime`: Execute reviews against a real cloned workspace with base/head commit awareness, file content loading, and cleanup.
- `semantic-pr-review`: Produce file-level and PR-level findings using semantic context, diff-aware prompts, and deterministic fallback heuristics.
- `inline-review-commenting`: Map findings back to diff lines and publish inline review comments with safe fallback behavior.

### Modified Capabilities
- None.

## Impact

**Affected code:**
- `server/src/services/ReviewExecutionService.ts`
- `server/src/jobs/CodeReviewWorker.ts`
- New review runtime / prompt / diff mapping / workspace utility modules under `server/src/review/`
- Review-related unit tests in `server/src` or `server/tests`

**Affected systems:**
- Job execution now performs real repository checkout and base/head file reads.
- Platform comment publishing now uses both top-level comments and inline review comments.
- Review output stored in `analysis.analysis_result` becomes richer and closer to the original CodaGraph agent contract.

**Dependencies / configuration:**
- Reuses existing `git`, `git-ai`, and platform OAuth credentials.
- Reuses existing `LLM_*` environment variables, while keeping a deterministic rule-only fallback when no LLM configuration is available.
