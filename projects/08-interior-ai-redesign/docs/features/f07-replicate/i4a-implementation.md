# F07 I4a — submission-aware job lifecycle

Run-ID: n8-20261002-1740 · Work-Unit-ID: n8-replicate-i4a · Attempt-ID: replicate-i4a-1.
Source: 64d640622444fe944ac61468ba9820a31f3907ac. Profile compact-quality-first-v2, accepted XL scope, sole requested gpt-6.1-sol/high coder. Actual host model/effort, usage and cost remain null pending host attestation.

Verdict: bounded implementation and test authorship ready for coordinator PG16 execution and independent review. This is neither PG acceptance nor F07/MVP completion. No provider invocation, network, Docker, host listener, install, commit, push, run-events or global configuration change.

## Lifecycle and authority

`provider_submission`, rather than caller configuration or job.mode, selects hosted lifecycle. All existing job-owned operations lock account → job → submission before sampling DB time. Local ticket allocation retains platform/day → account/day → account → job → submission and restarts across UTC midnight after the job/submission locks. Hosted recovery first takes an account/job/submission transaction and never allocates buckets, tickets or capacity. A concurrent local-to-hosted transition is rechecked again under the allocation transaction before any ticket effect. No transaction encloses network or a second transaction.

Known identity with remaining original attempt/hard deadline reclaims the same consumed nonsuperseded ticket, attempt number, immutable original deadline, submission fence and binding. Only job fence/heartbeat/lease change; the lease is capped by both deadlines. Recovery is marked `provider_recovery:true` in the worker claim. Two claimers serialize on real rows; the fresh lease excludes the loser. Maintenance leaves a recoverable known identity in running state for claim, rather than creating a fresh queued budget. Succeeded provider status still needs private import within original remaining time.

No-ID submitting after lease loss becomes ambiguous/unresolved and terminal locally. Explicit ambiguity, failed/canceled/aborted status, quarantine, input revocation and inconsistent bindings fail closed. After durable submission, retryable failure is always terminal; no attempt2 or ticket2. Claim/maintenance/get and current-fence fail/heartbeat/complete enforce deadlines even when live() is false. A stale worker returns false before deadline effects and cannot terminalize the new owner. Local fixture/controlnet retries without a submission retain their existing behavior.

Hold before CAS remains I1-denied. A hold after CAS permits the existing private bounded attempt, heartbeat and reclaim. `holdQueued` reuses its caller's account transaction, locks jobs/submissions, and honors an already durable hosted attempt. Customer release uses the existing unique reserve/release ledger implementation in the same transaction; provider reservation, counters and tickets never decrease.

Deletion takes account → ordered jobs → ordered submissions, then samples time, tombstones upload/jobs, fences and uniquely releases. Owner get immediately returns404. Known identity sets existing cleanup_state=needed; absent identity sets unresolved and submitting becomes ambiguous. Existing unresolved quarantine/claimed/done markers are preserved on terminal cleanup. I1 late valid ID binding still records identity with cleanup_required=true without changing or reviving the job. No remote cleanup loop/claim mechanics are implemented.

Current `jobs.complete` rejects every submission-backed local output. Neither fixture nor controlnet evidence can attach to a hosted prediction; provider/mode mismatch fails closed. There is no hosted completion/evidence/schema/quality branch in I4a. Existing no-submission local completion remains available.

## Worker-only interfaces for I4b

Existing `jobs.claim/heartbeat/fail/maintenance/get/delete/deleteUpload/holdQueued` signatures remain. Claim retains the existing fields `{job_id,account_id,upload_id,style,fence,attempt,attempt_deadline,hard_deadline,lease_until}`; only hosted reclaim additionally returns `provider_recovery:true`. Completion requires the current **job fence**, never immutable submission_fence.

`createProviderSubmissions(pool, config, {trustedClock}={})` additionally exposes:

- `await authority.workerContext(claim)` → `{claim,input,submission,db_now,remaining_ms}`. This is a locked read, not a send permit. `claim` contains current job/account/fence/attempt/deadlines/lease; `input` contains owned nondeleted `{id,private_key,sha256,width,height,mime,deleted_at:null}`; `submission` is the exact durable I1 row or null. `remaining_ms = min(original attempt deadline, hard deadline) - freshly sampled DB time`, with a live current lease/fence required. For submitted work, validate original consumed ticket, attempt/deadline/input/hash, identity/quarantine/status and envelope. Pre-CAS held accounts are denied; post-CAS holds are allowed. Safe ProviderSubmissionError codes remain server-internal; arbitrary database exceptions must be mapped by the worker to safe failure. No input body, URL, credential or browser route is added.
- `await authority.finalAuthorize(claim, check)` → literal boolean. `check` is I2's `{submission_id,job_id,request_sha,version,attempt_deadline}` callback value. Account → job → submission → envelope locks precede the authoritative clock. Check requires the original CAS winner's current live fence, immutable original deadline/identity, state=submitting, no prediction/quarantine, nondeleted owned input and unrevoked matching authorized envelope. It honors post-CAS hold. Mismatch, stale/revoked/deleted/expired state, exception or uncertain transaction completion yields false. A true result is returned only after commit/releases; no HTTP runs under locks.

