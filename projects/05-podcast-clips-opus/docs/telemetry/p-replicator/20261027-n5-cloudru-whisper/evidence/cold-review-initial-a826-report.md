# Independent cold source review — N5 Yandex STT
Reviewer family: codex
Spec revision: sha256:e1afae2ceaddef35d421700ad75b7e256f407e40bebeea0782b997d10690c16e

Verdict: **CHANGES REQUESTED** — two MEDIUM findings, no CRITICAL/HIGH finding established. AC-2 and AC-8 need the bounded corrections below. This is a completed independent source review, not runtime acceptance or a deployment decision.

Source revision: `a826387db43d50f1703a8233f94714a6853dc1a8`.
Baseline: `3c51e71e9cffd2f636864fb6513058907984c1c4`.
Project-relative paths below are rooted at `projects/05-podcast-clips-opus/` in `/tmp/n5-yandex-stt-code-20261027`.

## Material findings

### F1 — MEDIUM: successful remote completion can accept an incomplete upload

**Location:** `apps/worker/src/stt/yandex.ts:113–129`; missing adversarial case beside `tests/yandex-stt.test.ts:141–144`.

The success state tracks only readable `end` and gRPC `status.OK`. Neither branch checks that every input audio byte has been written and input half-closed. If `write()` returns false and no `drain` arrives, the upload is suspended, but valid finals followed by `end` and `OK` still invoke `finish()` and resolve successfully. The adapter then closes its client, potentially accepting words for only the prefix of an MP3. This contradicts the required sequence of actual byte upload → input half-close → successful complete recognition, and the bounded stalled-upload behavior of FR/AC-2 and FR/AC-8.

**Minimal reproducer, derived directly from the allowed test harness:** make the first session-options `write` return false; call `started(h)`; do not emit `drain`; invoke `h.success()`. Current source resolves with the golden ten words while `h.call.writes` contains only session options and `h.call.end` has never run. A less extreme variant permits an initial audio prefix and then blocks its next write. This is a source-derived reproducer, not a claimed executed test result.

**Required fix:** track complete input submission/half-close and require it together with readable end and successful status. A peer that completes before the upload is complete must not produce a successful transcript. Add the early-success-during-backpressure case; retain one cleanup/cancel, the 120-second bound and rejection of late events. The existing backpressure test always emits `drain` before success, so it cannot catch this case.

### F2 — MEDIUM: the independent wire guard does not cover outgoing audio or exact cursor identity

**Location:** `tests/yandex-stt.test.ts:40–54,135–144`; `tests/fixtures/yandex-official-golden.json:51`; relevant production fields in `apps/worker/src/stt/yandex-protocol.ts:9–10,24,31`.

The independent full-schema golden is genuine as a pinned input: its checked-in SHA256 is the required `8d7a2f539e0eff0fc881b516f25deb78cc9ea971aa84313094b21c99f1005314`. The test compares only the session-options request serialization to independent bytes. Audio uploads are asserted as JavaScript objects against an injected stream; no test serializes an audio chunk against independent official bytes. Consequently, changing the outgoing `StreamingRequest.chunk` field number or `AudioChunk.data` field number is outside the binary interoperability guard even though the mock receives the same correct-looking object. The present production field numbers are correct; this is a required verification gap, not a claim that current audio encoding is broken.

The response check similarly validates aggregate words and timing but does not assert the official decoded final indices are exactly `['0', '1']`. In this particular golden, changing the projection from final_index field 5 to field 6 would instead read cursor values `0` and `1175`, which preserve ordering and the current ten-word assertions. The collector tests derive their finals from that same projection, so their sorting assertions do not independently establish the required cursor identity. This is a source-level mutation hypothesis, not an executed mutant result.

**Required fix:** add a small outgoing audio request frame encoded independently using the already pinned complete official schema, and compare production serialization to it. Preserve the original pinned golden and its provenance. Assert the decoded official final indices and top-level channel values before collecting finals. Demonstrate red/restored-green for those outgoing field-number and cursor mutations using the existing bounded mutation process. This closes the specific AC-2/Refinement interoperability requirement without a new framework or broad test expansion.

## Spec conformance

