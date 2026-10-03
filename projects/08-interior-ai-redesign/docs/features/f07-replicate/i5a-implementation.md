# F07 I5a — hosted evidence and atomic completion handback

Run-ID: n8-20261002-1740. Work-Unit-ID: n8-replicate-i5a. Attempt-ID: replicate-i5a-1.
Base source: 2ad12e0e1cf98e0aacff28472f29b9a3bcdbf374. Accepted spec SHA256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad.
Launch SHA256: 5bf6aeb199bff6c17fbc82bfb03e33a060a4925d9330adcaef8473fa0d164cb6.
Approved subdivision: `i5a-slice-boundaries.md`; I4a F1 CLOSED retained. Sole author; no delegation. Requested gpt-6.1-sol/high; host-resolved actual model, tokens and cost are null pending host capture. Profile compact-quality-first-v2; mechanical S is a lower bound, substantive XL retained. Companion applied to preparation and handback; E2E preflight not_applicable because this slice runs no E2E.

This delivers the bounded implementation and allowed local proofs. It is not PostgreSQL acceptance, independent review, complete F07 acceptance or hosted activation. Parent owns the exact frozen PG16 execution and later review. No network/provider/credentials/install/Docker/listeners/commits/push/run-events/global configuration actions occurred.

## Schema 008

`scripts/migrate.js` appends `008-replicate-evidence.sql`, retaining its advisory-lock/transaction/idempotence protocol. DB001–007 remain byte-identical. Job/evidence mode checks admit `replicate`. Four formerly NOT NULL evidence columns become nullable only for hosted evidence: `model_revisions`, `hardware`, `inference_ms`, `warm`. A mode-specific CHECK requires all four nonnull for fixture/controlnet and all four null for hosted. Input/output/depth/config hashes, seed, queue time and worker revision retain their existing columns. There are no new evidence columns or historical row writes, preserving protected SELECT * and canonical evidence/hash comparisons.

Hosted canonical evidence is closed, requires explicit vendor-null/source-null fields, bounded integer local elapsed time, source fields, matching persisted hashes/seed/queue/revision and private unverified mode. A partial unique index binds hosted submission ID. The new INSERT trigger requires actual matching durable succeeded submission, known/terminal state, cleanup none, no identity quarantine, model/version/contract/request/source/transmitted/transform binding and live-mode running/nondeleted job. It rejects local evidence for a submitted job. Existing immutable UPDATE/DELETE trigger remains untouched. The JS completion transaction supplies current fence/deadlines/ticket/owner checks; direct SQL is not an alternative worker authority API. SQL syntax/constraints require the pending real PG16 run; no PG pass is claimed.

## Exact completion API

Existing `jobs.complete(jobId, currentFence, output)` remains the API. `validateOutput` returns detached local model revisions for fixture/controlnet exactly as before; for hosted it returns a frozen discriminated `{mode:'replicate', output_key, evidence}`. `validateHostedOutput` performs closed-key/data-descriptor/prototype validation, pin/hash/UUID/transform/settings/timestamp/source checks and recomputes the I3 provenance-only config digest before SQL locks. Unknown keys, accessors, symbols, mixed local revisions/manifests, URLs/tokens/data URI/raw responses, invented provider hardware/warm/predict-time/billing all fail closed.

Build a new plain output object; retain the original I3 result for its disposal capability:

```js
const output = {
  output_key: result.output_key,
  mode: 'replicate',
  quality: 'unverified',
  evidence: {
    ...result.evidence, // unchanged I3 provenance, config hash and explicit nulls
    evidence_version: 1,
    job_id: claim.job_id,
    seed: verifiedServerSeed,
    style: verifiedJobStyle,
    worker_source_revision: verifiedWorkerSourceRevision,
    queue_ms: consumedAt.getTime() - jobCreatedAt.getTime(),
    local_elapsed_ms: measuredMonotonicElapsedMs,
    metric_sources: {
      queue_ms: 'database_timestamps', local_elapsed_ms: 'worker_monotonic',
      hardware: null, warm: null, inference_ms: null, billing_actual_microusd: null
    },
    job_created_at: jobCreatedAt.toISOString(),
    attempt_started_at: consumedAt.toISOString(),
    local_started_at: localProcessingStartedAt.toISOString(),
    artifacts_verified_at: verificationFinishedAt.toISOString()
  }
};
const attached = await jobs.complete(claim.job_id, claim.fence, output);
```

