# Requirements Testability Analysis
Spec revision: sha256:4a7c7594632d791d694fb632c3f1dabd0f2363f3490ecb96a4ac38f643fe5459

Verdict: READY
Profile: L; Phase 2 VALIDATE, full plan review only.
Source HEAD: 9ba7a6fa19a3e8abee24eb4b10cbff4b8dea71e5
Implementation baseline: c559673649460fa5d8ef1e5e3c86bf7053ebbb69
Requested model/effort: gpt-6.1-sol / high. Actual model/effort metadata: null / null; no execution metadata supplied to this reviewer.
Usage tokens/cost: null / null; unavailable counters, not estimated. Elapsed duration: null; no instrumented start timestamp.

## Summary

Three user stories and six acceptance requirements analyzed. Mean base score: 93.8/100. Blocked requirements: none. Every Testable, Completeness and Traceability floor is nonzero and justified by the quoted AC text below and this report's Criterion scenarios table. READY follows `/feature` Phase 2's >=70 average and no blocked items; it is not an implementation, live-capability or release pass.

Inputs read: all five SPARC documents plus research.md, root/project CLAUDE.md, requirements-validator and its scoring/report contracts, parent feature Phase2, companion preparation/handoff instructions, selected scoped Phase1 receipt, and relevant immutable baseline config/DB definitions. No coder receipts/chats or new implementation outputs were read. No code, deployment, provider configuration, keys, history, toolkit or project documents were changed.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-cloudru-provider-foundation-1 | Selected provider configuration and startup rejection |
| AC-cloudru-provider-foundation-2 | Deferred Cloud.ru STT fails closed before construction |
| AC-cloudru-provider-foundation-3 | One documented Cloud.ru JSON-object request and locally valid candidate |
| AC-cloudru-provider-foundation-4 | Invalid output, cancellation and stalled body never trigger weaker mode |
| AC-cloudru-provider-foundation-5 | Actual provider attribution on one exclusively claimed dispatch |
| AC-cloudru-provider-foundation-6 | Offline Cloud.ru S3 signing under both addressing styles |

## Scoring and floors

Scores use the installed rubric: INVEST 50 + SMART 30 + Quality 20. Each row scores one requirement with its named AC and applicable inherited FR/NFR constraints. Security adjustment is reported separately and does not hide a floor failure.

| Requirement / AC suffix | INVEST I/N/V/E/S/T | SMART S/M/A/R/T | Quality trace/completeness | Base score | Floors T/C/Trace | Status |
|---|---|---|---|---|---|---|
| 1 — provider configuration | 8/8/10/8/8/8 = 50 | 6/4/6/5/5 = 26 | 10/10 = 20 | 96 | 8/10/10 | READY |
| 2 — STT refusal | 8/8/10/8/8/8 = 50 | 6/4/6/5/5 = 26 | 10/10 = 20 | 96 | 8/10/10 | READY |
| 3 — chat request | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/10 = 20 | 92 | 8/10/10 | READY |
| 4 — response acceptance | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/10 = 20 | 92 | 8/10/10 | READY |
| 5 — dispatch attribution | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/10 = 20 | 92 | 8/10/10 | READY |
| 6 — offline S3 safety | 8/8/10/8/8/8 = 50 | 6/8/6/5/0 = 25 | 10/10 = 20 | 95 | 8/10/10 | READY |

Rationale: 3–5 deliberately lose independence because config, selector and worker/DB attribution have integration dependencies; explicit interfaces and sequential ownership make these estimable without pretending they are standalone features. Configuration/refusal metrics are categorical rather than throughput/latency metrics (Measurable 4). AC6's 900 seconds is URL validity, not a signing execution-time bound (Time-bound 0); absence of an invented latency target is not a floor failure. Other timing credit is tied to startup-before-network, one dispatch, and the inherited 240000 ms body-inclusive timeout. Implementation choices remain negotiable inside protocol/security invariants. The producer/operator value, fixed file scope and offline fixtures support Value, Estimable and Small.

Completeness is evaluated across each AC and its explicitly paired FR/NFR plus the generated scenario variants below: successful current backend, configured refusal, malformed/network output, quota/fence concurrency, and S3 transport/isolation regression cases. Nonzero Testable/Completeness relies on the following actual AC quotations, not a prospective test-coverage claim. Traceability is the exact six-row table above. Security criteria are specific (+5 outside base score, capped at 100 if an adjusted score is displayed; none is used to determine this verdict). Growth adjustment: +0, not applicable to this foundation scope; no acquisition/adoption objective is added here. Parent analytics work is separate.

