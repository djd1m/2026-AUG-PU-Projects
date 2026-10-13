# F07 I1 — database submission authority

Run-ID: n8-20261002-1740. Work-Unit-ID: n8-replicate-i1. Attempt-ID: replicate-i1-1.
Source: 781d41e96dc143ea898d82747622f2b102f1888c.
Profile: compact-quality-first-v2, substantive XL; accepted plan/owner authorization retained. Requested gpt-6.1-sol/high; actual model/effort and usage/cost null pending host evidence. One executor, no delegation.

Verdict: implementation ready for Node22/PG16 runtime checks and independent review. This is I1 only, not F07/MVP acceptance. No HTTP, paid calls, Docker, listener, dependency changes, commit or push.

## Changes and authority

007 adds `provider_submission` (unique job and nullable unique prediction ID) and `provider_spend_budget`. No envelope is provisioned, so real admission is disabled. Append-only migration wiring includes 007; previous migrations and tests are unchanged.

Submission model/version, request/contract/original/transmitted hashes, numeric transform, attempt/ticket/fence/deadline, envelope/cost and acceptance digests are immutable. Insert verifies the existing consumed nonsuperseded ticket/job/input and envelope bindings; update/delete triggers preserve identity and one-way states. Provider status cannot regress. Prediction identity conflicts persist an irreversible `identity_conflict_at` quarantine marker and an unresolved cleanup marker. Neither secret nor input body is an API field or DB column; transform has closed numeric fields in JS and SQL.

Envelope scope/model/version/window/ceiling/per-create ceiling/authorization/privacy/license/safety/billing acceptance digests are immutable; revocation is irreversible and reservation cannot decrease. Modeled admission is separate from customer credits and actual billing. Failed/ambiguous/canceled work never automatically refunds spend or capacity. I1 does not mutate customer ledger or terminalize/release jobs; I4 uses the existing unique release path.

Authorization takes current-day platform bucket → account bucket → actual account → job → submission → envelope locks. It validates live status/fence/lease, original fixed attempt deadline, job hard deadline, owned nondeleted input/hash, no hold and consumed ticket. DB time is sampled after locks, including after waiting on the envelope. A midnight wait rolls back and retries at most three times. Before first submission across UTC midnight, replace the consumed ticket using the existing bucket limits/order; retain old counters. No existing immutable preflight binding is rewritten. Missing/zero/revoked/out-of-window/mismatched/exhausted envelopes fail closed.

The single transaction inserts preflight, reserves the envelope's immutable per-create ceiling, and CASes preflight → submitting. Only a committed `authorized:true` result permits one future invocation; the caller must not invoke on an exception or uncertain commit. There is no independently committed preflight insertion API. A rejected local preflight therefore leaves no false binding and may use existing local retry before any submission. A durable submitting/known/ambiguous/terminal row never authorizes a second invocation, including known provider failure. Request idempotency is local; no remote idempotency is assumed.

ID binding may run after lease expiry, fence change, local failure or deletion. It never changes the job, renews a lease, publishes output, grants completion, spends or releases credit. Expired authority marks cleanup needed. Monotonic observation is also identity-only; success observation does not imply successful local completion.

## Interfaces for I2–I4

All factory methods are internal worker APIs, never browser routes. IDs are canonical UUID strings, hashes lowercase SHA256, amounts PostgreSQL bigint strings in returned rows. The module sends no network request.

`createProviderSubmissions(pool, config, {trustedClock} = {})` requires `platformDailyLimit` 1..200, `accountDailyLimit` 1..20 and account≤platform. Optional clock is allowed only with `runtime:'test'`; normal execution uses PostgreSQL `clock_timestamp()`.

`await authority.authorize(claim, prepared)` owns and commits its transaction. Claim requires `{job_id, account_id, fence, attempt, attempt_deadline}` from the current job claim (existing additional claim fields are accepted). Prepared has exactly:

```js
{
  model, version, spend_budget_id,
  contract_sha, source_input_sha, transmitted_input_sha, request_sha,
  authorization_sha, privacy_acceptance_sha, license_acceptance_sha,
  safety_acceptance_sha, billing_acceptance_sha,
  transform: {
    original_width, original_height, canvas_width:512, canvas_height:512,
    content_rect:{x,y,width,height}
  }
}
```

Source dimensions are positive integers with ≤20000000 pixels; rectangle is positive, integral and inside the 512 canvas. Envelope fields must exactly match the prepared model/version/contract/acceptance digests. Actual ticket is resolved from the existing consumed current ticket; callers cannot supply a new ticket or cheaper reservation. Return is `{authorized:true, code:'submission_authorized', submission}` for the sole CAS winner, or `{authorized:false, code:'submission_no_replay', submission}` for identical already-submitted work. Mismatched bindings throw, even on replay. Reclaimed work with a new job fence must use GET/observation, never authorize.

`await authority.bindPrediction(jobId, {request_sha, prediction_id, version})` takes account → job → submission locks. The validated ID is 1..128 ASCII letters/digits/underscore/hyphen. Returns `{recorded:true, submission_id, prediction_id, cleanup_required, completion_authorized:false}`. Same-ID repeats are permitted. Conflicts return `{recorded:false, code:'prediction_identity_conflict', submission_id, completion_authorized:false}` and commit quarantine without overwriting an ID. A savepoint recovers the transaction after a unique-ID conflict. Caller should surface only this safe code/opaque ID to an operator; I1 adds no messaging transport.

