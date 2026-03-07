## 1. Review Runtime

- [x] 1.1 Create review workspace utilities for clone, fetch, checkout, diff, and file-content loading.
- [x] 1.2 Add semantic context, prompt, and diff-line-mapping helpers under `server/src/review/`.
- [x] 1.3 Integrate the new review engine into `ReviewExecutionService` while preserving analysis/job state updates.

## 2. Comment Publication

- [x] 2.1 Add inline comment mapping and bounded publication with summary fallback.
- [x] 2.2 Expand stored analysis payloads and markdown reporting to capture file findings, PR summary, and publication metadata.

## 3. Verification

- [x] 3.1 Add focused unit tests for diff mapping, review parsing, and execution-service behavior.
- [x] 3.2 Run typecheck and targeted tests, then update task status to reflect completed work.
