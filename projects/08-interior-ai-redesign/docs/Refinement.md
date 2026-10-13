# RoomKind — Refinement

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | no image/style | 400 with actionable message | no job/credit effect |
| Max size | >10MB or20MP image | 413/422 | bounded decode and cleanup |
| Concurrent access | two starts with one credit | one reservation | account lock + real postgres test |
| Network failure | dropped202 response | same job via same key | idempotent resume |
| Local worker crash | lease expires | ≤2 attempts, stale fence denied | deadline and unique customer credit release |
| Hosted crash/response loss | durable submitting/ambiguous | no second POST | terminal local state, conservative spend, operator reconciliation |
| Hosted known-ID reclaim | two workers/expired lease | same ticket/attempt/deadline, one new fence | GET only; stale attach/disposal denied |
| Provider duplicate | two identical successes | one20-credit grant | unique ledger + transaction |
| Provider mismatch | wrong amount/account/currency | no grant | provider GET + recorded rejection |
| Structural defect | moved window | rejected quality | no public accepted example |
| No GPU | real worker mode | explicit unavailable | never switch to fixture silently |
| Share revoke | old token | 404/no media | state checked every access |

## Testing Strategy
Unit: auth/validation/limits/entitlement/provenance/provider parsing. Integration: real isolated postgres migrations, concurrent ledger reserve, duplicate notification, fencing and rollback. E2E: actual web fixtures in shared Docker browser, desktop1440/mobile390, upload through comparison/gallery/paywall/share/revoke plus second-account denial. GPU: separate real corpus and performance commands, unavailable until CUDA environment. Every test artifact binds to commit or immutable dirty snapshot; browser health alone does not pass app E2E.
Full required test sets once per relevant change; no repeated green run without reason. Mutation guards must fail when owner check, payment idempotency, budget or fixture-quality exclusion is removed. Test runner capped2 workers. No new general-purpose validator.

## Test Cases
Happy: Given authenticated owner with one credit and valid room, When one idempotent job is created and worker succeeds, Then one reservation exists and owner sees before/after.
Error: Given same owner and key with a different style, When POST is repeated, Then409 and no second reserve. Growth-specific Gherkin happy/edge/security cases in `test-scenarios.md`.

## Security Hardening and Accessibility
Boundary validation, rate limits and structured safe logs; no raw media/credentials in logs. Keyboard reachable navigation, labelled image upload and slider, aria-live status, reduced-motion support, visible focus and contrast. Original/result labels remain visible; cancelled native share is not success.

## Performance and Technical Debt
Use bounded pagination, indexes on owner/status/lease and short transactions. GPU target may require tuning/resolution tradeoff after real measurement. Manual structural review protects early public examples but is not a scalable automated detector; any replacement requires new measured quality evidence. No production deployment or external spend included in current local delivery.

## Independent review corrections
The41 individually identified ACs and concrete parameter matrices in Specification/test-scenarios are the current coverage contract. Add real PostgreSQL cases for refund hold versus reservation/cached export/start, stale success after refund, first-conversion competing intents/repeat purchases, last-ticket admission, retry exhaustion, UTC rollover, queued expiry and heartbeat-resistant deadlines. Validate quality actor/output/evidence binding and XSS using an otherwise valid accepted result; rejecting fixtures alone is insufficient. That statement described the original 2026-10-02 design; later scoped software runs are recorded in Completion/acceptance-map. It is not a current whole-suite PASS.

## F07 refinement reconciliation — 2026-10-03

2026-10-03 I7 documentation reconciliation, source `be450153910208e2c043de24f7efab540b052c82`. Accepted I1–I6 includes R1/R2/R3 closures; I7 full runtime is pending at author time on parent-owned source `8890e0b7`. Fresh whole-feature review and I8 actual52 main+2 disabled browser/hosted-row restore remain pending. Historical proof retains its tested revision; this update does not declare F07/full MVP ready.

Transport failures (429/5xx/timeout/malformed/oversized/ID-commit loss) preserve one-shot submission. GET retries are bounded by the same original decreasing budget; heartbeat never renews180s/360s. FinalAuthorize and completion sample DB time after ordered locks. Known-ID late success is cleanup evidence, never job revival; cancellation cannot prove free billing or erasure. Maintenance claim30s, one cancel intent then later GET,5s remote window/pass and submitting+1h unresolved boundary are independently tested.

Single-frame media tests include CRC-correct APNG, compressed bombs, all-answer DNS policy/connection pinning, strict HTTPS hosts, metadata removal, exact crop/size, exclusive collisions and uncertain-commit winner preservation. Hosted evidence rejects unknown/sensitive fields and nonnull invented metrics, including zero/false. Quality validates actual private bytes and separate measured-hosted corpus declarations; synthetic fixtures are software proof only.

Required regression plan remains [I7](features/f07-replicate/i7-check-plan.md):32 non-PG files plus13 sequential real-PG suites, Python worker5 cases, static lint/build and existing guard mutations. This writer runs none of those commands. Accepted [I6a](features/f07-replicate/i6a-review.md) send-CAS mutation is baseline0/intended1/restored0 with exactly1→2 POST oracle; it is separate from ordinary recovery tests. I6b R1/R2/R3 closures preserve deletion/hold/canonical hash checks and cap registration at5 and main reservations13<20. Actual52+2 browser remains I8-pending.
