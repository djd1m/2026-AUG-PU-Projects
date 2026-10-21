# F11 independent source review — review-1

Run: `20261003T011351Z-weekly-metric`; baseline `d25e6141b3b43569281c85f95a6a6313f71f8c07`; supplied snapshot `64b0dfee0301396933be83924350d54ca9287f4a5e682f42c1a226198b066800`.

## Independently derived obligations (recorded before author reports)

Sources: Specification FR-n6b-15, SC-US-015-1–5; Pseudocode “Weekly metric”, “Widget config and badge decision”; Architecture WidgetInstall/Operator and service-role boundaries; Refinement metric and SSRF edge cases.

- Operator membership is the access boundary; missing membership gives 404, including an empty operator table. Service-role reads must not widen tenant privileges.
- Count bot × normalized external host, not distinct hosts: two bots on one host count twice. Require config plus successful question plus page verification for canonical count; present config+question count separately. Exclude test/operator owners and excluded hosts; use shared normalization (lowercase, remove leading www).
- Existing config/question instrumentation must retain atomic uniqueness and reject excluded hosts, unvalidated/failed questions, and ask without earlier config. Page host and origin host must match after shared normalization.
- Show goal 15, independent badge impressions/clicks and referred signups, zero-click “no data”, conversion signups/clicks, and n<30 suppression. Canonical text supplies no K formula for n>=30 and no rolling-seven-day SQL restriction.
- Operator-triggered verification GETs saved page through existing SSRF defenses, at most 15 seconds and 2 MiB; only an actual script for PUBLIC_BASE_URL/w.js with this bot public_id qualifies. Failure must not mark verified.
- Preserve existing schema, operator-list authority, service/tenant separation and widget gates. Verification needs bounded resources and safe asynchronous ownership; stale candidate/session/owner data must not create an invalid verification.

Scope: bounded source/evidence review only, maximum 480 seconds; no child agents, test/probe execution, network, containers, installs, product edits or commits. E2E preflight: not_applicable (no E2E execution authorized). Existing coordinator run/launch owns telemetry; this report is the only manually written artifact.

## Verdict

**ACCEPT_WITH_CAVEATS — source acceptance only.** No blocking product-source finding was established in the bounded review. This does not accept runtime behavior, the complete feature, or deployment. Mandatory coordinator checks remain pending.

## Source and evidence identity

Read all ten production/test files in `tests/artifacts/weekly-metric/implementation-source-hashes.json`, then compared their exact SHA256 values with the manifest: all ten match. `git rev-parse HEAD` matches the supplied baseline. The launch file SHA256 matches `e6082aa870e3fa48d1af8255d5535bee158b26bfe649d77e542cce10895ff0b5`. No source drift observed. Reviewed supporting unchanged metric-host, widget handler/DB instrumentation, authentication store, service transaction/pool, SSRF validation/pinned HTTP adapter, Next configuration and integration-test configuration. No N6 donor source was read.

## Acceptance challenge results

| Obligation | Independent source assessment |
| --- | --- |
| MET-01 operator/session/same-origin/cache | Page authenticates the session before service metrics read, whose operator lookup is mandatory. POST authenticates and checks operator before origin and lease; no body authority is consumed. Missing/ordinary authority gives 404; foreign or absent origin gives 403. JSON is private/no-store; page is force-dynamic/revalidate=0. Actual Next response headers and routing remain runtime gates. |
| MET-02 counts and thresholds | SQL requires config/question and current non-test/non-operator ownership. Shared metricHost/excludedMetricHost filters saved page/normalized host; verified is a subset of raw. Two rows for two bots on one host count twice. Badge impressions/clicks and referred registrations use independent cumulative SQL. Zero clicks yields no data; exact warning applies below 30. Neither a rolling window nor an invented K formula is introduced. |
| MET-03 safe page verification | Production route supplies no injected fetch: verifier defaults to createSafeHttp. Existing DNS/IP validation and pinned socket are retained; one request has no redirect-follow option. Transport limits DNS/connect/body by signal and body bytes. Verifier enforces successful text/html, 15s/page, 2 MiB, exact resolved script URL and exact public_id. Cheerio removes template/noscript; actual selectors exclude comments, inline text and escaped lookalikes. No SSRF bypass, JavaScript execution or recursive crawl added. |
| MET-04 acquisition and cleanup | Existing service transaction acquires pg_try_advisory_xact_lock before selection/202, bounding active verifier leases to one across instances. Five rows maximum, sequential page fetches, remaining deadline capped at 15s within the batch's 60s page-work budget. Busy transactions roll back without scheduling or changing cursor. Scheduler failure rolls back; verifier exceptions roll back; commit/rollback releases the connection; connection error discards it. Idle transaction timeout provides cleanup if callback never starts. Real failure/timeout behavior remains unexecuted. |
| MET-04 progress and stale data | Actor-bound HMAC cursor accepts only signed UUIDs; cookie advances past a selected five when more remain, leaves busy unchanged, clears at round end. Failed rows remain pending and reappear next round; no durable queue is claimed. Callback rechecks session and operator before fetch; rechecks session before write. SQL compares candidate bot/owner/public ID/host/page/config/question and current owner/actor eligibility, preserving an existing verification timestamp. |
| MET-05 prior gates and scope | Unchanged F09 code uses the same normalization at config and question attribution, creates only matching eligible installs, records questions only on successful answers, and uses conflict-do-nothing/null-first-question predicates. F11 does not change these sources, schema, roles/grants, paid gateway or billing. Only aggregate values are rendered. Full regression is still required. |
| MET-06 tests and mutation | Read both focused unit files and all 15 authored PG cases. Assertions exercise actual predicates, gates, signed cursor, limits, scheduling and PG aggregate/lease/stale-write paths; they are not merely status checks. PG test files run sequentially per existing configuration. Tests were inspected, not executed by this reviewer. |

