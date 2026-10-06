# f05-evidence-billing-growth requirements testability — A2
Spec revision: sha256:ac249fab21a4dbf9c35ffd81daa5bd5874df3aa431b4cdedbfa28ea2adf66d0c
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
| AC-f05-evidence-billing-growth-001 | `scenarios.md` SC-f05-evidence-billing-growth-001 Scenario Outline / Examples; legacy `AC-A1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-002 | `scenarios.md` SC-f05-evidence-billing-growth-002 Scenario Outline / Examples; legacy `AC-A2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-003 | `scenarios.md` SC-f05-evidence-billing-growth-003 Scenario Outline / Examples; legacy `AC-A3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-004 | `scenarios.md` SC-f05-evidence-billing-growth-004 Scenario Outline / Examples; legacy `AC-A4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-005 | `scenarios.md` SC-f05-evidence-billing-growth-005 Scenario Outline / Examples; legacy `AC-A5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-006 | `scenarios.md` SC-f05-evidence-billing-growth-006 Scenario Outline / Examples; legacy `AC-A6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-007 | `scenarios.md` SC-f05-evidence-billing-growth-007 Scenario Outline / Examples; legacy `AC-B1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-008 | `scenarios.md` SC-f05-evidence-billing-growth-008 Scenario Outline / Examples; legacy `AC-B2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-009 | `scenarios.md` SC-f05-evidence-billing-growth-009 Scenario Outline / Examples; legacy `AC-B3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-010 | `scenarios.md` SC-f05-evidence-billing-growth-010 Scenario Outline / Examples; legacy `AC-B4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-011 | `scenarios.md` SC-f05-evidence-billing-growth-011 Scenario Outline / Examples; legacy `AC-B5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f05-evidence-billing-growth-012 | `scenarios.md` SC-f05-evidence-billing-growth-012 Scenario Outline / Examples; legacy `AC-B6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |

## A1 gap resolution

The58previous composite BDD gaps across six contours are addressed by new derived scenarios, not relabelled as preexisting coverage. Per-contour closures:

| Prior gap | Criterion | Missing condition identified in A1 | New artifact |
| --- | --- | --- | --- |
| G01 | AC-f05-evidence-billing-growth-001 | SC-US-009-2 omits free3/team10 resource concurrency, expiry retention and immutable TEST100RUB/30days config. | `scenarios.md` SC-f05-evidence-billing-growth-001; complete original assertions and concrete Examples authored |
| G02 | AC-f05-evidence-billing-growth-002 | SC-US-011/013 omit30day cookie boundary and post-intent deactivation frozen-snapshot case. | `scenarios.md` SC-f05-evidence-billing-growth-002; complete original assertions and concrete Examples authored |
| G03 | AC-f05-evidence-billing-growth-003 | SC-US-009-1/2 omit changed-payload409, parallel checkout and crash-before-binding recovery. | `scenarios.md` SC-f05-evidence-billing-growth-003; complete original assertions and concrete Examples authored |
| G04 | AC-f05-evidence-billing-growth-004 | SC-US-009-3/4 omit operator/body bounds and fetch-outside-lock/version race cases. | `scenarios.md` SC-f05-evidence-billing-growth-004; complete original assertions and concrete Examples authored |
| G05 | AC-f05-evidence-billing-growth-005 | SC-US-009/011/013 omit paidAt fixed30day expiry and delayed success/cancel barrier. | `scenarios.md` SC-f05-evidence-billing-growth-005; complete original assertions and concrete Examples authored |
| G06 | AC-f05-evidence-billing-growth-006 | Named build/donor/source/mutation/full-regression BDD absent; review-a.md A6 retains historical procedure evidence. | `scenarios.md` SC-f05-evidence-billing-growth-006; complete original assertions and concrete Examples authored |
| G07 | AC-f05-evidence-billing-growth-007 | SC-US-008-1/2 omit finite/direction/window input and no URL-fetch assertions. | `scenarios.md` SC-f05-evidence-billing-growth-007; complete original assertions and concrete Examples authored |
| G08 | AC-f05-evidence-billing-growth-008 | SC-US-008-3 omits declared direction and both-denominator requirement as named cases. | `scenarios.md` SC-f05-evidence-billing-growth-008; complete original assertions and concrete Examples authored |
| G09 | AC-f05-evidence-billing-growth-009 | SC-US-010-1/3 omit concurrent share/idempotency-payload and complete public whitelist assertions. | `scenarios.md` SC-f05-evidence-billing-growth-009; complete original assertions and concrete Examples authored |
| G10 | AC-f05-evidence-billing-growth-010 | SC-US-012 omits revoked token, historical stale label and no-active-content cases. | `scenarios.md` SC-f05-evidence-billing-growth-010; complete original assertions and concrete Examples authored |
| G11 | AC-f05-evidence-billing-growth-011 | SC-US-013/010 omit bounded pagination and explicit copy/link event idempotence. | `scenarios.md` SC-f05-evidence-billing-growth-011; complete original assertions and concrete Examples authored |
| G12 | AC-f05-evidence-billing-growth-012 | Named concurrent share/badge mutation/full regression gates BDD absent; review-b-r1.md retains historical procedure evidence. | `scenarios.md` SC-f05-evidence-billing-growth-012; complete original assertions and concrete Examples authored |

## Preservation and evidence limits

Previous index: `history/validation-report.pre-a2-bdd.md`, sha256:2d03e764c046ca3ff84d000f5b6c58500fe1d5418ec10f4bc2e9ab5553e84cec. Original pre-format report and role-path migration remain preserved there and in history. Specification/pseudocode/architecture/refinement remain byte-identical to inspected source. Completion prior bytes are archived at `history/05_completion.pre-contract-coverage.md`; the active completion index names real executable witnesses plus exact limits. A populated checker cell is not execution evidence. No app runtime/build/browser/test/network occurred in this document repair. Fresh independent Astra must assess the mappings before integration; new expanded code keeps all approved full gates.

## Input digests

- `01_specification.md`: sha256:ac249fab21a4dbf9c35ffd81daa5bd5874df3aa431b4cdedbfa28ea2adf66d0c
- `scenarios.md`: sha256:4053451438df3a42ad372c2c0220d0ad08a3f32c911006be3d319c03fdb1788f
