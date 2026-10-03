# F05b F1/F2 closure review

Verdict: ACCEPT

F1: CLOSED. F2: CLOSED. No remaining confirmed findings in this correction scope.

Reviewed source `f0fb8556536381c968973e992d5e06ac0416cd83`, diff `79d48cf2..HEAD`, exact review-b/correction-b-r1, F05 specification/algorithms/architecture, affected production and unit/HTTP tests. Only production `src/evidence/input.ts` and `src/growth/reports.ts` changed. A and B2/B4 remain accepted; this accepts B scope, not whole-MVP readiness.

| Dependency | Closure |
|---|---|
| B1 | PASS: F1 direction defect closed. |
| B3 | PASS: F2 share replay defect closed. |
| B5 | PASS: F1 event-kind and F2 report-identity defects closed. |
| B6 | PASS for B scope: missing cases now exercised; saved regression/mutation/binding evidence verified. F06 whole-cabinet Playwright remains outside this slice. |

F1: `input.ts:17` and `reports.ts:63` require primitive strings before exact membership checks. Accepted higher/lower and copy/link values are preserved without coercion. HTTP tests submit both enum-shaped arrays, objects and null; assert typed400 and unchanged observation/event counts. Unit tests additionally reject boxed strings and prove invalid event kinds never connect to PostgreSQL. These are behavior assertions, not duplicated validator logic.

F2: `uuidInput` validates then lowercases. Share canonicalizes both IDs before own-observation queries and replay equality; event canonicalizes its report ID before lookup and comparison. Real HTTP checks cover identical uppercase retries, mixed-case identity, 12 concurrent share retries and eight concurrent retries each for copy/link, stable response/report identity, one report/share event and one event per copy/link key. Genuine changed pair, report and kind return409. These concurrent groups exercise replay after an initial successful request; unchanged tenant transaction serialization still covers creation. No authorization expansion: authenticated server tenant, Origin, tenant predicates and explicit POST remain intact. Projection, entitlement, consent, unsubscribe, freshness INSERT predicate and storage limits are unchanged.

Saved checks: type/lint/build exit0; unit27/27, full PostgreSQL109/109, restored affected11/11, canary/source-image PASS. Direction mutant returns201 instead of400; kind mutant503 instead of400; normalization mutant returns idempotency_conflict instead of the same successful payload. Each exits1 on an actual HTTP assertion. Later UUID-mutant failures cascade from that first failure; they are not additional independent defects. Reconstructed all three mutant SHA256s and confirmed exact restored production bytes.

Independent local comparison verified all80 inputs against donor `c5f3e3d8306b3b0b7e5dabfeee8ec3515db42cda`, current files, frozen snapshot and recorded copied-input hashes. Source/build map digests, Dockerfile, spec and launch match. Recorded image/container: `sha256:41a3d420d3265cf2d35e176564172459cdd47beae379e1f5f3735394648873f7`. Both full and targeted preflight commands exactly match recorded execution. No successful reruns or runtime reinspection. Full-diff whitespace check flags preserved raw logs only; no cleanup performed.

History retained: original author timeout1500s/exit124, recovery178.303s/exit0 and earlier delivery shortcomings remain recorded. Correction author host evidence confirms gpt-6.1-sol/high, process677.513s/exit0 (distinct from receipt-time622.574s); input/output1,944,868/16,599, cost null.

Preparation/delivery use project-work-companion; mechanical ROUTE L/exit1, substantive inherited XL under OWN-N7-002. Profile compact-quality-first-v2; reviewer requested gpt-6-astra/high, actual model/effort/usage/cost null pending host; active time null. Finished 2026-10-03T02:35:24.452317+00:00, elapsed 277.083s including preparation. Source-only E2E readiness not_applicable. No agents, product edits, commits/push, runtime, secrets, network or browser.

Evidence: [bound receipt](../../telemetry/features/20261003T010600Z-f05/astra-b-r1-receipt.md), [local binding check](../../telemetry/features/20261003T010600Z-f05/astra-b-r1-source-check.json).

Status: completed
