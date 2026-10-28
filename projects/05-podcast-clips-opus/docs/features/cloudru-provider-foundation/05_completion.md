# Cloud.ru provider foundation — Completion

## Coordinator acceptance v4 — 27.10.2026

Bounded Yandex STT implementation accepted at coder revision
`c25a290ffc6722175c890fe7958fc5ab8ce9df8c` after independent cold review and its
specific fixes. Spec SHA remains unchanged. The earlier a826 review with two
MEDIUM findings is retained as history, not relabeled PASS.

- Fresh corrected acceptance: **1179 tests,121 files,zero skips**, exit0;
  build/typecheck/lint/packaging pass. Four correction mutants fail red and the
  restored full suite passes. Earlier28 guard mutations remain separately bound
  to their actual attempts; they are not falsely claimed rerun on this commit.
- Selected unchanged native completion gate passes9AC rows; final independent
  review contract passes9rows. The historical whole-project traceability failure
  remains recorded under the previously approved selected-contour boundary.
- Actual **built N5 createTranscriber**, fixed live Yandex/general configuration:
  one own200s synthetic MP3,83words/16usable segments,5.452730277s elapsed,
  finite in-source second intervals,zero automatic retries. This is the compiled
  adapter path, distinct from the earlier standalone provider tests. Actual bill
  is unknown; key values/user recordings were not published or used.
- Natural-speech accuracy, hour-scale p95, target Cloud.ru storage/browser and
  production rollout are **not accepted** by these synthetic receipts. AC-9
  remains partial live qualification; full migration is not complete.

Source/check/review/probe receipts:
`docs/telemetry/p-replicator/20261027-n5-cloudru-whisper/evidence/`.
Current VPS was not deployed. Its existing stand occupies default port4181;
the port-conflict preflight is retained as a failed deployment check, separate
from passing offline application checks. Original v1 completion bytes are preserved
in Git0c42dfb1 and `foundation-v1-completion-original.md.gz` in the same evidence folder.

Status: **v4 CORRECTION IMPLEMENTED; final verdict in source-bound terminal receipt**, 2026-10-27. Frozen Specification SHA256 `e1afae2ceaddef35d421700ad75b7e256f407e40bebeea0782b997d10690c16e`; implementation input `3c51e71e9cffd2f636864fb6513058907984c1c4`. Native lifecycle gates, independent cold review and source integration remain coordinator-owned. Historical v1 receipt body is preserved below as archived data; its coverage header is explicitly demoted so only v4 has an active canonical table. It is not v4 evidence.

## Cold-review correction 1 (2026-10-27)

Bounded correction input: `a826387db43d50f1703a8233f94714a6853dc1a8`; frozen Specification hash remains unchanged. Successful remote status/readable end now requires producer Writable `finish`, which grpc-js emits after `_final` half-closes the RPC and all queued audio writes complete. Remote success during options/audio backpressure or before writable finish fails, cancels once and cannot accept late events. The independent full-official-schema fixture adds the three-byte audio frame; tests explicitly assert final indices 0 and 1. The canonical table below has all nine v4 criteria; the v1 table is an explicitly archived historical record.

This pass uses fresh `yandex-fix1-*` receipts under `/tmp/n5-acquisition-analytics-20261026-plan/checks/`. Final source/check/commit binding and verdict are in `/tmp/n5-yandex-stt-fix-review1-trace-20261027.md`. The prior implementation results below describe the earlier attempt and do not substitute for correction checks or independent review. The correction performs no paid call, production change or full-migration acceptance.

## Criterion coverage

One active canonical v4 table. These rows name existing executable tests; AC-9 checks honest partial qualification, not completed live migration. Historical v1 coverage below is archived data.

