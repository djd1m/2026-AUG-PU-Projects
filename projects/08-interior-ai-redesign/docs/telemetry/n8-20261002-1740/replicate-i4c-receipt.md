# I4c bounded implementation receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i4c
Attempt-ID: replicate-i4c-1
Source-Revision: 9a65eedd11ab166d186412201a0cfc2c884c094d
Build-Revision: dirty-worktree SHA256 snapshot 5ecada3c60fefa72dd6f2ece0062b9f74662309fbfa95256f2e2a4c3acbaa8f3
Launch-SHA256: 11fc8e5f2b62e9fde251199d24988b0bb78a61fc66019c21b964b374a1d7a568
Spec-SHA256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Started-At: 2026-10-03T13:24:16.067439Z
Frozen-At: 2026-10-03T13:44:35.561Z
Finished-At: 2026-10-03T13:47:01.512Z
Elapsed-Wall-Ms: 1365445
Active-Wall-Ms: null (no measured wait interval ledger)
Profile: approved F07 XL / sole productauthor Sol6.1-high owner override
Requested-Model: gpt-6.1-sol; effort high
Actual-Model: null (host-resolved metadata unavailable; host fills later)
Usage: null
Cost: null
Cost-Basis: unavailable
Verdict: bounded_code_delivered; parent PG/review acceptance pending

Delivered six product/test files: web/replicate-cleanup.js; scripts/maintenance.js narrow pass/standalone config hook; web/replicate-worker-config.js additive private-token cleanup accessor; tests/replicate-cleanup.test.js; tests/replicate-cleanup.integration.test.js; tests/replicate-cleanup-fixtures.js. Each has fewer than500 lines; exact hashes/line counts in replicate-i4c-snapshot.json. 151 protected source/test/schema/package/worker/feature files match accepted source byte-for-byte. node_modules is the preexisting readonly symlink and was not mutated. Source HEAD, launch bytes and specification bytes match supplied identities.

Scope: account→job→submission ordered locks and post-lock clock, needed/expired-claimed fence+30s lease, sequential one-action/row/pass, one scan≤100, private original-deadline cleanup budget≤5s/pass/request, persist cancel-request before first invocation then GET only, terminal-only done and canceled-only confirmation. Unknown/quarantine/retention boundary unresolved with zero HTTP; errors/429/404/timeout remain needed. No opaque output/URL return, attachment, revival, refund, spend/ticket allocation or job deadline change. Cleanup works independently of held/deleted/expired/revoked work; standalone defaultdisabled exact opt-in/pins/token only. Crash/budget expiry after request persistence may mean cancel was never sent; GET cannot retroactively claim it was. Neither done nor unresolved proves erasure or free billing.

Checks (Node22 /tmp/n8-node22; Sharp1; --test-concurrency=1):
- /tmp/n8-node22 --test --test-concurrency=1 tests/replicate-cleanup.test.js: exit0, final10/10; replicate-i4c-cleanup-units.log.
- /tmp/n8-node22 --test --test-concurrency=1 tests/replicate-cleanup.test.js tests/replicate-generation.test.js tests/replicate-worker-config.test.js tests/replicate.test.js tests/jobs.test.js tests/config.test.js: exit0, 186/186 on then-current cleanup8 plus unchanged old units; replicate-i4c-units.log. Required crash/timeout additions subsequently tested10/10; old sources unchanged.
- /tmp/n8-node22 --test --test-concurrency=1 tests/provider-submissions.test.js: exit0,2/2; replicate-i4c-provider-units.log.
- /tmp/n8-node22 scripts/check.js: exit0; final replicate-i4c-static.log. RealPG suite syntax included; separate --check also exit0.
- git diff --check: exit0.
- Source-bound stale cleanup-fence mutation: baseline0 / guard removed1 / restored0. Fixed oracle bytes unchanged throughout; exact source/oracle/mutant SHA256 and raw deliberate-failure output in replicate-i4c-mutation.json. Earlier mutation retained in replicate-i4c-mutation-initial.json. Original source restored and matches frozen helper hash.
- Mechanical route M exit0; substantive approved XL retained. Initial tracked route record unchanged, separate implementation route log retained.

Failures/corrections: initial unit NaN timestamp equality wrongly rejected unresolved disposition (exit1,7/8); corrected sameTime and restored green. First snapshot attempt rejected a doubled git prefix slash before writing output; normalized prefix and rechecked all151 protected files. Incidental nonexistent guessed DB filenames did not affect implementation. Detailed observed excerpts/provenance in replicate-i4c-failures.md. First failure stdout exists in tool transcript only, not a fabricated reconstructed raw log.

RealPG suite AUTHORED, NOT EXECUTED by author. It uses Node22/PG16 internal ownership guard n8-f07-replicate, actual I1 authorize/bind/observe/jobs fail/delete/deadline maintenance, no direct submission/evidence INSERT or trigger bypass, mocked fixed HTTPS only. Cases: competing owners one cancel; cancel→GET; expired/reclaimed stale observation zero changes; real account-lock observation expiry; durable cancel flag/no invocation crash window; post-lock retention; expired/held/revoked/deleted cleanup; success race/no evidence/no refund; terminal monotonicity; unknown/quarantine/retentionzeroHTTP; errors/429/404/actual I2 timer; defaultdisabled/invalid config; max100 sequential calls/pass exhaustion. Literal before/after full accounting/job/identity conservation assertions are included.

Parent next command as DATA only, not executed here:
N8_TEST_DB_OWNERSHIP=n8-f07-replicate [parent-owned TEST_DATABASE_URL] /tmp/n8-node22 --test --test-concurrency=1 tests/replicate-cleanup.integration.test.js tests/replicate.integration.test.js tests/replicate-lifecycle.integration.test.js tests/replicate-generation.integration.test.js
Separate existing jobs/filesystem suite: N8_TEST_DB_OWNERSHIP=n8-f02a [parent-owned TEST_DATABASE_URL] /tmp/n8-node22 --test --test-concurrency=1 tests/jobs.integration.test.js
Parent must satisfy each suite's actual owned database guard/config. Do not weaken it. Parent owns exact frozen-source real PG, fresh independent review, then I6 sendCAS/mock UI, I7 full regression/docs, I8 actual browser. No fake PG pass, active author background worker or full-feature success claim. Paid pilot/privacy/license/safety/billing/realquality/performance/deployment remain separate gates, not authorized here.

Companion applied minimally for preparation/handoff; E2E preflight not_applicable to code stage. No delegated agents, other model CLI, model override, commits/push, run-events writes, provider/network requests, real environment/token reads, installs, Docker, host listeners or global config changes. External spend0. Actual model/usage/cost remain null; savings not established.

Artifacts: docs/features/f07-replicate/i4c-implementation.md; docs/telemetry/n8-20261002-1740/replicate-i4c-progress.md, replicate-i4c-snapshot.json (SHA256 5ecada3c60fefa72dd6f2ece0062b9f74662309fbfa95256f2e2a4c3acbaa8f3), logs and mutations listed above. Receipt is atomically installed at the exact unique caller TRACE_PATH.

Status: completed