`await authority.markAmbiguous(jobId, requestSha)` transitions submitting with no ID to ambiguous/unresolved. Returns `{changed, state}`; repeated calls do not change known/terminal state or reservation.

`await authority.observe(jobId, {request_sha, prediction_id, version, status})` validates exact stored identity/version and status starting/processing/succeeded/failed/canceled/aborted. Returns `{changed, status}`. Repeats, older starting observations and observations after terminal status return the stored status without regression. Terminal provider status moves submission to terminal only; job stays unchanged.

For I4 transactions already holding account → job locks, use exported helpers on the SAME client:

- `await lockSubmission(client, jobId)` acquires submission lock, returns row or null.
- `await bindPredictionLocked(client, lockedJob, lockedSubmission, identity, dbNow)` has the same identity/result contract above, including savepoint/quarantine.
- `await markAmbiguousLocked(client, lockedSubmission, requestSha)` has the same one-way result.
- `await observePredictionLocked(client, lockedSubmission, observation, dbNow)` has the same identity/status contract.

Caller must pass freshly locked rows, a fresh DB timestamp and an active transaction. Helpers never start/commit a transaction or acquire account/job locks; do not call factory methods within an existing transaction. Authorize intentionally has no locked helper: its UTC bucket locks must precede account. No HTTP/decoding/file I/O may occur while locks are held.

## Safe denials and integration obligations

`ProviderSubmissionError.code` and message contain only a fixed safe code: invalid_submission, invalid_submission_config, invalid_submission_clock, submission_not_found, submission_binding_mismatch, submission_ticket_mismatch, submission_ticket_exhausted, submission_fence_expired, submission_billing_hold, submission_input_revoked, provider_spend_unauthorized, provider_authorization_mismatch, provider_spend_exhausted, submission_cas_failed, utc_rollover_retry, submission_not_authorized, invalid_prediction, prediction_identity_conflict, invalid_prediction_status. Any unexpected SQL/connection error is an uncertain failure, never send authority; runtime adapters must map it to an opaque safe code and must not log DB diagnostics/rows.

I2 must check token/config/prepared contract before authorize, invoke HTTP at most once after a true committed result, and immediately recheck abort/deadline/revocation before send. A restarted sender cannot prove that a durable submitting row was unsent and must treat it as ambiguous. Never replay after a provider error. I4 must intercept hosted submissions before generic retry, resume known identity with the same attempt/ticket/original deadline, and perform terminal/release/cleanup/deletion transitions under canonical locks. Completion must independently check current job fence, original submission deadlines/input/prediction/version/request and succeeded provider status, and deny any `identity_conflict_at` quarantine. Cleanup markers/known IDs provide no completion authority.

Cleanup storage is prepared for I4: cleanup_state none/needed/claimed/done/unresolved, monotonic cleanup_fence, cleanup_lease_until, cancel_requested_at/cancel_confirmed_at. No cleanup executor or claim loop is implemented in I1. Known work may be reconciled without the original job fence; no job revival is permitted. Actual billed amount stays nullable and is not derived from reservation.

I5 must add discriminated hosted generation evidence/mode constraints and validators. Existing fixture/controlnet mode checks, nonnullable local evidence fields, and evidence/quality immutability triggers are retained by 007. No fabricated local revision, hardware or warm field is introduced to admit hosted evidence.

## Checks and remaining gates

Actual limited checks under host Node20.20.2: syntax for module/migration wiring/both new tests exit0; provider-submissions unit tests 2 passed exit0; unchanged jobs units 5 passed exit0; unchanged generation units 13 passed exit0; git diff --check exit0. The first unit invocation used repository cwd and failed MODULE_NOT_FOUND (exit1); corrected project-cwd invocation passed. These are host checks, not Node22 runtime acceptance. Exact result data is in `replicate-i1-checks.json` under this run's telemetry.

Real PostgreSQL tests are written, not executed here. They require Node22, assert PG16, enforce N8_TEST_DB_OWNERSHIP=n8-f07-replicate, restrict DB to local/internal hosts, create/drop a random isolated schema, and migrate representative prior fixture/controlnet evidence. Lock-barrier races poll actual `pg_stat_activity` for both blocked contenders. Literal counts cover CAS/spend races, zero/exhausted/invalid authorization, account-hold and deadline wait barriers, late IDs, identity conflicts, direct immutability/regression, midnight exhaustion/rollback, and local preflight retry. No SQL mock or transport count is claimed.

Coordinator pending commands from PROJECT_ROOT inside the approved Node22/PG16 environment (use isolated disposable credentials without printing them):

```sh
node tests/provider-submissions.test.js
N8_TEST_DB_OWNERSHIP=n8-f07-replicate node tests/replicate.integration.test.js
```

The second command also requires an injected `TEST_DATABASE_URL` for the dedicated PG16 database. Both exits remain pending. Full existing Node22/PG regression, migration/restore rollback compatibility in disposable DB, actual runtime reclaim/HTTP crash tests, the accepted transport send-CAS mutation, I5 provenance checks, fresh Astra review, and actual browser E2E belong to coordinator/later slices. No whole AC or F07 completion is claimed; FR2/FR3/FR6 and AC2/3/4/6/9 database portions are implemented and awaiting real PG verification. Paid activation remains unauthorized (0USD).

## Frozen handoff

`docs/telemetry/n8-20261002-1740/replicate-i1-snapshot.json` binds changed product/tests, accepted plan/spec digests, source revision and launch digest. `replicate-i1-receipt.md` records the terminal unit verdict and measured elapsed time. Coordinator owns runtime execution, independent review and integration; no background executor is claimed by this unit.
