# f02-mailboxes-consent requirements testability — A2
Spec revision: sha256:65603ddd620ddeda59392fb673994aaf41b3199f46af6d0f03bf99eabd3a9bc4
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
| AC-f02-mailboxes-consent-001 | `scenarios.md` SC-f02-mailboxes-consent-001 Scenario Outline / Examples; legacy `AC-F02-1`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f02-mailboxes-consent-002 | `scenarios.md` SC-f02-mailboxes-consent-002 Scenario Outline / Examples; legacy `AC-F02-2`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f02-mailboxes-consent-003 | `scenarios.md` SC-f02-mailboxes-consent-003 Scenario Outline / Examples; legacy `AC-F02-3`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f02-mailboxes-consent-004 | `scenarios.md` SC-f02-mailboxes-consent-004 Scenario Outline / Examples; legacy `AC-F02-4`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f02-mailboxes-consent-005 | `scenarios.md` SC-f02-mailboxes-consent-005 Scenario Outline / Examples; legacy `AC-F02-5`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |
| AC-f02-mailboxes-consent-006 | `scenarios.md` SC-f02-mailboxes-consent-006 Scenario Outline / Examples; legacy `AC-F02-6`; inherited scenario references preserved in `history/validation-report.pre-a2-bdd.md` |

## A1 gap resolution

The58previous composite BDD gaps across six contours are addressed by new derived scenarios, not relabelled as preexisting coverage. Per-contour closures:

| Prior gap | Criterion | Missing condition identified in A1 | New artifact |
| --- | --- | --- | --- |
| G01 | AC-f02-mailboxes-consent-001 | SC-US-002-1 omits update/list settings and save0messages/unverified labels. | `scenarios.md` SC-f02-mailboxes-consent-001; complete original assertions and concrete Examples authored |
| G02 | AC-f02-mailboxes-consent-002 | SC-US-002-3/4 omit fresh nonce and distinct session/credential keys. | `scenarios.md` SC-f02-mailboxes-consent-002; complete original assertions and concrete Examples authored |
| G03 | AC-f02-mailboxes-consent-003 | SC-US-002-2 omits all reserved/mixed DNS cases, pinned IP/TLS peername and connection timeout boundaries; review-r1-report.md R1 is historical test evidence. | `scenarios.md` SC-f02-mailboxes-consent-003; complete original assertions and concrete Examples authored |
| G04 | AC-f02-mailboxes-consent-004 | SC-US-003-3 omits actor/time/disclosure version and recipient fingerprint expansion. | `scenarios.md` SC-f02-mailboxes-consent-004; complete original assertions and concrete Examples authored |
| G05 | AC-f02-mailboxes-consent-005 | SC-US-003-4/5 omit FIRST-lock ordering as a distinct BDD assertion and exact default/provider/pilot limit. | `scenarios.md` SC-f02-mailboxes-consent-005; complete original assertions and concrete Examples authored |
| G06 | AC-f02-mailboxes-consent-006 | Named full regression/type/lint/build/security procedure BDD absent; review-report.md and review-r1-report.md retain checks. | `scenarios.md` SC-f02-mailboxes-consent-006; complete original assertions and concrete Examples authored |

## Preservation and evidence limits

Previous index: `history/validation-report.pre-a2-bdd.md`, sha256:9fa60c57ae8a0c7e5327d17aa7da99e1212089956db7a508054bcdd9bb29c751. Original pre-format report and role-path migration remain preserved there and in history. Specification/pseudocode/architecture/refinement remain byte-identical to inspected source. Completion prior bytes are archived at `history/05_completion.pre-contract-coverage.md`; the active completion index names real executable witnesses plus exact limits. A populated checker cell is not execution evidence. No app runtime/build/browser/test/network occurred in this document repair. Fresh independent Astra must assess the mappings before integration; new expanded code keeps all approved full gates.

## Input digests

- `01_specification.md`: sha256:65603ddd620ddeda59392fb673994aaf41b3199f46af6d0f03bf99eabd3a9bc4
- `scenarios.md`: sha256:bca9a48648cfe0a5182e01fc472227b1691efc499cae7493a81fe197fbacd61c
