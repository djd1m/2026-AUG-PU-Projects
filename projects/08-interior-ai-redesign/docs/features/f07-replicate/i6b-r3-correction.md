# I6b R3 registration-cap correction

Source: cdb5fbaa5cbb26ef1c4f3243296e93df5d68291e. R3 is a coordinator source finding, not an executed browser failure. Original author attempt timed out before handoff; that attempt is not marked passed. This delivery only preserves completed changes and prior verification evidence.

hostedCases opens a fresh same-viewport context and uses the existing DOM login helper with that viewport main owner's credentials after extendedCases restores the owner. Real /api/me must return the original ID and email before fixture purchase. The distinct other account and cross-owner 404 checks remain. No additional accounts are registered.

Registrations: other once + (main owner once + failure account once) × 2 viewports = 5, preserving the 5/hour/IP cap. Per main owner, legacy reservations are 3 base + 1 uncertain-response reservation (the identical-body/key retry returns the same job) + 2 delayed A/B + 1 late-detail + 1 share-deletion = 8. Hosted reservations add 5: completion, missing/disabled configuration (one shared job), hold-before, hold-after, deletion = 13 < 20/day. This is exact source accounting checked by the focused test; actual browser/runtime counts remain pending I7/I8.

All 42 legacy + 10 hosted browser cases remain; R1/R2 deletion, hold and canonical-digest logic is preserved. Changed product/test files: scripts/ui/browser.js, scripts/ui/replicate-cases.js, scripts/ui/browser-cases.js (login export only), tests/ui-replicate-registration.test.js.

Prior commands, run from PROJECT_ROOT:
- `/tmp/n8-node22 --test tests/ui-replicate-registration.test.js tests/ui-replicate-corrections.test.js`: final run PASS 8/8 (3 new + 5 R1/R2); retained actual output in delivery snapshot. Initial combined run was 7/8 due to an extra /api/me observed by the focused test; the final implementation reuses the authenticated account response.
- `/tmp/n8-node22 scripts/check.js`: PASS, actual output retained.
- `git diff --check`: PASS (exit 0, empty stdout retained).

No tests were rerun during delivery. Prior I6b 43 units are inherited evidence, not rerun. Browser, frontend actual runtime and parent I7/I8 remain pending. No production/backend/config/DB changes or external operations were performed.

Profile: sole requested Sol6.1/high, no delegation or fallback. Actual model, usage and cost: null, awaiting host metadata. External spend: 0. Original attempt exceeded its hard window per parent; delivery duration is recorded in the separate receipt. Product/test byte copies, PROJECT-relative paths/SHA256, original changed-file hashes and protected baseline reused from the progress record are in docs/telemetry/n8-20261002-1740/replicate-i6b-r3-delivery-snapshot/manifest.json. Historical protected files were not rescanned during delivery.
