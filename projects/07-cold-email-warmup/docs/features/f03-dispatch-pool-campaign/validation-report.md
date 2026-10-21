# f03-dispatch-pool-campaign requirements testability — A2
Spec revision: sha256:6f88ae14deba475af0edfb89c37ec452d34c85df44b9e5c8aefeed802b36566f
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
| AC-f03-dispatch-pool-campaign-001 | `scenarios.md` SC-f03-dispatch-pool-campaign-001 Scenario Outline / Examples; legacy `AC-A1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-002 | `scenarios.md` SC-f03-dispatch-pool-campaign-002 Scenario Outline / Examples; legacy `AC-A2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-003 | `scenarios.md` SC-f03-dispatch-pool-campaign-003 Scenario Outline / Examples; legacy `AC-A3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-004 | `scenarios.md` SC-f03-dispatch-pool-campaign-004 Scenario Outline / Examples; legacy `AC-A4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-005 | `scenarios.md` SC-f03-dispatch-pool-campaign-005 Scenario Outline / Examples; legacy `AC-A5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-006 | `scenarios.md` SC-f03-dispatch-pool-campaign-006 Scenario Outline / Examples; legacy `AC-A6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-007 | `scenarios.md` SC-f03-dispatch-pool-campaign-007 Scenario Outline / Examples; legacy `AC-B1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-008 | `scenarios.md` SC-f03-dispatch-pool-campaign-008 Scenario Outline / Examples; legacy `AC-B2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-009 | `scenarios.md` SC-f03-dispatch-pool-campaign-009 Scenario Outline / Examples; legacy `AC-B3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-010 | `scenarios.md` SC-f03-dispatch-pool-campaign-010 Scenario Outline / Examples; legacy `AC-B4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-011 | `scenarios.md` SC-f03-dispatch-pool-campaign-011 Scenario Outline / Examples; legacy `AC-B5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f03-dispatch-pool-campaign-012 | `scenarios.md` SC-f03-dispatch-pool-campaign-012 Scenario Outline / Examples; legacy `AC-B6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |

## A1 gap resolution

The58previous composite BDD gaps across six contours are addressed by new derived scenarios, not relabelled as preexisting coverage. Per-contour closures:

| Prior gap | Criterion | Missing condition identified in A1 | New artifact |
| --- | --- | --- | --- |
| G01 | AC-f03-dispatch-pool-campaign-001 | SC-US-005-2/4 omit max5 steps/max100 recipients/delay24h and durable edit/start/pause API state. | `scenarios.md` SC-f03-dispatch-pool-campaign-001; complete original assertions and concrete Examples authored |
| G02 | AC-f03-dispatch-pool-campaign-002 | SC-US-003-1/2 omit durable job uniqueness and encrypted recipient/keyed hash storage. | `scenarios.md` SC-f03-dispatch-pool-campaign-002; complete original assertions and concrete Examples authored |
| G03 | AC-f03-dispatch-pool-campaign-003 | SC-US-004-1..4 omit freshly polled eligibility as a pool selection assertion. | `scenarios.md` SC-f03-dispatch-pool-campaign-003; complete original assertions and concrete Examples authored |
| G04 | AC-f03-dispatch-pool-campaign-004 | SC-US-005-1/3 omit45s lease recovery, default10/provider limit and equal-clock sender rotation. | `scenarios.md` SC-f03-dispatch-pool-campaign-004; complete original assertions and concrete Examples authored |
| G05 | AC-f03-dispatch-pool-campaign-005 | SC-US-006-5 omits prohibition of public fabricated-poll endpoints. | `scenarios.md` SC-f03-dispatch-pool-campaign-005; complete original assertions and concrete Examples authored |
| G06 | AC-f03-dispatch-pool-campaign-006 | Named mutation/build/full F01/F02 regression BDD absent; acceptance.md F03 acceptance retains historical gates. | `scenarios.md` SC-f03-dispatch-pool-campaign-006; complete original assertions and concrete Examples authored |
| G07 | AC-f03-dispatch-pool-campaign-007 | SC-US-003-4/006-5/005-5 omit lease-owner/operator-gate checks as individually named cases. | `scenarios.md` SC-f03-dispatch-pool-campaign-007; complete original assertions and concrete Examples authored |
| G09 | AC-f03-dispatch-pool-campaign-009 | SC-US-004-3/007-5 omit durable Message-ID matching and SMTP submitted-versus-inbox wording. | `scenarios.md` SC-f03-dispatch-pool-campaign-009; complete original assertions and concrete Examples authored |
| G11 | AC-f03-dispatch-pool-campaign-011 | SC-US-005-5/6/006-5 omit exact lease expiry and operator-only tick authority. | `scenarios.md` SC-f03-dispatch-pool-campaign-011; complete original assertions and concrete Examples authored |
| G12 | AC-f03-dispatch-pool-campaign-012 | Named final-guard mutation/build/fresh-review BDD absent; acceptance.md and review-b-r1.md retain procedure evidence. | `scenarios.md` SC-f03-dispatch-pool-campaign-012; complete original assertions and concrete Examples authored |

## Preservation and evidence limits

Previous index: `history/validation-report.pre-a2-bdd.md`, sha256:5594feba6a9e0a1aeb5c12432926255742c50c93e046255dc1cde98bf796af9d. Original pre-format report and role-path migration remain preserved there and in history. Specification/pseudocode/architecture/refinement remain byte-identical to inspected source. Completion prior bytes are archived at `history/05_completion.pre-contract-coverage.md`; the active completion index names real executable witnesses plus exact limits. A populated checker cell is not execution evidence. No app runtime/build/browser/test/network occurred in this document repair. Fresh independent Astra must assess the mappings before integration; new expanded code keeps all approved full gates.

## Input digests

- `01_specification.md`: sha256:6f88ae14deba475af0edfb89c37ec452d34c85df44b9e5c8aefeed802b36566f
- `scenarios.md`: sha256:4a4f3f8aba1d7cd201b053426c63695e88f8913466ac0f25a59afc203a5bc26e