The closed hosted evidence fields are exactly: schema_version, mode, provider, quality, submission_id, prediction_id, model, version, contract_sha, request_sha, source_input_sha, transmitted_input_sha, transform, raw_provider_depth_sha, raw_provider_output_sha, depth_sha, output_sha, input_sha, config_sha, artifact_key, hardware, warm, inference_ms, billing_actual_microusd, evidence_version, job_id, seed, style, worker_source_revision, queue_ms, local_elapsed_ms, metric_sources, job_created_at, attempt_started_at, local_started_at, artifacts_verified_at. Canonical DB evidence adds output_key only. No field is silently defaulted. I3 schema_version stays1; evidence_version names this separate DB contract.

`createJobs` must receive the trusted worker configuration's existing `seed` and `sourceRevision` properties for hosted completion; missing values or mismatch return false. This slice does not modify web config or worker wiring, so ordinary server configuration cannot enable hosted completion. Style is checked against the locked job. Queue time is derived from persisted job creation and original consumed ticket timestamps; it is application queue time, not provider starting time. Local elapsed time is a separately measured monotonic software interval, not warm/prediction duration. Vendor sources and values are always null; even caller zero/false is rejected. Tests use labelled synthetic timing/hashes solely to prove software behavior.

The exact unchanged I3 safe config consists only of schema_version, mode, provider, quality, submission_id, prediction_id, model, version, contract_sha, request_sha, source_input_sha, transmitted_input_sha, transform, raw_provider_depth_sha, raw_provider_output_sha, depth_sha, output_sha. Its config_sha is recomputed from canonical serialization of precisely that subset. Worker fields are never written into or pretended to exist in the artifact.

## Atomic authority

Canonical serialization/hash happens before transaction entry. Completion takes account→job→submission locks through the existing ownedTransaction and samples clock_timestamp after all three locks (trusted test clock only in explicit test runtime). No filesystem, decoding, hashing or network occurs under SQL locks. The current fence, running/nondeleted job, lease, original job/attempt/submission deadlines, nondeleted owner-scoped source/hash/geometry, original consumed nonsuperseded ticket and matching immutable submission identity/hash/transform are required. Durable prediction status must be succeeded and cleanup none/nonquarantine. Observed/submitting timestamps must exist; verified time cannot precede observation or exceed current DB time. Recovery allows current fence >= immutable submission fence with the same ticket/attempt/deadline.

One transaction inserts unique immutable canonical evidence and updates status succeeded/output key/mode replicate/quality unverified/finished time/lease null. Successful completion does not decrement or reconcile ticket/counter/credit/spend reservations. Hold after authorized CAS permits existing private completion. F1 correction restores the shared `expire(c,j,now,s)` immediately after the stale-fence early return and before live/mode denial. Current-fence original attempt/hard expiry and existing hostedInvalid terminal causes fail/fence/clear lease, uniquely release customer credit and preserve known prediction identity while marking cleanup in the completion transaction. This customer credit release is not provider billing reconciliation or refund; provider spend, tickets, attempts and counters remain unchanged. Stale fences cannot terminalize a newer owner, even at a deadline. Healthy lease-only expiry, wrong evidence and healthy binding mismatches remain pure denials. Maintenance/fail/heartbeat/get retain the same lifecycle logic. Local fixture/controlnet with no submission preserves existing completion/retry behavior; local output with a submission and hosted output without a submission are denied.

## I4b verification and disposal responsibility

Before this API, the future worker must obtain a fresh trusted owner-scoped job/upload/submission/ticket context. Reconstruct the exact pinned request using deterministic I3 sanitized JPEG bytes and server-fixed style prompt/a_prompt/n_prompt, num_samples='1', image_resolution='512', detect_resolution=512, ddim_steps=30, scale=7.5, eta=0, and the original verified seed. Recompute `hashReplicateRequest` and compare with immutable submission request_sha, plus source/transmitted hashes and transform. Changed seed, prompts, settings, bytes or transform must fail before GET/import/completion. This DB slice cannot derive seed/prompts from a digest and cannot authenticate fabricated artifact metadata; I4b owns actual reconstruction and byte verification, with no changed I3 API.

