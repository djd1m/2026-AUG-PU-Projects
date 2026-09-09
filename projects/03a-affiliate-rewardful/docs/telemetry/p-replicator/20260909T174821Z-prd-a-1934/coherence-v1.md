# Cross-document coherence validation receipt

- `RUN_ID`: `20260909T174821Z-prd-a-1934`
- `WORK_UNIT_ID`: `coherence-v1`
- Scope: frozen N3a SPARC planning package at baseline `30ff86ac1203a98838ee16f1566e0cc1e606593d`; cross-document consistency only.
- Profile / risk: `compact-quality-first-v2` / XL.
- Requested model / effort: `gpt-5.6-sol` / `high`.
- Actual model / effort: `null` / `null`; the host exposed no execution attestation, so no fallback or model switch is claimed.
- Usage / cost / quota / elapsed: `null` / `null` / `null` / `null`; no work-unit-scoped counters, billing record, quota value, or launch timestamp were exposed. No savings claim is made.
- Review date: 2026-09-09 UTC.
- Source edits, code/runtime checks, commits, pushes, subagents, provider calls, deployment, and financial actions: none.

## Input revision binding

| Artifact | SHA-256 |
|---|---|
| `docs/PRD.md` | `c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8` |
| `docs/Specification.md` | `7457c9f705230ad34b7b55ec32774e1aba3276f683be7c5af55f3825af8fe23e` |
| `docs/Pseudocode.md` | `37a0f6bf97b7d3f03c9d1ac7a0123deff33e8117f58de1e6749cd1ba2831ca9f` |
| `docs/Architecture.md` | `1620e4c6f6164934fc86713f6a2e1fb2c399ffe09abe90fc8f161c67a859a20f` |
| `docs/ADR.md` | `dface016ec4d2b7b990ee52f5499dffc47763ca308c71e8adb30638b38fce886` |
| `docs/C4_Diagrams.md` | `c26db5800db7ec38b683681dd6a2a38330c8f7732391dd688b34064b18b33113` |
| `docs/Refinement.md` | `ad876b61b80ea4d83dcb29b8ddcf0665439a3d0ab922b79c7b08f9fb81c19bf9` |
| `docs/Completion.md` | `b4dc3683129fe10d99096a4d8372223f36e0a7e6b87236fd6ca674c1260068e0` |
| `docs/Final_Summary.md` | `422c68ca7617834568d01415c4fba4e2673ba40a8624ca13280a6068109deff4` |
| `docs/implementation-plan.md` | `9856b2380d966ee93650711d730709c64082e7199a5c035a391e7207fdfb9403` |
| `docs/product-discovery-brief.md` | `2254286a9384e4974488bebc90c623e6faa70b52d228c2bdd5b4199aaf0fa9d3` |
| `docs/Solution_Strategy.md` (Decision Coverage input) | `32471c44aca6643dd53b42ce85c089e63495cc3ba6b394ee1f660e42e89f5351` |

## Verdict

**NEEDS WORK on this frozen revision.** One direct requirement contradiction and two current-versus-historical/status drifts remain. The latter include an unresolved owner choice, so they must be conditioned rather than silently resolved. No additional finding is asserted merely to fill a quota.

## Findings and suggested fixes

| ID | Severity | Evidence | Why it matters | Suggested bounded fix |
|---|---|---|---|---|
| COH-01 | BLOCKER | `Specification.md:15-17` makes `first payment only` versus `every eligible payment` and finite months versus `lifetime` selectable in FR-PROGRAM-001. The same document at `:27`, plus `PRD.md:69`, `Pseudocode.md:18,54,147`, `Architecture.md:42,85,138`, `ADR.md:28`, and `implementation-plan.md:148`, restrict the pilot to every eligible payment/lifetime and explicitly reject first-only/finite modes. | A developer can satisfy the heading requirement while violating the accepted pilot policy and the owning algorithm/schema. This is a present-tense contradiction, not historical discovery context. | Rewrite FR-PROGRAM-001 to require `every eligible payment` and `lifetime` for the N1 pilot; retain other modes only as explicitly deferred future scope. Re-run exact role/scenario checks after the edit. |
| COH-02 | WARNING | `implementation-plan.md:12` says the UI framework will be fixed after CJM and donor audit, and `:29` says the transport will be chosen during architecture design. The same document says at `:3` that CJM A and the architecture package are already prepared. Current proposals already name Next.js/React/Node 22 in `Architecture.md:54-55` and the signed N1 outbox/HMAC HTTPS plus authenticated cursor reconciliation in `Architecture.md:43-44,99,109` and `ADR.md:15,22`. | These are stale future-tense statements in a document presented as the current implementation plan. They obscure which decisions await owner approval versus donor compatibility confirmation or implementation. | Replace `:12` with the current proposed stack and say only exact packages/images/lockfiles await the fresh donor audit. Replace `:29` with the proposed outbox/HMAC/cursor transport and label it pending XL approval and implementation. |
| COH-03 | HIGH | `implementation-plan.md:21` presents the platform's own partner program/dogfooding as the main MVP growth loop without its approval boundary; the qualification appears only later at `:153-155`. `Final_Summary.md:11` reduces it to a voluntary N3a recommendation and omits that D7 is a proposed, unapproved lead-only platform-program stage. In contrast, `PRD.md:59`, `Specification.md:118,468-471`, `Pseudocode.md:227`, `Architecture.md:76`, and `ADR.md:57-58` consistently say platform enrollment/link/code/qualified-lead tracking only, no monetary platform commission, owner review pending, and N1 sales cannot stand in for N3a billing. | An executive or implementation reader could treat full monetary dogfooding as approved or fulfilled even though the owner choice is pending and no platform billing source or price exists. | Amend the early plan and Final Summary to state: D7 is an unapproved proposed lead-only stage; qualification is explicit owner evidence; it has no ledger effect; monetary dogfooding waits for an owner decision plus N3a price and billing source. Preserve the user's pending choice rather than selecting it in the cleanup. |

