# Requirements Testability Analysis
Spec revision: sha256:e1afae2ceaddef35d421700ad75b7e256f407e40bebeea0782b997d10690c16e

Verdict: **READY for bounded v4 implementation of AC-1–8**, with the live-qualification caveats below. **AC-9 overall live acceptance is PARTIAL; full migration is not complete.** No concrete blocker, high, medium or low requirements defect established.

Source revision: `0e37bcb99653bf347950f1f4d04a73c83a9db610`.
Run: `20261027-n5-cloudru-whisper`; work unit: `yandex-validate-v4`.
Launch SHA256: `e78273f630addf292294eaef2e8b319d82a1cb4b78ffcb20a440ede20a1af8ac`.

## Scope and evidence limits

Independent requirements validation of only the current six planner files under `projects/05-podcast-clips-opus/docs/features/cloudru-provider-foundation/`: numbered SPARC roles 01–05 plus `research-whisper-donor-20261027.md`. The six files match immutable git source above; specification matches the expected digest. Applicable instructions and requirements-validator/report/scoring contracts were applied. Previously read root/project/validator instructions were confirmed unchanged. No implementation source needed inspection.

No existing validation/review report, coder context, author conversation, root telemetry, probe execution log, private environment or external receipt was read for this pass. The requested current completion source contains a clearly labeled historical v1 tail; its old test/build/mutation/gate assertions are history and are not a v4 pass. The current planner sources also describe root's short Yandex result; this report evaluates their stated provenance and limits, without independently opening its response/receipt files. No network, dependency install, runtime, inference, git mutation or application edit occurred.

Root owns official native gates. This report supplies a semantic testability verdict and traceability artifact, not a native gate result, executable coverage or implementation acceptance.

## INVEST, SMART and scoring

Five stories / nine acceptance criteria / nine named acceptance scenarios. Each story has explicit user/operator value, a bounded existing seam and pass/fail AC. Existing provider defaults, financial/source invariants and fixed wire/security requirements are legitimate constraints; packaging and bounded implementation remain negotiable. No new public route, schema, credit engine, async job store or service is needed. Dependency/lockfile ownership and permitted files are explicit.

| Story | INVEST /50 | SMART /30 | Quality /20 | Base score | Security adjustment | Status |
|---|---:|---:|---:|---:|---|---|
| US-001: independent provider config and Yandex mapping | 50 | 30 | 20 | 100/100 | +5, capped at 100 | READY |
| US-002: preserved Cloud chat and local validation | 50 | 30 | 20 | 100/100 | +5, capped at 100 | READY |
| US-003: existing actual attribution and offline S3 | 50 | 30 | 20 | 100/100 | +5, capped at 100 | READY |
| US-004: bounded STT authorization and pipeline | 50 | 30 | 20 | 100/100 | +5, capped at 100 | READY |
| US-005: accurate reporting of partial live qualification | 50 | 30 | 20 | 100/100 | +5, capped at 100 | READY as reporting requirement; qualification remains PARTIAL |

INVEST component points per story: Independent 8, Negotiable 8, Valuable 10, Estimable 8, Small 8, Testable 8. SMART points: Specific 6, Measurable 8, Achievable 6, Relevant 5, Time-bound 5. Quality: Traceability 10, Completeness 10. The rubric saturates on this explicit technical contract; 100 measures stated testability, not provider quality, test adequacy, a live pass or implementation perfection. US-005 requires honest classification at readiness reporting, not an unbounded promise to achieve every deferred capability within this code slice.

Timing context is explicit: startup failure before network, authorization/fsync before RPC, successful complete status before acceptance, 120000-ms full RPC/caller deadline, three worker attempts and 30-minute job budget; chat retains 240000 ms and S3 retains 900-second expiry. Size/time limits and boundary tests are numerical. Deferred quality/journey work is explicitly pending and does not acquire an invented SLA.

The blocking floor is satisfied: Testable and Completeness are supported by actual AC quotations below; Traceability is supported by the exact Criterion scenarios table. Security acceptance specifies selected-key isolation, fixed verified TLS destination, no endpoint override/fallback, existing tenant/quota/fence checks and bound SQL. Growth traceability is not applicable to this STT/provider change: no acquisition/adoption requirement is introduced (+0); project-wide growth was not audited.