| Criterion | Test file | Test title |
|---|---|---|
| AC-cloudru-provider-foundation-1 | tests/yandex-stt.test.ts | keeps independent closed selectors and selected-key-only live requirements |
| AC-cloudru-provider-foundation-2 | tests/yandex-stt.test.ts | interoperates with independently complete official-schema golden including zero final index |
| AC-cloudru-provider-foundation-3 | tests/cloudru-provider.test.ts | sends documented Cloud.ru JSON-object request with prompt schema |
| AC-cloudru-provider-foundation-4 | tests/cloudru-provider.test.ts | rejects invalid Cloud.ru output without repair or provider fallback |
| AC-cloudru-provider-foundation-5 | tests/selection.integration.test.ts | records actual provider before one exclusively claimed dispatch |
| AC-cloudru-provider-foundation-6 | tests/s3-public-endpoint.test.ts | signs Cloud.ru configuration offline with compound credentials |
| AC-cloudru-provider-foundation-7 | tests/transcription.integration.test.ts | actual %s attribution is committed and fsynced before exclusive dispatch |
| AC-cloudru-provider-foundation-8 | tests/yandex-stt.test.ts | refuses remote success before producer half-close during %s backpressure |
| AC-cloudru-provider-foundation-9 | tests/yandex-stt.test.ts | keeps live qualification partial without claiming completed migration |

## v4 implementation and executable coverage

Explicit `yandex` selects one TLS SpeechKit v3 streaming RPC with fixed `general`, MP3, FULL_DATA, WHITELIST ru-RU and normalization disabled. OpenRouter remains the default; Cloud.ru STT retains its exact startup refusal. The new key is projected only to worker-stt. No customer-credit engine, shared parser/chunker/merge, SQL schema, LLM or S3 production logic changed.

| Criterion | Executable evidence | Prior implementation result |
|---|---|---|
| AC-cloudru-provider-foundation-1 | `tests/yandex-stt.test.ts`: independent selectors/selected keys/fake; `tests/cloudru-provider.test.ts`: actual entrypoint and synthetic compose isolation, existing Cloud refusal | Focused pass |
| AC-cloudru-provider-foundation-2 | `tests/yandex-stt.test.ts`: full-official-schema golden, actual words/phrases, index zero, dedup/conflicts, strict safe signed int64/shape/context/language checks, mixed silence and all-empty rejection | Focused pass |
| AC-cloudru-provider-foundation-3 | `tests/cloudru-provider.test.ts`: documented Cloud.ru request and existing OpenRouter control | Focused pass |
| AC-cloudru-provider-foundation-4 | `tests/cloudru-provider.test.ts`: malformed/refused/truncated responses and whole-body timeout | Focused pass |
| AC-cloudru-provider-foundation-5 | `tests/selection.integration.test.ts`, `tests/selection-order.test.ts`: existing actual chat attribution/exclusive dispatch | Full regression pass |
| AC-cloudru-provider-foundation-6 | `tests/s3.test.ts`, `tests/s3-public-endpoint.test.ts` and existing upload/render/retention integration: unchanged offline Cloud signing/private storage | Full regression pass |
| AC-cloudru-provider-foundation-7 | `tests/transcription.integration.test.ts`: competing handlers for openrouter/yandex/fake, committed SQL provider/model and readable fsynced attempt before one dispatch; existing retry/quota/fence/credit suites | Focused DB and full regression pass |
| AC-cloudru-provider-foundation-8 | `tests/yandex-input.test.ts`: separate stat/read guards; `tests/yandex-stt.test.ts`: exact 10MB/300s, complete status/deadline/cancel/backpressure; `tests/yandex-pipeline.test.ts`: real 220s speech MP3 extraction/chunk/merge/segment selection/word snap/chronological subtitles/FFmpeg render | Focused offline pipeline pass |
| AC-cloudru-provider-foundation-9 | Root's separately supplied short actual protocol receipt; implementation makes no live call | PARTIAL; natural quality and target/browser/storage qualification remain coordinator-owned |

The independent golden is `tests/fixtures/yandex-official-golden.json`. Its original session/response bytes (original fixture SHA256 `8d7a2f539e0eff0fc881b516f25deb78cc9ea971aa84313094b21c99f1005314`) are preserved; the correction adds independently full-schema encoded audio bytes `007fff` → request frame `12050a03007fff`. Tests assert both audio field numbers and exact decoded final indices `[0,1]`. It was re-encoded with the complete pinned official schema, not this projection and not original network frames. The embedded descriptor ships inside compiled JS and passes a smoke test under Docker's `dist/apps/worker/src/stt/` layout; no new build asset path is needed. Dependencies are exactly @grpc/grpc-js 1.14.6 and @grpc/proto-loader 0.8.1.

