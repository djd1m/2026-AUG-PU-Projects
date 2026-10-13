# F07 I2 independent code review

Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Verdict: ACCEPT
Source: 7395d7a5cdd977b0c5feebbd5487a18ef70db451
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i2-review
Attempt-ID: replicate-i2-review-1
Profile: compact-quality-first-v2; substantive XL; bounded independent I2 review.
Requested reviewer: gpt-6-astra/high. Actual reviewer model/effort: null pending host metadata.
Author: gpt-6.1-sol/high, supported by supplied host runtime metadata.

Accept the bounded I2 transport and its conjunction with the accepted I1 API. Zero confirmed code defects or blocking test-proof findings. This does not accept whole F07, actual provider behavior, or live activation. The requested different reviewer model must be confirmed by the host; a launch request or reviewer self-report is not actual-model evidence.

## Source binding and review method

HEAD exactly matched the assigned source. Both working files and their pinned-commit blobs match `replicate-i2-snapshot.json`:

- `web/replicate.js`: `be4bd7f92fb6dc354b11326ea6d8d519bbc35285756a6531defb4f91d59b649c`.
- `tests/replicate.test.js`: `f0efc8f4114cc59dd10c14576356c5db96a996f2c65d7aa76fef05e87cbd46cd`.

All five protected I1 file hashes and all eleven recorded contract hashes match. The exact I2 API handback and checks JSON also match their snapshot digests. Snapshot SHA256: `86f1141a34766180241c6914829ad54f0613284aa1ca026af836a3ccde549202`. Review launch SHA256 independently matches the caller-supplied `8d5652173344443c35f57930c74c25fe593bd7ca8c1c96414c4a4c7ab0bd4ed4`.

Read both complete I2 files, the five accepted role documents, relevant I1 implementation/closure and actual authority API, and the transaction commit boundary. Applied the local brutal-honesty-review skill as an evidence-based review, including the model policy's explicit permission for zero findings, plus project-work-companion delivery guidance. No delegation, product edits, network, Docker, paid calls, tests, global configuration, commit/push or run/events edits. Existing green suites were not rerun. E2E preflight: not_applicable, because this is source/evidence review, not E2E execution. Existing mechanical implementation route is S; the substantive XL risk classification remains controlling.

## Bounded I2 contract assessment

Paths below are relative to the project root. PASS means this slice's source contract is satisfied; it is not full acceptance of the corresponding feature AC.

| Contract / relevant AC | Source and failure evidence inspected | Result |
|---|---|---|
| Pinned config, closed request, hashes and immutable handle; AC2 | `web/replicate.js:33` validates exact settings, canonical base64 and byte limits; `:55` validates I1 binding, pinned model/version/contract and both transmitted/request hashes, freezes the copied binding and stores bytes privately. Factory `:131` snapshots token. Tests `:94`, `:108`, `:134`, `:346`, `:354` check literal limits/pins, mutations and cloned-handle rejection. | PASS |
| Committed I1 authority is the only send authority; AC2/3/9 | `web/replicate.js:220` requires literal authorized true, exact code and matching submitting row before POST. `web/provider-submissions.js:184` performs the single CAS; `web/db.js:13` awaits COMMIT before returning. Tests `:154`, `:167`, `:176`, `:200` exercise denial, uncertain commit, durable prior submitting and incorrect binding with zero additional POSTs. | PASS |
| Final authorization, abort/deadline and mutation boundary; AC3/6 | Claim is copied at `web/replicate.js:215`; the required callback is awaited at `:227`, then immutable fields and remaining budget are rechecked before the sole HTTP call. HTTP checks again before `req.end`. Tests `:216` exercise revocation, abort, invalid time and binding mutation; the literal 5-second Cancel-After boundary has positive and negative checks. | PASS |
| No POST replay on any failure; AC3/9 | Create has one invocation and no retry loop. Exceptions after invocation conservatively mark ambiguity and deny replay through I1; mark failure cannot grant authority. Tests `:167`, `:180`, `:248`, `:378` count actual injected requests across fresh transport instances, malformed/status/network errors and lost ID commit acknowledgements. | PASS |
| Valid late ID is cleanup-only; AC4/6 | `web/replicate.js:238` binds before observation, checks the I1 binding receipt and demotes expired/aborted results to cleanup. I1 identity binding does not require a live completion lease. Tests `:234`, `:248` distinguish late identity, uncommitted identity and committed identity with lost acknowledgement. | PASS |
| Quarantine and monotonic identity/status; AC4/5 | Create denies a quarantined row and propagates binding conflict; GET/cancel deny a quarantined supplied row. Identity/version are validated on response and again by I1 observation. Stored terminal/processing status wins over regressions. Tests `:200`, `:248`, `:336` check conflict/no observation and competing terminal observations. Current DB quarantine must still be checked by I4 at completion, as the accepted I1 handback requires. | PASS |
| Fixed HTTPS origin, TLS, paths and headers; AC2/10 | `web/replicate.js:148` supplies fixed hostname/SNI/443, certificate verification, TLS minimum1.2 and agent:false. Only validated IDs form GET/cancel paths; provider-supplied URLs are ignored. No proxy, redirect, SDK retry or Prefer:wait mechanism exists. Tests `:134`, `:180`, `:275`, `:365` inspect actual options and reject redirect/ID attacks. | PASS |
| Bounded response and exact protocol; AC3/7/10 | `web/replicate.js:100` validates ID/model/version/status and exactly two bounded HTTPS output slots for success. HTTP rejects compressed/non-JSON responses, invalid UTF8, declared/streamed bodies above524288 bytes and length mismatch. Tests `:180`, `:275`, `:354`, `:384` include literal inclusive/exclusive limits. Delivery-host/DNS/image validation remains I3. | PASS |
| Original deadline, GET polling/backoff and max three faults; AC5 | Opaque budget `web/replicate.js:69` caps monotonic elapsed time by trusted remaining time without replenishment. HTTP and waits have independent total timers. `:269` retries only GET transient/rate-limit failures, stops at the third consecutive fault and resets on success. Tests `:293`, `:330`, `:389`, `:408` check exact counts/waits, abort, original time and stalled collaborators. | PASS |
| Safe error/serialization and private output; AC10 | Closed ReplicateError codes strip ordinary transport/authority diagnostics; only safe identifiers/status are enumerable. Request bytes and output URLs stay in WeakMaps. Tests `:266`, `:378`, `:384` check serialization and safe errors; arbitrary provider logs/metrics are not promoted into evidence. | PASS |
| Output eligibility after observation crosses deadline; AC4/5/6 | `web/replicate.js:197` rechecks time/abort after awaiting I1 observation, suppressing WeakMap output on late create. GET checks once more before return at `:266`. Tests `:400` cover time crossing inside observation for both create and GET. An accessor is not continuing deadline or media authority: I3 must use the same remaining-budget accessor and I4 must fence final completion. | PASS |
| Cancellation grants no completion or refund; AC5/6/9 | `web/replicate.js:284` sends one bounded cancellation request and forces cleanup-only observation even when success wins the race. All observations carry completion_authorized:false. There is no job/ledger/spend release operation in I2. Tests `:336`, `:371` check terminal races, missing output eligibility, unchanged reservation and no create replay. | PASS |

