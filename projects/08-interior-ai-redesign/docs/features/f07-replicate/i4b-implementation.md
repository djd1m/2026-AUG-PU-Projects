# F07 I4b — bounded hosted worker handback

Run n8-20261002-1740; work n8-replicate-i4b; attempt replicate-i4b-1.
Source 4ebca31b55235076a5812894148135b6c4bd699e plus the frozen dirty snapshot.
Spec SHA256 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad.
Launch SHA256 06f87fe8d83fee078e5e0965c0a81f64fdce5d632cef74ace4d720a8512b2302.
Approved XL plan retained; mechanical M lower bound. Profile compact-quality-first-v2, explicit sole Sol6.1/high author override. Host-resolved model/effort, usage and cost remain null until host capture. Companion preparation/handback applied; E2E preflight not_applicable for offline implementation. No delegation, commits, installs, credentials, network/provider, Docker, listeners, global configuration or run-events. External spend authorization remains 0.

## Configuration and dispatch

Existing `workerConfig(env)` in scripts/worker.js calls unchanged `readConfig` with WORKER_MODE disabled for common validation, then selects explicit replicate via `readReplicateWorkerConfig(common,env)`. Ordinary web readConfig still rejects hosted mode. Fixture/controlnet retain their original seed bounds, manifest and Python path; replicate constructs no Engine and calls `runReplicateClaim(pool,jobs,config,claim,{signal})`.

Require WORKER_MODE=replicate, WORKER_SOURCE_REVISION (40..64 lowercase hex), WORKER_SEED (0..2147483647), REPLICATE_MODEL, REPLICATE_VERSION, REPLICATE_CONTRACT_SHA, REPLICATE_API_TOKEN (1..512 printable nonspace ASCII), REPLICATE_SPEND_BUDGET_ID (UUID), REPLICATE_AUTHORIZATION_SHA, REPLICATE_PRIVACY_ACCEPTANCE_SHA, REPLICATE_LICENSE_ACCEPTANCE_SHA, REPLICATE_SAFETY_ACCEPTANCE_SHA and REPLICATE_BILLING_ACCEPTANCE_SHA (all SHA256). No defaults or envelope provisioning.

Pins remain jagilley/controlnet-depth2img; version 922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60; contract 3d94bb6e59e6a90e24a0504abb4c06c055f7619372e2c36313f42de5d86e99bc. DB I1 remains the authority for matching unrevoked, in-window, nonzero envelope and reservation.

Returned frozen config has workerMode, sourceRevision, seed and frozen replicate binding settings. Token lives in a WeakMap, absent from enumerable config and JSON. Internal `replicateTransportConfig(config)` returns the exact I2 model/version/contractSha/token object with nonenumerable token. Copies lack secret identity. `replicateSettings(config,style)` accepts only warm/minimal/afrohemian/playful and supplies frozen server prompts, preservation constraints, fixed a_prompt/n_prompt, num_samples='1', image_resolution='512', detect_resolution=512, ddim_steps=30, scale=7.5, eta=0 and trusted seed. No caller prompt/model/URL override.

## Execution and authority

Additive provider workerContext fields: input.account_id, style, job_created_at and consumed_ticket={id,consumed_at} from the original current nonsuperseded consumed ticket under existing ordered locks. Existing predicates are unchanged. The worker creates one monotonic budget from original DB remaining and deadline, subtracting the context transaction duration conservatively. It shares the exact object with I2 and I3. Serialized heartbeats default to 10000ms, await each predecessor, abort on false/exception; external abort and the original deadline abort transport/import. Finally awaits any active heartbeat and closes opaque resources.

Actual private input is prepared by unchanged I3. Worker builds canonical request/binding from trusted settings and sanitized bytes. New create uses actual I1 authority and `finalAuthorize` through unchanged I2; only its literal committed CAS winner sends. Refresh context after create to account for authorize's UTC ticket replacement. Known-ID recovery compares all binding fields, original ticket/attempt/deadline, source/transmitted/transform/request/settings/seed before any GET. No-ID submitting/ambiguous never replay or authorize. Poll/import use fresh context and genuine I2 observations; style drift denies. Earlier errors use existing fenced nonretryable fail, without ticket/spend decrement or refund.

