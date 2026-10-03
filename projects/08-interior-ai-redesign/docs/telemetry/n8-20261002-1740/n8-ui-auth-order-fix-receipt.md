# N8 browser delete/auth ordering correction receipt

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-ui-auth-order-fix
ATTEMPT_ID: n8-ui-auth-order-fix-1
Source: 8da82681889e2b0197184873e002e643eb149aac
Build: dirty source snapshot 289318c6b7b1975cbef6f7f821af219700629fb366e697a37ee943302911ad1c
Launch-SHA256: 7d4c00dc62dc0475267f210d6bd98731b8543a2dd52fd532e50d7c3ac4b9e85b
Started-At: 2026-10-03T02:40:03+00:00
Finished-At: 2026-10-03T02:45:15.630538+00:00
Verdict: scoped fixture correction and local checks PASS; fresh parent review and actual full browser E2E pending outside this work unit.

Confirmed source defect: the previous delete/share scenario waited only for
result:hidden, while app.js clears that result before DELETE and uploads/account/
gallery refreshes. R4 could revoke the session while those requests still ran,
allowing an unintended 401 to clear the account before its designated held 401.

Only fixture ordering changed. clickAndWaitForHandler temporarily wraps the actual
onclick, preserves its receiver/event and returned operation promise, performs
ordinary button.click, awaits completion, propagates rejection and restores the
handler. The existing named delete/share regression keeps its real pending share;
DELETE must return 200, its three real authenticated refreshes must return ordered
200s, and the deleted owner job must return 404. The original account and logout
must remain visible before R4 revokes the real session. R4 still holds the actual
401, performs ordinary logout/new login, releases that old response and verifies
new-account survival. The later delayed-logout case remains intact.

Changed paths relative to N8: scripts/ui/browser-cases.js,
tests/ui-auth-order.test.js, docs/features/ui-auth-order-fix/README.md and this
receipt. Production bytes, accepted upload/payment corrections, other browser
matrix cases, manifests and lockfiles are unchanged. No arbitrary sleeps, forced
clicks, synthetic browser successes, network, Docker, installs, providers, secrets,
spend, global changes, delegation or commits. Parent owns integration.

Checks, existing Node v22.22.3 via /tmp/n6b-f06-node22/bin:

- node tests/ui-auth-order.test.js: 1/1 passed, exit 0. Deterministic local protocol
  doubles show hidden result while DELETE/each refresh remain pending, prove actual
  click/receiver/event/returned-promise semantics, rejection propagation, missing
  promise rejection and handler restoration. These are not browser/HTTP evidence.
- Old-order mutation replaces promise wait with result:hidden: 1/1 failed, exit 1,
  specifically "hidden result must not finish the operation barrier". Corrected
  bytes restored exactly; same focused test passed 1/1, exit 0.
- node tests/ui-upload.test.js: existing 10/10 passed, exit 0.
- npm run build: all project ESM/static JavaScript syntax verified, exit 0.
- git diff --check and production/unrelated fixture scope diff: exit 0.

Snapshot recipe: SHA-256 of sorted compact JSON containing baseline source and
these five source/check hashes. Raw runtime/prompts and check logs stay outside git.

| Source/check | SHA-256 |
|---|---|
| `scripts/ui/browser-cases.js` | `6c5604aeb6fe4d44c979aff0786d353f061ba49d31f4f43960c44bee4b5b5209` |
| `tests/ui-auth-order.test.js` | `d655d3d4177775b1dffaef824ba86c427b1f253bb94c124260a2a274e1c40b34` |
| `docs/features/ui-auth-order-fix/README.md` | `c0070b7e619b4f2a2f25601e23a7d18eb83c11c887d83b3f0f278e36be717951` |
| `tests/ui-upload.test.js` | `651493c9c1794a79f1963b0e22a676844dbc12e0e1aa15c972b73fb8b28c6f10` |
| `scripts/check.js` | `df39e9efb54e2f5b58731c6eb7646ea840eaeada9a21b8c2f01801a2c11de58f` |

| External check log | SHA-256 |
|---|---|
| `/tmp/n8-ui-auth-order-fix/old-order-mutant.log` | `1f0a3ab0afca12a8b5b3866a537143e53ebeac8cd471a324fd3d964c4a501b3a` |
| `/tmp/n8-ui-auth-order-fix/restored-auth-order.log` | `85ba29d4ac1db4aa2d5d0a3d2bd046e8c064fd4101b05a1066b8116e5fa5c250` |
| `/tmp/n8-ui-auth-order-fix/ui-upload-regression.log` | `7b5e052238af1129dc3a7060e9bddeb7dbdc0091c6ff88ad1a457f496a91dce5` |
| `/tmp/n8-ui-auth-order-fix/build.log` | `a531d40304097a26de3f50306e4409351d492bfe2ac42c84a53971ca51cad8ee` |

Profile: compact-quality-first-v2. One bounded S executor; requested and CLI-banner
confirmed actual model gpt-6.1-sol high (/tmp/n8-ui-auth-order-fix/runtime.log,
lines 5 and 9). No model switch or fallback. Duration including preparation,
implementation, mutation/restoration and handoff: 312.631 seconds / 480s cap.
Usage/tokens/cache/cost/active time: null; attributable host counters unavailable.
No measured savings or aggregate product acceptance claimed.

Both explicit-file ROUTEs returned exit 0 with mechanical M from existing
cache/timeout constructs. Substantive S correction is justified by fixture-only
observation: no production behavior, timeout or public contract change, permitted
by this brief; overall XL product gates unchanged. Stage record is
 docs/features/ui-auth-order-fix/README.md. No shared resource change requires a
new concurrent test. E2E preflight: not_applicable, as actual full-browser E2E and
fresh independent review are explicitly assigned to parent later. Prior failed
E2E records remain untouched. Shared run passport belongs to parent.

Telemetry: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-ui-auth-order-fix/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-ui-auth-order-fix-receipt.md

Status: completed
