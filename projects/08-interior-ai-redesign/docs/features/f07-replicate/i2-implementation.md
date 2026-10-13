# F07 I2 — asynchronous Replicate transport handback

Run-ID: n8-20261002-1740. Work-Unit-ID: n8-replicate-i2. Attempt-ID: replicate-i2-1.
Source: ef6758b0b42f61ed5e2e54c7cf1d82c5e7e72461.
Profile: compact-quality-first-v2; substantive XL; accepted plan and scoped owner instruction retained. Requested gpt-6.1-sol/high; actual model/effort, usage and cost null pending host confirmation. Sole bounded coder; no delegation/configuration changes/commit/push/run-events edits.

Verdict: I2 implementation and injected Node22 checks complete, ready for independent review. This is neither fresh review acceptance nor whole-feature readiness. I1 remains unchanged. No network, host listener, provider credential, paid request, Docker, build, PG execution or dependency installation occurred.

## Exact API for I3/I4

All exports in `web/replicate.js` are **internal server APIs**. Never expose these handles, methods or output accessor through browser routes. The factory has no environment reads and no enabled defaults:

```js
import {
  REPLICATE_MODEL, REPLICATE_VERSION, REPLICATE_CONTRACT_SHA,
  hashReplicateRequest, prepareReplicateRequest, createReplicateBudget, remainingReplicateBudget,
  createReplicateTransport, getSucceededOutput, ReplicateError,
} from './replicate.js';

const transport = createReplicateTransport({
  model: REPLICATE_MODEL, version: REPLICATE_VERSION,
  contractSha: REPLICATE_CONTRACT_SHA, token: serverRuntimeToken,
});
```

Config has **exactly** these four keys. Model is `jagilley/controlnet-depth2img`; version is `922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60`. Contract SHA is `3d94bb6e59e6a90e24a0504abb4c06c055f7619372e2c36313f42de5d86e99bc`, computed as SHA256 over sorted-key canonical UTF8 JSON `{model,version,input,output}` using the accepted `replicate-plan-1-evidence/official-model-schema.json` Input/Output schemas. This digest excludes page timestamp/price/license link. I4 must select this code-owned contract explicitly and match it to the authorized envelope; a nonzero environment value or presence of a token does not authorize spending.

I3 produces sanitized JPEG bytes and transform, then builds this exact candidate. I4 selects fixed server style prompts and persisted seed; the transport accepts server strings, not user prompt overrides:

```js
const candidate = {version: REPLICATE_VERSION, input: {
  image: preparedJpegDataUri, prompt: serverStylePrompt,
  a_prompt: serverAddedPrompt, n_prompt: serverNegativePrompt,
  num_samples: '1', image_resolution: '512', detect_resolution: 512,
  ddim_steps: 30, scale: 7.5, eta: 0, seed: persistedSeed,
}};
const binding = {...i1PreparedBinding,
  model: REPLICATE_MODEL, version: REPLICATE_VERSION,
  contract_sha: REPLICATE_CONTRACT_SHA,
  transmitted_input_sha: sha256OfPreparedJpeg,
  request_sha: hashReplicateRequest(candidate),
};
const prepared = prepareReplicateRequest(candidate, binding);
```

`binding` has exactly the I1 fields from `i1-implementation.md`: model/version/spend_budget_id, request/contract/source/transmitted/authorization/privacy/license/safety/billing SHA256 values and closed numeric transform. All SHA values must be lowercase64hex. JPEG data URI must be canonical base64, decoded bytes 1..262144. No raw URL/PNG data URI is accepted. Prompts each have 1..2048 UTF8 bytes and nonblank content. Seed is integer0..2147483647. Settings and field sets are closed; serialized sorted-key `{version,input}` JSON is ≤393216 bytes. `hashReplicateRequest` uses the same canonical bytes as POST. Source-photo decoding, JPEG magic/sanitization, deterministic512 letterbox and original hash remain I3 responsibilities, confirmed again by I1 input binding. The transport does not claim to decode an image.

`prepareReplicateRequest` snapshots private request bytes and a deeply frozen validated binding in a module WeakMap. Its returned frozen opaque handle contains only request/version/contract digests. Mutating the candidate/binding afterward cannot change the request. Cloning/serializing a handle does not retain authority or bytes. Do not persist the request/data URI. Recovered known submissions use GET and their durable DB row.