## Criterion scenarios

| Criterion | Scenario |
|---|---|
| AC-cloudru-provider-foundation-1 | Closed independent provider configuration |
| AC-cloudru-provider-foundation-2 | Word-timed gRPC protocol and strict response mapping |
| AC-cloudru-provider-foundation-3 | Cloud.ru request and valid candidate |
| AC-cloudru-provider-foundation-4 | Invalid response and failure paths |
| AC-cloudru-provider-foundation-5 | Actual attribution and exclusive dispatch |
| AC-cloudru-provider-foundation-6 | Offline S3 configuration safety |
| AC-cloudru-provider-foundation-7 | Exclusive attributed STT dispatch |
| AC-cloudru-provider-foundation-8 | Provider limits, cancellation and pipeline regression |
| AC-cloudru-provider-foundation-9 | Bounded actual protocol proof with honest remaining qualification |

## Actual acceptance criteria supporting the score

Document: `01_specification.md`; each excerpt is from its corresponding `### AC-cloudru-provider-foundation-N` heading.

| Criterion | Actual quotation | Completeness evidence |
|---|---|---|
| AC-1 | “Missing selected key, blank/unknown selector or yandex LLM fails before network.” | Selected keys, exact legacy Cloud STT refusal, absent-selector defaults, production fake rejection and test fake identity. |
| AC-2 | “Byte/field-number compatibility is checked against the independent golden, not just our projection.” | Fixed successful two-final/10-word mapping; partial/refinement noise, exact/conflicting duplicates, missing times, malformed/unsafe int64s and no repair/fallback. |
| AC-3 | “Returned content must pass existing `validateFragments` before persistence.” | Fixed Cloud chat request, schema prompt, valid fixture and OpenRouter control; errors belong to AC-4. |
| AC-4 | “rejected shapes never reach acceptSelection; there is no fallback or extra request.” | Malformed/refused/truncated/extra-field fixtures, candidate filtering and 240000-ms body timeout. |
| AC-5 | “at most one dispatch occurs, quota and durable attempt logging precede it, and DB plus ledger record actual provider/model.” | Real concurrent handlers, quota refusal, timeout counted and fake identity; ledger means existing JSONL. |
| AC-6 | “expire after 900 seconds and retain filename disposition; zero external requests occur.” | Independent GET/multipart PUT signing, both path styles, intended host/region/credentials and unchanged storage regressions. |
| AC-7 | “Format/conflicting-final rejection never advances a retry ordinal.” | Real DB race, identity/fsync-before-RPC, zero refused/stale calls, retry ceiling and idempotent credits across stale/redelivery. |
| AC-8 | “A stalled upload/result/status exceeds neither 120000 ms nor caller deadline, cancels once and cannot accept late events; error status after finals still fails.” | Empty/oversize/overduration zero-RPC checks, exact valid limits, pause/overlap synthetic pipeline and explicit offline-only claim. |
| AC-9 | “mark short Yandex protocol/timed-word receipt proven and overall live acceptance partial.” | Lists natural speech/origin, full chunk, >180-second journey, target/browser/storage and economics as pending; additional paid calls require concrete authority. |

Happy paths, errors and edges are specified across each story and adjacent FR/pseudocode/refinement. No future test filename/title is claimed as existing coverage.

## Generated BDD scenarios

These are validation scenarios, not executed tests.