After I3 import, unchanged verifyArtifacts rereads original/output/depth/config and checks hashes, safe canonical config and normalized geometry. Retain original result capability; build a NEW closed output per I5a. queue_ms and job/attempt timestamps derive from DB created/consumed timestamps; local_started_at is measured after durable submission, artifacts_verified_at after observation/byte verification, local_elapsed_ms uses monotonic measurement. Every vendor metric/source remains null. Actual jobs.complete provides final authority and atomic evidence.

Confirmed true completion releases handles. False/throw resolves owned job/output plus immutable evidence/global key references BEFORE disposal. Referenced or committed winner preserves files and releases; known unreferenced rechecks within key-bound cleanup then fenced-fails; unavailable lookup preserves files/releases for orphan reconciliation. No generic discard or fail of committed winner. A resolved winner returns false (the loop logs completion only on true); unknown commit throws replicate_completion_uncertain. Errors are fixed safe codes without raw causes/payloads.

Only explicit runtime=test permits injected transportOptions/mediaOptions, authority, now/wallNow or shorter heartbeatMs. Parent PG uses real I1 and jobs methods; mocks HTTP/download boundaries and injects lost completion-response/reference-query faults around actual DB operations. No direct evidence insertion or trigger bypass.

## Checks and pending gates

Node22 /tmp/n8-node22, Sharp concurrency1 and test concurrency1. New+unchanged units passed 41/41; final affected worker/config timing guards passed 24/24. Existing generation/jobs/provider tests remain byte-identical. scripts/check.js passes; exact final PG syntax and scope/protected-hash checks are in telemetry. Every owned file is below 500 lines.

Failures retained: initial writes used incorrect cwd and wrote no files; first new-unit run 13 pass/8 fail because HTTP double lacked setTimeout; corrected run 21/21. No product-boundary guard was weakened. Subsequent focused units cover original budget expiration/context delay. Disposable recovery-guard mutation uses unchanged zero-GET oracle: baseline0/mutant1/restored0; five mismatches produced three GETs each only in mutant. Source/oracle/restored digests and raw logs are recorded. I6 actual send-CAS mutation remains pending.

From PROJECT_ROOT, local commands:

```sh
/tmp/n8-node22 --import ./tests/replicate-generation-fixtures.js --test --test-concurrency=1 tests/replicate-generation.test.js tests/replicate-worker-config.test.js tests/generation.test.js tests/jobs.test.js tests/provider-submissions.test.js
/tmp/n8-node22 scripts/check.js
```

Parent-only PG16 commands, with securely injected TEST_DATABASE_URL, N8_TEST_DB_OWNERSHIP=n8-f07-replicate and an internal allowed host; no skip:

```sh
node --test --test-concurrency=1 tests/replicate-generation.integration.test.js
node --test --test-concurrency=1 tests/replicate.integration.test.js tests/replicate-lifecycle.integration.test.js tests/replicate-evidence.integration.test.js
```

The new PG suite authors real create→poll→private completion, two reclaimers/GET-only recovery, request/transform/settings/seed/bytes mismatch before GET, no-ID no replay, hold before/after CAS, deletion, stale/lost heartbeat, missing/zero envelope, immutable counters/tickets/deadlines/null provenance and actual committed winner preservation after false/throw/unavailable lookup. Canonical WebP uploads obey DB id/private_key/MIME checks. PostgreSQL has NOT run here; these are authored tests, not passing PG claims.

I4c remote cleanup claims/actions in maintenancePass are next and remain pending. Existing needed/unresolved cleanup markers are retained; no operational remote cleanup claim. Parent owns frozen PG execution, fresh independent review, I4c, I6 final mutation, I7 full regression and I8 real shared Docker browser. Real paid activation/geometry/safety/latency/cost acceptance remains separately gated. No synthetic software image or metric establishes real hosted quality.

Evidence: docs/telemetry/n8-20261002-1740/replicate-i4b-checks.json, logs, replicate-i4b-snapshot.json and replicate-i4b-receipt.md. Receipt gives measured elapsed time; actual model/usage/cost null until host. Savings not established.
