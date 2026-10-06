# N7 dependency security correction receipt

RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
Coordinator run label: RUN20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f08-dependency-fix-a1
TRACE_PATH: /tmp/n7-f08-dependency-fix-a1-receipt.md
Source revision: 967acf90519b0a81d4adee3ffac52244d89219ba
Result revision: 6adcd529554a5c861fdf61d913e4bf3b18758443
Branch: work/n7-f08-dependency-fix-20261006
Worktree: /tmp/n7-f08-dependency-fix-20261006
Launch: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-replicate/projects/07-cold-email-warmup/docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/f08-dependency-fix-a1/launch.json
Launch SHA256: edff4e2aad8f0cb2530bf254cb324e98774e4c66202dd1be2fed94d650c1c4a1

Scope: exactly projects/07-cold-email-warmup/package.json and package-lock.json.
Commit: fix(n7): удалить уязвимую цепочку dev-зависимостей. No push.
Authorization: coordinator supplied applicable OWN-N7-005; no new access, spend, live mail, charge, deployment, or publication.

Fix: exact typescript-eslint 8.46.1 → 8.48.0. Official registry metadata confirms 8.47.0 still uses fast-glob; 8.48.0 replaces that path with tinyglobby and supports existing ESLint9.39.1/TypeScript5.9.3. fast-glob, micromatch, braces and their unused dependencies are absent from the resulting lock. No force audit fix, overrides, or suppression. Registry evidence: /tmp/n7-f08-dependency-fix-a1/registry-choice.json and full metadata files.

ROUTE: dependency-only configuration correction; mechanical router returned T/exit0; substantive security finding preserves full audit plus lock/lint/typecheck/build requirements. E2E preflight: not_applicable because runtime app source/tests and production dependency entries are unchanged; unit/PG/browser reruns explicitly excluded by coordinator. Independent feature review remains mandatory outside this work unit.

Checks on result 6adcd529554a5c861fdf61d913e4bf3b18758443, Node22.20.0, isolated actual dependencies (no shared node_modules writes):
- npm install --save-dev --save-exact typescript-eslint@8.48.0 --ignore-scripts --no-fund: exit0; bounded fetch timeout20000ms/retries1; own /tmp cache; /tmp/n7-f08-dependency-fix-a1/install.log.
- npm ci --ignore-scripts --no-audit --no-fund: exit0; resulting package-lock SHA identical before/after; /tmp/n7-f08-dependency-fix-a1/ci.log, lock-before-ci.sha256, lock-after-ci.sha256, lock-consistency.exit.
- npm audit --audit-level=high --json: exit0, zero vulnerabilities at every severity; /tmp/n7-f08-dependency-fix-a1/audit-full.json.
- npm audit --omit=dev --json: exit0, zero vulnerabilities; /tmp/n7-f08-dependency-fix-a1/audit-production.json.
- npm run lint: exit0; /tmp/n7-f08-dependency-fix-a1/lint.log.
- npm run typecheck: exit0; /tmp/n7-f08-dependency-fix-a1/typecheck.log.
- npm run build: exit0; /tmp/n7-f08-dependency-fix-a1/build.log. Checks serialized under /tmp/codex-heavy-build.lock with bounded mutex wait90s/run150s.
- git diff --check and exact two-file allowlist: pass; committed-paths.txt lists only authorized files; clean final worktree.
- Production lock entries unchanged; vulnerable packages absent: pass, /tmp/n7-f08-dependency-fix-a1/lock-review.log.
- src/tests tree identity before/after equal; runtime tree SHA256 be9c34bca3c4b6d5e8dd8695128326fc9afde42f5bebbf06edfd4d64b0d71f22; git diff source..result -- src tests exit0.

Evidence: /tmp/n7-f08-dependency-fix-a1/summary.json plus per-check .exit/.log/.json and UTC timestamps.
Profile: compact-quality-first-v2, inherited bounded Sol implementation with fresh Astra independent review owned by coordinator. Requested model: gpt-6.1-sol/high. Actual model: null; actual effort: null; usage: null; cost: null. Host does not expose actual-model/effort or per-agent usage/cost measurement; no estimates substituted.
Started (serialized launch): 2026-10-06T11:53:32.407873+00:00
Ended: 2026-10-06T11:58:44.523778+00:00
Elapsed: 312.116 seconds, including instruction reading/install/checks/commit/handoff. Active time: null, host interval accounting unavailable. Bound: 2026-10-06T12:01:32Z; finished within bound.

Remaining: coordinator integrates commit 6adcd529554a5c861fdf61d913e4bf3b18758443, performs fresh independent Astra review of combined F08 candidate and existing mandatory overall feature gates. This dependency work unit is complete; it does not self-accept F08 or authorize publication.
Status: completed
