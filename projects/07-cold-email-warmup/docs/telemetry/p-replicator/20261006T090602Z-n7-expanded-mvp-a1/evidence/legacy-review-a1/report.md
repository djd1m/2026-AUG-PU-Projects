# Independent N7 legacy contract review
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: legacy-review-a1
Source-revision: cad27c7d3f82a7d526485fc9c69b7689af03f848
Baseline: c80504ac
Launch-SHA256: 89ba11772e1e27d38ed90f1cee374bff8f0ffc2077bec035b350303c54774925
Reviewer family: codex
Actual-model: null (host execution metadata unavailable)
Usage: null (host counters unavailable)
Profile: read-only bounded independent review; docs-only within approved XL parent batch

Verdict: CHANGES REQUIRED — one narrow confirmed scenario inconsistency; no other confirmed blocker to this documentation VALIDATE gate.

## R1: preserve minor-unit price in F06 Example
File: projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/scenarios.md:134.
Criterion: AC-f06-cabinet-e2e-delivery-005 / legacy AC-A5.
Scenario: SC-f06-cabinet-e2e-delivery-005, Examples row TESTcheckoutstablepayloadrepeat /changedpayload /disabled /operatorcanonicalsuccessoutsidebrowser /partnercopyfallback.
Expected cell says actualfree-teamlimitsTEST100RUB30daysstatusintent. Original quoted clause (line116), unchanged assertion (line125), and F05 billing contract require TEST100minorRUB30days. Dropping minor makes the expected monetary unit inconsistent by a factor of100.
Minimal fix: replace that cell fragment TEST100RUB30days with TEST100minorRUB30days; refresh the corresponding scenarios.md digest in F06 validation-report.md. Review only that correction and affected digest/validation after correction. Search of all six new scenario files found no other 100/RUB occurrence missing the minor qualifier.
This is a new documentation expectation defect, not a claim of a runtime payment defect. Coordinator notified before terminal delivery.

## Scope and semantic assessment
Read root/project/docs CLAUDE, approved contract-route plan, requirements-validator and feature-report contracts, project-work-companion local rule and receipt contract. No source edits, runtime tests, builds, reinstalls, browser, network, external messages, delivery or deployment actions occurred.
All60 original acceptance paragraphs are still exact in the specification and quoted derived scenarios, with aliases retained. All60 distinct AC have exactly one algorithm REQUIREMENT claim. Thirty old role basenames absent; active underscore roles exist. Architecture/refinement bytes and original six validation plus six completion archives equal baseline. Canonical validation/Completion archives equal baseline; protected46 review/acceptance/implementation/correction files compared independently and unchanged. Supplied preservation evidence additionally reports83 protected feature files exact.
All changed paths versus baseline are within N7 docs, including coordinator telemetry. Runtime/source/manifests/tests remain unchanged.
Reviewed per-AC concrete When triggers, original condition assertions and Examples. The new documents explicitly describe derived test plans, never newly executed tests. Examples often bundle subcases and repeat composite expected conditions; original clauses remain normative, so they do not independently establish executable coverage or runtime success. No further contradictory requirement was confirmed in this bounded review. Verification/delivery AC bind actual gate procedures instead of pretending a runtime operation satisfies delivery.
Completion tables identify existing literal executable witnesses and explicitly limit them to partial witnesses, retaining composite gates and original receipts. F06 B5/B6 empty mappings remain visible; historic B5 prose is qualified by current executable-mapping UNVERIFIABLE statement, B6 remains not met with PR403. Canonical zero-row tables are valid here because canonical16 FR/NFR headings contain zero machine AC headings; original scenarios and requirements remain unchanged. Expanded9 tests are future implementation, not accepted delivery.

