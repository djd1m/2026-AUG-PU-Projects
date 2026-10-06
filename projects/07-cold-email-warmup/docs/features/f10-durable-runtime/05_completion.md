# F10 — будущая приёмка и передача

PLAN / AUTO, f10-plan-a2. Candidate originates at partial commit7c8f7334e2950fe9326034e0184ba4f3b7d5ef4e. All tests in the table are FUTURE implementation assignments, not executed files/results or a PhaseIII pass. No F10 runtime, independent validation or review has been accepted by this document.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-f10-durable-runtime-001 | tests/f10-runtime-integration.test.ts | durable runtime drains and recovers without replaying uncertain sends |
| AC-f10-durable-runtime-002 | tests/f10-runtime-integration.test.ts | fair polling serves thirty active mailboxes and preserves activity intent |
| AC-f10-durable-runtime-003 | tests/f10-runtime-protocol.test.ts | suspended transport owners retain physical slots across runtime restart |
| AC-f10-durable-runtime-004 | tests/f10-runtime-integration.test.ts | paced dispatch preserves current day quota and every stop fence |
| AC-f10-durable-runtime-005 | tests/f10-runtime-integration.test.ts | automatic pool allocation skips pair conflicts and remains idempotent |
| AC-f10-durable-runtime-006 | tests/f10-runtime-integration.test.ts | overload backoff preserves due age and independent tenant progress |
| AC-f10-durable-runtime-007 | tests/expanded-mvp-04.test.ts | persistent fair workers serve every eligible mailbox |

Parent binding: AC-expanded-mvp-004 → tests/expanded-mvp-04.test.ts → `persistent fair workers serve every eligible mailbox`. Coordinator updates parent evidence only after implementation and independent acceptance. SC-F10-001..007 in01 and04 map respectively to these seven rows. Composite AC007 requires all supporting protocol/PG/mutation/config/regression evidence, not just one test title.

## Mandatory gates and evidence

PLAN: run original installed script on full project with exact role-map sources:

```sh
bash /root/.npm-global/lib/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh /tmp/n7-f10-plan-20261006/projects/07-cold-email-warmup --traceability --role-map-source /tmp/n7-f10-plan-20261006/.claude/commands/feature.md --project-role-map-source /tmp/n7-f10-plan-20261006/.claude/skills/sparc-prd-mini/SKILL.md
```

Preserve actual stdout/stderr and exit in /tmp/n7-f10-plan-a2/phase1.txt and phase1.exit. Only0 advances;1 named gap returns for repair,2 is not-established. Receipt binds exact source and spec digest. This document does not predeclare the result.

VALIDATE: fresh independent requirements-validator owns validation-report.md, INVEST/SMART/BDD and exact Spec revision plus Criterion scenarios table; original --report-revision --criterion-scenarios must exit0. Planner cannot issue this verdict. Explicit review questions in04 must be resolved before dependent implementation; a structural gate cannot decide them.

IMPLEMENT: repeat substantive route against actual files; coordinator freezes canon/spec/source and ownership, accepts substantive worker receipts. Run npm run typecheck, npm run lint, npm run build, npm test and full real-PG integration/protocol/fault/concurrency/canary sets. Existing npm integration glob does not include every parent/protocol filename: explicitly execute tests/expanded-mvp-04.test.ts and f10-runtime-protocol.test.ts using existing tsx test harness, and all affected F09/F07 regressions. Required mutation evidence is in04. Every measurement ties to source/build/environment and exact command/exit, with resource sampling and workload, not a remembered estimate.

Runtime database is explicitly disposable DATABASE_NAME=n7f09_a1 (or coordinator-reserved isolated equivalent); never default database truncate. Before any container start run repository port-conflict check for N7; DB has no published port, runtime network is isolated, fixture construction cannot reach external providers. No installs required by this plan. E2E preflight in PLAN is not_applicable (docs only); read-only companion readiness immediately precedes actual E2E. Browser not_applicable unless UI changes, then Docker Playwright1.63.0 and project journeys apply.