```js
const budget = createReplicateBudget(originalAttemptDeadline, trustedDbRemainingMs, {
  // Optional synchronous current DB-derived remaining snapshot; never an async query here.
  trustedRemaining: () => currentTrustedRemainingMs,
});
const observation = await transport.create({
  authority, claim, prepared, budget, signal,
  finalAuthorize: async ({submission_id, job_id, request_sha, version, attempt_deadline}) => {
    // I4: query current authorization/fence/lease/deletion/revocation under proper locks.
    // Return literal true only after that transaction completes and locks are released.
    return currentAuthorizationIsValid;
  },
});
```

`claim` snapshots the I1 `{job_id,account_id,fence,attempt,attempt_deadline}` fields. Budget is opaque and labels the immutable original deadline; initial remaining must be >0 and ≤180000ms, computed from trusted DB time with attempt/job deadline caps. It decreases by monotonic time and any lower trusted snapshot, cannot increase or run backwards, and survives the whole polling lifecycle. Recovery creates a budget from **remaining original time**, never a fresh180s allowance. I3 uses `remainingReplicateBudget(budget, signal)` to read this same cap for import; the accessor cannot renew it. The transport cannot independently query DB time; I4 owns the trusted initial/updated values and current lease. Injected `now()` for deterministic clocks is an explicit collaborator on `createReplicateBudget`; it cannot alter origin, TLS, response/request limits, timeout maximum or retry rules.

The final callback is mandatory and must check the applicable live claim/lease/deadline, input deletion and operator authorization revocation. Preserve canonical hold semantics: hold before authorization denies creation; an already authorized active attempt may finish privately. Abort/deadline and immutable submission binding are rechecked after the callback with no asynchronous gap before HTTP invocation. DB/HTTP cannot atomically exclude a deletion immediately afterward; I4 must reconcile/cancel and deny output.

Create first checks config/prepared/budget/callback, then awaits I1 `authority.authorize(claim,binding)`. Only literal `authorized:true`, `code:'submission_authorized'` and a matching committed `state:'submitting'` row allow invocation. It checks all immutable prepared fields, original attempt/deadline/fence/job/ticket, pinned provider, absent prediction and absent quarantine. Duplicate/throw/uncertain commit never sends. The single POST has `Cancel-After: floor(remaining_seconds - 15)s`, refuses values<5, and never uses Prefer:wait or remote idempotency assumptions. TLS certificate verification is explicit, TLS≥1.2, port443, fixed hostname/SNI and no shared agent/proxy/redirect/retry mechanism. Every HTTP call has total/inactivity timeout≤min(5000ms,remaining).

After invocation, any HTTP/429/4xx/5xx/reset/timeout/malformed/oversized/invalid-identity/status/output/ID-commit failure yields safe ambiguity with conservative reservations and no resend. Best-effort `markAmbiguous` cannot overwrite known/terminal I1 state. Valid ID binding uses I1 `bindPrediction` before `observe`; even expired/aborted late responses can establish cleanup identity. Identity conflicts retain I1 quarantine and throw `prediction_identity_conflict`, without overwrite/observation/output. This module never terminalizes/releases/completes a job or refunds spend/tickets. Known-unsent final denial is conservatively marked ambiguous because I1 has no proven-unsent terminal API; I4 may distinguish the original sender's proof, while another caller must never infer unsent from durable submitting.

## Observations, polling and cancellation

```js
const observation = await transport.get({authority, submission, budget, signal});
const terminalObservation = await transport.poll({authority, submission, budget, signal});
const cancelObservation = await transport.cancel({authority, submission, budget, signal});
const privateOutput = getSucceededOutput(terminalObservation);
// privateOutput is null or {depthUri, generatedUri}; I3 validates delivery hosts/bytes.
```

`submission` is the exact durable I1 row with provider/model/version/contract/request/id/job/original deadline/prediction identity; GET/cancel reject quarantined or invalid identity before a request. Prediction ID is exactly1..128 ASCII alnum/underscore/hyphen, including rejection of trailing newlines. GET/cancel build their own fixed `/v1/predictions/{id}` and `/v1/predictions/{id}/cancel` paths and ignore all response URLs. No DELETE, list matching, webhook or identity guessing is implemented.

Responses are streamed≤524288 bytes, including absent Content-Length; over-limit declarations fail immediately. Exact Content-Length is checked, gzip/other encodings and non-JSON MIME are denied, invalid UTF8/malformed JSON fail closed. Response model/version/ID/status are exact. Accepted statuses are starting/processing/succeeded/failed/canceled/aborted. `succeeded` requires exactly two bounded HTTPS URI slots: depth0/generated1. HTTPS shape is preliminary; delivery-host/DNS/TLS/redirect/bytes/MIME/image/crop validation remains I3, and deployed order confirmation remains the authorized pilot.

