Fixed exactly the three confirmed findings. Bounded correction completed in **348,105 ms (5m48s)**. Feature acceptance remains pending coordinator PostgreSQL checks and independent review.

1. **WebP provisioning:** fixtures now store actual WebP input bytes with matching upload, evidence and corpus hashes. Integration provisioning declares `image/webp`; output/depth remain PNG. Schema unchanged.
2. **Corpus coverage:** validation requires 12 distinct input hashes among rooms with at least three styles. The exact aliases-plus-single-style negative case rejects; valid 12×3 coverage passes.
3. **Engine lifecycle:** requests, cancellation and failure handlers are child-scoped. Termination promises survive protocol failure, and `stop()` awaits relevant processes. Real subprocess restart tests pass without sleep workarounds.

Changed files, relative to `projects/08-interior-ai-redesign/`:

- `web/generation.js`
- `web/quality.js`
- `tests/generation.test.js`
- `tests/engine-double.py`
- `tests/quality.test.js`
- `tests/quality-fixtures.js`
- `tests/quality.integration.test.js`
- Evidence files under `docs/features/f02b/fix-*`

All commands used `/tmp/n6b-f06-node22/bin/node` from the project directory:

| Arguments | Result |
|---|---|
| `scripts/check.js` | Build syntax passed |
| `tests/boundaries.test.js` | 7 passed |
| `tests/media.test.js` | 5 passed |
| `tests/jobs.test.js` | 5 passed |
| `tests/generation.test.js` | 13 passed |
| `tests/quality.test.js` | 7 passed |
| `tests/mutation.test.js` | 3 passed |
| `scripts/mutation.js fixture` | Targeted mutation detected |

**40/40 unit tests passed.** Independently restoring each original defect in a temporary copy produced exit 1 at its targeted assertion. Restoring the old engine reproduced both premature-stop and replacement-request failures. `git diff --check`, file ownership and frozen snapshot verification passed.

| Receipt field | Value |
|---|---|
| RUN_ID | `n8-20261002-1740` |
| WORK_UNIT_ID | `n8-f02b-fix` |
| ATTEMPT_ID | `n8-f02b-fix-1` |
| Source-Revision | `30faa9d4172852244a14fe96e85a56c44e2ed709` |
| Launch-SHA256 | `f7175d54633d25f9a41e92bc7af77cad8974e28f792314c68a7db56e22f18c59` |
| Build-Revision | `0c501c67861efcf17860fa114db9577810663dbe46697a3fcee6400cff568235` |
| Finished-At | `2026-10-02T22:18:18.903975+00:00` |
| Profile / risk | `compact-quality-first-v2` / inherited substantive XL |
| Requested model | `gpt-6.1-sol`, high |
| Actual model / effort | `null` — host confirmation unavailable |
| Usage / cost / active time | `null` — unavailable |

Build-Revision hashes canonical JSON `{files:[...]}` for **45 files**, all independently reverified. It is a source snapshot; no container image was built.

Evidence is under `projects/08-interior-ai-redesign/docs/features/f02b/`: `fix-attempt.json`, `fix-events.jsonl`, `fix-build-snapshot.json`, `fix-build-supplement.json`, `fix-checks.json`, `fix-regression-mutations.json` and their logs. Every final check/mutation log has a verified SHA256. The checks-index SHA256 is `129f48865313323f264a833377278ee44d92833d1eea1639733b4b501a3f0bbd`.

**Pending:** coordinator must run all six real PostgreSQL quality scenarios through their assertions and obtain fresh independent closure review. GPU geometry/performance and transitive compatibility remain unmeasured. No Docker, deployment, provider or GPU actions occurred. Initial focused logs were overwritten by the final suite run; final logs and defect-reversion evidence are preserved.

Receipt destination remains absent for coordinator installation: `projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f02b-fix-receipt.md`. No commit or push performed.

Status: completed