The small own synthetic Russian fixture is `tests/fixtures/yandex-synthetic-ru.mp3`, SHA256 `4970a2d1ac36b3e304ff392a8e77786011a6ea3376ea6c748544c396d59f7c4f`; provenance is adjacent. Its repeated speech plus an inserted pause drives the offline 220-second media test. Injected word fields prove integration, not recognition quality.

## v4 checks and source-bound receipts

The bounded implementation launch is `/tmp/n5-yandex-stt-implementation-launch-20261027.json`, SHA256 `5d0b8200106f3f7c2ecdae5486ca8bdc8fcbeb188753bee216baea9ef1fc4472`; its fresh trace is `/tmp/n5-yandex-stt-implementation-trace-20261027.md`. Check JSON/log receipts are under `/tmp/n5-acquisition-analytics-20261026-plan/checks/`, using unique `yandex-*` names. Coordinator owns promotion into project telemetry and final source/native-gate binding.

- `yandex-focus-final`: 80 tests passed, including the corrected malformed-case isolation and synthetic environment regression.
- `yandex-attribution-1`: real PostgreSQL STT concurrency/attribution passed.
- `yandex-pipeline-2`: real offline media pipeline plus protocol/lifecycle tests passed; `yandex-timing-correction`: 76 focused protocol/input/shared-parser/media tests passed after the timing clarification.
- `yandex-typecheck-timing-final`: exact full workspace/test typecheck passed. Earlier TS2742 was caused by reused dependency symlinks; only two private worktree dependency copies were materialized, with no source workaround or shared dependency edits.
- `yandex-build-timing-final`: full production build passed. `yandex-lint-timing-final`: static lint passed. `yandex-packaging-timing-final`: compiled worker/Docker-layout embedded protocol and pinned production dependencies passed, zero network calls; no new image was built.
- `yandex-model-cost-1`: existing read-only model-cost declaration guard passed.
- `yandex-seams-1`: synthetic environment wiring, all 21 mandatory variables and database-port exposure guard passed. Existing default edge port 4181 is occupied by the current stand container; the port-conflict script returned 1. No deployment/start was attempted and this is not represented as a deployment pass.
- `yandex-full-1` is a diagnostic failed attempt: six existing env-wiring assertions in two suites found the shared fixture missing the newly projected synthetic Yandex variable. The fixture was corrected. `yandex-full-final` was then interrupted (exit -15) solely for the coordinator-required signed/reversed timing clarification; it is not a pass. The fresh corrected source-bound run `yandex-full-timing-final` passed: **121 files / 1175 tests / zero skipped**, exit 0, 406.09 seconds (helper wall time in its JSON receipt).

Twenty-six earlier meaningful production mutants each returned 1: independent-wire MP3 enum, fixed host, millisecond conversion, index zero, conflicting final, dedup, stat 10MB, read 10MB, 300-second duration, success-status wait, deadline, full-RPC timer, backpressure, transparent retries, auth retry classification, SQL provider attribution, durable attempt before RPC, fixed model/FULL_DATA/normalization/field number, missing-time-to-zero synthesis, empty phrase context, unsafe index, entrypoint key and compose key. Every mutation restored the original source immediately. Receipts: `yandex-mutant-<name>.json`; manifests `/tmp/n5-yandex-guard-mutations-20261027.json` and `/tmp/n5-yandex-guard-mutations-extra-20261027.json`. After the timing correction, two direct signed/reversed regression mutants also returned 1 (`/tmp/n5-yandex-guard-mutations-timing-20261027.json`); unaffected earlier guards were retained as instructed by the coordinator. Restored-green evidence is the focused/final acceptance run; no historical v1 mutation count is reused.

## Interpretation and qualification limits

Exact safe **signed** word/phrase milliseconds are converted to seconds and passed into unchanged `parseTranscript`: negative bounds and finite reversed intervals use its existing clamp/warning behavior. Only final indices are nonnegative. Missing/malformed/unsafe timing and starts wholly after the measured duration still fail. The coordinator clarified this existing contract during implementation; the shared parser was not changed. Final corrected source/test manifest: `/tmp/n5-yandex-source-timing-final-20261027.json`, SHA256 `53ec958b1c89403e1aa8c71db219a91f54313396f42da588a7a4012860a6d61f`.

