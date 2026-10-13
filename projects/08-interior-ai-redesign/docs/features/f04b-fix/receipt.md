Verdict: PASS for the bounded correction and authored browser coverage. Product/browser acceptance remains pending coordinator execution.

RUN_ID: `n8-20261002-1740`
WORK_UNIT_ID: `n8-f04b-fix`
ATTEMPT_ID: `n8-f04b-fix-2`
Source-Revision: `7dd37e81fbe24be8d1300d6884a82ed303c53373` (uncommitted candidate)
Build-Revision: `ac8b9e5390194cd12e0bc6bc648149e2ea274e4a953d30eeda4a8e698c30c56d`
Launch-SHA256: `dd00206ff6dfca1fb908237bc41813a6c799233f2321fc04a9ee71a8dd91a8ea`

Implemented all four correction items:

- R1: reservation resolution requires its submitted key and unchanged selection/account generation. Independent pending state blocks overlapping B submission; delayed A cannot attach its job ID to B or render after a selection change, including delayed job-detail loading. Uncertain requests retain their body/key through reload.
- R4: rejected requests receive the same account-generation guard as successful responses. Exact delayed authentication_required regression preserves the newly logged-in account. Login also waits for logout's cookie-clearing response to settle.
- R2: owned N8 Node client uses fixed existing Playwright 1.63 package paths and remote shared-browser WebSocket. Added owned HTTPS Caddy/internal-network compose, secure-cookie fixture configuration, no host ports and concurrent CPU total 2. Shared browser receives no project mount or DB environment. Donor hashes/differences are recorded.
- R3: fresh owned schema initializes through existing migrate(pool), including schema_migration. Strict ownership/PG16/storage/identifier checks remain; the DATABASE_URL must select that same schema before normal-server startup.

Authored 1440/390 browser coverage retains the core matrix and adds uncertain real POST/drop/reload recovery, reservation/detail/authentication/logout races, gallery51 with continuation, cookie expiry, credit/budget/verified-refund hold and timeout screens, and deletion during pending share. Disabled payments use a separate actual server restart and dedicated harness. Business responses remain real; only native WebShare promises are stubbed. SQL history/failure seeds and accepted public examples are explicitly synthetic software evidence, never GPU proof.

Validation: **14/14 focused tests passed** (state 6, actual app races 4, UI HTTP/fixture guards 4); frozen syntax build, shell syntax, local YAML/internal-network/no-port/CPU checks and git diff --check passed. **6/6 targeted old-logic mutants were detected** in disposable copies. Initial selection-only mutation survived the independent key guard; the combined old unchecked-render behavior was then detected. A mutant-induced timer timeout was corrected by test cleanup. Product files were never left mutated.

The frozen canonical snapshot includes all 81 prior files plus 7 new runtime/check inputs (**88 total**). Snapshot-file SHA256: `ae064e18cd4a4db3774e027fd5d7ff1d496ae10680b35fbbbc491eb76e5eab6c`. Check commands/exits/log hashes: `docs/features/f04b-fix/checks.json`; mutations: `mutations.json`; topology/runtime instructions: `browser-runbook.md`; telemetry: `run.json` and `events.jsonl` in that directory. Prior evidence is preserved.

Remaining coordinator gates: fresh independent review, source-bound image/init/normal-startup verification, fresh companion preflights, actual browser matrices and disabled-provider restart. No Docker, listener, browser, network, install, provider/GPU, deployment, spend, delegation, commit or push was performed here. Copied client/image/environment hashes and GPU acceptance remain null.

Profile: `compact-quality-first-v2`; substantive tier XL. Requested model/effort: `gpt-6.1-sol/high`; provider-resolved actual model/effort, usage, cost and active time: **null**, unavailable from this host. No model-config change or fallback. Attempt 1 preparation failed before Codex with NameError and no product work; this is launch attempt 2. Intermediate stage timestamps were not collected; check clocks and overall duration are recorded. Savings are not established.

Started-At: `2026-10-03T01:15:13Z`
Finished-At: `2026-10-03T01:36:01.001722+00:00`
Elapsed: **1248.002 seconds**, including reading, corrections and verification, within the 1500-second bound.

This is the substantive receipt for wrapper atomic installation at:
`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f04b-fix/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f04b-fix-receipt.md`
That TRACE path remains absent in the worktree for the wrapper.

Status: completed
