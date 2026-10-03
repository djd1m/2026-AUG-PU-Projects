# I4c — bounded maintenance cleanup

Source: `9a65eedd11ab166d186412201a0cfc2c884c094d`. Run `n8-20261002-1740`, work `n8-replicate-i4c`, attempt `replicate-i4c-1`. Approved F07 XL/externalspend0; sole requested Sol6.1/high author, host-resolved model/usage/cost unavailable. Frozen product/test SHA-256 values and complete protected-source map: `docs/telemetry/n8-20261002-1740/replicate-i4c-snapshot.json`.

## API and existing loop

`createReplicateCleanup(pool, config, options).pass()` returns a frozen object containing only numeric `scanned`, `claimed`, `actions`, `done`, `needed`, `unresolved`, `stale`, `errors`. No claim, submission, original-deadline budget, I2 observation/output handle, error payload or URL is returned. Options permit mocked I2 `transportOptions`; `trustedClock` and `monotonicNow` are restricted to explicit `runtime: test`. Production samples `clock_timestamp()` after all locks and uses `performance.now()` for its bounded pass.

The existing `maintenancePass` invokes cleanup after its unchanged job maintenance, deleted-file cleanup and upload/output orphan sweeps. Existing hosted worker config activates this call; no worker execution/Python path, timer, scheduler or admin API changes. Default disabled cleanup returns all-zero counts before SQL or HTTP. Scan happens once, `LIMIT 100`; rows are claimed and processed sequentially, never batch-claimed ahead of HTTP.

## Configuration

`readReplicateCleanupConfig(common, env)` returns `common` unchanged when `REPLICATE_CLEANUP_ENABLED` is absent or exactly `false`. Only exactly `true` plus exact `REPLICATE_MODEL`, `REPLICATE_VERSION`, `REPLICATE_CONTRACT_SHA` and bounded printable `REPLICATE_API_TOKEN` enables standalone cleanup; all other opt-ins/pins/token shapes throw safe `replicate_config_denied`. Standard standalone common server configuration still applies with `WORKER_MODE=disabled`. No cleanup spend envelope, acceptances, seed or source-revision config is required.

The token is registered in the existing private WeakMap; it is absent from serialized config and nonenumerable in `replicateTransportConfig`. A private WeakSet marks cleanup-only configs: `replicateSettings` rejects them. Copies/forged config flags do not activate cleanup. `replicateCleanupEnabled` accepts an actual registered hosted worker config or cleanup-only config. Ordinary web config validation and I1 create admission remain unchanged. The helper invokes only the unchanged I2 `get`/`cancel` APIs.

## Claim, observation and disposition

Every claim, final send preparation, observation and reconciliation transaction takes account → job → submission locks, then obtains fresh DB time. Claims require `needed` or an expired `claimed` lease, increment existing `cleanup_fence`, and set a lease exactly 30 seconds. Fence exhaustion denies a new claim. Claimed identity snapshots bind submission/job/account, provider/model/version/contract, prediction/request, original attempt/ticket/submission fence, submitting timestamp and attempt deadline. The private authority's `observe` rejects wrong identity, lost fence/lease, quarantine or elapsed retention before calling unchanged `observePredictionLocked`. SQL locks are released before HTTP/parsing.

| Condition | Result |
|---|---|
| Missing/invalid ID, quarantine, unsupported immutable pins/deadline, missing/bad/future submitting time, retention boundary | `unresolved`, zero HTTP |
| Recorded succeeded/failed/canceled/aborted status | `done`, zero HTTP |
| Known nonterminal, no cancel request | Persist `cancel_requested_at`, then one cancel action |
| Cancel request already persisted | One GET action |
| Valid claim observes terminal | `done`; only actual `canceled` sets `cancel_confirmed_at` |
| Nonterminal, transport/protocol error, 429/404/timeout | `needed`, retain cancel request for later GET |
| Fence/lease lost | Old owner makes no observation/finalization changes |

Terminal reconciliation is atomic with the fenced observation, so terminal monotonicity is preserved even if the I2 GET return crosses its budget. A terminal status recorded by existing observation authority can also be reconciled without another network request. No job/account/upload/ticket/credit/spend/evidence mutation occurs in this helper. Billing hold, expired/deleted job and revoked/expired spend do not remove valid cleanup authority. Success racing cancellation remains terminal remote evidence only: no output attachment, revival, refund or spend release.

## Time, retention and crash limits

The whole pass starts one monotonic 5000ms ceiling. Each HTTP action uses a separate private I2 budget of at most its remaining duration and at most 5000ms, retaining the ORIGINAL immutable `attempt_deadline` timestamp identity. This narrow cleanup duration can operate after job/attempt expiry; it does not change persisted deadlines or reuse/renew any active worker budget. The handle stays inside cleanup and is never passed to create, polling or import. No inner retry/wait/poll occurs. Database/file work may take longer; the ceiling bounds the remote action window, not all maintenance work. Claims are not accumulated after budget exhaustion.

Retries stop at `submitting_at + 3600 seconds`, the accepted default-content-retention ceiling in this slice. Equality is elapsed. Changed operator/provider retention requires reconsidering activation; `unresolved`/`done` do not prove provider erasure, legal retention expiry or free billing. Unknown ID remains unresolved without guessed/list lookup.

The request flag is committed BEFORE cancel invocation. Crash, commit uncertainty, process termination or budget exhaustion between flag commit and HTTP can mean cancellation was NEVER actually sent. Later passes use GET only and cannot claim otherwise. This intentionally avoids repeat cancellation while preserving honest uncertainty. A lease is not an atomic DB/HTTP bridge: expiry/reclaim immediately after final send preparation cannot retract an already authorized remote action; stale responses still cannot observe/finalize. Only observed `canceled` confirms cancellation.

## Validation and handoff

Node22 `/tmp/n8-node22`, test concurrency1 and Sharp concurrency1; synthetic tokens and mocked HTTP only. Local new cleanup units pass10/10; old worker/config/I2/jobs/config units pass186/186; unchanged provider-submission units pass2/2; `scripts/check.js` and `git diff --check` pass. First cleanup run failed one missing/invalid-timestamp case because NaN equality made its own snapshot appear stale; corrected timestamp identity comparison and reran green. Mutation removes the cleanup-fence equality while keeping the stale-owner oracle unchanged: exits0/1/0, restored source SHA bound in telemetry.

`tests/replicate-cleanup.integration.test.js` is authored and syntax-checked ONLY. It requires Node22, real PG16 and `N8_TEST_DB_OWNERSHIP=n8-f07-replicate` on an internal owned DB. Setup uses real I1 authorize/bind/observe and jobs fail/delete/deadline maintenance, never direct submission/evidence INSERT or trigger bypass. Mock only HTTPS. Real account-lock barriers cover competing owners and post-lock expiry; HTTP gates cover old/new cleanup lease owners. Before/after full rows protect account/upload/job/credit/tickets/counters/spend/evidence and immutable submission identity; literal assertions also check original ticket/attempt/deadline/reserved300000, no output/evidence, and one existing job release.

Parent must execute the frozen new PG suite plus accepted provider-authority/lifecycle/worker and old jobs/filesystem cleanup suites, perform fresh independent review, then I6 send-CAS/mock UI, I7 full regression/docs and I8 browser. No author PG/Docker/network/provider/token/environment access, commits/push, installs, global config changes or run-events writes. Real safety/privacy/license/billing/quality/performance and paid pilot/deployment are separate unauthorized gates. Author completion denotes delivery of this bounded code slice, not PostgreSQL/full-feature acceptance.
