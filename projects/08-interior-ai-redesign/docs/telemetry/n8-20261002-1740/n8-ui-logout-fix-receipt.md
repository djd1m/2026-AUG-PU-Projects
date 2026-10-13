Verdict: PASS for the bounded product logout-control correction. Browser acceptance remains pending the parent run.

RUN_ID: `n8-20261002-1740`
WORK_UNIT_ID: `n8-ui-logout-fix`
ATTEMPT_ID: `n8-ui-logout-fix-1`
Source-Revision: `6792c6a999ee32e8d1eb6f7037f8553159b806c2` (baseline; uncommitted correction)
Build-Revision: `8a1a6ac5a88da37b3febc6bc81a1a1934eefeff8b575f960345a7f0da78a1d27` (candidate-hashes.json SHA256; local syntax build)
Launch-SHA256: `949bed53ab999391fc0a4fcd0fa9a9827e8e1ff9c42a1b7e40d076c7040981d6`

The login handler’s `finally` now sets button state from current `logoutPending`. An earlier login completion therefore keeps login/register disabled while logout remains pending. Existing submit, logout identity, and stale-account guards are preserved.

Added a deterministic actual-app regression that holds the previous login load and logout request, completes the earlier login, checks both controls remain disabled and no second login request occurs, then settles logout and verifies login resumes.

**48/48 local tests passed:** app races5, state6, upload10, auth-order1, payment fixture10, boundaries7, media5, UI HTTP4. `npm run build`, `git diff --check`, and scope verification passed.

Restoring the original product line yielded **4 passed / 1 failed**, at the exact assertion: “earlier login finally must not enable login/register while logout is pending”. Restoring corrected bytes yielded **5/5 passed**. The initial `--test` invocation lacked assertion diagnostics and remains recorded as inconclusive; direct Node execution supplied the meaningful mutation evidence.

Exact corrected source hashes:

- `web/public/app.js`: `15a8dd97b39e0a2fb9d307ce26ddcf5ac857d01e15e2de1cbca09102b86ebbe3`
- `tests/ui-app-races.test.js`: `9c10ba5cdbb4ad63f09cc1521c7dfe52497cf7a43b1b4e1a3723f47eecb2ef0a`

Evidence under `projects/08-interior-ai-redesign/docs/features/ui-logout-fix/`: `checks.json`, test/build logs, `candidate-hashes.json`, `mutation-restoration.json`, `evidence-hashes.json`, and `progress.json`.

Profile: `compact-quality-first-v2`; mechanical ROUTEs M/exit0, substantive XL session boundary retained within approved autonomy. Requested and CLI-reported model/effort: `gpt-6.1-sol/high`; provider-resolved model, usage, cost and active time: **null**, unavailable. One implementation pass, one verification invocation retry, no fallback or escalation. Savings are not established.

Started-At: `2026-10-03T03:00:00Z`
Finished-At: `2026-10-03T03:05:20.351162+00:00`
Elapsed: **320.351 seconds**, including reading, implementation and checks; within600s.

Fresh independent Astra review and actual browser UI6 matrix/preflight remain mandatory parent gates. Previous failed E2E evidence is preserved. No browser harness, backend, payments, schema, worker or manifests changed; no delegation, Docker, network/install, live providers, spend, GPU, secrets, global settings, commit or push actions performed.

Telemetry / terminal receipt:
`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-ui-logout-fix/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-ui-logout-fix-receipt.md`

Status: completed