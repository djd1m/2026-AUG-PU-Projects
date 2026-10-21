# Source management — independent review (review-1)

Run-ID: 20261003T053651Z-source-management
Source-Revision: 41d6dedfd027f698ae4d79aa1b61a066d22ced32

## Independent obligations, recorded before source and author claims

Derived directly from Specification FR-n6b-17, SC-US-017-1/2/3, NFR-n6b-3/4; Pseudocode “Source management and retention”; Architecture Data/Security Architecture; ADR-005; Refinement conflict/concurrency/security rows.

1. List only authorized bot sources with latest job status; deterministic order and latest-job selection. Missing/foreign/revoked studio access must not disclose objects (404); preserve current family RLS after handover.
2. Delete source and all dependent chunks/documents/files/jobs atomically; deleted material no longer searchable. Queued/running jobs cause 409 with wait message. Concurrent enqueue, retry, worker transitions/writes cannot bypass that invariant or leave partial deletion; avoid new tenant job-update authority and incompatible FK locks.
3. Recrawl creates a new job after terminal work, or returns the same current live job through idempotency; preserves documents and hashes so unchanged material is not re-embedded. Retry semantics retain ADR-005 fencing and ceilings.
4. Published bot owner sees exactly two 7-day counts and an Add source action. Strict created_at > now−7 days, widget/demo only, unknown outcomes exactly below_threshold/model_unknown/invalid_citation, no question text exposed. Route auth/origin, cache, pending/error/success UI must preserve these properties.
5. Worker purges question_log older than 30 days and quota days older than Moscow today−2, preserving boundaries including auth-hour keys. Bounded batches and non-overlap/lease must permit backlog progress; startup wiring and stop awaiting work before pool shutdown must be correct.
6. Required evidence: focused functional/type checks, meaningful mutation RED/restored GREEN, actual PostgreSQL concurrency/RLS/FK/boundary checks, full regression and actual UI evidence. Pending coordinator gates are not acceptance.

Review status: independent obligations were fixed before source inspection and author-claim assessment. E2E readiness: not_applicable to this read-only review; coordinator owns actual E2E. No donors, source edits, new probes, children, Docker, ports, dependencies or publication authorized.

## Verdict: REQUEST_CHANGES

One medium finding (F15-R1) against SRC-01/SRC-06; no high/blocker finding or data-loss claim. Review completion is not feature acceptance. Full regression/build/mutation final exits and actual UI remain coordinator-owned gates.

### F15-R1 — medium: bulk job deletion can deadlock an old retry through the live-job unique index

Location: `packages/db/src/source-management.ts:17` (bulk DELETE before live-state check), interacting with `packages/db/migrations/005_index_job_cabinet_grants.sql` (`n6b_retry_job` job lock then failed→queued UPDATE) and `001_init.sql` (`index_job_live_source_key`).

Concrete permitted state: one source has a queued/running job L and a failed historical job F. A historical failed job can still be retried through the existing authenticated job route. The following interleaving is possible:

1. Retry transaction R locks F in `n6b_retry_job`'s SELECT FOR UPDATE, before its UPDATE.
2. Delete transaction D takes source FOR NO KEY UPDATE. Its bulk DELETE visits L first and tentatively deletes L, then waits for F held by R. The DELETE has not finished, so the JavaScript live-state check at line 18 has not run.
3. R updates F to queued. The partial unique index finds L's uncommitted deletion and waits for D to finish before deciding whether the source has a live job.
4. D waits for R's job lock; R waits for D's transaction. PostgreSQL must abort a participant with 40P01. Neither deleteSource nor n6b_retry_job handles deadlock as the required domain conflict; the HTTP handler can return 503 instead of the required409 (and the retry can fail transiently as well).

This is a source-level lock-cycle finding, **not an executed new probe**. It requires DELETE's permitted L-before-F visitation order; the query has no ordering guarantee. It does not require direct tenant SQL, new grants, a rogue worker, or simultaneous new source insertion. FK rollback prevents partial data loss, but does not satisfy the exact busy response contract. A deterministic coordinator PostgreSQL regression should hold the failed job at retry's lock boundary, observe the deletion waiting after acquiring the live job, then release retry into the unique check. An equivalent two-session SQL lock-graph reproduction may split the two row deletes to establish that visitation order explicitly, then test the product operation with a barrier.

Existing tests cover single failed-job retry versus deletion, and a live+failed source without simultaneous retry; neither combines both ingredients. The worker-FK barrier solves a different lock cycle and remains valuable.

