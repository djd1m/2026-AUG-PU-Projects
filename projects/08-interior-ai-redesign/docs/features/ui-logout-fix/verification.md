Verdict: PASS for the confirmed, bounded product logout-control correction. Full browser acceptance remains pending the parent run.

RUN_ID: `n8-20261002-1740`
WORK_UNIT_ID: `n8-ui-logout-fix`
ATTEMPT_ID: `n8-ui-logout-fix-1`
Source-Revision: `6792c6a999ee32e8d1eb6f7037f8553159b806c2` (baseline; uncommitted candidate hashes below)
Build-Revision: `8a1a6ac5a88da37b3febc6bc81a1a1934eefeff8b575f960345a7f0da78a1d27` (SHA256 of candidate-hashes.json; local syntax build, no image/runtime claim)
Launch-SHA256: `949bed53ab999391fc0a4fcd0fa9a9827e8e1ff9c42a1b7e40d076c7040981d6`

Changed only product `web/public/app.js` and `tests/ui-app-races.test.js`, plus correction evidence. The login handler's finally now sets button disabled state from current `logoutPending`. Completing an earlier login therefore preserves both login/register controls while the newer logout is pending; logout's existing completion handler enables them when its request settles. The submit guard, logout identity check, and stale account generation checks remain intact.

The deterministic regression runs the actual app: hold an earlier login's uploads load, start logout and hold its handler request, finish the earlier load, assert both auth controls remain disabled and a second login request is blocked, settle logout, then verify controls enable and login to B succeeds. No browser fixture, assertions, backend, payment, schema, worker, manifest, or previous failed E2E evidence was changed.

Validation on Node `v22.22.3`: **48/48 local tests PASS**: actual-app races5, state6, upload10, auth-order1, payment fixture10, boundaries7, media5, UI HTTP4. Each uses `node tests/<suite>.test.js`; `npm run build` and `git diff --check` PASS. Scope check passed against the explicit allowlist. Exact commands, exits, timing and log hashes: `docs/features/ui-logout-fix/checks.json`; all evidence hashes: `evidence-hashes.json` in that directory.

Mutation: restoring the original unconditional-enable line produced **4 PASS / 1 FAIL**, specifically “earlier login finally must not enable login/register while logout is pending”. Restoring the fixed bytes produced **5 PASS / 0 FAIL**. `mutation-restoration.json` confirms exact restoration. Initial `node --test` invocation returned only file-level diagnostics and was recorded as inconclusive; direct Node execution obtained the meaningful assertion. No implementation change or optional polish followed the passing checks.

Exact corrected hashes:

- `web/public/app.js`: `15a8dd97b39e0a2fb9d307ce26ddcf5ac857d01e15e2de1cbca09102b86ebbe3`
- `tests/ui-app-races.test.js`: `9c10ba5cdbb4ad63f09cc1521c7dfe52497cf7a43b1b4e1a3723f47eecb2ef0a`

`candidate-hashes.json` binds every JS build/check input and package/lockfile; all remained unchanged after verification. Dependencies were existing; no image/browser/GPU or provider acceptance is claimed.

Profile: `compact-quality-first-v2`; mechanical ROUTEs M/exit0, substantive **XL session boundary retained** within accepted F04 design and recorded owner autonomy. One isolated writer, one implementation pass, no delegation, model change or fallback. Requested model/effort: `gpt-6.1-sol/high`; actual CLI execution banner: `gpt-6.1-sol/high` (saved `model-evidence.txt`). Provider-resolved model, tokens, usage, cost and active time: **null**, unavailable. One verification invocation retry; no escalation. Savings are not established without a comparable baseline.

Started-At: `2026-10-03T03:00:00Z`
Finished-At: `2026-10-03T03:05:20.351162+00:00`
Elapsed: **320.351 seconds**, including reading, implementation, mutation and checks; within600s.

Parent gates remain mandatory: fresh independent Astra review and actual source-bound browser UI6 full matrix/preflight. These are outside this isolated correction unit, explicitly retained and not reported as passing. No Docker, network/install, live provider, spend, GPU, secrets, other-project/global settings, commit or push actions were performed.

Evidence: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-ui-logout-fix/projects/08-interior-ai-redesign/docs/features/ui-logout-fix`
Telemetry / terminal receipt: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-ui-logout-fix/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-ui-logout-fix-receipt.md`

Status: completed