## Executed checks
- Installed1.13.4 full --traceability --report-revision --criterion-scenarios: exit0, canonical +7 features, all three verdicts PASS, zero gaps/inconclusive.
- Scoped1.13.4+n7patch1 full --traceability --completion --report-revision --criterion-scenarios: exit1, completion11 gaps, inconclusive0. Traceability/report-revision/criterion-scenarios PASS. Exact gaps: AC-expanded-mvp-001..009 absent tests/expanded-mvp-01..09.test.ts; AC-f06-cabinet-e2e-delivery-011 and012 empty test-file cells.
- Both used explicit snapshot .claude/commands/feature.md and .claude/skills/sparc-prd-mini/SKILL.md role-map sources.
- git diff --check c80504ac: exit0. Final git status --porcelain: empty.
- Independent preservation script: exit0, details/hashes below. First exploratory paragraph splitter incorrectly joined adjacent AC paragraphs; corrected the read-only splitter and reran; no product defect inferred.
- Independently reran10 checker fixtures. First exploratory rerun omitted inherited role map and correctly returned input unavailable; corrected invocation supplied explicit snapshot role map. Final exits: original canonical/nested/missing-target/missing-test/mismatched-title all2; patched canonical0,nested0,missing-target2,missing-test1,mismatched-title1. Full final outputs below.

## Scoped checker patch
Installed SHA256: 06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8.
Scoped patched SHA256: 635390797a395f63a3b40119b271a13eeb92d261dd2156af6019bc69fa1e03db.
Exact patch only renames absolute assignment and existence guard to PROJECT_COMPLETION_FILE, retaining original relative PROJECT_COMPLETION for process_completion_contour. This fixes double-prefix path resolution; it does not weaken title/file checks or hide missing targets. Installed package was unchanged. ACCEPT scoped patch with these fixture results.

## Required continuation
One exact R1 correction plus F06 scenario digest refresh, then narrow independent confirmation. Do not repeat unchanged runtime suites for docs-only change. Do not call full completion accepted: the11 named gaps and absent PR remain, and expanded implementation must retain all later required checks.