`met` below means the inspected implementation and test source implement the criterion, with no source defect identified here. It does not mean that tests were executed or that native gates passed. Root retains executable acceptance ownership.

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| AC-cloudru-provider-foundation-1 | met | `packages/shared/src/config.ts` has separate closed selectors, absent defaults, exact Cloud STT refusal, selected-key-only live validation and test-only fake. `runtime.ts`, actual STT entrypoint, Compose and `tests/cloudru-provider.test.ts` carry the Yandex key only into worker-stt and preserve FM isolation. |
| AC-cloudru-provider-foundation-2 | not met | F1 permits success before complete input submission; F2 leaves audio binary field numbers and exact official final-index identity outside the independent guard. Otherwise fixed TLS/method/options, checked safe signed int64 /1000, first alternative, top-level single-channel identity, dedupe/conflict/order, silence aggregate behavior and usable actual words/segments match the plan. |
| AC-cloudru-provider-foundation-3 | met | Unchanged `apps/worker/src/llm/provider.ts` sends one fixed Cloud JSON-object request with schema prompt and no OR extensions; `workers/select.ts` and DB acceptance retain `validateFragments`. `tests/cloudru-provider.test.ts` checks both body and local validation. |
| AC-cloudru-provider-foundation-4 | met | Unchanged selector rejects malformed/refused/truncated envelopes and malformed JSON; existing strict local fragment validation remains before persistence; combined abort includes the 240000-ms timeout through body reading. Existing negative tests inspect rejection/filtering and no extra requests. |
| AC-cloudru-provider-foundation-5 | met | Unchanged `packages/db/src/selection.ts` uses conditional exclusive claim/quota transaction and actual identity; `workers/select.ts` awaits existing fsynced spend before request. `tests/selection.integration.test.ts` contains real DB concurrent handlers, refusal, timeout and fake-identity cases. No execution pass inferred. |
| AC-cloudru-provider-foundation-6 | met | S3 runtime is unchanged; existing `tests/s3-public-endpoint.test.ts` independently recomputes signatures for Cloud compound credentials, GET/multipart PUT, both path styles, host/region, 900-second expiry and filename disposition with rejecting injected transport. No live compatibility claim. |
| AC-cloudru-provider-foundation-7 | met | `packages/db/src/transcription.ts` binds provider/model inside the existing ordinal UPDATE and transaction/savepoint, preserving lock/fence/quota/finalization; runtime passes actual identity, worker awaits fsynced attempt before RPC, outcomes copy identity. Concurrent three-provider attribution test is substantive source, supplemented by existing retry/refusal/stale/credit tests. `TranscriptError` and nonretryable transport errors cannot advance the worker retry ordinal. |
| AC-cloudru-provider-foundation-8 | not met | F1 leaves incomplete-upload early success possible. Other inspected source retains exact decimal 10MB/300s guards on stat/read, unchanged common 25MB and 180-second/2-second chunking, request timer and caller abort, closed transient statuses, disabled client retries, end+OK gating, cancellation and late-event protection. `tests/yandex-pipeline.test.ts` exercises real offline extraction/chunk/merge/select/FFmpeg with injected timed finals and explicit synthetic-only scope; no executed result inferred. |
| AC-cloudru-provider-foundation-9 | unverifiable | Frozen planner explicitly classifies short synthetic protocol proof separately from overall partial migration and pending natural speech, representative long chunk, overlap journey, target/browser/storage and economics. Review assignment excludes live receipts, current completion and parallel economics documents; those reporting/qualification facts remain root-owned. No extra paid calls or deployment occurred. |

## Scope, security and evidence limits

This cold review received the specification and validation report, read frozen planner roles 01–04, reviewed the complete source/test/config/manifest diff excluding completion, and inspected the actual unchanged worker/parser/DB-credit/selection/S3 context needed for AC-1–8. HEAD and spec digest were verified at the beginning and near the end; the worktree remained clean. No accumulated coder conversation, coder receipts, completion document, root telemetry, test execution log, private environment, key, user media or another worktree was read. No git mutation, dependency install, network/provider call, container startup or application-code change occurred.

The official fixture is independent of the project projection and byte-identical to the planner-pinned golden. Its declared provenance is full-schema re-encoding of an own synthetic response, not raw network capture. I did not independently fetch the upstream schema or regenerate the fixture. The embedded readable descriptor compiles with the worker source, with no extra proto asset path; exact pinned grpc-js 1.14.6/proto-loader 0.8.1 are production dependencies included by the existing prod-deps Docker stage. This establishes source packaging consistency; built-runtime smoke and actual production dependency contents remain executable gate work, not a pass asserted by this review.

No secret exposure, alternate endpoint, disabled TLS validation, SQL injection, hidden provider fallback, customer-credit debit change, source/fence regression or broad timing refusal was identified. Safe signed finite/reversed timings still pass to the unchanged shared clamp diagnostics. Fully well-formed empty finals contribute no invented words/context, while aggregate usable words and actual phrase context remain required. No UI change is needed.

The two findings were sent promptly to root before finalization. They are bounded corrections; no additional broad research or optional polish is requested. Fresh focused checks, full no-skip regression, build/typecheck/lint, native gates and required red/restored-green evidence remain the coordinator's responsibility. This review does not turn test names into passed results.

Profile: model-routing-econom. Requested model: gpt-6.1-sol/high. Actual model/effort, token usage and cost: null (host execution metadata unavailable). Review duration and exact artifact hashes are recorded in `/tmp/n5-yandex-stt-cold-review-trace-20261027.md`.
