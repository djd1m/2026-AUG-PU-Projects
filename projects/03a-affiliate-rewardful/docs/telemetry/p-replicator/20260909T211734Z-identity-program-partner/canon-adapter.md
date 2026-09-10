# Canon adapter receipt

RUN_ID: `20260909T211734Z-identity-program-partner`
WORK_UNIT_ID: `canon-adapter`
Base revision: `d7a31e47b36a623f2690704701287d64e73858b8`
Started: `null` (launch timestamp not captured)
Ended: `2026-09-10T09:08:02.875Z` (measured by `date -u`)
Requested model/effort: `gpt-5.6-luna` / `medium`
Actual model/effort: `null` / `null` (host attestation unavailable)
Usage/cost: `null` / `null` (host counters and billing evidence unavailable)

Implemented only the assigned files:

- `scripts/check-canon.mjs`: verifies pinned upstream SHA-256 `99e6bff9b0078eb2ec23f7df98b7ac06c894f9018eba4a8c358e8f92e5ec7b06`, then executes a temporary byte copy whose only behavioral change scopes `unitRows(text)` to the single exact `## Единицы` section. Missing or duplicate section headings return exit 2. Temporary files are removed in `finally`. CLI accepts project root, default `.`.
- `tests/canon-checker.test.mjs`: isolated fixtures cover upstream false duplicate versus adapted pass, duplicate actual unit (2), wrong hash (1), missing canon (1), absent/duplicate unit headings (2), and upstream byte pin.

Validation:

`node --test tests/canon-checker.test.mjs` → 6 tests passed, 0 failed.

Source hashes, computed mechanically with `sha256sum`:

| File | SHA-256 |
|---|---|
| `scripts/check-canon.mjs` | `4dc0139408cb00f64b6a072b54cc752c155bd13315fcebf1e948156aa054dad9` |
| `tests/canon-checker.test.mjs` | `984e5105810cea4976ae226676ada8b0a5d33fa487c8345c143a6fa26fbd6436` |
| `../../.claude/hooks/check-canon.cjs` (pinned upstream) | `99e6bff9b0078eb2ec23f7df98b7ac06c894f9018eba4a8c358e8f92e5ec7b06` |

No manifests, lockfiles, upstream vendor files, application source, installs, containers, or commits were touched. Root independently reviews and mounts the adapter.

Status: completed
