# f06-cabinet-e2e-delivery requirements testability — A2
Spec revision: sha256:044d738715cc33c29c453805648b209176ecdcf12c8c8c7320b2e7cd3265e1ce
Date: 2026-10-06
Inspected source revision: 40ff7c776a1bdca720db42043e1a2be823b85de0
Verdict: CAVEATS — documentation testable; fresh independent semantic review pending; runtime/delivery claims unchanged.

## Analysis and score

INVEST34/50: Independent0 (inherited dependency graph), Negotiable0 (fixed accepted safety clauses), Valuable10 (concrete tenant/user benefit), Estimable8 and Small8 (bounded contours), Testable8 (quoted original AC in scenarios.md). SMART30/30: Specific6 (explicit conditions), Measurable8 (numeric/boolean/status/state assertions), Achievable6 (local fixtures/procedures), Relevant5 (same accepted scope), Time-bound5 (explicit quota/session/poll/retry/performance/execution boundaries). Quality20/20: Traceability10 (table below), Completeness10 (all original clauses quoted and scenario assertions, success/error/boundary Examples). Base84/100; security bonus5 for explicit auth/input/tenant/encryption/operator boundaries =89/100. This is a reasoned documentation score, not measured runtime quality or cost. Growth bonus not rescored: unchanged inherited canonical growth scope, no promoted seed obligation.

Inherited security scenarios retain auth bypass, SQL/XSS/input, cross-tenant and applicable rate-limit cases. Derived Examples add exact missing composite conditions; no generic template thresholds replace the project values.

Blocking floor: Testable8/Completeness10 are anchored to all exact acceptance paragraph quotations and assertions in `scenarios.md` under the named headings below. Traceability10 is anchored to `validation-report.md` Criterion scenarios. No criterion without an AC or named scenario receives a nonzero score. The fixed values/dependencies are disclosed caveats, not new owner decisions.

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |
| AC-f06-cabinet-e2e-delivery-001 | `scenarios.md` SC-f06-cabinet-e2e-delivery-001 Scenario Outline / Examples; legacy `AC-A1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-002 | `scenarios.md` SC-f06-cabinet-e2e-delivery-002 Scenario Outline / Examples; legacy `AC-A2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-003 | `scenarios.md` SC-f06-cabinet-e2e-delivery-003 Scenario Outline / Examples; legacy `AC-A3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-004 | `scenarios.md` SC-f06-cabinet-e2e-delivery-004 Scenario Outline / Examples; legacy `AC-A4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-005 | `scenarios.md` SC-f06-cabinet-e2e-delivery-005 Scenario Outline / Examples; legacy `AC-A5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-006 | `scenarios.md` SC-f06-cabinet-e2e-delivery-006 Scenario Outline / Examples; legacy `AC-A6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-007 | `scenarios.md` SC-f06-cabinet-e2e-delivery-007 Scenario Outline / Examples; legacy `AC-B1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-008 | `scenarios.md` SC-f06-cabinet-e2e-delivery-008 Scenario Outline / Examples; legacy `AC-B2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-009 | `scenarios.md` SC-f06-cabinet-e2e-delivery-009 Scenario Outline / Examples; legacy `AC-B3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-010 | `scenarios.md` SC-f06-cabinet-e2e-delivery-010 Scenario Outline / Examples; legacy `AC-B4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-011 | `scenarios.md` SC-f06-cabinet-e2e-delivery-011 Scenario Outline / Examples; legacy `AC-B5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f06-cabinet-e2e-delivery-012 | `scenarios.md` SC-f06-cabinet-e2e-delivery-012 Scenario Outline / Examples; legacy `AC-B6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |

## A1 gap resolution

The58previous composite BDD gaps across six contours are addressed by new derived scenarios, not relabelled as preexisting coverage. Per-contour closures:

| Prior gap | Criterion | Missing condition identified in A1 | New artifact |
| --- | --- | --- | --- |
| G01 | AC-f06-cabinet-e2e-delivery-001 | Auth SC-US-001 lacks cabinet navigation, request epoch/abort, passive-tab and DOM clearing BDD; review-a-r1.md exact trigger supplies historical verification. | `scenarios.md` SC-f06-cabinet-e2e-delivery-001; complete original assertions and concrete Examples authored |
| G02 | AC-f06-cabinet-e2e-delivery-002 | Mailbox/consent scenarios lack browser forms/secret clearing/reload and explicit labels; review-b.md B2 supplies historical journey. | `scenarios.md` SC-f06-cabinet-e2e-delivery-002; complete original assertions and concrete Examples authored |
| G03 | AC-f06-cabinet-e2e-delivery-003 | Dispatch BDD lacks browser import/form, actionable blocked state and reconsent journey; review-b.md B2 supplies historical journey. | `scenarios.md` SC-f06-cabinet-e2e-delivery-003; complete original assertions and concrete Examples authored |
| G04 | AC-f06-cabinet-e2e-delivery-004 | Evidence BDD lacks browser input/compare/copy/revoke and textContent assertions; review-b.md B2 supplies historical journey. | `scenarios.md` SC-f06-cabinet-e2e-delivery-004; complete original assertions and concrete Examples authored |
| G05 | AC-f06-cabinet-e2e-delivery-005 | Billing BDD lacks browser stable-key retry/clipboard fallback/status refresh; review-b.md B2 supplies historical journey. | `scenarios.md` SC-f06-cabinet-e2e-delivery-005; complete original assertions and concrete Examples authored |
| G06 | AC-f06-cabinet-e2e-delivery-006 | Named UI CSP/session-mutation/build/canary procedure BDD absent; review-a-r1.md and review-a.md A6 retain historical checks. | `scenarios.md` SC-f06-cabinet-e2e-delivery-006; complete original assertions and concrete Examples authored |
| G07 | AC-f06-cabinet-e2e-delivery-007 | Named three-engine viewport/keyboard/reduced-motion/preflight/cleanup BDD absent; review-b.md B1 and review-b-r3.md final closure retain exact procedures. | `scenarios.md` SC-f06-cabinet-e2e-delivery-007; complete original assertions and concrete Examples authored |
| G08 | AC-f06-cabinet-e2e-delivery-008 | Domain BDD lacks the whole real-click/reload/operator fixture journey; review-b.md B2 and copied harness procedures retain historical evidence. | `scenarios.md` SC-f06-cabinet-e2e-delivery-008; complete original assertions and concrete Examples authored |
| G09 | AC-f06-cabinet-e2e-delivery-009 | Tenant BDD lacks delayed-response epoch/mobile loading/offline and trace-secret assertions; review-b.md B3 supplies historical verification. | `scenarios.md` SC-f06-cabinet-e2e-delivery-009; complete original assertions and concrete Examples authored |
| G10 | AC-f06-cabinet-e2e-delivery-010 | Named100samples/concurrency10/CPU2 p95 and source-bound operations BDD absent; review-b.md B4 and review-b-r3.md supply historical measurements. | `scenarios.md` SC-f06-cabinet-e2e-delivery-010; complete original assertions and concrete Examples authored |
| G11 | AC-f06-cabinet-e2e-delivery-011 | Named documentation/toolkit/12AC telemetry procedure BDD absent; ../../Completion.md Документы, воспроизведение и поставка retains delivery evidence. | `scenarios.md` SC-f06-cabinet-e2e-delivery-011; complete original assertions and concrete Examples authored |
| G12 | AC-f06-cabinet-e2e-delivery-012 | Named commit/push/PR target/deployment checkpoint procedure BDD absent; ../../Completion.md Внешний blocker и готовая передача records PR403 blocked. | `scenarios.md` SC-f06-cabinet-e2e-delivery-012; complete original assertions and concrete Examples authored |

## Preservation and evidence limits

Previous index: `history/validation-report.pre-a2-bdd.md`, sha256:11810a7376e88f48a11e010f9319f1444cf4eb4ebb2e8530c9ae01826eeae4a2. Original pre-format report and role-path migration remain preserved there and in history. Specification/pseudocode/architecture/refinement remain byte-identical to inspected source. Completion prior bytes are archived at `history/05_completion.pre-contract-coverage.md`; the active completion index names real executable witnesses plus exact limits. A populated checker cell is not execution evidence. No app runtime/build/browser/test/network occurred in this document repair. Fresh independent Astra must assess the mappings before integration; new expanded code keeps all approved full gates.

## Input digests

- `01_specification.md`: sha256:044d738715cc33c29c453805648b209176ecdcf12c8c8c7320b2e7cd3265e1ce
- `scenarios.md`: sha256:4d3866b1804ca97d5301dd1edfbc5cad66e3c26aafa5f68f0896a027d773d08b

F06 B6 remains not met: GitHub403 PR creation, no PR and no newly authorized release. Full documentation testability does not remove this delivery blocker.