## Preservation and file hashes
```json
{
  "checks": [
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth: paragraphs/archives/claims/scenarios/digests PASS 6",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent: paragraphs/archives/claims/scenarios/digests PASS 6",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign: paragraphs/archives/claims/scenarios/digests PASS 12",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression: paragraphs/archives/claims/scenarios/digests PASS 12",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth: paragraphs/archives/claims/scenarios/digests PASS 12",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery: paragraphs/archives/claims/scenarios/digests PASS 12",
    "Canonical archives exact; protected historical files exact 46; diff docs-only PASS"
  ],
  "hashes": {
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth/01_specification.md": "0a62915da4cad8837bdd4c6e3387fe11453b33386537d124bb543fe3cf4bbfca",
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth/02_pseudocode.md": "31b005eb9b1bc15480a2a912f0bf47d1f63c650c842922a6d12dbec8c21bcdf1",
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth/03_architecture.md": "5fa3337a6ace31083c5b7aee436a82dc184146dfd4555fda2dd45af5615c19c8",
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth/04_refinement.md": "bb1f6cf2f53d8472e1b424c6ac692d793446559fde6ab40227c17366bffc4a73",
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth/05_completion.md": "80be5347be9f6275e525ae4d1a2bb239d43ec40afe5974b5d284c4ded5cbfa65",
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth/scenarios.md": "f1ab6d5801dbbb584dbd5499975787bd7934d8656b7232618a650bf7a64a6503",
    "projects/07-cold-email-warmup/docs/features/f01-foundation-auth/validation-report.md": "ca9ce61c8f2753c4d5523c590a9a503fdc570a7302eaa8bcd317d3c0b451981a",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/01_specification.md": "65603ddd620ddeda59392fb673994aaf41b3199f46af6d0f03bf99eabd3a9bc4",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/02_pseudocode.md": "f686614535f57c7a938524b25fa130939fe33c27280cee8063edb7e3e3aaee31",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/03_architecture.md": "1b85a0b86475e9564bb6c97591f462bd2024a79975ba9c02605038102924f52b",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/04_refinement.md": "92c4515c8a3d385316a431c4ebc42fe2e0dd71be7f9911c246b06336df736e93",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/05_completion.md": "2fbcb9ff71b7a2c414123df5182f517f869a8467c6fa940f34546907870dd97b",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/scenarios.md": "bca9a48648cfe0a5182e01fc472227b1691efc499cae7493a81fe197fbacd61c",
    "projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/validation-report.md": "7f6daa663ac81c9459b5f4fc7f325d6230f59654bd0d07186f18b6e34837ad9e",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/01_specification.md": "6f88ae14deba475af0edfb89c37ec452d34c85df44b9e5c8aefeed802b36566f",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/02_pseudocode.md": "9d6ee16da9efa48b6e1727a9eb5f9d3be77ee784e9a94a22b264b754b5682244",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/03_architecture.md": "3c03d54097421a208cd4676187a65a6ad61ea077c94518fa1e5e25fe956abd77",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/04_refinement.md": "7a7719f5df35dea3e0106e9a0d398c78a32e3e3623f460bf8fbe838e5414dc1a",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/05_completion.md": "01dc6e147a1cd340a0cbbf6c2453f80c3ee0ddf1c055ed695f3e0ed466805a4f",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/scenarios.md": "4a4f3f8aba1d7cd201b053426c63695e88f8913466ac0f25a59afc203a5bc26e",
    "projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/validation-report.md": "7619d15673cd83aa6d84b61e98200e4fd0b75452e10732ec449e52f7428774fc",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression/01_specification.md": "73a4dc62c00e08718bde936bd6fede36bd1bae07c48cf9c963d3c56a552237a6",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression/02_pseudocode.md": "fc9eb9de0bfb35d568b573446aea394cf8d49d99c210025cdd5772a3db5e273d",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression/03_architecture.md": "c377e4a0fcca7a28b60c9e3b2fb2a73de502152f02c77142a9c8a586619009c9",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression/04_refinement.md": "416286c8f6b689d84be90dd33d13e1198a1028c3e58cfe47466e8d6cf27492b2",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression/05_completion.md": "85ddff9fcbe8a426b61a54590909a29aba519f61a0477313ce249b961b25668c",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression/scenarios.md": "fd9ca238af7b2493f584d6e8e03b67f27bd149d4559ad698c24be0772a093f8f",
    "projects/07-cold-email-warmup/docs/features/f04-reply-suppression/validation-report.md": "fbb22e24ab3e6e9b5c1e363adcc7423d1a8f19839964e3d8312492c0d5bb81e2",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/01_specification.md": "ac249fab21a4dbf9c35ffd81daa5bd5874df3aa431b4cdedbfa28ea2adf66d0c",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/02_pseudocode.md": "2b99ad3df28594485f33c3fd73cfe01cc4d5df9c78f07f210c1eeeb08ea5c1a5",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/03_architecture.md": "86a4f3b60e821ce30f303886a7f67f2cafe2c43da5678a25243b4fd8d047fece",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/04_refinement.md": "135d97debff4e516f5e1b9514108ffbfd53016cecc7ce16613dd890f72e59b0c",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/05_completion.md": "d5d3bd5693b0b8db4d25a80fffad5edc5d56e00054115a9fb777eca00d90f3f0",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/scenarios.md": "0ec50085f614c9cda936452ba02b0469f443498ac62686ff1ee03448487cd36e",
    "projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/validation-report.md": "b7d2f32c9cda736649697a6b686961ae5423bdcf54b5a171a870ed29a98066b4",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/01_specification.md": "044d738715cc33c29c453805648b209176ecdcf12c8c8c7320b2e7cd3265e1ce",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/02_pseudocode.md": "ae51c0ba21e1594e371dc3e6e6e9ebb047cd673161be0e4a967c1ce09bb8719b",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/03_architecture.md": "dda20e26a470e82f5172fd4f8a8d8a1b4531c18349fa79ed9c60a95ad383c962",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/04_refinement.md": "5850acd92c0b7717258966ff53455ed11a8a2c6c4b57f0f81f59334bef205792",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/05_completion.md": "0cfe6c03b24c3cf03789643dcbb3070244eb039b137b533b7269630c0116bd74",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/scenarios.md": "27f3431cf25443232fa0b81c5d4cb3090754a0a51347d9947ce4119eec416a5e",
    "projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/validation-report.md": "4a528b3b04592e857292326a49045a9712104e050296f330077b596bd1b0a947"
  }
}
```