The coordinator's independent planner clarification `/tmp/n5-yandex-empty-final-interpretation-20261027.md` (SHA256 `35668aa0aae24165157a84b325d75d482d51315bab879a70eec2167832f7caa6`) confirms aggregate nonempty words/context. A final with present words `[]`, exact text `''` and valid actual identity/timing/languages contributes no words or segments. Index/channel/dedup/conflict checks still apply. All-empty output, malformed empty-looking finals and nonblank phrase text without words still fail. No timing is synthesized. The frozen Specification hash is unchanged.

Root supplied the short 5.26175-second/43245-byte actual protocol proof: gRPC0, two finals/10 actual timed words, imperfect recognition, actual charge null. Its response SHA256 is `f4e38ddb339d44aafaff0f30004e991a62a91c18d297f5830a613e60bb372ecd`; official schema commit is `b5702253b8216fa5cdac9f70509ed608eb0f17f5`. Root additionally reports a separate 200-second protocol experiment; binding/acceptance of that live receipt remains coordinator-owned. This coder made no paid request and does not claim natural Russian speech quality, latency SLA, production/target deployment, live storage/browser acceptance or completed migration. Unit economics remain separately assigned.

Rollback is explicit OpenRouter selection with its own key or reversal of the v4 adapter/config revision; never fallback within a dispatched attempt or replay an unknown outcome. Preserve existing DB/JSONL ordinal and identity history.

Profile: model-routing-econom. Requested implementation model/effort: gpt-6.1-sol/medium. Actual runtime model/effort and token/cost counters are unavailable to this leaf (null), not estimated. Final duration and source commit belong in the terminal trace; root retains telemetry/native gates/cold review/integration and remaining live qualification.

---

# v1 historical completion receipt (unchanged claims below)

Status: FOUNDATION CODE ACCEPTED by coordinator after independent review and required local checks. Foundation success does not complete full Cloud.ru migration. All paths are project-relative unless noted. No live provider calls or deployment were performed.

## ARCHIVE — v1 criterion coverage (historical data; inactive)

The planned titles below are implemented verbatim. Focused and full isolated tests pass; the coordinator owns the scoped native Phase 3 completion gate and independent review. Source-bound implementation evidence is summarized below.

| Criterion | Test file | Test title |
|---|---|---|
| AC-cloudru-provider-foundation-1 | tests/cloudru-provider.test.ts | resolves selected provider and rejects invalid configuration before HTTP |
| AC-cloudru-provider-foundation-2 | tests/cloudru-provider.test.ts | refuses Cloud.ru STT before constructing a transcriber |
| AC-cloudru-provider-foundation-3 | tests/cloudru-provider.test.ts | sends documented Cloud.ru JSON-object request with prompt schema |
| AC-cloudru-provider-foundation-4 | tests/cloudru-provider.test.ts | rejects invalid Cloud.ru output without repair or provider fallback |
| AC-cloudru-provider-foundation-5 | tests/selection.integration.test.ts | records actual provider before one exclusively claimed dispatch |
| AC-cloudru-provider-foundation-6 | tests/s3-public-endpoint.test.ts | signs Cloud.ru configuration offline with compound credentials |

## Implementation evidence (2026-10-26)

Scope: optional fixed Cloud.ru JSON-object chat endpoint/model, schema in system prompt and unchanged local validation; closed backend configuration; startup refusal for unsupported STT; actual chat provider/model attribution; generic S3 signing verified offline. The FM key is forwarded only to worker-llm. Synthetic compose resolution and execution of transpiled entrypoint projections test actual configuration delivery, including selected-key rejection.

Provider attribution uses the existing conditional dispatch claim and quota transaction. The worker requires an explicit execution provider; runtime derives fake from execution mode. The existing direct DB authorization API retains its backward-compatible OpenRouter default for legacy callers; the worker always passes the provider explicitly. Existing history is unchanged.

Checks (fresh redacted receipts: `/tmp/n5-acquisition-analytics-20261026-plan/checks/`):