```gherkin
Scenario: Closed independent provider configuration
  Given separate Cloud.ru LLM and Yandex STT selections with synthetic selected keys
  When each worker loads its role-specific config
  Then each selected live backend requires only its own worker-scoped key
  And unknown or blank selectors, missing selected key and Yandex LLM fail before network
  And Cloud.ru STT retains its exact existing startup refusal in every mode
  And absent selectors retain OpenRouter and fake remains test-only with fake identity

Scenario: Word-timed gRPC protocol and strict response mapping
  Given injected TLS gRPC and the independently full-schema-encoded pinned golden
  When the Yandex adapter sends session options, actual MP3 chunks and input half-close
  Then exactly one fixed general FULL_DATA MP3 ru-RU normalization-disabled RPC is used
  And request bytes match the independent golden and official response bytes decode correctly
  And successful complete status permits exact millisecond-to-second mapping of actual words and phrases
  And zero indices and protocol-defined scalar zeros remain valid
  And partials and refinements add no transcript words and exact duplicate finals add nothing
  And conflicting duplicate payloads, multiple channels, missing timing or malformed int64s fail without repair or fallback
  And existing OpenRouter and fake controls retain their behavior

Scenario: Cloud.ru request and valid candidate
  Given injected fetch and a valid Cloud chat candidate
  When selection runs
  Then one fixed nonstreaming JSON-object request includes the exact fragment schema in the prompt
  And existing validateFragments runs before persistence
  And the existing OpenRouter request remains unchanged

Scenario: Invalid response and failure paths
  Given malformed, refused, truncated, extra-field and out-of-range chat fixtures
  When selection consumes them or its response body stalls
  Then existing shape rejection or semantic filtering applies before acceptance
  And the complete body remains bounded by 240000 milliseconds
  And no repair, alternate provider or extra request occurs

Scenario: Actual attribution and exclusive dispatch
  Given two isolated-DB handlers competing for one fenced selection attempt
  When authorization executes
  Then at most one dispatch follows quota and fsynced attempt logging
  And DB and existing JSONL record the actual provider and model
  And quota refusal sends zero requests while timeout remains counted
  And fake execution records fake

Scenario: Offline S3 configuration safety
  Given synthetic compound credentials and injected SDK transport
  When GET and multipart PUT are signed with both addressing styles
  Then independent signature checks verify intended host, region and credential
  And expiry is 900 seconds with filename disposition preserved
  And existing multipart, render and retention regressions hold without external requests

Scenario: Exclusive attributed STT dispatch
  Given competing handlers for one fenced STT ordinal in the existing isolated DB
  When Yandex, OpenRouter and fake variants request authorization
  Then only one claim can dispatch after actual identity is stored and the attempt is fsynced
  And refused or stale claims open no RPC
  And classified transient failures remain counted within the existing three-call ceiling
  And format or conflicting-final failure cannot advance the retry ordinal
  And retries, refusal, stale results and redelivery preserve idempotent customer finalization

Scenario: Provider limits, cancellation and pipeline regression
  Given actual synthetic audio spanning a pause-aware cut and two-second overlap
  And injected Yandex-shaped finals for the existing extraction, merge, select and render path
  When offline processing runs
  Then the unchanged target 180 seconds plus or minus 20 seconds and measured offsets are preserved
  And deduplication, real segment prompts, word snapping and chronological subtitles remain correct
  And empty, over 10000000 byte or over 300 second Yandex input causes zero RPCs
  And exact valid limits are tested without changing shared chunk or video-upload limits
  And stalled upload, backpressure, missing status or caller abort cancels once within the effective deadline
  And a terminal error after finals or late event cannot produce acceptance

Scenario: Bounded actual protocol proof with honest remaining qualification
  Given the planner's source-bound short Yandex protocol receipt references
  When root verifies those receipts and reports readiness
  Then the short two-final timed-word protocol result is classified as proven
  And overall live acceptance remains partial
  And natural speech, timing origin, representative chunk under 120 seconds and overlap-render journey remain pending
  And target, browser, storage and separately assigned economics acceptance remain pending
  And additional paid calls require concrete fixture, budget and target authority
  And Cloud STT stays refused without GigaASR or any hidden fallback
```

## Security and additional edge scenarios

