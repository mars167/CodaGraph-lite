# CodaGraph-lite Project Memory

## Required Workflow

- Reproduce the exact bug on the current branch before changing code.
- For interaction bugs, inspect browser behavior first: focus, active element, DOM replacement, network request, and backend log.
- Do not claim a fix based on a different branch, worktree, or prior patch. Verify the current branch contains the change.
- Do not report "fixed" until the same user path has been re-tested in the browser or with a direct request.

## Known Failure Modes

### Settings Password Inputs

- Symptom: on `/dashboard/settings`, the admin password fields only accept one character, then lose focus or appear to clear.
- Real root cause: helper components defined inside `SettingsPage()` can cause subtree remounts on every `setPasswordForm`.
- First things to check:
  - whether local helper components are declared inside the page component
  - whether the active input node/id changes after one keystroke
  - whether password form updates use functional state updates
- Current fix location: `web/app/dashboard/settings/page.tsx`

### Failed Login Returning 500

- Symptom: wrong admin password returns `500 {"details":"FOREIGN KEY constraint failed"}` instead of `401`.
- Real root cause: failed login activity log attempted to insert an invalid `admin_id`.
- First things to check:
  - `POST /api/auth/login` response code
  - backend log stack under `server/src/auth/routes.ts`
  - `server/src/models/ActivityLog.ts`
- Current fix locations:
  - `server/src/auth/routes.ts`
  - `server/src/models/ActivityLog.ts`

### Local Frontend / Backend Validation

- Prefer `http://localhost:3000`, not `http://127.0.0.1:3000`, when validating the real app flow.
- Reason: the backend CORS configuration commonly allows `http://localhost:3000`; using `127.0.0.1` can create a false negative during login and settings verification.

## Response Discipline

- Separate symptom from root cause.
- Fix one proven root cause at a time.
- If a patch only addresses an adjacent issue, do not present it as the root fix.
