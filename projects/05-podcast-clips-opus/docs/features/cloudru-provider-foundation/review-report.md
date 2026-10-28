# Independent corrected delta source review — N5 Yandex STT
Reviewer family: codex
Spec revision: sha256:e1afae2ceaddef35d421700ad75b7e256f407e40bebeea0782b997d10690c16e

Verdict: **PASS for the bounded source corrections**. F1 and F2 from the independent a826387 review are resolved in the inspected source at `c25a290ffc6722175c890fe7958fc5ab8ce9df8c`. No remaining material source finding was established. This verdict does not assert executed tests, native gate completion, deployment readiness or completed migration.

Baseline: `a826387db43d50f1703a8233f94714a6853dc1a8`.
Launch SHA256: `25a0bd203dc9b069774dea5a02166f2fe5eec7d8862282ab69006ec1eeed2686`.
The original CHANGES REQUESTED report and trace remain untouched. Paths below are relative to `projects/05-podcast-clips-opus/` in the frozen code worktree.

## Findings disposition

**F1 — MEDIUM, resolved in source.** `apps/worker/src/stt/yandex.ts` now sets `inputComplete` only on the duplex stream's Writable `finish` event. The common success path refuses completion with a nonretryable sanitized ProviderError unless that event has occurred. It still requires readable end and successful gRPC status, preserves the 120000-ms timer/caller abort, and uses the existing settled/cancelled guards for one cleanup and no late acceptance.

This matches actual installed grpc-js 1.14.6 semantics, not merely the revised EventEmitter mock: `node_modules/@grpc/grpc-js/build/src/call.js:134–148` supplies each `_write` callback to `sendMessageWithContext`, and `_final` invokes underlying `halfClose()` before its callback. Writable `finish` therefore follows completion of queued write callbacks and submission of half-close. The underlying subchannel `halfClose()` ends the HTTP/2 stream. `client.js` delivers readable EOF/status separately, so a remote OK does not manufacture the Writable finish event.

The new parameterized adversarial test covers all three missing-input-completion states: backpressure on session options, backpressure on an audio write, and `end()` invoked without a Writable finish event. Each delivers valid finals plus remote end/OK, requires nonretryable rejection, then emits late drain/finals/status and checks no further writes/end plus exactly one cancel/close. The unchanged ordinary backpressure test still drains and half-closes before success. `tests/yandex-pipeline.test.ts` adapts its injected stream to emit Writable finish on its local end; its audio generation, extraction, boundaries, word offsets, merge, selection and rendering assertions are unchanged. These are source assessments; no test pass is claimed.

**F2 — MEDIUM, resolved in source.** The protocol test now compares production serialization of an audio chunk containing bytes `00 7f ff` to the independent official-schema fixture frame `12 05 0a 03 00 7f ff`. Independently interpreting those short bytes yields outer field 2 with a five-byte submessage, then inner field 1 with three data bytes. This covers precisely the previously unguarded StreamingRequest.chunk/AudioChunk.data wire numbers. The test also asserts decoded official final indices are exactly `['0', '1']`, closing the cursor-field substitution gap before collector/deduplication tests run.

The original pinned golden file at a826387 hashes to `8d7a2f539e0eff0fc881b516f25deb78cc9ea971aa84313094b21c99f1005314`. Parsing old and corrected JSON and removing only the newly added `audio_chunk_golden` field yields structurally equal original payloads, including original request bytes, response frames, source manifest and creation/provenance fields. The corrected fixture SHA256 is `e8dcf2b5edf207afcc011191d29f386e8844363417cf051f5b3ae32b8fc66a68`. The new frame explicitly records complete pinned official-schema encoding rather than project-projection encoding. No upstream schema fetch or independent regeneration was performed here; executable red/restored-green mutations remain coordinator-owned.

## Spec conformance