`product-discovery-brief.md` is explicitly a pre-PRD/pre-choice checkpoint and labels its unknowns/hypotheses. Its now-resolved historical statements were not counted as current contradictions; current documents must not copy them back as unresolved present-tense decisions.

## Coherence results outside the findings

- Scope is aligned on CJM A, N1 Proofwall first, N2 as a provenance-tracked code donor only, and no automatic inheritance of the distinct old N3 applications/MCP/A2A/permissions.
- Calendar and payment boundaries are aligned: YooKassa is verified by N1; N3a records confirmed business facts; registration creates no commission; every applicable manually initiated N1 payment can create one commission; the owner makes the actual transfer on the 5th for the prior calendar month; CSV and `sent` do not prove bank receipt.
- Role boundaries are aligned: server-derived owner/operator/partner authority, identity-only session before consent, one trusted membership transition, scoped views, and no payout authority for partners. The old-N3 role/scope model is not inherited.
- Tax boundaries are aligned at the coherence level: unknown status/rules/YTD/contract/approval fail closed; NPD is not a flat retained 6%; progressive withholding uses payer/person/year guards and actual transfer year; performed transfers remain observations for evidence reconciliation. Detailed monetary correctness belongs to the separate monetary review and is not re-adjudicated here.
- Planning documents consistently say that the application, provider integration, migrations, tests, deployment, and real payouts are not completed. No planned check is reported here as a runtime result.

## Metrics source check

The static documentation guard `node .claude/hooks/check-metric-source.cjs projects/03a-affiliate-rewardful` exited 0 and reported four Final Summary metrics with allowed source classes: journal 1, database 2, external API 0, manual 1. PRD `§8`, Specification `§6`, product discovery `PD-012`, Completion monitoring, and Final Summary metrics name a DB, sanitized journal, or manual timing source and keep unavailable values/targets unknown. This check proves source declarations are present; it does not call an API, prove instrumentation exists, or validate measured values.

## Decision Coverage

Decisions in `docs/ADR.md`: 8 · named downstream: 8 · superseded: 0.

| Decision | Exact downstream mention(s) in the contract file set |
|---|---|
| ADR-001 | `docs/Architecture.md`, `docs/C4_Diagrams.md` |
| ADR-002 | `docs/Architecture.md`, `docs/Specification.md` |
| ADR-003 | `docs/Specification.md` |
| ADR-004 | `docs/Specification.md` |
| ADR-005 | `docs/Architecture.md`, `docs/Specification.md` |
| ADR-006 | `docs/Specification.md` |
| ADR-007 | `docs/Architecture.md` |
| ADR-008 | `docs/Specification.md` |

Recorded but named nowhere:

none

Named downstream but absent from `docs/ADR.md`:

none

The census searched exactly `PRD.md`, `Solution_Strategy.md`, `Specification.md`, `Pseudocode.md`, `Architecture.md`, `Refinement.md`, `Completion.md`, and `C4_Diagrams.md`; it excluded `ADR.md`, `validation-report.md`, summaries, plans, and telemetry as required. Exact naming establishes traceability only, not implementation.

## Requirement and scenario ownership census

- `Specification.md`: 36 unique canonical FR/NFR headings; no duplicate canonical heading.
- `Pseudocode.md`: 36 unique `REQUIREMENT` declarations; each occurs once; exact set equality with Specification, so no missing, extra, or multiply owned requirement ID.
- `Specification.md`: 51 unique `SC-US-*` IDs.
- Pseudocode algorithm `REALISES` declarations: 48 unique exact IDs, all present in Specification.
- Explicit non-algorithm exclusions: `SC-US-012-1`, `SC-US-012-2`, and `SC-US-012-3`, each recorded as `ui-only` at `Pseudocode.md:340-346`; `:352` routes them to browser/security verification in Refinement. No scenario is dangling after those explicit exclusions.
- These are static naming checks over the frozen documents. They do not prove the algorithms, UI, tests, or application exist or work.

Status: completed
