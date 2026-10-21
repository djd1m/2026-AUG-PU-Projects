# F10 implementation attempt a1 — coherent partial, not accepted

RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT: f10-implement-a1
Start ACK: 2026-10-06T15:11:49Z
Launch deadline: 2026-10-06T15:30:18.283812Z
Receipt sealed: 2026-10-06T15:29:33.736936+00:00
Baseline: 9951c9e0f3c51cbca560de4763f3cc71b73e6835
Result commit: 457f006c76d3b4a908e1a2e9ae9a372e01ba20e3
Spec SHA256: 410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8
Launch SHA256: 5d6c4185de61ad42ea02a9ada6231548098b7f6b1935c3599fe6674f7c35c5c4
Requested role/model/effort: exclusive coding, gpt-6.1-sol/high, inherited requested role.
Actual native model/effort/usage/cost: null; host_not_exposed. No inferred attestation.
Profile: XL/full, inherited coordinator workflow.
Delivery: local commit only; no push, publication, external provider or charges.

Implemented candidate

Additive schema015: persisted per-kind tenant/mailbox service sequence advanced in FIRST-global-lock claim before I/O; logical generation/owner CAS and original due age retention. Existing activity-only capacity renewal/admission with global30; no recreation after explicit deactivation. Finite4 poll/2 dispatch lanes plus bounded pool/maintenance, joined promises and abort propagation to existing native child; no physical expiry reclaim. One snapshot/page poll quantum, separately persisted tail horizon, existing20page/120s budget and explicit rescan retry preserved. Runtime guards compose poll/source/grant and dispatch final fence. Final SMTP60s spacing commits with submitting, retry remains inside original120s ceiling, unknown behavior unchanged. Bounded30 peer cursor skips pair conflict, one movable outbound per sender, reply priority, old-day movable initial cancellation. Opt-in runtime CLI/scripts/compose. No UI change.

Executed final checks on result source

- focused-pg-final: exit 0; raw /tmp/n7-f10-implement-a1/focused-pg-final.log
- affected-pg-v2: exit 0; raw /tmp/n7-f10-implement-a1/affected-pg-v2.log
- typecheck-v2: exit 0; raw /tmp/n7-f10-implement-a1/typecheck-v2.log
- lint-v2: exit 0; raw /tmp/n7-f10-implement-a1/lint-v2.log
- build-v2: exit 0; raw /tmp/n7-f10-implement-a1/build-v2.log
- unit-v2: exit 0; raw /tmp/n7-f10-implement-a1/unit-v2.log
- Focused PG command: npm run test:f10, exact parent witness explicitly included by script. TAP7/7. Production stores/adapters on asserted current_database=n7f09_a1; no default database reset.
- Affected PG command: node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/submission-integration.test.ts tests/dispatch-integration.test.ts tests/replies-integration.test.ts. TAP52/52.
- Focused lane command: node node_modules/tsx/dist/cli.mjs --test tests/f10-runtime-unit.test.ts. TAP1/1; this is an internal fake-store lane join witness, not native cleanup proof.
- Type/lint/build commands: npm run typecheck; npm run lint; npm run build, all exit0 using readonly checked deps under heavy mutex.
- Three source mutations, restored before final checks: oldest-due fairness, removed finish generation predicate, spacing60→5. Each exit1 with discriminating tests. Raw mutation-v2-*.log and mutations-v2.json. Earlier generation mutation survived exit0; retained mutations.json and mutation-generation.log, then same-owner changed-generation ABA witness added and red v2 confirmed.
- git diff --check exit0; every changed source/test file below500 lines.
- Node actual: runtime-version.log, v22.20.0.
- Source manifest: /tmp/n7-f10-implement-a1/source-manifest.json; built dist manifest: /tmp/n7-f10-implement-a1/build-manifest.json. No F10 Docker image built; old existing image is not claimed. Browser N/A (unchanged UI), no E2E claim.

Failures and measurement boundaries

First focused run4/5: fixture used nonexistent transport_slot instead of transport_operation. First raw log was overwritten; original raw bytes are missing. Actual failure was observed in tool output, not reconstructed. Later initial5/5 log also overwritten by7/7; no historical raw-preservation claim. Future v2/final logs are distinct.
Initial affected PG48/52 including parent failure: two midnight quota-release assertions exposed real early-return pacing bug; fixed pacing predicate inside final UPDATE preserving quota-release branch. Old exact5/30 retry assertion intentionally updated to required60s spacing within original120s; fresh poll, revoke, quota and ceiling assertions retained. Prior affected-pg.log preserved, final affected-pg-v2.log52/52.
The seven required integration title strings do not mean every boundary of those AC has been proven. Current overload title's selected-A–D/E witness is same tenant; independent-tenant fault composition remains unexecuted. Current durable recovery title proves20 concurrent CAS claims/expiry/ABA and physical rows untouched, not complete native drain/unknown-send restart.

