# Read-only disk safety audit — 2026-10-06

Start: 2026-10-06 15:13:38 UTC. Measurements completed approximately 15:16:51 UTC.
Role: independent read-only auditor. No deletions, Git mutations, container mutations, or cache pruning performed. The only write is this explicitly requested report.
Requested model: OpenAI Astra high review role; actual model identity/usage is unavailable to this agent and not asserted. Ordinary sandbox launcher failed with bwrap permission denied; narrowly escalated read-only diagnostics succeeded.

## Capacity

- Root filesystem: 99G total, 91G used, 2.9G available, 97% used; inodes 1,783,345 / 6,553,600 (28%).
- `/tmp`: 9,040,232,448 allocated bytes.
- Repository `.claude/worktrees`: 10,956,820,480 allocated bytes.
- Docker: images 40.81GB, nominal reclaimable 11.31GB; volumes 4.227GB, nominal reclaimable 2.105GB. These are foreign/mixed resources and NOT approved cleanup targets.
- BuildKit: total 8.516GB, shared 8.512GB, private 3.707MB. All nine private records are mutable source.local records. No private immutable candidates; no Docker cleanup recommended.

## Exact candidate set

| Path | Allocated bytes | HEAD | Existing retained branch |
|---|---:|---|---|
| `/tmp/n7-f07-plan-20261006` | 314556416 | 78f0adedaf2d20a439c481268768ef3f7b534fd4 | work/n7-f07-plan-20261006 |
| `/tmp/n7-f07-implement-20261006` | 315895808 | 10c8e946ca7f9e7e6d30f386c9e5069acb0097f2 | work/n7-f07-implement-20261006 |
| `/tmp/n7-f06b-r3` | 314359808 | f460a2b0f234d29645934ac7a7b57a926e6bcfa5 | work/n7-f06b-r3 |

Combined measured allocation: 944812032 bytes (approximately 901MiB / 0.88GiB). Actual df recovery may differ.
All three root directories uid0, registered worktrees, tracked-clean using GIT_OPTIONAL_LOCKS=0. Branches preserve each exact HEAD. Root relayed explicit N7 coordinator confirmation that these three trees are obsolete and unassigned to F10/future work.

- Plan: zero untracked and zero ignored files; eligible for standard `git worktree remove` after root fresh precheck.
- Implement: one untracked node_modules symlink to `/tmp/n7-expanded-runtime-20261006/node_modules`; 56 ignored files, all within `projects/07-cold-email-warmup/dist/`. Preserve the symlink target. Remove only the symlink itself and exact generated dist directory before standard no-force worktree removal.
- F06b-r3: untracked node_modules symlink to `/tmp/n7-f03b-sol/projects/07-cold-email-warmup/node_modules`, and exact pycache files `projects/07-cold-email-warmup/scripts/ui/__pycache__/f06-audit.cpython-312.pyc` and `f06-run.cpython-312.pyc`; 55 ignored files, all within project dist. Preserve dependency target. Remove only these generated entries/symlink, then standard no-force worktree removal.

## Activity and dependency safeguards

- Process `/proc/*/{cwd,root,fd/*}` links inspected; no references into any of the three candidates observed.
- All Docker container mount Source fields inspected; no mounts inside candidates observed.
- Registered-worktree symlinks inspected; no inbound symlinks to the three candidates found outside candidates. Scan excluded .git/node_modules/.next/dist/__pycache__ directories; this is a stated coverage limitation, not proof of absence everywhere.
- Root additionally relayed no active F10/F09 contract reference to these candidates and current dependency realpaths remain in protected F08/expanded-runtime trees.
- No process command lines, secret file contents, or environment contents printed.
- Root must repeat exact dirty/untracked/ignored/activity and branch checks immediately before mutation, keep branches, avoid --force, avoid symlink traversal, and stop/reconcile on unexpected contents or failed standard removal.

## Preserved scope

Main N7 tree, all F10 implement/plan/validate trees/evidence, F08 dependency-fix tree and node_modules target, `/tmp/n7-expanded-runtime-20261006`, `/tmp/n7-f06a-runtime`, `/tmp/n7-f09-verify-a2`, `/tmp/n7-f09-review-fix-a4`, N7 web/db containers/network/PG volumes, codex-ui-playwright, both `/tmp/codex-heavy-build.lock` and `/tmp/codex-ui-e2e.lock`, Coursevideo outputs, foreign containers/images/volumes, npm download cache (possible active dependency installation).

## Other inspected candidates: not part of approved exact set

- F02-r1 291520512B; F03a-r1 292073472B; F03a-sol 291840000B; F03b-r1 292278272B; F03b-sol 358334464B; F04a-r1 293023744B; F04a-sol 292855808B; F06b-r3-review 313974784B; V03-review 289964032B.
- Their additional telemetry was compared to main N7 copies by SHA256 without printing contents. All extras in F02-r1/F03a-r1/F03b-r1/F04a-r1/F04a-sol/F06b-r3-review/V03-review were identical. Other safeguards remain incomplete; no blanket removal recommendation.
- F03a-sol events.jsonl and run.json differ from main; F03b-sol events.jsonl differs from main. Preserve unique evidence before any later cleanup. F03b-sol also supplies node_modules to an old worktree and must not be removed blindly.
- Largest repository group n8-replicate 3305697280B; n6b-release-gate 820641792B. Foreign scope; preserve.
- `/tmp/claude-0` 1809932288B. Active orchestration/evidence ownership not established; preserve.

Checks are point-in-time metadata/hashes and coordinator corroboration, not a claim of globally quiescent filesystem. No code changed; build/tests not applicable to this read-only audit.
