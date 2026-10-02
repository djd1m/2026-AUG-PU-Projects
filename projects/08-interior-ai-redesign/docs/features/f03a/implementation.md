# F03a verified payment implementation

The bounded artifact implements ROOM20 (90000 minor RUB / 20 credits), immutable owner/key/body bindings, asynchronous durable checkout creation, authenticated provider verification, deduplicated credits, permanent refund hold, and the first committed successful payment marker. It remains **unaccepted** until the mandatory database, HTTP transport, and independent review gates run.

Provider creation is enabled only by explicit server configuration. The default is disabled; missing live credentials return 503 and production rejects fixtures. The server starts one background runner with durable 30-second leases and 60-second retries. UUID provider idempotency and stored request bytes remain stable. Unknown outcomes stop automatic POSTs after a conservative 23-hour window from the first attempt; the intent enters review. Provider network work and hashing happen outside SQL locks.

`POST /api/payments` authenticates and checks exact Origin, then returns 202 with a durable intent. `GET /api/payments/:id` is owner scoped. `GET /api/payments/config` discloses mode and the fixed package, without credentials. The root return URL performs no payment operation. `/api/me` exposes hold and effective entitlement, including suppression of the existing badge-free field while held.

`POST /api/payments/webhook` is the sole provider Origin exemption. It accepts 16KiB JSON and uses only event type/object ID. At most four notifications verify concurrently. An authenticated GET must match the already attached provider ID, merchant, intent/account/package metadata, exact amount/currency, status and paid flag. A notification racing checkout attachment returns retryable 503 without dedupe. Refunds independently verify their ID/status/positive capped amount/payment ID and the bound succeeded payment. Verification failures never claim an event. YooKassa calls use a fixed HTTPS endpoint, 5-second timeout, 64KiB response cap and no redirects.

Settlement locks account then intent; schema uniqueness guards provider IDs, events and purchase ledger. Review is monotonic, canceled may upgrade to verified success, and success cannot downgrade to canceled. Verified refunds set permanent hold/review and invalidate the winning conversion. Queued jobs fail/release once through a trusted same-connection transition under account then job locks. Active pre-hold work may finish private; further starts, retries and admissions remain denied. Refunds never guess credit reversal or execute money movement.

The first verified success permanently claims the account marker, including no-partner, held or reviewed cases. Eligible active nonself partner snapshots may create one conversion/event. Later purchases cannot backfill or promote a replacement after refund. Attribution accepts validated manual active code or server-stored preference; cookie consent, registry administration and aggregates remain F03b. Payment UI/export rendering remain F04.

Explicit nonproduction fixture objects persist separately from notification bodies and use the same verifier/settlement. The server-only fixture CLI changes these objects then supplies a signal. There is no ordinary HTTP grant setter.

## Verification and limits

49 Node host tests and five Python software tests passed. Syntax/build and diff whitespace checks passed. Merchant-binding, Origin and fixture-quality mutations passed from green baselines and produced targeted red assertions. Injected slow header/body tests verified the 5-second bound.

Four PostgreSQL suites failed before setup because no `TEST_DATABASE_URL` and required ownership markers were supplied. The separate local HTTP adapter suite failed with sandbox `listen EPERM`. These are blocked checks, not passes. The F03a PG suite contains 15 scenarios for idempotency, bounded runner/leasing, mismatch/transient recovery, ten replays, status orderings, refunds, queue/start/retry holds, first winner and HTTP owner/Origin/body/return boundaries. Owner/budget PG mutations and coordinator fresh independent review remain pending. Docker and browser were not run; no GPU acceptance is claimed.

See `checks.json` for commands, exits and complete log digests, `source-snapshot.json` for all 57 production/test/runtime file hashes, and `attempt.json` / `events.jsonl` for telemetry. The canonical snapshot includes `.env.example`, `.dockerignore`, `.gitignore`, dependency manifests and worker files; docs, secrets, dependencies and caches are excluded. Package manifests/lockfile and Compose were not changed.

The only necessary extra source path outside the initial list is `tests/boundaries.test.js`: the old blanket fixture rejection was replaced with unknown-mode rejection, and the safe disabled default is tested. Existing secret/session/budget guards remain tested. No global settings, other projects, secret files, provider payment calls, money movement, messages, deployment, installations or delegation occurred. Public provider documentation was read only.

Profile: compact-quality-first-v2; substantive XL, accepted mechanical S lower bound. Requested model/effort: gpt-6.1-sol/high. Resolved model, effort, token usage and cost remain null because the host exposed no measurement. This artifact does not replace fresh review or satisfy the pending acceptance gates.