- `cloud-focused-1`: 117/117; `cloud-focused-2`: 55/55, including all provider races, quota refusal, timeout accounting and independent compound-key SigV4 checks.
- `cloud-build-1`: full workspace build, exit 0.
- `cloud-typecheck-2`: exit 0 after local workspace outputs were built. Earlier `cloud-typecheck-1` failed because the fresh worktree lacked dependency dist outputs; retained as failed evidence.
- `cloud-lint-1`: exit 0, including the 500-line limit.
- `cloud-full-suite-2`: 116/116 files, 1092/1092 tests, no skips, exit 0; 430.775 seconds. Mandatory acceptance skip reporter remained enabled. Validated code/test revision: `325f1f53ed090ad3325230fe29ad4156b636a9d0`.
- `cloud-mutations-3`: all 21 mutations red=1 / restored green=0, exit 0; 116.976 seconds. Includes existing six selection guards plus selected-key/backend, STT refusal, fixed endpoint, JSON-object mode, prompt schema, truncation, body timeout, SQL/ledger/fake attribution and actual secret/selector entrypoint projections. Fresh raw evidence: `checks/cloud-mutations-3-artifacts/`.
- `cloud-typecheck-3`: exit 0 on the corrected shared fixture; `cloud-fixture-regression-1`: previously failing wiring tests plus config/Cloud.ru tests pass.
- Synthetic `scripts/check-env-complete.sh`: exit 0 (21 required variables); `scripts/check-env-wiring.sh`: exit 0; actual values were synthetic. `cloud-model-cost-1`: exit 0.

`cloud-full-suite-1` found three fixture-based wiring assertions: the shared synthetic `environment()` lacked the newly projected backend selectors and FM key. The allowed fixture now includes synthetic values, and absent-selector controls explicitly remove the selectors. The known-failing first suite was stopped after diagnosis (exit -15; 330.134 seconds), its partial/failing evidence retained, and the complete unchanged test set rerun successfully on the committed correction. No runtime behavior was weakened.

The first mutation run (`cloud-mutations-1`) deliberately filtered tests with `-t` but inherited `N5_ACCEPTANCE=1`, so restored controls correctly failed on intentional skips. The runner now disables that full-suite flag only for its explicitly filtered mutation subprocesses. Mandatory full-suite skip reporting remains enabled. Failed logs are preserved; fresh subsequent runs use an optional output path to avoid overwriting historical artifacts.

The mechanical implementation route is M (timeouts); substantive profile remains L for a new external-provider trust boundary, per approved plan. Requested model: gpt-6.1-sol medium; actual model/effort and token/cost counters are null because execution metadata was unavailable. No savings claim is made. Initial/final file hashes and exact source/validation binding are in `/tmp/n5-cloudru-foundation-impl-1-20261026.md`.

The owner-approved scoped Phase 1/2 boundary uses immutable feature snapshots; parent receipts preserve native exit 0 and aggregate legacy exit 1 separately. The historical blocker paragraph below describes the earlier observation and is not a current claim that aggregate legacy checks passed.

## Required checks

