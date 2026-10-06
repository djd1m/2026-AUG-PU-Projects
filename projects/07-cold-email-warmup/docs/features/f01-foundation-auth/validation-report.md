# f01-foundation-auth requirements testability — A2
Spec revision: sha256:0a62915da4cad8837bdd4c6e3387fe11453b33386537d124bb543fe3cf4bbfca
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
| AC-f01-foundation-auth-001 | `scenarios.md` SC-f01-foundation-auth-001 Scenario Outline / Examples; legacy `AC-F01-1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f01-foundation-auth-002 | `scenarios.md` SC-f01-foundation-auth-002 Scenario Outline / Examples; legacy `AC-F01-2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f01-foundation-auth-003 | `scenarios.md` SC-f01-foundation-auth-003 Scenario Outline / Examples; legacy `AC-F01-3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f01-foundation-auth-004 | `scenarios.md` SC-f01-foundation-auth-004 Scenario Outline / Examples; legacy `AC-F01-4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f01-foundation-auth-005 | `scenarios.md` SC-f01-foundation-auth-005 Scenario Outline / Examples; legacy `AC-F01-5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f01-foundation-auth-006 | `scenarios.md` SC-f01-foundation-auth-006 Scenario Outline / Examples; legacy `AC-F01-6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |

## A1 gap resolution

The58previous composite BDD gaps across six contours are addressed by new derived scenarios, not relabelled as preexisting coverage. Per-contour closures:

| Prior gap | Criterion | Missing condition identified in A1 | New artifact |
| --- | --- | --- | --- |
| G01 | AC-f01-foundation-auth-001 | Runnable Compose/migration and DB-fault readiness are not named BDD; use review-report.md AC-F01-1 evidence. | `scenarios.md` SC-f01-foundation-auth-001; complete original assertions and concrete Examples authored |
| G02 | AC-f01-foundation-auth-002 | SC-US-001-3 omits 7day TTL/HMAC-only storage and inactive identity rejection. | `scenarios.md` SC-f01-foundation-auth-002; complete original assertions and concrete Examples authored |
| G03 | AC-f01-foundation-auth-003 | SC-US-001-6 has SQL syntax but not all malformed UUID classes. | `scenarios.md` SC-f01-foundation-auth-003; complete original assertions and concrete Examples authored |
| G04 | AC-f01-foundation-auth-004 | SC-US-001-5/6 omit exact PHC parameters, Unicode bounds and finally-release on KDF exception. | `scenarios.md` SC-f01-foundation-auth-004; complete original assertions and concrete Examples authored |
| G05 | AC-f01-foundation-auth-005 | SC-US-001-5 omits rejected-attempt persistence and spoofed forwarded-IP checks. | `scenarios.md` SC-f01-foundation-auth-005; complete original assertions and concrete Examples authored |
| G06 | AC-f01-foundation-auth-006 | Named build/license/donor/canary gate BDD absent; review-report.md AC-F01-6 supplies historical procedure evidence. | `scenarios.md` SC-f01-foundation-auth-006; complete original assertions and concrete Examples authored |

## Preservation and evidence limits

Previous index: `history/validation-report.pre-a2-bdd.md`, sha256:c439845b462d58b3b08a519406aad03e2f283c4b7ec9899f3146ee0be02d406c. Original pre-format report and role-path migration remain preserved there and in history. Specification/pseudocode/architecture/refinement remain byte-identical to inspected source. Completion prior bytes are archived at `history/05_completion.pre-contract-coverage.md`; the active completion index names real executable witnesses plus exact limits. A populated checker cell is not execution evidence. No app runtime/build/browser/test/network occurred in this document repair. Fresh independent Astra must assess the mappings before integration; new expanded code keeps all approved full gates.

## Input digests

- `01_specification.md`: sha256:0a62915da4cad8837bdd4c6e3387fe11453b33386537d124bb543fe3cf4bbfca
- `scenarios.md`: sha256:816573f3577be50ea99ef937e8a7cc5045189af4fe7637848e2f79aa91c7f9eb