Remaining implementation — F10 still NEEDS_WORK

- AC002: replace current set-based reconciliation over existing requested capacity rows with the specified persisted keyset connected-mailbox reconciliation, page≤100 and cursor continuation. Preserve explicit activity-only rule; do not create/recreate leases from consent or connected status.
- AC004/006: project actual oldest eligible send_job due_at and typed waiting_budget/waiting_pacing/authority/transport outcomes into durable dispatch scheduling; current initial runtime due is admission timestamp and blocked/no-job paths can reset due age. Recheck due/failure/DB-unavailable composition across restart.
- AC001/006: prove or correct fail-closed DB error classification across operations and joined sibling shutdown. Current operation catch treats generic errors as provider_backoff; pool guard uses process abort rather than internal sibling-abort signal. No claim of completed strict DB-admission shutdown.
- AC001/003: validate conditional total15s drain with actual child TERM/KILL and DB release; current code joins owned work and skips post-abort finish, but no actual runtime proof yet. Retain cleanup_blocked physical occupancy and no orphan healing.

Remaining verification — after those source corrections

- AC001 native runtime drain/restart with submitting/unknown and all cleanup fault orders.
- AC002 actual100-connected/30-active healthy participants; multiple tenants, expiring renewal/waiting fairness, stop/revoke ordering and keyset continuation.
- AC003 tests/f10-runtime-protocol.test.ts required literal suspended transport owners retain physical slots across runtime restart; native runtime SIGSTOP>120 plus actual4IMAP/2SMTP/1permailbox resource/cpu/memory/fd evidence. Existing F09 source invariants retained but not a fresh F10 runtime PASS.
- AC004 complete20worker final-fence quota/midnight/pacing/provider-cap/retry/unknown composition and affected full realPG suite.
- AC005 midnight allocation/final races, every pair conflict/cursor/reply/one-movable invariant and fresh both-peer consent/capacity boundaries.
- AC006 independent tenant failure progress; exact backoff progression30/60/120/300 and retained oldest due, operation/DB faults.
- AC007 measured per-mailbox poll≤30s/fairround≤60s/poolround≤300s under stated healthy fixture resource assumptions; no provider SLA claim.
- Full unit, full realPG, relevant native protocol/fault tests, broader canary scan and independent review. Current three mutation PASS means expected red discrimination only, not all mutation inventory.

Next owner/step: /root/n7_expanded_coordinator must launch bounded f10-implement-a2 on 457f006c76d3b4a908e1a2e9ae9a372e01ba20e3, exclusive writer to finish the concrete implementation gaps above, then bounded verification/review. This attempt failed its complete7AC implementation scope; parent autonomy continues. No running process claimed after handoff.

Changed paths (19):
projects/07-cold-email-warmup/db/015-durable-runtime.sql
projects/07-cold-email-warmup/docker-compose.yml
projects/07-cold-email-warmup/package.json
projects/07-cold-email-warmup/src/db.ts
projects/07-cold-email-warmup/src/dispatch/store.ts
projects/07-cold-email-warmup/src/dispatch/submission.ts
projects/07-cold-email-warmup/src/pool/store.ts
projects/07-cold-email-warmup/src/replies/adapter.ts
projects/07-cold-email-warmup/src/replies/store.ts
projects/07-cold-email-warmup/src/replies/worker.ts
projects/07-cold-email-warmup/src/runtime/loop.ts
projects/07-cold-email-warmup/src/runtime/store.ts
projects/07-cold-email-warmup/src/runtime/worker.ts
projects/07-cold-email-warmup/tests/diagnostics-integration.test.ts
projects/07-cold-email-warmup/tests/expanded-mvp-04.test.ts
projects/07-cold-email-warmup/tests/f10-runtime-fixture.ts
projects/07-cold-email-warmup/tests/f10-runtime-integration.test.ts
projects/07-cold-email-warmup/tests/f10-runtime-unit.test.ts
projects/07-cold-email-warmup/tests/submission-integration.test.ts

Status: failed
