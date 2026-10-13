# F02a bounded durable queue candidate

Accepted plan: `docs/plans/f02-generation.md`, F02a only. Source baseline `67d2e251d145c11a68d9f05a9e9be59094716138`. This is an implementation handoff; real PostgreSQL/Docker acceptance and fresh independent Astra review are pending. F02 roadmap remains in progress. Specification and its 41 AC / 57 scenarios are unchanged.

`db/002-generation.sql` maps job, attempt_budget, attempt_ticket and immutable generation_evidence. The F01 migrator applies versions 1 and 2 transactionally under its existing migration advisory lock; startup requires version 2. Cleanup metadata is added to upload/job. No dependency/lockfile changes.

Owner endpoints:

- `POST /api/jobs`: JSON upload_id, style, idempotency_key; 202 with job_id. Same owner/key/body always returns the original ID, including after hold, caps or tombstone; changed body 409. Allowed style: warm/minimal/afrohemian/playful; key 1–128 ASCII letters/digits/underscore/hyphen; lowercase UUID boundary retained.
- `GET /api/jobs/:job_id`: persisted owner state; absent/wrong owner/tombstone 404. Queue/hard expiry is reconciled under locks before returning state.
- `GET /api/jobs?limit=50&before=UUID`: maximum 50 entries, stable descending created_at/id pagination and next cursor; owner-bound cursor, private/no-store, noindex. Status is persisted queued/running/succeeded/failed. API fetch failures remain failures; a future client must show unknown rather than infer running.
- `DELETE /api/jobs/:job_id` and existing `DELETE /api/uploads/:upload_id`: tombstone the source upload and every associated job under account→job locks, increment fences, release each still-reserved credit once, and prevent subsequent private reads. Unverified completed results retain their reservation until later quality disposition or deletion. Future accepted-quality transition must finalize reservation consumption. No shares exist in F02a; future sharing must require non-tombstoned records on every read.

`createJobs(pool, config)` exposes internal reserve/claim/heartbeat/complete/fail/maintenance/get/list/delete/deleteUpload methods. None of the worker operations is an HTTP endpoint. Claim returns the attempt number, fence and lease/deadlines. Heartbeat is due every 10 seconds; lease is 30 seconds, queued expiry 60 seconds, fixed attempt limit 180 seconds, absolute job limit 360 seconds and at most two starts. The controller must cancel its future inference child at the returned deadline; database fencing already rejects late attachment. Retryable failure queues the same job and invalidates the old fence; claim obtains new capacity before a retry. Expired leases are invalid before retry even without maintenance.

Budget locks are platform-day→account-day→account→job. Completion, heartbeat, terminal maintenance and deletion start at account and never subsequently request budget locks. Admission creates job, reserve ledger and first ticket in one transaction. Same-day first claim consumes that ticket without incrementing counters. New-day replacement supersedes the old ticket, retains both old counts, and obtains new capacity before start. UTC time comes from PostgreSQL clock_timestamp after locks; a transaction crossing midnight restarts before effects. Trusted test clock is constructor-only, absent from HTTP and refused in production.

Required configuration: PLATFORM_DAILY_LIMIT positive integer ≤200, ACCOUNT_DAILY_LIMIT positive integer ≤20 and ≤platform limit. Missing/invalid values fail startup. `.env.example` has explicit 200/20 values; Compose requires explicit supplied values. Tickets never refund. Queue status is observable through `node scripts/queue-status.js`, which prints counters and aggregate states without credentials.

F02b output contract: `complete(job_id, fence, {output_key, mode, evidence})`, where output_key is a server-owned UUID in STORAGE_DIR/outputs. The trusted F02b controller must verify actual bytes/hashes and install the output outside the transaction before calling complete; F02a does not claim byte verification or GPU inference. Evidence requires input/output/depth/config SHA256, sd/controlnet/depth revision strings, integer seed, worker source revision, hardware, queue/inference milliseconds and warm boolean. Input hash must match the normalized upload. Evidence and succeeded/unverified output attach atomically under a live fence. Evidence rows reject updates/deletes. Fixture mode is explicitly labelled and refused in production; there is no quality-acceptance/publication endpoint. Active pre-hold work may finish private; queued/post-hold starts and retries cannot run.

Maintenance is an explicit Compose service (`node scripts/maintenance.js`), retrying passes every 10 seconds; `--once` runs one pass with failure exit 1. It processes up to 1000 due queue rows, 100 tombstone cleanup rows and bounded cursor-based F01 sweeps, including the separate output registry. Failed physical deletes remain queued with rotated retry priority. Healthy maintenance is required for the 1-hour cleanup contract; filesystem/DB failure keeps media tombstoned and retries rather than restoring visibility. DB/web/maintenance CPU caps sum to 2 (1/.75/.25); DB remains unpublished. No service was started in this sandbox. The actual 1-hour runtime/service-recovery contract remains pending coordinator validation.

Run from PROJECT_ROOT with Node22 and existing dependencies. No install, GPU, provider, mail or deployment is needed for these checks:

```sh
node scripts/check.js
node --test --test-concurrency=2 tests/boundaries.test.js tests/media.test.js tests/mutation.test.js tests/jobs.test.js
node scripts/mutation.js origin
```

Coordinator-only runtime checks require the heavy-build lease/mutex, port-conflict preflight, dedicated PostgreSQL16 and privately supplied TEST_DATABASE_URL. Never print the URL or other secrets. Each harness creates/drops a random isolated schema:

```sh
N8_TEST_DB_OWNERSHIP=n8-f01 node tests/integration.test.js
N8_TEST_DB_OWNERSHIP=n8-f01 node scripts/mutation.js owner
N8_TEST_DB_OWNERSHIP=n8-f02a node tests/jobs.integration.test.js
N8_TEST_DB_OWNERSHIP=n8-f02a node scripts/mutation.js budget
```

Budget negative control runs a green baseline then removes exactly the executable capacity check in a disposable copy. It accepts only ERR_ASSERTION with exact tag `SEC-03 budget last slot admits exactly one`, expected 1, actual 2 and strictEqual; timeouts/spawn errors/unrelated failures cannot count. Mutation oracle unit tests are synthetic harness probes, not real budget evidence. PostgreSQL fixtures are synthetic development inputs, never GPU/geometry/public-quality proof.

Required remaining checks: real F01 regression and owner mutation; real F02a concurrency/rollover/deadline/hold/fencing/cleanup/API suite and budget mutation; Compose migration/startup/config/private-network/resource/maintenance checks; coordinator freshness/source-bound independent Astra review. Browser generation UI, F02b ControlNet/Python, actual GPU corpus/performance, payments and shares are outside this unit.
