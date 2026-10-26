# Cloud.ru provider foundation — Completion

Status: IMPLEMENTED; independent review and coordinator acceptance pending. Foundation success does not complete full Cloud.ru migration. All paths are project-relative unless noted. No live provider calls or deployment were performed.

## Criterion coverage

The planned titles below are implemented verbatim. Focused isolated tests pass; the coordinator owns the scoped native Phase 3 completion gate and independent review. Source-bound implementation evidence is summarized below.

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
- Final full suite and mutation controls: pending at this checkpoint; no final pass claim yet.

The first mutation run (`cloud-mutations-1`) deliberately filtered tests with `-t` but inherited `N5_ACCEPTANCE=1`, so restored controls correctly failed on intentional skips. The runner now disables that full-suite flag only for its explicitly filtered mutation subprocesses. Mandatory full-suite skip reporting remains enabled. Failed logs are preserved; fresh subsequent runs use an optional output path to avoid overwriting historical artifacts.

The mechanical implementation route is M (timeouts); substantive profile remains L for a new external-provider trust boundary, per approved plan. Requested model: gpt-6.1-sol medium; actual model/effort and token/cost counters are null because execution metadata was unavailable. No savings claim is made. Initial/final file hashes and exact source/validation binding are in `/tmp/n5-cloudru-foundation-impl-1-20261026.md`.

The owner-approved scoped Phase 1/2 boundary uses immutable feature snapshots; parent receipts preserve native exit 0 and aggregate legacy exit 1 separately. The historical blocker paragraph below describes the earlier observation and is not a current claim that aggregate legacy checks passed.

## Required checks

Implementation commands-as-data: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` using the repository mandatory skip reporter. Focused `npm test -- tests/cloudru-provider.test.ts tests/config.test.ts tests/selection.test.ts tests/model-spend.test.ts tests/s3-public-endpoint.test.ts`; integration full suite in existing authorized isolated environment; existing `node scripts/test-selection-mutations.mjs` with its supported invocation inspected before execution. Run env completeness/wiring scripts using synthetic fixture, never print real env. Root `node .claude/hooks/check-model-cost.cjs projects/05-podcast-clips-opus` checks declarations; code/DB tests prove ordering separately.

Traceability command from project root: `bash /root/.npm-global/lib/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md`. Explicit supported role-map arguments are needed because this repository keeps toolkit at root, not inside N5. Exit 0 only advances. Phase 2 must create validation-report.md with first-20-line `Spec revision: sha256:<actual spec bytes>` and exact Criterion scenarios table; gate `--report-revision --criterion-scenarios` with the same root role-map arguments. Phase 3 `--completion` checks executable coverage; Phase 4 independent reviewer receives specification + validation report + immutable code/test revision and creates reviewer-family/spec-hash/AC conformance table. All nonzero gates block their phase. No guessed score/verdict or future coverage claim.

PLAN gate observed 2026-10-26: this contour has 14/14 matching keys and no missing/orphan requirements; aggregate project gate is nonzero due legacy root duplicate claims and existing feature folders without numbered role slots. This feature cannot advance or be committed under the current gate rule until coordinator resolves the aggregate evidence boundary. No unrelated documents/toolkit are changed to conceal that blocker.

## Deployment Plan

### Pre-Deployment checklist

- [ ] All six AC implemented and mandatory tests/build/typecheck/lint/mutations green, bound to exact source/build.
- [ ] Independent review complete, no unresolved blocker/high findings; secret exposure and external-dispatch safety reviewed.
- [ ] Targeted provider descriptions/REPRODUCE/model-cost docs updated; canonical economics remains estimates.
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

Required terminal receipts distinguish PLAN complete, implementation pass, actual integration pass and release. Source-bound fresh receipts are substantive regular non-symlink files, never a narrative substitute. No future expense/time estimate is presented as measured usage.
