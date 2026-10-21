# N8 Phase 2 — validator-dependencies narrow rebind

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-dependencies-2`
- TRACE_PATH: `/tmp/n8-validator-dependencies-20261013/projects/08-interior-ai-redesign/docs/validation/validator-dependencies-fix.md`
- Launch UTC: `2026-10-13T21:48:48.100547+00:00` (coordinator event `validator-dependencies-2-start`).
- Finished UTC: `2026-10-13T21:49:55Z`; measured receipt interval: `66.899453 s`.
- Route: inherited `gpt-5.6-sol`, effort `high`; actual model/effort/fallback and attempt usage/cost: `null` because host-authoritative metadata/counters were not exposed.
- Scope: source rebind only after corrections from the other five lenses. No provider/model/API calls, external research, source edits, implementation or E2E were performed.
- Prior receipt: `validator-dependencies.md`, SHA-256 `04d4223e31a10e0d07685f1910e1eda9ef9a3c5de3faedc570e45b22b3b7e3b6`.

## Current evidence binding

| Current source | SHA-256 |
|---|---|
| `docs/Specification.md` | `a33255dc6f9dd1058108cf26968db630ba7584ffe9948349465bb78851aea8b3` |
| `docs/Pseudocode.md` | `ac6df814f53a52ab5be225cc9f2ff9e7728339f65b17abb9ee0d018ad39690d7` |
| `docs/Architecture.md` | `5bfc8c2debc9f0ba67a028d3d348a3b4e63483943eed2fe38b0c1b21845345ee` |

Ordered three-file `sha256sum` manifest SHA-256: `fa24cdf8097fe8bd9cef1ba70f57329482e9bc7acff96a5e8c5e5331045106c5`. Current `Architecture.md` lines 58–74 (`## External Dependencies` through its boundary statement) SHA-256: `1322fa9e923f2fe6433c620d5ab290e016c8272dc3e0ec244dbfe0b754c1eae6`.

## Closure result

**Verdict remains CAVEATS; score remains 94/100.** The capability inventory still contains exactly **5 CONFIRMED and 4 UNCONFIRMED** rows, with the same checked date, provider quotes, verdicts and requirement consequences reviewed in the prior receipt. The corrected contracts add no mandatory external integration and make no stronger provider claim.

| Corrected surface | Dependency check |
|---|---|
| Rate/auth/owner/transport boundaries | Atomic PostgreSQL rate buckets, cookie/Origin checks, owner-scoped repositories and the custom local HTTP entrypoint are application/database behavior. No new provider capability is assumed. |
| Dispatch and immutable request snapshot | The saved request bytes, consent hash, deadline, fence and mark-dispatched linearization refine the existing OpenRouter adapter. The one bounded external POST, structured-output caveat, local semantic validation and fail-closed spend controls remain unchanged. |
| Refund handling | The contract still consumes the existing ЮKassa notification/status-refetch surface: it verifies refund status and the linked payment, then applies local holds/revocation. It does not claim HMAC verification, automatic refund initiation or merchant entitlement. Those remain outside the claim. |
| Provenance, quotas and budget rules | Export provenance, GLB/file bounds, immutable budget inputs, reserve arithmetic and quota order are local storage/domain controls. They remain independent of automatic retailer price/stock, Pinterest API access and metric reconstruction. |
| Owner CSV | `FR-procurement-4`/`ExportShoppingList` reads an owned immutable local budget snapshot and emits a local UTF-8 CSV response. It does not call a spreadsheet, retailer, storage or delivery provider. |
| Operator reconciliation | `ReconcileJob` is an audited local script using separate DB credentials and explicitly performs no network call or redispatch. It does not manufacture provider usage/cost; unknown cost keeps the reservation. |

The mandatory flows remain operable when all four unknown features are absent:

- retailer automation/B2C entitlement → manual immutable product snapshot and official user-opened link;
- arbitrary Pinterest read → upload or stored HTTPS link, no OAuth requirement;
- metric/25-second reconstruction → manual room measurements/GLB calibration and immutable shell;
- provider live availability/entitlement → manual/demo modes plus fail-closed live configuration, with no live inference or real payment required for local acceptance.

No capability overclaim was introduced. The updated refund contract is verification of a provider-originated object, not an automatic-refund capability; owner CSV and operator reconciliation are local. The prior live-enablement gates remain unchanged: prove OpenRouter entitlement/effective limits and exact endpoint behavior only under separate authorization; prove ЮKassa merchant/test-shop flows in an allowed environment; keep the four UNCONFIRMED features disabled; pin and fixture-test Babylon.js/glTF Validator locally.

Blocking dependency fixes for the accepted local/manual-first scope: **none**.

Status: completed