```gherkin
Scenario: Authentication bypass through another provider key
  Given selected Yandex STT has no selected key but another model key exists
  When the worker loads live config
  Then startup fails without selecting the other provider or making an RPC

Scenario: Input injection remains untrusted data
  Given transcript text contains instruction-like or SQL-like content
  When segment prompts and provider attribution are built
  Then transcript remains data, SQL identity fields remain bound parameters
  And model output still crosses existing local fragment validation

Scenario: Cross-tenant dispatch attempt
  Given another account's video or an absent video
  When existing ownership and fence authorization runs
  Then existing indistinguishable 404 behavior is retained
  And no unauthorized provider dispatch occurs

Scenario: Malformed time representation and legitimate zero
  Given exact valid zero values and fractional, exponent, whitespace or unsafe int64 representations
  When official-shaped finals are decoded and mapped
  Then protocol-defined valid zeros map without loss
  And malformed representations fail without inventing zero or coercing units
```

No authentication endpoint is added, so a new brute-force/rate-limit mechanism is not applicable. Existing rate, account, quota, source and fence controls remain mandatory regressions. Concurrent same-ordinal DB tests remain required; sequential mocks cannot substitute.

## Consistency and provenance assessment

The six documents agree on explicit Yandex STT selection, retained exact Cloud STT refusal, unchanged OpenRouter default and preserved Cloud chat/S3. Backend selection is narrower than the expanded audit identity union. Secrets are role-specific; neither key presence nor error handling selects another provider. Actual yandex/general identity extends the existing DB ordinal claim and existing fsynced JSONL only; no new financial, credit, ledger or schema semantics are introduced.

The protocol boundary is concrete: fixed TLS method/options, top-level channel identity, numeric final-index ordering, exact duplicate versus conflicting-final policy, first alternative, strict actual word/phrase timings, language-empty fallback and successful terminal status. Legitimate protobuf zeros are distinguished from arbitrary malformed/missing decoded values. An independently full-official-schema golden is required in both encoding and decoding directions, with explicit field-number/enum mutation checks and actual built-worker packaging smoke. This is meaningfully stronger than a subset self-roundtrip.

Input constraints are compatible: common 25000000-byte guard remains, Yandex adds 10000000-byte/300-second limits; actual pause-aware chunks remain target 180 ±20 seconds with two-second overlap. The 120000-ms deadline is a client bound, not evidence that a representative chunk will complete. Closed transient-status classification, disabled client retry and existing worker attempts retain existing spend accounting and cancellation ownership.

The research note pins official cloudapi revision `b5702253b8216fa5cdac9f70509ed608eb0f17f5`, protocol-source hashes, the golden hash `8d7a2f539e0eff0fc881b516f25deb78cc9ea971aa84313094b21c99f1005314`, and redacted short-receipt hashes. Its old Gitverse donor is explicitly historical; disabled-TLS/retry/chunking patterns are not adopted. Re-encoded golden bytes are expressly not original network frames. This provenance is reproducible as a requirement input; this validator did not open those external files or independently verify the probe execution.

## Caveats and continuation

There is no concrete requirements finding requiring a rewrite before bounded coding. The following remain explicit acceptance boundaries, not newly discovered defects:

- Root must make the pinned independent golden/protocol provenance available to the coder and verify its source hashes; this validator did not access files outside the permitted planner set.
- The short synthetic protocol claim is documented but not independently runtime-revalidated here. It proves neither natural recognition quality nor full chunk latency. Receipt verification remains root-owned.
- AC-9 overall acceptance remains partial. Natural Russian speech and word origin, representative 160–200-second chunk within the existing 120-second request bound, >180-second overlap/render journey, RF target/browser/storage and the separately assigned economics update remain accepted pending work.
- All AC-1–8 implementation results are pending. Official native Phase 2 contracts, focused protocol/failure/concurrent DB/pipeline tests, complete no-skip suite, build/typecheck/lint, relevant red/restored-green mutations, env/model-cost checks and independent source review remain mandatory. No v1 result or historical completion row establishes a v4 pass.

Root retains continuation ownership after this bounded validation. No additional inference, fallback, deployment or expense is authorized by this report. If the specification changes, its digest/report binding must be renewed through the affected native contracts.

Profile: model-routing-econom. Requested validator: gpt-6.1-sol/high. Actual model/effort: null (host execution metadata unavailable to this agent); tokens/cost: null. No savings claim. Measured duration, exact per-file hashes and terminal status are in `/tmp/n5-yandex-stt-validation-trace-20261027.md`.
