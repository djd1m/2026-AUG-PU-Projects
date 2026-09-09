# Completion checker adapter receipt

RUN_ID: `20260909T192932Z-foundation`
WORK_UNIT_ID: `completion-adapter`
Profile: `compact-quality-first-v2`; bounded tooling repair in the existing XL foundation run.
Worktree: `/tmp/n3a-foundation-core`. Coordinator candidate: `/tmp/n3a-build/projects/03a-affiliate-rewardful`.
Requested model/effort inherited from foundation-core: `gpt-6-astra` / `high`; actual model/effort and usage/cost: null, authoritative metadata unavailable.
Receipt timestamp: 2026-09-09T21:03:18.803075+00:00. First explicit clock measurement in this work unit: 2026-09-09T20:56:01Z. Full dispatch-to-finish elapsed null; coordinator owns dispatch timestamp. Test duration measured separately below.

## Inspected defect and bounded repair

Installed @dzhechkov/p-replicator1.13.2 checker was read before implementation. At line763 it overwrites raw PROJECT_COMPLETION with DOCS_ROOT/PROJECT_COMPLETION. At line772 that prefixed value is passed to process_completion_contour, whose line489 prefixes its directory again. The existence checks need the physical path; the function requires the raw role target.
Exact upstream SHA-256: `06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8`.
Adapter verifies package version1.13.2 and this exact SHA, then checks exactly one occurrence of each of two substitution strings. The only checker corrections rename the prefixed assignment and both existence-check references to PROJECT_COMPLETION_PATH. The raw process_completion_contour argument is explicitly checked and retained.
Corrected bytes are written as a regular private file in a uniquely created temporary directory, executed by Bash with the original requested checker arguments, and removed in finally. Canonical root role-source arguments are supplied only when caller arguments omit them. Original checker exit codes are preserved; unknown upstream bytes/version, unavailable inputs and execution failures return2 with NOT-ESTABLISHED.
No vendor/root toolkit file, production document, role map, manifest, lockfile, symlink or duplicate evidence document was changed. Test fixtures contain temporary copies of the actual specification, completion table and substantive referenced tests; they are removed after each test. No commits or container operations were performed.

## Commands and actual evidence

Command: `N3A_PIPELINE_CANDIDATE_ROOT=/tmp/n3a-build/projects/03a-affiliate-rewardful node --test projects/03a-affiliate-rewardful/tests/pipeline-completion.test.mjs` from `/tmp/n3a-foundation-core`.
Final result: exit0;2tests passed,0failed,0skipped; measured Node test duration756.71897ms.
1. Original real installed checker plus real candidate completion input returned2 and reported the doubled candidate/docs/candidate/docs/Completion.md path. Patched real checker over the same candidate passed completion, traceability, report-revision and criterion-scenarios. The vendor SHA stayed identical. Both wrapper and upstream temporary directories were gone afterward.
2. Temporary fixture copied actual foundation specification/completion and their real test files. Valid fixture returned0; removing AC-foundation-7 mapping returned1 and named the missing row; malformed actual header returned2 and named malformed coverage; restoring actual bytes returned0. No fabricated test-title placeholders or mocked checker were used.
3. Appending unknown bytes to original checker was rejected by the exported patch function before execution.
Initial sandbox run could not spawn Bash/Node subprocesses (EPERM). This was an environment failure, not a passing check. Tool escalation explained the blocked subprocess action and was approved; the exact test command then passed. A direct adapter invocation also returned completion=PASS.

## Invocation and integration

After integrating the two regular files, run `node scripts/check-pipeline-completion.mjs . --completion` from PROJECT_ROOT. Shared root role maps are resolved automatically, or pass the original explicit --role-map-source / --project-role-map-source arguments unchanged. Additional original checker modes are forwarded unchanged.
Run focused tests with `node --test tests/pipeline-completion.test.mjs` in the integrated candidate. N3A_PIPELINE_CANDIDATE_ROOT is an optional test-only selection of an existing real candidate; it does not override the adapter upstream hash or package version.
Coordinator owns manifest/script wiring and lifecycle documentation. Runtime auth/database files from the prior work unit were not modified.

## Owned file hashes

| File | Lines | SHA-256 |
|---|---:|---|
| `scripts/check-pipeline-completion.mjs` | 75 | `9a55b5d7cfa07abe67f355632a83415f765891331395edc796113d8a50d84454` |
| `tests/pipeline-completion.test.mjs` | 79 | `5a42b25119b5a3ec2f35ce6989c96151bee4d5983752a4370c9185232217c736` |

Status: completed