At end IMPLEMENT, original --completion checks existing files/titles; all F10 rows require real witnesses. Full-project inherited/future gaps remain explicit and cannot be reported as full pass. Fresh independent REVIEW receives exact spec plus current validation and runtime evidence, provides AC-by-AC conformance and source-bound verdict; check-review-contract requires0 and all blocker/high findings closed. No self-review acceptance.

## Deployment Plan

Pre-deployment checklist, FUTURE and unchecked: mandatory tests/gates pass; security review accepted; runtime keys/permissions scoped; docs reconciled; rollback/recovery rehearsed; explicit operator deployment and external provider authorization exists. F10 PLAN grants none of these permissions.

Deployment Sequence:1 integrate additive migration and runtime revision after local acceptance, retain old revision/config;2 start explicit worker profile in disabled/local_test mode and verify bounded tick/loop/readiness/drain locally;3 only a separately authorized later live step enables scoped F09 grants and provider/account access, with cadence and failure observations. Existing CI/CD ordering remains test → build → authorized deploy; no fictional deploy.sh or deployment action is executed here. Package/config/compose integration is coordinator-owned.

Rollback Procedure: stop admission, revoke applicable authority under FIRST global lock, abort/drain active children, preserve submitted/unknown reservations and UID cursor/stop effects. Restore compatible prior app revision while keeping additive due/receipt metadata; never delete evidence or requeue unknown. Exact child exit or sealed socket close is required to release physical slots; lost proof means cleanup_blocked until exact previous isolated-container termination is established through an accepted privileged process. Restart/expiry/PID alone is insufficient. Rollback rehearsal covers graceful drain, DB loss during cleanup and orphan safety; availability limitation is reported honestly.

## Monitoring and Logging

| Metric | Trigger / response | Source |
|---|---|---|
| Complete poll age |≥60s denies send; healthy completion gap>30s records miss |наша БД |
| Eligible due round | >60s records starvation risk per tenant/mailbox |наша БД |
| Pool allocation round | >300s with legal peers/budget records miss |наша БД |
| Physical slots / child count | >2SMTP/4IMAP/1protocol-mailbox or>6children is failure |наш журнал |
| cleanup_blocked / unknown_delivery | exact counts and retained state; operator reconciliation |наша БД |
| SMTP pacing / UTC budget | <60s start gap or quota breach is failure |наша БД |
| Backoff / original due age | retain blocked/overdue outcomes, no reset on restart |наша БД |
| CPU/RAM/lock wait | measured workload receipt, no assumed capacity |наш журнал |

Use INFO/WARN/ERROR typed events and existing retention/aggregation; metadata only, no bodies/credentials/provider transcript. No PagerDuty/Slack/Email destination is installed or authorized by F10; external alerting is not a fabricated acceptance gate. F14 owns full measured capacity/SLO reports and F15 live7day window.

## Handoff

Development: exact commit/spec SHA, unchanged01/02 hashes, five role paths, current source contracts, source/ownership map before implementation and named responsible coordinator. QA: actual fixture/PG namespace, literal titles, fault setup, mutation receipts, canary scan and preflight. Operations: modes default disabled, active intent/lease semantics, explicit grants, conditional cadence, kill/drain/unknown recovery and physical cleanup proof limitations. No secrets in any handoff.

Profile compact-quality-first-v2; requested Astra/high; actual model/effort/token/cost null (host_not_exposed). Coordinator owns docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/. A1 timeout receipt remains failed and immutable; A2 gets separate receipt and actual timing. Completed PLAN is distinct from independent VALIDATE, runtime acceptance and delivery. Next executor is the coordinator-assigned fresh validator; any finding returns to a new bounded correction without rewriting historical evidence.

## Remaining product boundaries

Inherited F06 AC-f06-cabinet-e2e-delivery-011 remains UNVERIFIABLE as executable documentary witness and012 remains unmet PR delivery (historical403); empty original rows are not replaced by unrelated F10 tests. F11–F15 future witnesses remain pending. TEST billing unchanged; no external SMTP/IMAP/LLM, charges, deploy or live acceptance is performed. Full expanded-MVP success cannot be inferred from a local F10 fixture pass.