## Non-blocking finding C1 — inaccurate row-lock claim in handoff (low)

Location: `docs/features/weekly-metric/05_completion.md`, “Minimal interface decisions”, claim “no row lock is held over a page fetch”; implementation `packages/db/src/metrics.ts:95` and `apps/web/src/server/metrics-verifier.ts:62`.

Source-derived reproduction: select at least two pages; let the first verify successfully and the second fetch remain pending. The first `UPDATE widget_install` occurs in the still-open batch transaction. Its row lock remains until `batch.finish(true)` after the loop. A concurrent update/delete of that first install must wait for the transaction, potentially through later page fetches. No runtime reproduction was run, as prohibited by the brief.

Impact: the handoff understates resource retention. The explicitly requested transaction lease retains one service-pool connection (pool maximum 10); successful rows additionally retain row locks through remaining batch work. The 60s page-work budget, 5s statement timeout, 75s idle-transaction safeguard and global singleton lease bound this design, but do not mean zero row locks. Correct the handoff description; this review does not demand a new lease design. No acceptance criterion requiring immediate concurrent install deletion was supplied, so this is not treated as a blocking functional defect.

## Evidence inspected and pending gates

- Focused test log reports 37 passing tests, and typecheck artifact plus check record report exit 0. These are author-produced evidence, not a fresh reviewer execution.
- Mutation evidence is meaningful: the fixed wrong-bot assertion expected false but received true when the data-bot equality was removed (exit 1); the identical selected assertion passed after restoration (exit 0). Before/restored SHA256 equals the current verifier's manifest hash. The red log is an assertion failure in the intended predicate, not a syntax/import failure. This validates that guard, not every parser or security property.
- Still pending: full unit/contract regression including safe HTTP and F09/F10; all real PostgreSQL suites including the 15 F11 cases; production build and image/source binding; actual Next after lifecycle; Docker UI at 1440/390, operator page, ordinary 404, POST202 and refreshed counts.
- UI positive counts may be seeded and must be identified as such. Real pending202 and positive DI-fetch/real-PG verification are separate evidence. Neither establishes live external-page verification by production HTTP. Do not bypass SSRF to obtain a positive UI fixture. Public stand is not deployed by this review.
- Runtime gates remain required even though no blocking source finding was identified. No test, browser, Docker, network, install, product mutation, commit, child agent or manual TRACE write was performed.

## Telemetry and handoff

Profile: `compact-quality-first-v2`; substantive tier M under the accepted fresh-SPARC exception to L. Plan and implementation record the external-GET risk; mechanical S is only the lower bound. This is the independent REVIEW stage, not a new feature implementation or route execution.

Requested reviewer model: `gpt-6-astra`, effort medium per launch. Requested author model: `gpt-6.1-sol`, high per handoff. Actual model/effort and native usage are not exposed to this reviewer; leave them unknown pending host reconciliation. No reviewer fallback/model switch or delegation occurred. Tokens, cost and active time are unknown, not zero; no savings claim.

Telemetry: `docs/telemetry/p-replicator/20261003T011351Z-weekly-metric/`. Coordinator owns run/events/work-record. CLI owns the fresh receipt at `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-weekly-metric/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T011351Z-weekly-metric/evidence/review-1-receipt.md`; it was not manually written.


Review report finished: `2026-10-03T01:43:32.880091+00:00`. Elapsed since supplied launch: 252.053s, including instruction reading and evidence inspection; below 480s. Active/wait split unavailable.
