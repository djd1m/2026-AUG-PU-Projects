# Completion — expanded-mvp delta v1

Progressive completion index. AC001–AC003 name actual accepted F07/F08/F09 tests at sources10c8e946,521ae2b3,e043bb27; the remaining six rows are future assignments, not executed tests. F09 final review accepts the exact parent witness and explicit unchanged-component runtime evidence. F07 runtime evidence and independent acceptance are recorded in its feature report. No whole expanded-MVP or live pass is claimed; the whole Phase3 criterion gate remains unmet until the remaining bindings exist and required checks pass.

## Criterion coverage
| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-expanded-mvp-001 | tests/capacity-integration.test.ts | F07 real PostgreSQL capacity boundaries and atomic safety |
| AC-expanded-mvp-002 | tests/expanded-mvp-02.test.ts | live diagnostics enforce pinned TLS without DATA |
| AC-expanded-mvp-003 | tests/expanded-mvp-03.test.ts | ambiguous SMTP and UID reset preserve recovery safety |
| AC-expanded-mvp-004 | tests/expanded-mvp-04.test.ts | persistent fair workers serve every eligible mailbox |
| AC-expanded-mvp-005 | tests/expanded-mvp-05.test.ts | inbound context is bounded tenant scoped and expires |
| AC-expanded-mvp-006 | tests/expanded-mvp-06.test.ts | OpenAI drafts obey consent budget and approval version |
| AC-expanded-mvp-007 | tests/expanded-mvp-07.test.ts | AI reply authority preserves stop fence and shared quotas |
| AC-expanded-mvp-008 | tests/expanded-mvp-08.test.ts | full path SLO counts overdue errors and unknowns |
| AC-expanded-mvp-009 | tests/expanded-mvp-09.test.ts | live gates kill switch and TEST billing remain distinct |

## Deployment Plan
Pre-deployment: source-bound full tests/lint/build, real PG+protocol fixtures, security audit, all criterion/review gates0, docs updated, backup/restore and rollback rehearsed. Fixture readiness alone cannot close f15. Required pipeline: test → build → approved deployment; use existing project scripts only. No fictional deploy.sh or alert service integration.

Deployment sequence:1 verify permission and record frozen revision/config/account/provider/OpenAI budget and rollback revision;2 operator enables narrowly scoped live capabilities for consenting pilot peers, starts bounded workers and verifies probes;3 observe complete7day A1 window and publish raw outcomes, passes/misses plus current remaining blockers. Paid billing stays TEST. These are instructions for a future approved deployment, not authority to deploy now.

Rollback: revoke live gate/AI policy under global first lock, stop new claims, drain only already-submitting attempts, persist unknowns for reconciliation; stop workers then restore prior application revision with additive-compatible schema. Never drop evidence or requeue unknown submissions. Restore snapshot only through separately tested procedure preserving reconciliation ledger.

## Monitoring
| Metric | Threshold / response |
|---|---|
| Complete poll age | ≥60s blocks sending; operator-visible alert |
| Oldest due / fairness | >60s atA1 records saturation and SLO risk |
| Pool eligible wait | >5min with available budgets reports starvation |
| Arrival→SMTP accepted | ≥300s marks miss, no unsafe acceleration |
| LLM tokens/currency | configured cap reached: block generation |
| API p99 / error / CPU | baseline sample then operator-configured threshold; no fake PagerDuty/Slack integration |
| Unknown delivery / timestamp | exact count and reconciliation needed; never retry automatically |
| TTL lag | expired body still present: failure and cleanup alert |

Logs: typed INFO/WARN/ERROR without secrets/mail bodies; event metadata TTL30days proposed; body/draft absolute7days and terminal24h. Metrics from durable DB, provider proof and resource logs. Validate alert visibility locally; external notification integration is separately authorized.

## Handoff
Development: accepted source SHA, frozen docs, owner/file map, receipts, actual host model evidence, next pending AC and responsible executor. QA: fixture environment/data and exact literal test titles; UI Docker artifacts and defects. Operations: scoped account/provider/OpenAI authorization, runtime keys, limits/kill switch, complaint intake, expiry/retention, recovery runbook. Never paste secret values in handoff.

## Gates and evidence
PLAN checker --traceability; VALIDATE --report-revision --criterion-scenarios; IMPLEMENT --completion; REVIEW check-review-contract all require0. Keep checker stdout/stderr/exit verbatim;1 means repair,2 means not-established, neither warning. Fresh reviewer gets exact spec SHA plus validation report; all AC verdicts must cite actual evidence. Source-version/canon/ownership/receipt checkers before aggregation. Final summary lists profile, actual model evidence/fallbacks, elapsed wall time incl coordination, available usage/cost and missing measurements, telemetry paths, fixture readiness and live status separately. Pending external live permission is explicitly a blocker on live AC, not a fake pass or voluntary pause.

## Mandatory AI content gates — N7-VAL-001

AC006/007 evidence includes [ai-policy-v1](ai-policy-v1.md) frozen C01–C24 and variants, threshold0 unauthorized,100% correct holds,≥90% useful positive answers, model/prompt/policy/snapshot/cases hashes. Distinguish local deterministic/recorded fixtures from separately permitted actual-model gate, then full-path live pilot. None executed in PLAN. New specification bytes require fresh validation/review bound to new SHA; old report cannot certify them. Arrival latency≥300s is a miss.

## F07 source-bound AC001 evidence

The named parent test contains the actual101st connection, global30 admission/races, lease120 expiry/renewal/release, tenant pagination, both send endpoints and additive migration cases. Additional F07 billing/unit/browser and existing full dispatch/submission/suppression regressions are required by `../f07-connected-capacity/05_completion.md`; one table witness does not alone prove the composite criterion. Source10c8e946 runtime receipt and logs are preserved under `../../telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/f07-implement-a1/`. AC003–009 remain pending their corresponding implementation/runtime stages; F15 needs separate live authorization.

## F08 source-bound AC002 evidence

F08 accepted on `521ae2b3208c7ffa2f33a6701c84a816f07c3d5a` after independent R1/R2 correction review. The parent witness runs explicitly outside the integration glob. Exact final PostgreSQL146 and affected20 checks pass; unchanged unit54, real TLS, three guard mutations and browser20 evidence retain their earlier component source bindings. Browser evidence is00f6888f, not a claimed521 final-image run. [Scoped completion](../f08-live-diagnostics/05_completion.md) and [independent review](../f08-live-diagnostics/review-report.md) define the composed acceptance. Native authentication diagnostics are implemented; external provider authorization, sending/reading transports, workers and the live pilot remain separate pending stages.