Verify actual private original/output/depth/config bytes, normalized geometry and exact safe config before assembling worker evidence. Worker sourceRevision/seed must match the trusted configuration; timestamps and monotonic elapsed must come from actual software measurements, never provider advertising or caller scalar claims. Recovery uses the original consumed ticket/start timestamp and newly measured local processing interval within the remaining original deadline, never a fresh180s budget.

After confirmed commit call `result.release()`. After false completion, query references before granting `result.cleanup(async key => definitelyUnreferenced(key))`. After an uncertain commit, query DB job/output/evidence by job and key first: referenced winner releases descriptors, known-unreferenced can clean, unavailable/uncertain DB preserves files and releases capability for orphan reconciliation. Never generic-discard the winner. I3 nonenumerable cleanup/release methods stay on `result`, not the closed output object passed to validation.

## Quality contract and limitations

Successful attachment always has unverified quality. Existing quality/public modules are untouched; their local evidence predicates still reject hosted mode. I5b must validate this separate hosted evidence/config branch, actual bytes and independently measured real36-pair corpus before changing any public predicate. No local manifest/revision fabrication, fixture/public eligibility, provider performance/cost/warm proof or spend release is added. Full source-bound I7 suite and I8 actual shared-Docker browser remain mandatory. I6 final send-CAS mutation is not replaced by this focused evidence mutation. Actual provider/pilot/quality activation stays separately gated.

## Checks and parent commands

Node v22.20.0 (`/tmp/n8-node22`), one test worker. Allowed local run: new strict hosted unit plus unchanged jobs/provider/generation/quality focused tests, 33 pass/0 fail/0 skip; source/log bound in snapshot. Build/static syntax check passed; final additive PG test syntax passed separately. Existing heavy I2/I3 suites were not rerun. Sharp runtime defaults to concurrency1 in this environment; parent should retain its concurrency1 preload for PG/full-suite checks.

Focused disposable mutation removed exactly the non-null vendor-scalar guard in `validateHostedOutput`; unchanged provider-scalar oracle recorded baseline exit0, mutant exit1 at Missing expected exception (invented hardware accepted), restored exit0 with identical restored source SHA. Production files were never mutated. This is the bounded meaningful guard mutation, not proof of send-CAS or SQL runtime safety.

No PostgreSQL test was executed by this author. In the parent's dedicated internal PG16 frozen-image overlay, with TEST_DATABASE_URL already supplied securely and N8_TEST_DB_OWNERSHIP=n8-f07-replicate:

```sh
node --test --test-concurrency=1 tests/replicate-evidence.integration.test.js
node --test --test-concurrency=1 tests/replicate.integration.test.js tests/replicate-lifecycle.integration.test.js
node --test --test-concurrency=1 tests/jobs.integration.test.js tests/quality.integration.test.js
```

Use the image's Node22 binary; do not run these on node20. Dedicated F07 URL/ownership/internal hostname and server16 guard are mandatory, with no skip. The new PG suite starts at historical007 and proves unchanged local rows/evidence hashes, migration8/idempotence/immutability, null/mixed/closed schema negatives, hold completion, two contenders, actual account/job/submission deadline waits, stale/reclaimed fences, delete/cleanup races, every cleanup state, provider statuses/quarantine/identity/hash/geometry/settings/ticket checks separating existing terminal causes from pure denial; literal state equality except required terminal fields/cleanup/customer release, atomic rollback and local retries. Parent must record exact executed bytes and outcomes; author syntax is not a PG pass.

Evidence: `docs/telemetry/n8-20261002-1740/replicate-i5a-checks.json`, local/syntax/scope/mutation logs, `replicate-i5a-snapshot.json`, `replicate-i5a-receipt.md`. Snapshot includes every changed owned product/test path+SHA256, protected previous file map, source/spec and pin. One initial write/test command used a project cwd with root-relative paths and failed without writing files; corrected command passed. All local failures are preserved as limitations/history, with no fake PG result. No optional polishing round.

F1 bounded correction and fresh author checks: `i5a-f1-correction.md`. Prior actual-PG history remains preserved; corrected-source PG and independent F1 closure are parent-owned and pending.

Status: completed
