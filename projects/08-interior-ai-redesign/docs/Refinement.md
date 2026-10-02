# RoomKind — Refinement

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | no image/style | 400 with actionable message | no job/credit effect |
| Max size | >10MB or20MP image | 413/422 | bounded decode and cleanup |
| Concurrent access | two starts with one credit | one reservation | account lock + real postgres test |
| Network failure | dropped202 response | same job via same key | idempotent resume |
| Worker crash | lease expires | ≤2 attempts, stale fence denied | deadline and unique refund |
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
