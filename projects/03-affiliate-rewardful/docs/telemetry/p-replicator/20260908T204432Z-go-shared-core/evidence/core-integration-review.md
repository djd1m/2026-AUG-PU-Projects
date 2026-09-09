# N3 shared core / HTTP / Docker independent review

## Receipt

- Source: `82efe647160a8ea6f0ee626a71a078fda72cfe62`.
- Scope: `projects/03-affiliate-rewardful`; read-only independent review. Repository files were not changed. No running API was attacked; no production/provider/money calls or container starts were made.
- Profile: `compact-quality-first-v2`, consequential REVIEW/QE, XL financial scope.
- Requested model/effort: `gpt-6-astra` / `high`. Actual model/effort: `null` (provider execution metadata unavailable). Tokens, cost, active time: `null` (counters unavailable). Savings not established.
- Started: `2026-09-09T06:06:14Z`, first recorded timestamp; initial instruction reads preceded this timestamp.
- End/duration: appended below.
- Review inputs: root/project CLAUDE, model-routing and telemetry policies, complexity/security/webhook/transaction/guard/Docker/deployment rules; runtime contract; Architecture; shared PRD; all 25 shared specification criteria and validation report; application/domain/infrastructure modules; HTTP/API/frontend server; compose, Dockerfile, secret/bootstrap/deployment scripts; core and HTTP test sources and mutation runners.

## Decision

**Changes requested: one confirmed HIGH availability defect in request-target parsing.** No additional confirmed financial-integrity, tenant-leakage, replay, secret-exposure, or CORS-origin-bypass finding emerged in this bounded review. This is not whole-product acceptance: there are no working A–D UI journeys at the reviewed commit, browser/embedding evidence remains outstanding, MCP/A2A are fixture semantics only, and real payment capability is absent by design.

## H1 — unauthenticated malformed request terminates HTTP process

Severity: **HIGH**, availability. Confirmed through a real raw HTTP request against an isolated child process on Node `22.22.0`.

Locations relative to project:

- `apps/api/http.mjs:44` — `new URL(req.url, 'http://n3.local')` executes outside the `try` starting at line 62, in an async request listener.
- `apps/frontend/server.mjs:12` — same unguarded parsing pattern before its static-file `try` at line 23. Frontend consequence is supported by the identical control flow; the independently executed socket reproduction targeted the API implementation only.

Reproduction request, no bearer token or Origin required:

```http
GET //[ HTTP/1.1
Host: localhost
Connection: close

```

Exact socket bytes: `GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`.

The isolated process imported `createHttpServer`, listened on an ephemeral loopback port, and wrote those bytes using `node:net`. Result: process exit `1`, no response, `TypeError: Invalid URL`, `code: 'ERR_INVALID_URL'`, `input: '//['`, with the stack at `apps/api/http.mjs:44:18`. This reaches URL parsing before authentication or request quotas. Repeated requests can keep the shared API unavailable despite `restart: unless-stopped`.

Initial reproduction attempt was inconclusive because sandbox denied loopback listening (`EPERM`). The same isolated command was rerun with escalation and confirmed the crash; neither result is conflated with the other. The live N3 API was never targeted.

Required fix: handle request-target parsing within an outer safe request boundary, return a controlled 400 for malformed targets, and cover both servers. Add a raw-socket regression for this request that also proves a subsequent `/health` request succeeds and the same process remains alive. Ordinary `fetch()` URL tests may normalize/reject malformed URLs before they reach the server and therefore are insufficient alone.

## AC-by-AC review

Statuses below assess backend support by source and reviewed tests, not an independently rerun PostgreSQL acceptance suite. `Supported` means the reviewed implementation and test assertions address the stated F1 backend behavior; it does not override H1 or confer UI/protocol acceptance.

