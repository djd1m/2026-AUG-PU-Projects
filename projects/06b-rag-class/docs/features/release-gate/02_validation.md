# F16 independent requirements validation — implementation-1

Validated before implementation, 2026-10-03. Run `20261003T064351Z-release-gate`;
source `58b49da642298d991679241ce26c508b22392aee`.
Plan SHA256 `a0273754103fc9a75e0a7ddd7888dbbc904432c3d579a318d0f98dbf773e8e88`;
Specification SHA256 `918e5d0e070d61f599d4cb5b7fc883adaee55a6c4c8c76c4c1cae21837018c82`.
This is a fresh semantic pass by the implementation worker, independent of the plan author;
it does not replace the coordinator's separate postimplementation review.

## Verdict

READY for bounded offline implementation, with external acceptance gates preserved.
INVEST 42/50 (negotiability 0: release numbers are intentionally fixed), SMART 27/30
(achievability 3: actual high-similarity negative eligibility remains unmeasured),
quality 20/20; total 89/100. Security criteria are explicit; bonus +5 = 94/100.
Growth tracing is not rescored: existing badge/ref flow is exercised, no new acquisition requirements.
No blocking floor: Testable 8, Completeness 10, Traceability 10, based on the quoted AC below.

## Criterion scenarios

| AC / quoted plan requirement | Named scenarios and evidence |
|---|---|
| REL-01: “exactly30questions (20 answerable,10 unanswerable)” | Frozen fixture validation; duplicate/missing evidence/cardinality rejection; UTF8 hash receipt |
| REL-02: “Missing key/DB/explicit live switch -> exit2 without paidcalls” | Missing live grant/config and fake mode refuse before factory/DB; one bounded logged corpus batch; 30 sequential attempts; failed provider stops without retry |
| REL-03: “10/10 unknown outcomes WITH measured top retrieved similarity >= configured MIN_SIMILARITY” and “>=17/20known” | 17/20 boundary accepted; 16 rejected; one low-sim negative rejected; legal citation with wrong facts rejected; incomplete run rejected; score mutation red/green |
| REL-04: “registration→markis_test viaownerDB→createbotURL202/jobpoll bounded” | Actual API sequence; missing source/origin/DB/authorization exit2; 202/job IDs validated; failed/unknown job protocol exit1; cited sandbox/visitor answer, publication and badge/ref checked |
| REL-05: “offline substantive tests” | Tests inject only tool-boundary dependencies; no monkeypatch of product routing; focused unit plus explicit script typecheck |
| REL-06: “initially explicit NOTEXECUTED” | Pending-live report and completion mapping; no historic contract/roadmap checkmarks edited |

## Cross-read and risks

Read Specification US005/US006/FR6/NFR1 against Architecture (real PG HNSW, paid port),
ADR003/004/010/014 and model-cost/embed/long-job contracts. Current answerQuestion accepts
PaidGateway, captures one question vector, uses real search and records terminal question outcome.
The tool can observe the vector via a delegating wrapper while keeping quota/ledger authority in the live gateway.
Fixture seeding is explicitly not a crawl; CJM separately queues a real source job.
Frozen negatives target omitted details on documented topics; their high similarity is a hypothesis
until measured, not a pass claim. Do not alter threshold/prompt/dataset after seeing outputs within an attempt.
Deterministic factual matching is transparent evidence for human review, not a semantic truth oracle.
Elapsed per case is recorded; 30 cases do not establish the 200k-chunk NFR performance benchmark.

Security scenarios: unauthenticated/fake/missing-live tool entry refuses; SQL values parameterized;
credential-bearing URLs rejected; evidence excludes sessions/passwords/raw exceptions; new fixture tenant
is_test verified before paid calls; existing product cross-tenant/auth/rate guards remain mandatory coordinator checks.
No new concurrency mechanism; sequential tool execution retains existing atomic quota reservations.

## Repeated ROUTE and ownership

Mechanical command: `bash ../../scripts/complexity-router.sh scripts/calibrate.ts scripts/check-cjm.sh tests/calibration/questions.json`.
Actual exit0, S; evidence `tests/artifacts/release-gate/route-implementation.txt` (justified added artifact path).
Substantive M: tooling observes existing paid gateway/public protocols without changing production behavior.
Author owns only plan-allowed scripts/fixtures/unit/docs/artifacts; no donors, children, network,
Docker, secret reads, paid calls, dependencies, schema, commit or deployment in this attempt.
Coordinator owns telemetry, full runtime regression, independent review, live/stand/browser/rollback gates.
Profile compact-quality-first-v2; requested Sol6.1 high from launch; actual model/effort/usage unavailable to worker.
Preflight not_applicable: no E2E or live execution authorized for this author.
