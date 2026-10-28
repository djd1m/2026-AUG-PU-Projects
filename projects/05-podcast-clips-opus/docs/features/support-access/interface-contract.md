# Support access: shared coding contract

Frozen implementation seam; Specification remains ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf.
Read 01_specification.md, 02_pseudocode.md API Contracts and validation-report.md.
This file fixes naming and file ownership; it adds no feature or money-write permission.

## SSR seam owned by backend

NEW apps/web/src/server/support/page-state.ts exports supportPageState(): Promise<SupportPageState>.
SupportPageState is a sanitized plain object with this exact shape:
- account: null or { id: string, email: string, verified: boolean }.
- operator: boolean (fresh active session + current DB membership; no browser role).
- mailAvailable: boolean.
- support: { mode: 'disabled'|'test'|'libredesk', baseURL: string|null, inboxID: string|null,
  identifiedEnabled: boolean, contactEmail: string|null, synthetic: boolean }.
No session hash, token, secret or private provider credential belongs in it.
Anonymous/disabled state does not require a DB lookup. Authenticated lookups fail closed.
UI pages use this seam for verification status and SSR staff gating. Staff pages call
notFound() when operator is false; API/DB still repeat their own authority check.
Next cookies()/getRuntime() adaptation belongs inside the backend seam, not a UI DB query.

## HTTP and widget behavior

Use the exact paths/methods/success JSON in 02_pseudocode.md. Existing N5 auth endpoints
keep their existing error shape; NEW support endpoints use {error:{code,message}}.
Valid forgot persisted quota/cooldown/storage-full returns the same202 as unknown email;
only the independent pre-body global IP limiter can return429.

UI gets public anonymous widget settings from supportPageState, with no initial JWT call.
Automatic widget open stays anonymous. POST /api/support/session with {} happens only
on explicit customer opt-in; backend deployment identification switch is separately off
by default. Unverified/revoked accounts never receive a JWT. Show context preview and
require consent before sharing/copying it. A widget failure must show a visible fallback.
Official widget/script only; no local ticket engine. Remote vendor session revocation
and real vendor history/retention remain unqualified, as specified.

## Browser and integration ownership

Backend owns packages, server code, API routes, config/manifests/migrations/compose/env,
existing backend regression expectations and backend tests. UI owns app non-API pages,
components/styles, support client helper/tests, existing-container responsive adapter.
Root only integrates source commits; root writes planner/process/evidence/docs.
UI never edits manifests/server/API/packages; backend never edits owned UI paths.
No full Next build in both coding trees: focused checks first; complete integrated build
and full regression after merge. Both use existing Node22 and third-party dependencies.

## Required delivery boundaries

Test mode is isolated and visibly synthetic; no debug mailbox/token route in public runtime.
No current production deployment or real outbound mail. Actual mail sender/contact and
Libredesk/RF runtime are configured later and never replaced with fake working claims.
Check SSD before expensive operations and stop growing artifacts near2GiB free.