| Criterion | Assessment and evidence |
|---|---|
| AC-shared-core-11 | Supported for F1 application boundary: hashed-token tenant lookup and membership before tenant state access, foreign resource lookup confined to loaded tenant; `core-access` foreign-tenant test. UI/MCP/A2A labels in that test call the same application method, not three real transports. |
| AC-shared-core-12 | Supported: role allowlists plus `ownTarget`, partner projections filter ledger/payments/transfers/exceptions; `core-access` other-partner and merchant denial assertions. |
| AC-shared-core-13 | Backend supported: membership rechecked on every command, limited session cannot select merchant; `core-access` role/membership test. UI acting-subject display pending. |
| AC-shared-core-21 | Supported: tenant row lock, stable provider/account/object key, input-hash conflict, one immutable journal business key; `core-events` concurrent duplicate/restart test. |
| AC-shared-core-22 | Supported: distinct payment IDs accrue using frozen policy fields; explicit recurring-off check; `core-events` renewal and policy-version assertions. |
| AC-shared-core-23 | Supported for fixture only: verified/confirmed guard precedes business identity claim, unknown event then confirmed retry tested. No actual provider verification is claimed. |
| AC-shared-core-24 | Supported: explicit promo wins, invalid promo cannot fall back to cookie; self-referral and expired attribution return explained zero; `core-events`. |
| AC-shared-core-31 | Supported: immutable positive/negative ledger facts, cumulative integer refund formula, policy freeze, pending refunds applied atomically; `core-domain` and `core-events` rounding/rollback assertions. |
| AC-shared-core-32 | Supported: kind-filtered cash/credit projections, credit exclusions from registry, customer denied registry operations; `core-registry` and `core-credit`. |
| AC-shared-core-33 | Supported: sent allocations remain immutable; post-sent refund adds exception rather than cancelling transfer or freeing settlement; `core-events` sent refund and DB trigger assertions. |
| AC-shared-core-41 | Supported: canonical month boundaries, hold/kind/allocation/net exclusions, partner rows and due-date projection; `core-registry` selected month assertions. |
| AC-shared-core-42 | Supported: revision/hash/source exactness, immutable historical revision, stale approval/export including cached commands rejected; `core-registry`. |
| AC-shared-core-43 | Supported: export creates CSV only; separate sent action checks evidence/date and records actor with `credited:false`; `core-registry` export/send assertions. Browser download flow pending. |
| AC-shared-core-44 | Supported: same explicit artifact/content keeps revision; separate drafts cannot claim another active allocation; exports do not allocate anew; `core-registry` stable draft/competing approval tests. |
| AC-shared-core-45 | Supported: tenant transaction lock plus unique `(tenant_id, obligation_id)` allocations; competing independent application connections tested with exactly one winner. |
| AC-shared-core-46 | Supported: same artifact/revision/partner fact with new key returns prior transfer, conflicting evidence rejects; immutable obligation-transfer facts and sent allocation guard; `core-registry`. |
| AC-shared-core-47 | Supported: refund invokes source invalidation in same transaction; only unsent allocations released; mixed sent/unsent and stale cached export tests in `core-registry`. |
| AC-shared-core-48 | Supported for prescribed historical CSV path: reconciliation preserves original revision/current discrepancy and synthetic transfer; source invalidation and sent allocations prevent second normal settlement; `core-registry` historical CSV test. |
| AC-shared-core-51 | Supported for trusted fixture context: role-specific action grant, no approve/export/sent/credit.reserve grants, deterministic task dispatch; `core-grants`. This is not a credential for an external agent: F1 calls still use the owner's session context. |
| AC-shared-core-52 | Supported for fixture grant context: grant validity before cached result and repeated checks before transaction publication, owner direct artifact access remains; expiry/revoke tests in `core-grants`. |
| AC-shared-core-53 | Backend supported: task result references persisted registry id/revision/hash and owner reads/approves that artifact; `core-grants` parity assertions. Real UI handoff pending. |
| AC-shared-core-54 | Supported for synchronous deterministic runner: canceled terminal state cannot execute, task IDs and matching grant/actor checked; `core-grants` canceled/second-task assertions. No asynchronous external late-response protocol exists yet. |
| AC-shared-core-61 | Supported: random independent tenant/session bootstrap with atomic global cap and separate seed; `core-access` isolation/limit tests. |
| AC-shared-core-62 | Backend supported: same authorized session/actor can retrieve task artifact without copying financial state; `core-grants`. Browser channel handoff pending. |
| AC-shared-core-63 | Supported only as F1 backend semantics: shared application is single ledger authority; duplicate/restart test. Actual real-pilot/provider and MCP/A2A integration are explicitly deferred. |

## Other boundaries reviewed