## Acceptance criteria evidence

### AC-cloudru-provider-foundation-1 — quoted acceptance criterion

Source: `docs/features/cloudru-provider-foundation/01_specification.md`, heading `AC-cloudru-provider-foundation-1`.

> [SC-US-001-1] Selected provider configuration
> Given live mode, an explicit Cloud.ru LLM selector, exact DeepSeek model and a synthetic Cloud.ru key, when configuration loads, then it resolves Cloud.ru without requiring an OpenRouter key. Unknown/empty selector, missing selected key or wrong model fails before network access. Existing absent selectors still resolve OpenRouter; production fake fails.

### AC-cloudru-provider-foundation-2 — quoted acceptance criterion

Source: `docs/features/cloudru-provider-foundation/01_specification.md`, heading `AC-cloudru-provider-foundation-2`.

> [SC-US-001-2] Deferred STT fails closed
> Given `N5_STT_PROVIDER=cloudru`, when STT configuration loads, then it throws `Cloud.ru STT не поддерживается: контракт таймкодов слов не подтверждён` and dispatch count is zero. Word-timestamp rejection tests remain green for OpenRouter.

### AC-cloudru-provider-foundation-3 — quoted acceptance criterion

Source: `docs/features/cloudru-provider-foundation/01_specification.md`, heading `AC-cloudru-provider-foundation-3`.

> [SC-US-002-1] Cloud.ru request and valid candidate
> Given an injected fetch and a valid candidate fixture, when selection runs, then exactly one request has the fixed Cloud.ru URL, required JSON-object body and serialized FRAGMENTS_SCHEMA in the prompt, without OpenRouter provider extensions. Returned content must pass existing `validateFragments` before persistence. The OpenRouter request contract remains unchanged.

### AC-cloudru-provider-foundation-4 — quoted acceptance criterion

Source: `docs/features/cloudru-provider-foundation/01_specification.md`, heading `AC-cloudru-provider-foundation-4`.

> [SC-US-002-2] Invalid response and failure paths
> Given malformed/refused/truncated/extra-field fixtures, out-of-range candidates and a stalled body, when selection runs, then the existing local rejection/filtering rules and timeout error apply; rejected shapes never reach acceptSelection; there is no fallback or extra request. A body timeout remains bounded by existing 240000 ms selection timeout.

### AC-cloudru-provider-foundation-5 — quoted acceptance criterion

Source: `docs/features/cloudru-provider-foundation/01_specification.md`, heading `AC-cloudru-provider-foundation-5`.

> [SC-US-003-1] Actual attribution and exclusive dispatch
> Given selected provider and two competing handlers for the same attempt, when authorization/selection executes in the existing isolated integration environment, then at most one dispatch occurs, quota and durable attempt logging precede it, and DB plus ledger record actual provider/model. Quota refusal yields zero requests; timeout remains counted. Fake dispatch records fake.

### AC-cloudru-provider-foundation-6 — quoted acceptance criterion

Source: `docs/features/cloudru-provider-foundation/01_specification.md`, heading `AC-cloudru-provider-foundation-6`.

> [SC-US-003-2] Offline S3 configuration safety
> Given synthetic `<tenant_id>:<key_id>` credentials and Cloud.ru endpoint configuration, when signing GET and multipart PUT under both addressing styles with an injected request handler, then signatures bind the intended host/region/credential, expire after 900 seconds and retain filename disposition; zero external requests occur. Existing S3 multipart/render/retention regressions pass.

## BDD scenarios and variants

