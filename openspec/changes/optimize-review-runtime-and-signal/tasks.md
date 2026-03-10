## 1. Runtime Efficiency

- [x] 1.1 Replace per-job clone behavior with repository mirror + detached `git worktree` preparation.
- [x] 1.2 Add credential-safe git authentication so access tokens do not appear in child-process arguments.
- [x] 1.3 Add per-stage timeout / cancellation budgets for git, context collection, LLM calls, and publication.
- [x] 1.4 Record skipped / unsupported / partial-review conditions instead of silently treating the job as fully reviewed.

## 2. Improve Mode and Traceability

- [x] 2.1 Add a review mode flag that supports `normal` and `improve`.
- [x] 2.2 Define and persist a structured review trace schema with prompt version, stage timings, tool invocations, evidence references, fallback reasons, and rationale summaries.
- [x] 2.3 Add trace redaction and retention rules so improve-mode logs are safe to store and inspect.

## 3. Review Signal Quality

- [x] 3.1 Refactor the review workflow into change-inventory, impact, security, logic, and synthesis passes.
- [x] 3.2 Introduce finding weights / ranking rules that prioritize impact, security, correctness, and logic over style noise.
- [x] 3.3 Reduce default publication of style-only findings, while keeping them accessible in improve mode or secondary report sections.
- [x] 3.4 Upgrade prompts and fallback heuristics to better explain call-chain impact, failure modes, and security boundaries.

## 4. Report and Publication Flow

- [x] 4.1 Redesign the persisted review report template to show risk, confidence, reviewed-vs-skipped files, fallback status, evidence quality, and next actions.
- [x] 4.2 Redesign the platform summary comment to emphasize the highest-value findings and publication metadata.
- [x] 4.3 Ensure analysis payloads distinguish inline findings, fallback findings, suppressed low-signal findings, and improve-mode traces.

## 5. Legacy Path Removal

- [x] 5.1 Audit all references to `CodeReviewService`, `ReviewAgentClient`, dead webhook routes, and `review-agent/`.
- [x] 5.2 If the audit confirms they are unused in the active product path, remove the drifted gRPC review-agent implementation and related dead tests/docs.
- [x] 5.3 If any residual dependency remains, migrate it to the active review path before deletion.

## 6. Verification

- [x] 6.1 Add focused tests for mirror/worktree lifecycle, timeout/cancellation, improve-mode trace generation, and signal ranking.
- [x] 6.2 Add report-template tests covering skipped files, fallback mode, and low-signal suppression.
- [x] 6.3 Run targeted tests and typecheck, then update the task checklist to reflect implementation status.
