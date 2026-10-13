# f04-reply-suppression requirements testability — A2
Spec revision: sha256:73a4dc62c00e08718bde936bd6fede36bd1bae07c48cf9c963d3c56a552237a6
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
| AC-f04-reply-suppression-001 | `scenarios.md` SC-f04-reply-suppression-001 Scenario Outline / Examples; legacy `AC-A1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-002 | `scenarios.md` SC-f04-reply-suppression-002 Scenario Outline / Examples; legacy `AC-A2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-003 | `scenarios.md` SC-f04-reply-suppression-003 Scenario Outline / Examples; legacy `AC-A3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-004 | `scenarios.md` SC-f04-reply-suppression-004 Scenario Outline / Examples; legacy `AC-A4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-005 | `scenarios.md` SC-f04-reply-suppression-005 Scenario Outline / Examples; legacy `AC-A5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-006 | `scenarios.md` SC-f04-reply-suppression-006 Scenario Outline / Examples; legacy `AC-A6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-007 | `scenarios.md` SC-f04-reply-suppression-007 Scenario Outline / Examples; legacy `AC-B1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-008 | `scenarios.md` SC-f04-reply-suppression-008 Scenario Outline / Examples; legacy `AC-B2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-009 | `scenarios.md` SC-f04-reply-suppression-009 Scenario Outline / Examples; legacy `AC-B3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-010 | `scenarios.md` SC-f04-reply-suppression-010 Scenario Outline / Examples; legacy `AC-B4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-011 | `scenarios.md` SC-f04-reply-suppression-011 Scenario Outline / Examples; legacy `AC-B5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f04-reply-suppression-012 | `scenarios.md` SC-f04-reply-suppression-012 Scenario Outline / Examples; legacy `AC-B6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |

## A1 gap resolution

The58previous composite BDD gaps across six contours are addressed by new derived scenarios, not relabelled as preexisting coverage. Per-contour closures:

| Prior gap | Criterion | Missing condition identified in A1 | New artifact |
| --- | --- | --- | --- |
| G01 | AC-f04-reply-suppression-001 | SC-US-006-4 omits bounded header/page-size rejection cases. | `scenarios.md` SC-f04-reply-suppression-001; complete original assertions and concrete Examples authored |
| G02 | AC-f04-reply-suppression-002 | SC-US-006-3/4 omit concurrent page reorder and atomic counter ledger as separate BDD. | `scenarios.md` SC-f04-reply-suppression-002; complete original assertions and concrete Examples authored |
| G03 | AC-f04-reply-suppression-003 | SC-US-006-2/3/5 omit sparse/expunged coverage and second-reset stale-worker case. | `scenarios.md` SC-f04-reply-suppression-003; complete original assertions and concrete Examples authored |
| G04 | AC-f04-reply-suppression-004 | SC-US-006-3/5 omit explicit retry budget-reset preserving run/H/cursor. | `scenarios.md` SC-f04-reply-suppression-004; complete original assertions and concrete Examples authored |
| G05 | AC-f04-reply-suppression-005 | SC-US-006-3/003-4/5 omit duplicate concurrent page and reset-during-tail cases. | `scenarios.md` SC-f04-reply-suppression-005; complete original assertions and concrete Examples authored |
| G06 | AC-f04-reply-suppression-006 | Named migration/build/mutation/canary/store-interface gates BDD absent; acceptance-a.md retains historical procedure. | `scenarios.md` SC-f04-reply-suppression-006; complete original assertions and concrete Examples authored |
| G07 | AC-f04-reply-suppression-007 | SC-US-007-4 omits expired capability and exact30day/job binding cases. | `scenarios.md` SC-f04-reply-suppression-007; complete original assertions and concrete Examples authored |
| G08 | AC-f04-reply-suppression-008 | SC-US-007-2 omits pool-recipient global withdrawal and tenant-wide campaign suppression cases. | `scenarios.md` SC-f04-reply-suppression-008; complete original assertions and concrete Examples authored |
| G09 | AC-f04-reply-suppression-009 | SC-US-007-3/4 omit operator-event dedup and malformed/foreign complaint cases. | `scenarios.md` SC-f04-reply-suppression-009; complete original assertions and concrete Examples authored |
| G10 | AC-f04-reply-suppression-010 | SC-US-007-4 omits31st/concurrent rate limit and no-store/referrer/token-log conditions. | `scenarios.md` SC-f04-reply-suppression-010; complete original assertions and concrete Examples authored |
| G11 | AC-f04-reply-suppression-011 | SC-US-006-2/5 omit30s cadence/operation timeout and disabled/local-source authority cases. | `scenarios.md` SC-f04-reply-suppression-011; complete original assertions and concrete Examples authored |
| G12 | AC-f04-reply-suppression-012 | Named local source→poll→reply plus full regression/mutation/source receipt gates BDD absent; acceptance.md and review-b-r1.md retain procedure evidence. | `scenarios.md` SC-f04-reply-suppression-012; complete original assertions and concrete Examples authored |

## Preservation and evidence limits

Previous index: `history/validation-report.pre-a2-bdd.md`, sha256:8dbc8955662db6167bdd6975acf4088546fe62b7e8061286f8dd050b632cf773. Original pre-format report and role-path migration remain preserved there and in history. Specification/pseudocode/architecture/refinement remain byte-identical to inspected source. Completion prior bytes are archived at `history/05_completion.pre-contract-coverage.md`; the active completion index names real executable witnesses plus exact limits. A populated checker cell is not execution evidence. No app runtime/build/browser/test/network occurred in this document repair. Fresh independent Astra must assess the mappings before integration; new expanded code keeps all approved full gates.

## Input digests

- `01_specification.md`: sha256:73a4dc62c00e08718bde936bd6fede36bd1bae07c48cf9c963d3c56a552237a6
- `scenarios.md`: sha256:fd9ca238af7b2493f584d6e8e03b67f27bd149d4559ad698c24be0772a093f8f
