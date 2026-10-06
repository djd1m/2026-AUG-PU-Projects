# N7 historical contract format repair — bounded ROUTE / PLAN

Source inspected: d6b1b9df174ece42b03e50738900b29c26f28bb6.
Repository root: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-replicate
Project root: projects/07-cold-email-warmup (relative to that repository).
Approval context supplied by coordinator: OWN-N7-005 accepts expanded plan 298960ce. Coordinator owns approval/telemetry recording and confirms source continuity before implementation.

## ROUTE
Mechanical nature T (document format/reference changes only), substantive scope inherits approved XL batch and its PLAN→VALIDATE→IMPLEMENT→REVIEW gates. This repair introduces no product behavior, executable code, migration, new canonical requirement, or access. Run repository scripts/complexity-router.sh with the explicit document file list before authoring; record actual exit/tier (not measured in this planning task). Repeat substantive route before local expanded-feature code. Companion readiness is not_applicable: this attempt performs no E2E. Reuse installed p-replicator 1.13.4 checker unchanged; reject creating a validator/manifest/router as unnecessary scope.

## File ownership and transformations
Single Sol author, at most 12 minutes, isolated writer worktree prepared by coordinator. Exact feature directories beneath PROJECT/docs/features:
- f01-foundation-auth
- f02-mailboxes-consent
- f03-dispatch-pool-campaign
- f04-reply-suppression
- f05-evidence-billing-growth
- f06-cabinet-e2e-delivery

For each directory rename its existing five role documents (move, never copy) 01-specification.md→01_specification.md, 02-pseudocode.md→02_pseudocode.md, 03-architecture.md→03_architecture.md, 04-refinement.md→04_refinement.md, 05-completion.md→05_completion.md. Edit only specification/pseudocode content as specified below; preserve architecture/refinement/completion bytes during move. Keep reviews, acceptance, implementation and correction reports byte-for-byte as historical evidence. Preserve current validation-report.md exact bytes at history/validation-report.pre-contract-format.md (new unique path; fail if occupied with different bytes), then replace current validation-report.md with a fresh explicit contract index. Archive is preservation of report evidence only: feature directories and their five roles remain active and fully enumerated by checker.

Other allowed writes: repair live Markdown references to these 30 renamed files only within PROJECT/docs and PROJECT/CLAUDE.md; existing historical reports and telemetry remain immutable. When an immutable historical report has a former role path, list old→new role paths in the corresponding new validation-report.md; identify the historical basename explicitly and explain the unique current role path. This is an explicit role-path migration, not duplicated canonical documents. Do not bulk-edit every historical log mentioning a filename. Coordinator alone updates its already selected project telemetry/work record; author does not modify root files, shared .claude, scripts, package manifests/locks, toolkit, product source or tests.

## One-to-one machine identities
Use slug exactly matching directory and decimal suffix with leading zero padding optional (choose 001 consistently).
- f01: legacy AC-F01-1..6 → AC-f01-foundation-auth-001..006.
- f02: legacy AC-F02-1..6 → AC-f02-mailboxes-consent-001..006.
- f03..f06: legacy AC-A1..A6 → AC-<directory-slug>-001..006; AC-B1..B6 → AC-<directory-slug>-007..012.

Convert each existing AC paragraph to a level-three machine heading, retain full original legacy ID and exact original requirement paragraph under it. The old IDs are aliases, not additional machine headings. Keep canonical references in prose: do not promote FR-n7/AC-N7 references to new feature headings. Total legacy machine identities: 60 (6+6+12+12+12+12). Canonical project 16 and expanded feature 18 existing identities remain unchanged.

Pseudocode: preserve original substantive paragraphs and canonical algorithm references. Add a small number of meaningful `### Algorithm: <name>` sections grouping existing paragraphs, with one exact unfenced `REQUIREMENT: `AC-<slug>-NNN`` line per corresponding feature AC (the identifier itself is enclosed in backticks). Every AC is claimed exactly once across the pseudocode; multiple claims per substantive algorithm section are allowed. Do not add 60 empty algorithm stubs. Existing text supports identity/credential/bootstrap (F01), encrypted save and serialized consent (F02), planning/reservation and final submit/outcomes (F03), reply/cursor and stop consumers (F04), billing/evidence/growth (F05), client epoch/forms and browser/delivery workflow (F06). For verification/delivery AC, add a concise binding to the existing documented verification or delivery procedure, preserving all conditions. Do not pretend a runtime operation satisfies a test/delivery criterion. Ambiguous binding stops that criterion with a concrete gap for coordinator, not invented algorithm content.