```gherkin
Scenario: Selected provider configuration and startup rejection
  Given live LLM mode with cloudru selected, DeepSeek-V4-Pro and a synthetic FM key
  And the LLM environment contains no OpenRouter key
  When the LLM configuration loads
  Then its backend is cloudru and no network request has occurred
  And only the selected component's key is required
  When an empty or unknown selector, missing selected key or wrong provider-model pair is supplied
  Then startup rejects it before any request
  And absent selectors preserve existing OpenRouter selection
  And fake outside NODE_ENV=test is rejected

Scenario: Deferred Cloud.ru STT fails closed before construction
  Given N5_STT_PROVIDER=cloudru in live or test fake mode
  When the STT configuration loads
  Then the exact unconfirmed-word-timestamp error in AC2 is thrown
  And no transcriber, audio dispatch or fabricated word timings are produced
  Given the existing OpenRouter STT mode
  Then actual-word-timestamp rejection and existing retry behavior remain regression requirements

Scenario: One documented Cloud.ru JSON-object request and locally valid candidate
  Given an authorized selection, timestamped transcript and injected fetch
  When a valid Cloud.ru fixture is returned
  Then exactly one POST targets the fixed HTTPS chat endpoint
  And the Bearer key, exact DeepSeek model, stream false and json_object are present
  And serialized FRAGMENTS_SCHEMA occurs in the system prompt
  And OpenRouter routing fields are absent
  And validateFragments precedes acceptSelection
  Given explicit OpenRouter selection
  Then its existing strict-schema request and provider pins remain unchanged

Scenario: Invalid output, cancellation and stalled body never trigger weaker mode
  Given each of malformed envelope, invalid JSON, refusal, missing or nonstring content,
    empty content, extra fields and finish_reason length
  When selection consumes that fixture
  Then its schema/provider error occurs and rejected shapes cannot reach acceptSelection
  And fetch has been invoked once with no repair, fallback, alternate model or format
  Given candidates with invalid times, scores or overlap alongside valid candidates
  Then existing semantic filtering and word snapping apply without broadening acceptance
  Given a 429 or 5xx response, a redirect, caller abort or stalled response body
  Then the request is rejected or aborted under the existing failure contract
  And the 240000 ms budget covers body reads as well as response headers
  And the existing attempt remains counted

Scenario: Actual provider attribution on one exclusively claimed dispatch
  Given two handlers share the same video fence and selection attempt
  When existing transaction and conditional claim authorization run
  Then at most one handler may dispatch
  And quota or existing reservation, provider-model DB attribution and durable attempt event precede HTTP
  And DB and JSONL describe the actual cloudru, openrouter or fake execution
  Given per-user or global quota refusal
  Then no HTTP or unauthorized attempt spend event occurs
  Given a timeout, provider error or schema failure after authorization
  Then the one counted attempt remains and its outcome retains provider-model identity
  Given a stale fence
  Then no result is accepted through the current fence

Scenario: Offline Cloud.ru S3 signing under both addressing styles
  Given synthetic compound tenant:key credentials, ru-central-1 and the Cloud.ru endpoint
  When GET and multipart PUT URLs are signed under path and virtual-host addressing
  Then independently verified signatures bind the intended host, region and credential
  And expiry is 900 seconds and the intended filename disposition is retained
  And zero external requests occur
  Given distinct public-signing and internal-transport origins
  Then the original isolation remains and URLs are not rewritten after signing
  And existing multipart, render and retention success/failure regressions remain required

Scenario: Authentication bypass attempt
  Given a missing Cloud.ru selected key and a present OpenRouter key
  When Cloud.ru LLM startup is attempted
  Then the missing selected key rejects startup without credential substitution or a request

Scenario: Input injection remains data and parameterized SQL
  Given transcript text containing instructions, SQL-like strings or script markup
  When it enters the timestamped user-data prompt and provider attribution path
  Then it remains data and provider-model SQL uses bound closed values
  And local schema and semantic checks remain the only fragment acceptance boundary

Scenario: Cross-tenant dispatch attempt
  Given another account's video identifier or a nonexistent identifier
  When existing ownership authorization runs
  Then the same existing 404 behavior and zero unauthorized dispatch remain
```

No auth endpoint is added; brute-force endpoint testing is not applicable. Existing rate/quota controls remain mandatory regressions. These security variants do not manufacture new machine AC IDs or change the frozen root specification.

## Compatibility and external dependency assessment