## Installed PLAN/VALIDATE raw output
```text
TRACE contour=project specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/Specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/Pseudocode.md
COUNT requirements=16 algorithms=16 missing-algorithm=0 orphan-algorithm=0
PASS contour=project bidirectional traceability complete
TRACE contour=expanded-mvp specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/expanded-mvp/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/expanded-mvp/02_pseudocode.md
COUNT requirements=18 algorithms=18 missing-algorithm=0 orphan-algorithm=0
PASS contour=expanded-mvp bidirectional traceability complete
TRACE contour=f01-foundation-auth specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f01-foundation-auth/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f01-foundation-auth/02_pseudocode.md
COUNT requirements=6 algorithms=6 missing-algorithm=0 orphan-algorithm=0
PASS contour=f01-foundation-auth bidirectional traceability complete
TRACE contour=f02-mailboxes-consent specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/02_pseudocode.md
COUNT requirements=6 algorithms=6 missing-algorithm=0 orphan-algorithm=0
PASS contour=f02-mailboxes-consent bidirectional traceability complete
TRACE contour=f03-dispatch-pool-campaign specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f03-dispatch-pool-campaign bidirectional traceability complete
TRACE contour=f04-reply-suppression specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f04-reply-suppression/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f04-reply-suppression/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f04-reply-suppression bidirectional traceability complete
TRACE contour=f05-evidence-billing-growth specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f05-evidence-billing-growth bidirectional traceability complete
TRACE contour=f06-cabinet-e2e-delivery specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f06-cabinet-e2e-delivery bidirectional traceability complete
VERDICT traceability=PASS features=7 gaps=0 inconclusive=0
VERDICT report-revision=PASS features=7 gaps=0 inconclusive=0
VERDICT criterion-scenarios=PASS features=7 gaps=0 inconclusive=0
```

## Scoped full completion raw output
```text
TRACE contour=project specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/Specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/Pseudocode.md
COUNT requirements=16 algorithms=16 missing-algorithm=0 orphan-algorithm=0
PASS contour=project bidirectional traceability complete
TRACE contour=expanded-mvp specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/expanded-mvp/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/expanded-mvp/02_pseudocode.md
COUNT requirements=18 algorithms=18 missing-algorithm=0 orphan-algorithm=0
PASS contour=expanded-mvp bidirectional traceability complete
GAP contour=expanded-mvp completion AC-expanded-mvp-001 test file tests/expanded-mvp-01.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-002 test file tests/expanded-mvp-02.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-003 test file tests/expanded-mvp-03.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-004 test file tests/expanded-mvp-04.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-005 test file tests/expanded-mvp-05.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-006 test file tests/expanded-mvp-06.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-007 test file tests/expanded-mvp-07.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-008 test file tests/expanded-mvp-08.test.ts does not exist
GAP contour=expanded-mvp completion AC-expanded-mvp-009 test file tests/expanded-mvp-09.test.ts does not exist
TRACE contour=f01-foundation-auth specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f01-foundation-auth/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f01-foundation-auth/02_pseudocode.md
COUNT requirements=6 algorithms=6 missing-algorithm=0 orphan-algorithm=0
PASS contour=f01-foundation-auth bidirectional traceability complete
TRACE contour=f02-mailboxes-consent specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f02-mailboxes-consent/02_pseudocode.md
COUNT requirements=6 algorithms=6 missing-algorithm=0 orphan-algorithm=0
PASS contour=f02-mailboxes-consent bidirectional traceability complete
TRACE contour=f03-dispatch-pool-campaign specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f03-dispatch-pool-campaign/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f03-dispatch-pool-campaign bidirectional traceability complete
TRACE contour=f04-reply-suppression specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f04-reply-suppression/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f04-reply-suppression/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f04-reply-suppression bidirectional traceability complete
TRACE contour=f05-evidence-billing-growth specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f05-evidence-billing-growth/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f05-evidence-billing-growth bidirectional traceability complete
TRACE contour=f06-cabinet-e2e-delivery specification=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/01_specification.md pseudocode=/tmp/n7-expanded-contracts-20261006/projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/02_pseudocode.md
COUNT requirements=12 algorithms=12 missing-algorithm=0 orphan-algorithm=0
PASS contour=f06-cabinet-e2e-delivery bidirectional traceability complete
GAP contour=f06-cabinet-e2e-delivery completion AC-f06-cabinet-e2e-delivery-011 test file is empty
GAP contour=f06-cabinet-e2e-delivery completion AC-f06-cabinet-e2e-delivery-012 test file is empty
VERDICT traceability=PASS features=7 gaps=0 inconclusive=0
VERDICT completion=FAIL features=7 gaps=11 inconclusive=0
VERDICT report-revision=PASS features=7 gaps=0 inconclusive=0
VERDICT criterion-scenarios=PASS features=7 gaps=0 inconclusive=0
```