## Findings and test quality

Confirmed findings: **0** (critical0, high0, medium0, low0). No reproducer or corrective edit is requested. The source supports the verdict independently of syntax checks.

The test suite contains meaningful negative-effect oracles: zero POST before authorization, exactly one POST after lost response across another transport instance, no ID binding on invalid responses, persistent known identity after lost acknowledgement, literal request/response/timing limits, three-fault termination, and no output on late/cancel observations. The fake authority intentionally models the accepted I1 API; it does not independently prove PostgreSQL serialization. Accepted I1 PG evidence and its R01 closure supply that separate layer. The required production send-CAS mutation remains I6, not a claimed I2 result.

## Runtime evidence, limitations and later gates

Supplied source-bound Node22 v22.20.0 evidence records module/test syntax exit0, new transport suite exit0 with149/149 TAP tests (25 top-level plus124 nested; zero failed/cancelled/skipped/todo), and unchanged I1 unit suite exit0 with2/2. Inspected final TAP summaries and checks metadata; no reviewer runtime rerun is claimed. Earlier134-test failures and later147/148-test passes remain preserved. Final wrapper timing gaps and unavailable first inner exit are disclosed in the existing checks artifact.

Original implementation process history is not a code rejection: the supplied1491.287-second exit0 process stayed within1500 seconds; receipt delivery missed the1400-second soft milestone by24.683 seconds. The separate delivery unit completed in89.019 seconds with unchanged product bytes. Historical records remain unchanged and neither timing fact establishes correctness.

This review does not exercise real HTTPS/TLS/proxy behavior, PostgreSQL anew, provider availability/output ordering, billing, or real images. I3 owns JPEG sanitization and secure delivery/import; I4 owns trustworthy DB remaining time, final authorization callback, worker fences/reclaim/terminalization/release and cleanup; I5 owns quality; I6 owns the mandatory send-CAS mutation and browser preparation; I7 owns full regression/document reconciliation; I8 owns actual browser execution. These are explicit later gates, not missing I2 wiring defects. The interfaces can support those obligations; they must not be exposed as browser authority. No full AC/F07/MVP or real-provider acceptance is claimed. Authorized external spend remains0 and live activation remains disabled.

Review usage, actual reviewer model/effort and cost remain null until host confirmation; no savings claim. Measured delivery elapsed and launch/source identity are in `docs/telemetry/n8-20261002-1740/replicate-i2-review-receipt.md`. Parent coordinator owns host-model confirmation and the next bounded slice; no background work is asserted by this reviewer.

Status: completed