- Tenant serialization uses a checked-out pg client for BEGIN/SELECT FOR UPDATE/persistence/COMMIT. Errors roll back before idempotency result persists; no external network calls occur inside financial transactions.
- Session bearer tokens use 32 random bytes and only SHA256 is stored. Current membership and active grant are checked before cached result delivery. Production mode is refused. Full-role synthetic bootstrap is an explicit F1 design, not production identity.
- Positive/negative ledger, approvals, registry revisions and transfer facts are append-only in the application journal and guarded against UPDATE/DELETE at the DB layer. Sent allocations cannot be deleted by ordinary application mutations.
- Credits reserve against both available credit and remaining invoice under tenant lock; unknown outcome holds reservation, failed releases, successful terminal outcome is immutable, late refund produces visible negative adjustment without rewriting prior invoice.
- CORS denies non-allowlisted origins before command execution; no wildcard credentials; request bodies are bounded and API errors conceal internal failures. Fixed origin ports and frontend CSP must be exercised through actual browser journeys when UI compositions/configuration land.
- Compose declares no database host ports, an internal database network separate from frontend, file secrets, generated 64-hex passwords, and a non-superuser application DB role. API reads root-owned secret before dropping uid/gid to 1000 before listening. Source review is not a fresh live-container uid/network verification.
- Health reports process mode/version only, as specified. It is not a database readiness claim.

## Checks and evidence limitations

Executed independently:

1. `node --test projects/03-affiliate-rewardful/tests/core-domain.test.mjs projects/03-affiliate-rewardful/tests/http-ui-format.test.mjs` — **4/4 passed**, no skip, duration `113.791341 ms` as printed by Node.
2. Isolated real-loopback malformed-request reproduction — **confirmed process crash**, exit 1, Node22.22.0.
3. Read all relevant test assertions/mutation runners and implementation; no live mutation or database writes by this reviewer.

Coordinator-provided evidence, not independently reexecuted here: 27 PostgreSQL/core tests and 3 core mutations passed; 8 HTTP/format tests plus origin mutation passed; API healthy. Their green results do not cover the malformed request-target path found above. The 8 HTTP-related tests consist of 6 HTTP-boundary tests and 2 UI-format tests, so they do not establish actual browser journeys or frontend/server robustness.

No browser E2E, genuine protocol interoperability, external provider verification, or production-money test performed. All four working UI journeys remain required before product acceptance.

Completed: `2026-09-09T06:12:05Z`. Recorded elapsed review window: **351 seconds (5m51s)**; includes reproduction approval/tool wait, excludes unmeasured instruction reads before first timestamp. Active time, model/provider usage and cost remain `null`. No model fallback was observed; actual execution model remains unverified.

## H1 follow-up verification — resolved

Source: `e9cf72a72e67f8b8cd6fd438068a86665dc17635`. Started `2026-09-09T06:12:59Z`. Scope limited to H1 fix and its direct regression; previous financial review was not repeated.

**H1 is resolved at this commit.** Both API and frontend now catch exceptions from request-target URL construction and return 400 before proceeding. Exporting `createFrontendServer` permits the real frontend request handler to be tested independently, while the explicit script-entry branch retains runtime listening and environment configuration. The intentional `/join` fallback serves the static enrollment preview and does not perform enrollment or grant additional rights.

Independently executed `node --test tests/http-request-target.test.mjs` from the project: **2/2 passed**, zero skips/failures, Node-reported total `263.499484 ms`. Both cases send actual raw `GET //[` bytes, assert HTTP400, and then obtain HTTP200 from the same running server (`/health` for API, `/join` for frontend). The frontend case also verifies CSP and traversal rejection. `git diff e9cf72a --` for both servers and this test was empty, binding this run to the reviewed commit's files.

Inspected both added mutation definitions: each removes the corresponding URL guard and selects the raw-request regression. The coordinator reports all three HTTP mutants killed; this follow-up did not rerun mutations independently.

No remaining H1 issue or additional defect found in this bounded fix review. This closes the HIGH request-target finding; outstanding UI/browser/protocol acceptance limitations elsewhere in this receipt remain unchanged. Requested model/effort `gpt-6-astra/high`; actual model/effort, token usage, cost and active time `null` because execution metadata/counters are unavailable.

Follow-up completed `2026-09-09T06:13:14Z`; recorded elapsed **15 seconds**, excluding this final receipt append. No model fallback observed.