Implementation commands-as-data: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` using the repository mandatory skip reporter. Focused `npm test -- tests/cloudru-provider.test.ts tests/config.test.ts tests/selection.test.ts tests/model-spend.test.ts tests/s3-public-endpoint.test.ts`; integration full suite in existing authorized isolated environment; existing `node scripts/test-selection-mutations.mjs` with its supported invocation inspected before execution. Run env completeness/wiring scripts using synthetic fixture, never print real env. Root `node .claude/hooks/check-model-cost.cjs projects/05-podcast-clips-opus` checks declarations; code/DB tests prove ordering separately.

Traceability command from project root: `bash /root/.npm-global/lib/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md`. Explicit supported role-map arguments are needed because this repository keeps toolkit at root, not inside N5. Exit 0 only advances. Phase 2 must create validation-report.md with first-20-line `Spec revision: sha256:<actual spec bytes>` and exact Criterion scenarios table; gate `--report-revision --criterion-scenarios` with the same root role-map arguments. Phase 3 `--completion` checks executable coverage; Phase 4 independent reviewer receives specification + validation report + immutable code/test revision and creates reviewer-family/spec-hash/AC conformance table. All nonzero gates block their phase. No guessed score/verdict or future coverage claim.

PLAN gate observed 2026-10-26: this contour has 14/14 matching keys and no missing/orphan requirements; aggregate project gate is nonzero due legacy root duplicate claims and existing feature folders without numbered role slots. This feature cannot advance or be committed under the current gate rule until coordinator resolves the aggregate evidence boundary. No unrelated documents/toolkit are changed to conceal that blocker.

## Deployment Plan

### Pre-Deployment checklist

- [x] All six AC implemented and mandatory tests/build/typecheck/lint/mutations green, bound to exact source/build; independent acceptance remains separate.
- [x] Independent source review and native review contract complete; no unresolved blocker/high finding. Live-provider acceptance remains separate.
- [x] Targeted provider description/configuration and launch overlay updated: [cloudru-launch-plan.md](../../cloudru-launch-plan.md). Existing REPRODUCE remains the baseline; canonical economics remains estimates.
- [ ] Rollback config/code revision and compatibility verified in existing isolated environment.
- [ ] Actual target capability work authorized separately; credentials alone do not authorize paid tests or deployment.

### Deployment Sequence

1. Implement/review foundation code in isolated worktree, collect fresh test receipts and merge only through parent workflow. There is no deploy command in this feature.
2. Separately obtain Cloud.ru STT generated request example, verify actual word timestamps and DeepSeek constraints with authorized fixture/budget; qualify target RF server and storage. These are deferred deliverables, not hidden foundation AC.
3. Deploy to owner-designated RF server only after explicit release authority and readiness checks; current VPS deployment is excluded. Actual four Metrika goals are checked afterward under their own workflow.

### Rollback Procedure

No schema migration: revert foundation code/config revision or explicitly select existing OpenRouter providers with valid keys/model. Do not automatically switch providers after an error or replay a dispatched attempt. Keep existing JSONL/history and job_attempt provider/model evidence intact; use existing retry/fence behavior only through authorized workflow. Rollback simulation uses fake/injected providers, never a live billable call.

## CI/CD

Existing sequence is tests/lint/typecheck → build → separately authorized release. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` are real project commands. No new `deploy.sh`, deployment automation, hook, server or resource is introduced.

## Monitoring and logging

| Signal | Foundation evidence | Threshold/action |
|---|---|---|
| Selected request/provider mismatch | Mock dispatch + DB/JSONL fixture | Any mismatch fails tests/review |
| Extra repair/fallback dispatch | Mock fetch count | More than one per accepted attempt fails |
| Missing selected key/unsupported STT | Startup fixture | Must fail before network |
| Body stall | Fake timer fixture | Existing 240000 ms timeout must fire |
| Actual provider latency/error rate/CPU | No measurement in foundation | null; target operations later |

Preserve existing levels/retention/aggregation and attempt/outcome records; never log Authorization/key/prompt content. No PagerDuty/Slack/email integration or arbitrary generic monitoring thresholds are added. Parent telemetry records actual agent metadata when available, otherwise null with reason.

## Handoff

Development: fixed baseline and feature allowlist, environment canon, no arbitrary endpoints/dependencies, requirements validation before code. QA: synthetic keys/fixtures, existing isolated DB/Redis/MinIO only, concurrency and mutation evidence, no paid inference or real user content. Operations: target server/keys/bucket/CORS and release authority remain separate prerequisites; live STT and storage status remain unverified. Coordinator owns continuation after bounded attempts, remaining AC and next executor; no claim that background work runs when stopped.

Implementation evidence, independent source review, native scoped completion gate and coordinator acceptance are complete. An earlier optional candidate-branch push was rejected because the destination was unverified; no candidate push retry occurred. Root separately verified the owner-authorized original repository/existing delivery branch, scanned credentials and pushed the accepted integration55f53a41 there. No main/release/production publication occurred.

Required terminal receipts distinguish PLAN complete, implementation pass, actual integration pass and release. Source-bound fresh receipts are substantive regular non-symlink files, never a narrative substitute. No future expense/time estimate is presented as measured usage.

## Coordinator acceptance

Source325f1f53 and docs74742a64 integrated with byte-equality verification.
Official scoped completion gate exit0; native review-contract exit0 with6AC.
Cold review report: [review-report.md](review-report.md). Root independently read
fullsuite receipt1092/1092,116files,0skips and21red1/green0 mutation results.
Foundation CODE accepted; fullCloud.ru migration/liveSTT/S3 acceptance remains
pending. No currentproduction deployment or paidprovider call occurred.