## Final fixture raw output
```json
[
  {
    "fixture": "canonical-positive",
    "tool": "original",
    "exit": 2,
    "output": "NOT-ESTABLISHED contour=project role=completion path=/tmp/n7-checker-1.13.4-n7patch1/fixtures/canonical-positive/docs//tmp/n7-checker-1.13.4-n7patch1/fixtures/canonical-positive/docs/Completion.md missing or unreadable\nVERDICT completion=NOT-ESTABLISHED features=0 gaps=0 inconclusive=1\n"
  },
  {
    "fixture": "canonical-positive",
    "tool": "patched",
    "exit": 0,
    "output": "VERDICT completion=PASS features=0 gaps=0 inconclusive=0\n"
  },
  {
    "fixture": "mismatched-title",
    "tool": "original",
    "exit": 2,
    "output": "NOT-ESTABLISHED contour=project role=completion path=/tmp/n7-checker-1.13.4-n7patch1/fixtures/mismatched-title/docs//tmp/n7-checker-1.13.4-n7patch1/fixtures/mismatched-title/docs/Completion.md missing or unreadable\nVERDICT completion=NOT-ESTABLISHED features=0 gaps=0 inconclusive=1\n"
  },
  {
    "fixture": "mismatched-title",
    "tool": "patched",
    "exit": 1,
    "output": "GAP contour=project completion AC-fixture-001 test file tests/fixture.test.js does not contain title \"accepts forged authority\"\nVERDICT completion=FAIL features=0 gaps=1 inconclusive=0\n"
  },
  {
    "fixture": "missing-completion",
    "tool": "original",
    "exit": 2,
    "output": "NOT-ESTABLISHED contour=project role=completion path=/tmp/n7-checker-1.13.4-n7patch1/fixtures/missing-completion/docs//tmp/n7-checker-1.13.4-n7patch1/fixtures/missing-completion/docs/Completion.md missing or unreadable\nVERDICT completion=NOT-ESTABLISHED features=0 gaps=0 inconclusive=1\n"
  },
  {
    "fixture": "missing-completion",
    "tool": "patched",
    "exit": 2,
    "output": "NOT-ESTABLISHED contour=project role=completion path=/tmp/n7-checker-1.13.4-n7patch1/fixtures/missing-completion/docs/Completion.md missing or unreadable\nVERDICT completion=NOT-ESTABLISHED features=0 gaps=0 inconclusive=1\n"
  },
  {
    "fixture": "missing-test",
    "tool": "original",
    "exit": 2,
    "output": "NOT-ESTABLISHED contour=project role=completion path=/tmp/n7-checker-1.13.4-n7patch1/fixtures/missing-test/docs//tmp/n7-checker-1.13.4-n7patch1/fixtures/missing-test/docs/Completion.md missing or unreadable\nVERDICT completion=NOT-ESTABLISHED features=0 gaps=0 inconclusive=1\n"
  },
  {
    "fixture": "missing-test",
    "tool": "patched",
    "exit": 1,
    "output": "GAP contour=project completion AC-fixture-001 test file tests/absent.test.js does not exist\nVERDICT completion=FAIL features=0 gaps=1 inconclusive=0\n"
  },
  {
    "fixture": "nested-positive",
    "tool": "original",
    "exit": 2,
    "output": "NOT-ESTABLISHED contour=project role=completion path=/tmp/n7-checker-1.13.4-n7patch1/fixtures/nested-positive/docs//tmp/n7-checker-1.13.4-n7patch1/fixtures/nested-positive/docs/nested/review/Completion.md missing or unreadable\nVERDICT completion=NOT-ESTABLISHED features=0 gaps=0 inconclusive=1\n"
  },
  {
    "fixture": "nested-positive",
    "tool": "patched",
    "exit": 0,
    "output": "VERDICT completion=PASS features=0 gaps=0 inconclusive=0\n"
  }
]
```