1. Environment canon is internally consistent: N5_MODEL_PROVIDER is execution live/fake, while N5_LLM_PROVIDER/N5_STT_PROVIDER are backend selectors. Absent selectors preserve OpenRouter; empty values fail. N5_LLM_MODEL is checked against the selected backend, not the presence of keys. LLM Cloud.ru can start without an OpenRouter key in its own role; the separate live OpenRouter STT role still needs its own key. Config failure cannot silently select another provider.
2. The FM key belongs only in worker-llm for this foundation. NFR1's phrase “STT/LLM worker environment wiring as needed” does not authorize sending it to worker-stt: Cloud.ru STT is unsupported and has no need for this key. Pseudocode's keys-as-needed and architecture's worker scoping must be implemented under that narrower interpretation. No new Cloud environment name is needed.
3. Immutable baseline config already has live/fake and the two named OpenRouter models. Baseline job_attempt.provider/model are nullable text in migration 001_init.sql, without an OpenRouter-only CHECK; fake/openrouter/cloudru therefore do not conflict with that SQL storage shape. Unrelated payment-provider constraints apply to other tables. Extend the application union and bind SQL values; do not migrate or relabel historical rows.
4. Baseline authorizeSelection has a conditional llm_dispatched claim, quota/reservation handling and provider-model update inside the transaction. The plan preserves those operations and adds actual provider identity; it does not propose a second claim. Durable/fsynced attempt event must still precede selector invocation, including error/timeout paths. These are future DB/concurrency checks, not facts established by this report.
5. JSON-object generation plus schema in prompt and existing strict LOCAL validation is explicit. There is no claim that Cloud.ru enforces strict schema generation. One request, no repair/fallback and abort/body-inclusive timeout avoid a silently weaker mode. OpenRouter's existing strict-generation branch remains explicit and unchanged.
6. Public documentation rechecked read-only during validation: the [FM OpenAPI](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml?source-platform=Evolution) lists chat POST, bearer auth and a response_format type enum containing text/json_object; its separate json_schema property does not establish strict-generation support. The [model catalogue](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models) lists the exact DeepSeek model and Whisper, but that does not establish Whisper request encoding or word timing. The [S3 SDK guide](https://cloud.ru/docs/s3e/ug/topics/tools__sdk-python) supports the documented compound-key/endpoint/region configuration. These are documented capabilities, never tenant/live acceptance evidence.
7. UNCONFIRMED capability-dependent work is excluded: CloudWhisper transport/word timestamps, strict provider schema generation, model output ceiling/quality/latency, and actual Cloud.ru S3/browser/target-server acceptance. AC2 tests refusal and AC6 tests offline generic S3 signing, so neither depends on pretending those capabilities are confirmed. Full migration remains incomplete after foundation delivery.
8. Billing/config integration: coordinator clarified that N5_BILLING_MODE is a later separate credit-feature change after foundation config handoff. It is outside the current closed canon and must not be added by this feature. Shared config/DB selection ownership is sequential with SHA handoff; no simultaneous writer is authorized.

## Findings and concrete delivery notes

No blocking requirement and no mandatory specification rewrite identified. Two nonblocking reconciliation notes:

- Keep CLOUDRU_FM_API_KEY out of worker-stt as well as web/video/browser; explicitly assert only worker-llm receives it in synthetic wiring checks. This is the selected-provider rule already required by the accepted scope, not an added key-access permission.
- Completion/research contain historical prose saying aggregate legacy exit1 blocks advancement. The owner subsequently approved a scoped gate boundary using the unchanged checker on an immutable selected-feature snapshot. Preserve those historical observations and attach the new scoped approval/receipt; do not report the real-project aggregate as passing or weaken runtime gates. No unrelated legacy repair belongs in this feature.

Reviewed scoped Phase1 evidence: docs/telemetry/p-replicator/20261026-n5-credits-cloudru/evidence/phase1-foundation-scoped.json binds the unchanged checker digest, HEAD and the six source-file digests, snapshot_matches_before_after=true and exit_code=0. Requirement/algorithm traceability is 14/14 per coordinator and scoped receipt/log; aggregate project exit1 is preserved separately. Phase2 native report-revision/scenario gate is still for the coordinator to run after copying this report; this validator does not claim its result.

Implementation/delivery remains conditional on all six executable AC mappings; full tests with mandatory skip reporter; build/typecheck/lint; selection mutations, synthetic env wiring, isolated real-DB dispatch concurrency and attribution; existing S3/render/retention regressions; and independent code review bound to exact source. No runtime test was run by this plan reviewer. No new expense, resource, key access, deployment, provider call or historical mutation is authorized.

## Terminal result

Requirements validation complete: READY, no blocked requirements. Native Phase2 gate pending coordinator execution; implementation and live capability acceptance remain unverified. This artifact is the bounded VALIDATE result, not a terminal success claim for the owner's whole task. Parent coordinator owns the next implementation step and source-bound shared-file handoff.

Status: completed
