# I8 legacy delete refresh correction

Source: `1f226f0e74cb147a610e8a32e46cbc38592ae1d9`. WORK_UNIT_ID: `n8-replicate-i8-refresh`.

The actual mobile failure contained a prior jobs200 before uploads200/me200/jobs200. `reserve` returns before `generate` finishes balance/gallery. The actual `generate` finally clears disabled after that tail; `resume` returns the guard/openJob promise and waits publication, not gallery. The single legacy deletion case now waits the generate completion flag, then uses the unchanged `clickAndWaitForHandler` for resume before visible comparison, held share and observer installation. Production and heldPair were not edited; no production defect is confirmed.

The new local test executes the extracted actual case, unchanged helper and actual app handlers with deterministic delayed response/page/DOM seams. It reproduces the original extra prior gallery response and passes the fixed sequence. The exact DELETE200, exactly three ordered refresh200 responses and owner404 assertions remain. Negative DELETE/refresh/order/404 cases reject. Reverting the predecessor waits makes the unchanged positive oracle fail; restoration passes.

| Existing check | Exit | Evidence |
|---|---:|---|
| New focused suite, 3 tests | 0 | replicate-i8-refresh-baseline.log |
| Related observer/async suites, 17 tests | 0 | replicate-i8-refresh-related.log |
| Node22 scripts/check.js static build | 0 | replicate-i8-refresh-build.log |
| Reverted waits, unchanged positive test | 1 | replicate-i8-refresh-mutation-red.log |
| Restored focused suite | 0 | replicate-i8-refresh-restored.log |

Commands and immutable hashes: `docs/telemetry/n8-20261002-1740/replicate-i8-refresh-checks.json`. Candidate SHA256 `f3450c2cc1d2181df6f53b25bad15797ec40f207a72110a4201bc8b8f463b420`; test/oracle SHA256 `92812de4fe6c3adf593495aa5d3c011af36871d65df2c7712f49db13f9f28c0d`. Launch SHA256 `cf685673c2ac730d98d587cee62cb2826c5f3283ca835a811f649358923626db`. Evidence SHA256 `541a46430db6fd6af0bd38692e4f6cc3598279f3a93fe83c0b1729b695240a4e`.

Original correction attempt timed out: hard480s, exit124 (owner-supplied); freeze420s was missed. This delivery continuation only installs documentation/telemetry, with no source/test edits or reruns. No commit/push, Docker/browser/PG/network/provider/npm/install/secret action. Profile compact-quality-first-v2, sole requested Sol6.1/high; actual model/effort/usage/cost null for parent metadata. Protected baseline map: 9022 tracked paths, digest `d635332132b9b8f5fb779c550739d31491a3dc41edac05dcf52d3c285198189d`; final full-map verification was not recorded and remains for parent audit.

Correction delivery is complete. Fresh independent Astra review and actual browser main52+disabled2 remain parent-owned and pending. Original browser failure383.589s/source493b7d0c is preserved: only main partial; mobile hosted/disabled/row restore remain pending. Desktop hosted hold pair passed up to mobile; its fix is not reopened. Local deterministic checks/static build do not close those runtime gates.