The rows for unchanged AC are carried forward from the completed independent source inspection of a826387. `met` records source conformance, not an executed acceptance result. This delta introduces no new implementation assertion for unchanged source.

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| AC-cloudru-provider-foundation-1 | met | Carried forward: separate closed config allowlists/defaults, selected-key validation, exact Cloud STT refusal and test-only fake; actual entrypoint/Compose worker-secret isolation source unchanged in c25a290. |
| AC-cloudru-provider-foundation-2 | met | F1 now requires Writable finish plus end/OK; F2 adds independent outgoing audio binary comparison and exact official final indices. Existing fixed TLS/options/method, first alternative, strict safe int64 milliseconds, actual words/phrases, single top-level channel, duplicate/conflict/order, aggregate silence and malformed-format handling are unchanged. |
| AC-cloudru-provider-foundation-3 | met | Carried forward: unchanged fixed one-request Cloud chat JSON-object/schema-prompt path, unchanged OpenRouter strict body and local validateFragments before persistence. |
| AC-cloudru-provider-foundation-4 | met | Carried forward: unchanged malformed/refused/truncated response rejection, strict local filtering/shape checks, no repair/fallback and body-inclusive 240000-ms timeout source. |
| AC-cloudru-provider-foundation-5 | met | Carried forward: unchanged exclusive DB selection claim/quota transaction, actual provider/model identity and fsynced pre-request spend ordering; existing concurrent/refusal/timeout/fake test source unchanged. |
| AC-cloudru-provider-foundation-6 | met | Carried forward: S3 runtime and independent offline signing source unchanged, including compound credentials, both path styles, GET/multipart PUT, host/region, 900 seconds and filename disposition. No live compatibility assertion. |
| AC-cloudru-provider-foundation-7 | met | Carried forward: actual STT provider/model remains bound to the atomic ordinal UPDATE; lock/savepoint/quota/fence/customer-credit behavior and fsync-before-RPC remain unchanged. New premature-success failure is explicitly nonretryable and cannot advance the worker retry ordinal. |
| AC-cloudru-provider-foundation-8 | met | F1 closes early success during blocked upload or incomplete half-close. Existing exact 10MB/300s stat/read guards, common 25MB and 180-second/2-second chunking, deadline/abort, closed transient retry set, disabled grpc retries and late-event protection remain. Offline pipeline fixture changes only its mock Writable finish event; no natural-speech or live long-file pass follows. |
| AC-cloudru-provider-foundation-9 | unverifiable | Frozen planner still marks the short synthetic protocol proof separately from overall partial live qualification. Natural speech, full representative chunk, overlap journey, target/browser/storage, economics and current readiness receipts are root-owned and excluded from this source review; the added completion-text test does not independently establish them. |

## Boundaries and verification

Reviewed only the four authorized corrective source/fixture files against the prior reviewed revision, plus the installed grpc-js implementation needed to establish actual Writable finish semantics. Confirmed new HEAD, clean worktree, unchanged specification digest, and old golden-payload preservation. The fifth changed completion document was excluded; no completion contents, coder conversation/trace/receipts, root telemetry, test logs, private configuration/keys or other worktree was read. No application-code edit, git mutation, dependency install, container/database/network/provider operation or paid call occurred.

No tests were executed. The new test file includes a completion-text test; its source body was visible in the authorized diff, but the excluded completion document was neither opened nor indirectly read through test execution. Root owns focused/full no-skip tests, mutation proofs, build/typecheck/lint, native completion contracts, built-provider smoke and any authorized integration/publication. Those checks must bind their own results to the corrected source; this review does not substitute for their receipts.

The bounded corrections add no endpoint, credential, configuration, database, customer-charge, shared-parser or UI behavior. Source review is complete with no additional polishing request. Overall live migration remains partial under AC-9.

Profile: model-routing-econom. Requested reviewer: gpt-6.1-sol/high. Actual model/effort, tokens and cost: null because host execution metadata is unavailable. Duration and report/launch hashes are in `/tmp/n5-yandex-stt-delta-review-trace-20261027.md`.