Serializable observations contain only `{submission_id,prediction_id,status,cleanup_required,completion_authorized:false,output_available}`. They exclude echoed input/error/logs/URLs/timing/cost/hardware/warm. I1's stored monotonic status determines the result; a regressing/competing response never supplies output for an older stored success. Only matching persisted succeeded status and live transport budget can retain private output in the WeakMap. Cleanup-only/late/cancel observations never retain output. GET failing its deadline after DB observation throws rather than providing output. The accessor is internal I3 input, **not completion/media/publication authority**. I4 must independently fence import/complete and deny quarantined/stale/deleted work.

`get` performs one request; `poll` owns only bounded prediction observation, not a worker/general scheduler. Ordinary nonterminal interval is2000ms. Transient reset/timeout/5xx retries wait2000/4000ms; the **third consecutive fault terminates immediately**, preserving the accepted maximum3 consecutive failures rather than issuing a fourth GET for the nominal5000ms third backoff. Backoff cap is5000ms. 429 numeric Retry-After is capped5000ms (fractional seconds accepted); missing/date/malformed headers use5000ms conservatively. A successful observation resets consecutive faults. All waits have abort listeners and a total timer capped by original remaining time, even with a stalled injected sleeper. No POST has retries. I4 handles heartbeat/lease/job deadline failure/release/cancellation and separate maintenance passes; it should use one-shot GET/cancel per claimed cleanup row rather than `poll` in maintenance.

`cancel` is one≤5s request and identity-bound monotonic observation. For cancellation after local deadline, I4 may supply a separate short cleanup budget labeled with the original submission deadline; never reuse that cleanup allowance for active GET/create/import. Cancellation never offers output/completion authority or proves billing stop, erasure, refund or credit/spend release. Cleanup claims/leases/cancel_requested_at/cancel_confirmed_at updates and provider-retention policy remain I4.

`ReplicateError.code`/message have a closed allowlist: config_denied, provider_request_denied, provider_protocol, provider_output_denied, provider_create_ambiguous, provider_authorization_denied, provider_authority_unavailable, provider_deadline, provider_aborted, provider_unavailable, provider_rate_limited, submission_no_replay, prediction_identity_conflict. No cause/raw diagnostic is retained. `provider_rate_limited` may additionally carry safe numeric retryAfterMs. Unknown authority/transport errors map to safe codes, never raw SQL/provider errors.

## Checks and remaining integration constraints

Node binary `/tmp/n8-node22` reports v22.20.0. Final module/test syntax exits0. New suite exits0 with149 TAP tests,149 passed,0 failed/cancelled/skipped/todo (25 top-level tests plus124 nested subtests, not149 independent scenarios). Unchanged `tests/provider-submissions.test.js` exits0,2/2. Tests use injected EventEmitter requests and Readable response streams through actual production boundary code, fake durable authority and clocks. They do **not** constitute new PG16 durable proof; supplied accepted I1 PG16 proof remains separate and was not rerun. Literal byte/timing/id limits and accepted pins have independent assertions.

The first test log retains134 total,123 pass,11 fail; its inner process exit was not separately captured by that original summary shell (outer exit0 is not a test pass). The next measured invocation retains exit1,134 total,133 pass,1 fail. Fixture corrections changed comparisons to the immutable durable row and removed an invalid expectation that a completed HTTP request must be destroyed after later payload rejection. A later147/147 run is retained; an identified observation/deadline race then required the final focused fix and148/148 run. Adding the required I3 remaining-budget accessor then produced the final149/149 run. No pending check is described as passed.

Evidence: `docs/telemetry/n8-20261002-1740/replicate-i2-checks.json`, `replicate-i2-snapshot.json`, final `replicate-i2-tests-delivery.log`, and `replicate-i2-receipt.md`. Snapshot binds both product files and exact accepted contract/API handback digests. Worktree scope, protected source/launch hashes and whitespace checks are recorded there. No optional mutant was run; mandatory send-CAS mutation is I6 and remains pending. Fresh independent review is coordinator-owned. I3 secure media, I4 config/job/recovery/heartbeat/cleanup wiring, I5 output quality/provenance, I6 mutation/UI prep, I7 full regression/docs/review, I8 actual browser, and paid activation all remain out of this accepted I2 scope. No real hosted quality, latency, billing or model availability claim is made.
