# F09 — completion plan and future acceptance bindings

PLAN only, source801b1102972f76e67f17ce7f7dada7cc79de5ec7. No implementation, PhaseII verdict or runtime PASS is asserted. The following files/titles are FUTURE PhaseIII targets and must physically exist with passing assertions before --completion may pass.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-f09-live-transport-001 | tests/f09-live-transport.test.ts | transport grants are separate scoped expiring authority |
| AC-f09-live-transport-002 | tests/f09-live-transport.test.ts | final live submission preserves all eligibility fences |
| AC-f09-live-transport-003 | tests/f09-live-protocol.test.ts | pinned SMTP accepts only the final DATA completion |
| AC-f09-live-transport-004 | tests/f09-live-protocol.test.ts | post DATA uncertainty never retries or releases quota |
| AC-f09-live-transport-005 | tests/f09-live-protocol.test.ts | IMAP proves bounded read only UID range coverage |
| AC-f09-live-transport-006 | tests/f09-live-transport.test.ts | UID reset crash and replay preserve atomic stop effects |
| AC-f09-live-transport-007 | tests/f09-live-protocol.test.ts | hostile framing and cancellation release bounded resources |
| AC-f09-live-transport-008 | tests/f09-live-protocol.test.ts | transport secrets and fixture authority remain isolated |
| AC-f09-live-transport-009 | tests/expanded-mvp-03.test.ts | ambiguous SMTP and UID reset preserve recovery safety |

Parent binding: AC-expanded-mvp-003 → tests/expanded-mvp-03.test.ts → `ambiguous SMTP and UID reset preserve recovery safety`. Existing expanded parent table must be reconciled by coordinator after runtime acceptance, outside planner ownership.

## Mandatory gates and handoff

PLAN: original installed check-pipeline-gaps.sh full PROJECT --traceability with root feature.md and sparc-prd-mini role-map sources; only exit0 advances. Preserve stdout/exit and spec SHA in planner receipt. Independent VALIDATE owns validation-report.md, INVEST/SMART/BDD and exact revision/scenario gate. Planner cannot issue own PhaseII verdict. Implementation freezes source/spec and ownership; original --completion must verify actual test files/titles. Fresh independent review receives specification+validation and AC witnesses; --review contract requires current spec SHA. Full tests/typecheck/lint/build, PG/TLS/races/crash/canaries/mutations from04 are mandatory. E2E preflight during PLAN: not_applicable, documentation-only; actual runtime preflight belongs immediately before E2E.

Next responsible executor: coordinator assigns independent validator immediately after this coherent PLAN receipt, then bounded Sol implementation and fresh Astra review. Requested model names are intent; actual native model/effort/token/cost are null with host_not_exposed until host metadata exists. Telemetry owner is coordinator at docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/. No root/shared toolkit changes.

## Deployment Plan

Pre-deployment checklist (future, all unchecked): [ ] mandatory checks passing on exact source; [ ] security review complete; [ ] accepted docs reconciled; [ ] rollback/recovery tested; [ ] explicit external authorization. F09 local acceptance does not deploy or send externally.

Deployment Sequence:1 validate candidate and migration13→14 against real local PG;2 start disabled configuration and inspect zero transport grants, test local fixtures;3 only separately authorized later pilot supplies scoped operator grants and endpoints. No deploy.sh invocation is authorized here. Existing CI/CD conceptual order test → build → deploy; run npm test, npm run lint, npm run build and package typecheck command during implementation; deploy remains a separate authorization gate.

Rollback Procedure: disable transport process modes, revoke grants under FIRST lock, abort/drain bounded workers, preserve submitting/unknown and reply cursor/effects. Revert runtime after compatibility check; additive grant/receipt history is retained, never destructively rolled back to make sends retryable. Reconcile unknown manually before any future action.

## Monitoring and Logging

Use existing typed operational logs and DB states: unknown_delivery, grant denied/expired, paused/incomplete poll, slot admission and cleanup counts, attempt durations. No raw peer lines, credentials, headers/body. Follow existing retention, no new alert integrations or sends. Template operational thresholds retained as future examples only: Response time p99 >500ms/PagerDuty, Error rate >1%/Slack, CPU usage >80%/Email; these destinations are not installed, authorized or F09 acceptance claims. F14 owns measured transport/arrival SLO and approved operational monitoring.

## Handoff

Development: exact commit/spec digest, paths, source contracts and remaining F10 integration obligations. QA: local TLS/PG fixtures, Node22.20.0, no live accounts, required failures and source-bound receipts. Operations: disabled defaults, grant publish/revoke/expiry runbook, unknown recovery and rollback; production access and F15 live gate remain separately authorized. Parent continues autonomously through authorized package; no repeated owner checkpoint is needed for unchanged scope.