I4b invocation contract (illustrative only, no wiring in this slice):

```js
const claim = await jobs.claim();
const context = await authority.workerContext(claim);
const budget = createReplicateBudget(context.claim.attempt_deadline, context.remaining_ms);
if (context.submission) {
  // Reclaimed known identity: GET/poll only; DO NOT call authorize or create again.
  if (!context.submission.prediction_id) throw new Error('provider_create_ambiguous');
  const observation = await transport.get({authority, submission: context.submission, budget, signal});
  // Preserve this same budget through poll and I3 preparation/import.
} else {
  // I3 prepares owned bytes/binding outside locks, using this same decreasing budget.
  const observation = await transport.create({authority, claim, prepared, budget, signal,
    finalAuthorize: check => authority.finalAuthorize(claim, check)});
  // I2 performs the sole I1 authorize/CAS internally; no earlier separate authorize call.
}
```

I4b must keep the existing 10s heartbeat/abort orchestration, use fresh current job fence, abort HTTP/import on lost authority, and preserve the same opaque decreasing budget through I2 and I3. Recovery may reconstruct I3's candidate/prepared handle under the remaining original deadline; it must verify the durable hashes/transform rather than create a replacement prediction. A context cannot eliminate the DB/HTTP deletion race after final authorization. Reconcile late identity/cleanup, deny output, retain spend, and never replay POST. Cleanup execution/claims are later; existing needed/unresolved rows are the handoff markers.

I5 must add accepted discriminated hosted evidence plus the schema branch before hosted result completion is usable. Completion will require account/job/submission serialization, current live job fence/lease/original time, nondeleted hash-bound input, nonquarantined succeeded identity, exact submission/request/version/contract/transform, raw provider depth/result hashes and normalized private hashes/config binding, immutable evidence and succeeded/unverified attach. Unknown hosted hardware/warm/billing remain null with provenance; never invent local model revisions. I3's output accessor is not completion authority. Quality/public eligibility and actual corpus validation remain their accepted later gates.

## Focused tests, compatibility and checks

`tests/replicate-lifecycle.integration.test.js` authors 15 nested scenarios on real production methods and PG16 rows, including pg_stat_activity barriers for two reclaimers, stale old-fence calls before/at deadline, unchanged literal ticket/attempt/deadline/counters/spend, known success recovery, current-fence deadline paths with expired lease, unknown crash/no replay, terminal statuses/quarantine, retryable failure, pre/post-CAS hold, tombstone404/late ID, final account/envelope deadline/revocation waits, midnight expiry with no new bucket, mode/completion bypass denial and unchanged local retry/completion. No SQL fake proves these claims. These tests have **not run in this writer**.

Compatibility dependency: common lifecycle queries now require migration007. The existing I1 suite previously used current `createJobs.claim/complete` BEFORE applying007. Only that pre-007 fixture/controlnet seeding now uses explicit old-schema SQL (plus pure canonical/hash helpers); genuine old job/ticket/ledger/evidence rows exist before migrate. Exact existing before/after evidence equality, immutable checks and every later I1 case/assertion remain unchanged. No catch for missing table and no historical migration edit.

Writer checks under `/tmp/n8-node22`: jobs unit5/5, provider unit2/2, generation13/13, ESM/static syntax build, changed/new file syntax and git diff --check exit0. Jobs/provider reran after the final related claim/binding guard changes; unchanged generation was not repeated. No failed executed check; retained history lists initial and affected final checks. Source/check hashes and actual four-product/test-file map are in `replicate-i4a-snapshot.json`; exact check metadata in `replicate-i4a-checks.json`.

Coordinator commands from PROJECT_ROOT, with disposable injected TEST_DATABASE_URL for a dedicated PG16 database (never print credentials):

```sh
N8_TEST_DB_OWNERSHIP=n8-f07-replicate node tests/replicate-lifecycle.integration.test.js
N8_TEST_DB_OWNERSHIP=n8-f07-replicate node tests/replicate.integration.test.js
N8_TEST_DB_OWNERSHIP=n8-f02a node tests/jobs.integration.test.js
```

Use Node22; all exits above are pending. The suites create/drop randomized schemas, restrict hosts to local/internal and assert PG16. Existing jobs integration includes its established HTTP harness; its execution is coordinator-owned. Follow with fresh independent Astra/high review and only concrete corrections. Later hosted evidence/worker/cleanup, full regression/mutation/browser and real paid pilot gates remain outside this writer. Current spend authorization stays0; local green checks do not establish PG, provider, quality or MVP acceptance.