## Fresh validation indices
Current validation-report.md must place `Spec revision: sha256:<actual new specification bytes>` exactly once within first 20 lines. Hash after final specification edits; include date, inspected source revision and document digests so dirty snapshot is identifiable. Explain this is format/inheritance validation, not rerun runtime acceptance or independent product review.

Include exact checker table:

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |

One row per machine AC, no orphan/duplicate/empty rows. Scenario cells identify legacy AC alias, exact existing project specification/security-scenario/test-plan document and named scenario/Examples anchor; cite multiple exact scenarios if required to cover a composite AC. F01 identity starts from SC-US-001-1..6 and security auth Examples; F02 from SC-US-002-1..4 and SC-US-003 consent Examples; F03 from SC-US-003/004/005 and final transition stop Examples; F04 SC-US-006/007 and replay/stop Examples; F05 SC-US-008..013 and billing/security Examples; F06 existing cabinet/browser/operations scenarios and acceptance/review evidence. These are starting search domains, not asserted complete one-to-one coverage. Author must read each referenced scenario and ensure it covers actual clause. Do not fill a blank with generic `covered`, an AC citation alone, or an invented scenario/PASS. Missing existing documented BDD must remain a named VALIDATE gap and be resolved through the existing planning process before new code; no checker-only semantic concealment.

Preserve source-bound accepted historical runtime receipts as historical evidence. A matching digest and populated scenario cell only establish documentation traceability; independent Astra verifies meaningful content. F06 PR #403 delivery remains blocked as presently evidenced. No new current runtime PASS follows from this format repair. Current canonical/expanded validation indices need edits only if the actual checker proves an existing mismatch; send that finding to coordinator rather than expanding author scope autonomously.

## Concrete acceptance criteria for this repair
1. Six active historical contours load under the installed role maps, with exactly 60 distinct slug-bound AC and exactly one claim per AC; no original requirement sentence removed or behavior weakened.
2. Thirty role files moved, not duplicated; protected historical reports unchanged and six old validation reports archived with identical SHA-256; references repaired or explicit old/current role migration recorded.
3. Six fresh report hashes match their exact spec bytes and each AC has verified existing scenario references. No fresh runtime success claim, no F06 delivery reclassification.
4. Full-project traceability/report-revision/criterion-scenarios command exits 0 across canonical + all seven features (six historical plus expanded); inspect per-contour output, not only final code.
5. Full-project --completion is also executed and its actual findings recorded. Existing coverage/report deficits and external PR #403 blocker remain truthful. Structural completion deficits are identified separately from external delivery status; a parser PASS cannot prove PR delivery. Do not defer a newly established documentary defect as if it were external.
6. Fresh independent Astra format/spec review finds no loss, false coverage, duplicate canon or gate weakening. Concrete findings get one targeted correction pass and affected checks only.

## Exact commands and boundaries
Run from repository root, replacing N7_PROJECT with its absolute project path:

```sh
N7_REPO=/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-replicate
N7_PROJECT="$N7_REPO/projects/07-cold-email-warmup"
N7_CHECKER=/root/.npm-global/lib/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh
bash "$N7_CHECKER" "$N7_PROJECT" --traceability --report-revision --criterion-scenarios --role-map-source "$N7_REPO/.claude/commands/feature.md" --project-role-map-source "$N7_REPO/.claude/skills/sparc-prd-mini/SKILL.md"
bash "$N7_CHECKER" "$N7_PROJECT" --traceability --completion --report-revision --criterion-scenarios --role-map-source "$N7_REPO/.claude/commands/feature.md" --project-role-map-source "$N7_REPO/.claude/skills/sparc-prd-mini/SKILL.md"
git diff --check
```

Record real stdout, stderr, exit codes and immutable input digest in coordinator evidence location. Also inspect git diff --name-status and source-preservation digest comparison (read-only one-off Python/shell allowed, no new repo validator). Installed role map is inherited root .claude/commands/feature.md, not PROJECT/.claude; project role map is root sparc-prd-mini SKILL.md. No network/runtime tests needed for document-only repair. Historical code acceptance remains attached to original receipts/revisions; expanded code later requires its approved full runtime/build/security/mutation/browser checks and fresh review. Format PASS is prerequisite to new IMPLEMENT, never substitute for those tests.

## Stop and continuation
At 12-minute bound, author writes exact files/digests/remaining criteria/finding and stops its attempt, no silent extension. Coordinator inspects artifacts and launches a narrower corrective pass or independent reviewer; task remains owned and active. Review: fresh Astra, at most 8 minutes, read-only, same source snapshot and exact changed files. Explicit host model metadata required; unknown is null rather than inferred from requested role. No additional user checkpoint is introduced for this already approved mechanical preparation.
