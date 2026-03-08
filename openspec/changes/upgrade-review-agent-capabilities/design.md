## Context

The repository contains two review paths:

- The shipped worker path: `CodeReviewWorker -> ReviewExecutionService.execute()`
- An unfinished agent path: `CodeReviewService -> ContextAgentClient/ReviewAgentClient`

Only the shipped worker path is executed for queued jobs today, but it performs diff-only regex scanning and posts top-level comments. The unfinished agent path contains the right shape (workspace, context, review agent) but is stubbed and is not used by the worker. The safest way to close the capability gap is to upgrade the active worker path instead of routing production work through the incomplete gRPC services.

## Goals / Non-Goals

**Goals:**
- Make the active worker path repository-aware and commit-aware.
- Add semantic context collection and PR-level reasoning without introducing a new service dependency.
- Support inline review comments with graceful fallback to body comments.
- Keep the implementation deterministic when LLM configuration is missing or the LLM call fails.

**Non-Goals:**
- Fully port the original multi-module Python review agent.
- Make the unfinished `CodeReviewService` / gRPC path production-ready in this change.
- Replace `Code Context Engine` with a different semantic indexer.

## Decisions

### 1. Upgrade `ReviewExecutionService` instead of reviving the unfinished gRPC path

The worker already calls `ReviewExecutionService.execute()`, and it already owns analysis record updates, job progress, comment publishing, and cancellation handling. Replacing its internal review engine avoids splitting production behavior across two competing implementations.

Alternatives considered:
- Revive `CodeReviewService` and route workers through gRPC. Rejected because the current client/server pair is stubbed and would add more moving parts before fixing the real shipped path.
- Port the original Python review agent wholesale. Rejected for this change because it is larger, depends on modules that do not exist in Lite, and is slower to verify safely.

### 2. Introduce a local review engine under `server/src/review/`

The new review engine will encapsulate:
- Workspace preparation and git operations
- Diff line mapping
- Semantic context gathering
- LLM prompt building / response parsing
- PR-level summary generation

This keeps `ReviewExecutionService` focused on orchestration and persistence.

Alternatives considered:
- Keep all logic inside `ReviewExecutionService`. Rejected because the file is already handling orchestration and would become harder to test.

### 3. Use hybrid review: deterministic rules first, LLM second

The engine will always run deterministic checks for high-signal issues such as dangerous eval usage, hardcoded secrets, raw HTML injection, debug statements, and oversized changes. If `LLM_API_KEY` is configured, it will augment those findings with file-level and PR-level LLM review using diff-aware prompts and semantic context.

Alternatives considered:
- LLM-only review. Rejected because the system must still produce useful output without external model access.
- Rules-only review. Rejected because it would not close the semantic/contextual gap identified in the comparison with the original project.

### 4. Post inline comments when a diff position exists, otherwise fall back to summary comments

The platform client already exposes `postReviewComment`. The new diff mapper will convert annotated file line numbers to inline review positions. Findings that target deleted lines or cannot be mapped stay in the top-level review summary so no feedback is lost.

Alternatives considered:
- Only post top-level comments. Rejected because precise placement is one of the primary capability gaps.

## Risks / Trade-offs

- [LLM latency or failure] -> Keep a deterministic rule-only fallback and treat LLM enhancement as optional.
- [Workspace checkout failures for uncommon PR shapes] -> Fetch both base and head SHAs explicitly and degrade to diff-only review if file content cannot be loaded.
- [Code Context Engine unavailable on the host] -> Fall back to regex-based symbol extraction and repository text search without failing the job.
- [Too many inline comments] -> Cap published inline findings and move overflow into the summary comment to avoid spam.
- [Bigger analysis payloads in SQLite] -> Persist a compact structured JSON report instead of raw full-file context.

## Migration Plan

1. Add the new review engine modules under `server/src/review/`.
2. Replace `ReviewExecutionService` internals to use the new engine while preserving the same public `execute()` contract.
3. Keep the old regex checks as part of the deterministic fallback layer.
4. Add tests for diff mapping, prompt/result parsing, and execution-service level behavior.
5. Deploy with existing `LLM_*` env vars; if not configured, the upgraded worker still runs in rule-only mode.

Rollback:
- Revert the `ReviewExecutionService` integration and new review modules. The database schema does not need migration for rollback.

## Open Questions

- None for implementation. The current change intentionally leaves the standalone gRPC review-agent path untouched and non-production.
