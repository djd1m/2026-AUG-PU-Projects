# I4 bounded implementation boundaries

2026-10-03 · approved F07 plan retained · substantive XL. Owner autonomy and spend0 remain in force. I1–I3 have independent acceptance; I3 APNG finding is closed. This partitions the accepted lifecycle implementation, without a new scheduler, ledger or provider contract.

## I4a — durable lifecycle before HTTP wiring

One Sol6.1/high attempt≤25minutes, then real PostgreSQL16 affected scenarios and independent Astra/high review≤8minutes. Own `web/jobs.js`, narrowly necessary existing `web/provider-submissions.js` helpers, `tests/replicate-lifecycle.integration.test.js`, focused tests if meaningful, and I4a handback/telemetry. If the500-line ceiling requires separation, one `web/replicate-jobs.js` helper may hold these same ordered transactions; it is not a second queue.

Intercept every hosted submission before generic retry: known identity reclaims the same attempt/ticket/original deadline with a new job fence, while submitting/ambiguous without ID fails locally without a second ticket/create. Terminal provider failure/cancellation never authorizes another create. Current attempt/hard deadline must terminalize and uniquely release credit even after live() becomes false. Account→job→submission locks and post-lock DB time remain authoritative. Hold after durable authorization permits the existing bounded private attempt; hold before submission remains denied by I1. Deletion immediately tombstones/fences/releases and marks known identity for cleanup; late identity uses I1 cleanup-only binding. No provider spend/ticket decrement.

Expose the minimal worker-only locked context/final-pre-send check needed by I2, using original deadline/remaining time and immutable submission bindings. No HTTP/browser route or credentials. Persist cleanup-needed/unresolved markers in existing rows; remote cleanup execution is a later I4 sub-slice. Existing local fixture/controlnet retries must remain compatible. Do not extend hosted completion/evidence schema in I4a: that depends on the accepted I5 discriminated evidence work.

Acceptance: real PG races for two reclaimers, stale fence, deadline despite expired lease, no-ID crash, terminal provider status, hold/deletion/late identity and unique release; literal unchanged attempt/ticket/counters/deadline/spend assertions. Existing I1 PG and relevant jobs tests remain mandatory after production lifecycle changes. No mocked SQL substitutes for this proof.

## Remaining dependency order

After I4a acceptance, implement the accepted hosted evidence/schema/completion conjunction from I4/I5 before declaring hosted result completion usable; preserve existing fixture/controlnet validators. Then connect I2/I3 to the worker and the existing maintenance pass with bounded remote cleanup claims. Each concrete next ownership/check set is recorded before its writer launch. I4 is not complete from I4a alone. Final I6 mutation, I7 full regression/contract review and I8 actual shared-Docker browser remain mandatory. Real paid pilot/privacy/license/safety/quality/performance and deployment remain external gates, unauthorized at current spend0.