Requested correction: prevent tentative deletion of an already-live job from forming this cycle, while retaining the RETURNING-state rollback protection against a retry that races a prior read. For example, an early live-job rejection can address this interleaving, but must not replace the atomic post-lock guard. Keep tenant job UPDATE revoked. Add the bounded two-job concurrency regression; rerun affected tests and mandatory full gates. Coordinator should dynamically confirm/adjudicate this precise schedule before implementation rather than broadly redesign locking.

## Obligation assessment

| Obligation / AC | Independent assessment |
|---|---|
| Atomic removal / SRC-01 | Explicit children→source transaction and SourceBusy exception rollback are sound for covered cases. RETURNING correctly rechecks retry-updated rows after waits. F15-R1 remains. |
| Worker FK / privileges | NO KEY UPDATE is compatible with worker KEY SHARE while job DELETE waits for worker FOR SHARE. No new job UPDATE grant; tenant access remains withTenant/RLS. Direct arbitrary tenant SQL can bypass service business sequencing; that is not claimed as the supported HTTP AC or a new cross-tenant defect. |
| Recrawl / SRC-02 | Source FOR UPDATE serializes supported enqueue/recrawl/deletion; partial unique index and fresh READ COMMITTED lookup yield one live handle. Terminal recrawl uses fresh defaults and preserves stored files/documents/chunks. Existing worker hash reuse inspected; integration explicitly uses fake provider/extractor fixtures. |
| Cabinet / SRC-03 | Deterministic source/bot order and latest task created_at DESC/id DESC; route wiring present, no-store responses, confirmation/pending/error states. Job completion refresh changes parent key, remounting SourceActions with current state. Real browser evidence still pending. |
| Stats / SRC-04 | Tenant bot join, strict >7d, widget/demo only, exactly three unknown outcomes, two numeric fields. Published rendering and Add source anchor present; question/visitor text not returned. |
| Ownership | Existing RLS family scope retained; real handover kept/revoked cases authored and the 13-case DB file observed passing. Missing/foreign/revoked return null/not-found then404. |
| Retention / SRC-05 | Strict <30d and Moscow date−2; auth reservation uses Moscow day with hour in scope. Transaction advisory lock, 1000-row batches/max20, continuation for backlog, daily non-overlap and awaited stop are wired into startWorker and main's pool.end ordering. Boundary and lifecycle tests are substantive; no production load claim. |
| Gates / SRC-06/07 | Focused and existing runtime evidence below; new two-job race absent. Full terminal gates and actual1440/390 UI not accepted in this review. |

## Evidence inspected, not re-executed

- `tests/artifacts/source-management/focused-tests.txt`: 31 passed / 6 files, author run; typecheck artifact successful root/web TypeScript.
- `tests/artifacts/source-management/mutation-origin.txt`: fixed assertion baseline1pass → RED1failure (404 versus403) → exact-byte restore → GREEN1pass. This is meaningful Origin evidence, not evidence for the deletion lock cycle.
- `tests/artifacts/source-management/final-full-regression.txt`: coordinator run in progress at inspection; observed 646 unit tests /44files passed and `packages/db/tests/int/source-management.test.ts`13tests passed. A partial log is not a terminal full-gate receipt.
- `tests/artifacts/source-management/full-stage-exits.json`: absent at initial evidence inspection. Default real-PG deletion mutation, production build and full regression completion not inferred from launch.
- Read actual handler/routes/components, DB transaction/jobs/migrations, worker lifecycle/retention/guarded document writer and new tests. No unchanged tests repeated and no new probes executed.

## Identity, limits and handoff

HEAD independently verified: `41d6dedfd027f698ae4d79aa1b61a066d22ced32`.
Snapshot SHA256 verified: `70471b359546817533f6bd3bddb40f735b93fed4994895e22d5975e3c28b0245`; all23raw-file hashes match. Snapshot's earlier implementation baseline is c7e5c65fcf7d880c8eae686d4221053085ca692f; current review is bound to committed HEAD plus these verified bytes.
Launch SHA256 verified: `eccc8b3a7e1ca36c582f543373d7823a519e35b88e139c28a6b869cc2f1d9056`.
Build-Revision: none for this review. No browser, Docker, network, dependency, source edit, child, commit or push performed. Writes limited to this report and review-1 receipt. No donors read.
Profile: compact-quality-first-v2; substantive M, existing mechanical S/exit0 retained as lower bound. Requested model/effort: gpt-6-astra/medium; actual model/effort unavailable from per-attempt host metadata. Tokens/cost/active time null; no inferred usage or savings.
Coordinator owns dynamic confirmation/correction of F15-R1, missing mandatory gates, actual UI, telemetry and acceptance. This review has no running background work.

Final evidence read:2026-10-03T06:09:02Z; full-stage-exits.json still absent, no terminal integration/build/mutation result asserted. Finished:2026-10-03T06:10:01.577225+00:00; elapsed from launch:338.934s, within480s.
