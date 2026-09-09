# Refinement — f3-referral-funnel

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty/malformed evidence | empty token/promo, unknown fields | explicit400, no hidden fallback | boundary tests |
| Max size |100000visits,10000customers,5000orders |429, unrelated tenant remains usable | literal-cap tests/admission |
| Concurrent access | same customer/key, opposing webhook/create | one binding/order/reward, no lock inversion | SQL integration races |
| Network failure | provider timeout or DB unavailable |503, saved key safe retry, no success claim | injected failures |
| Expiry | forged browser time, expired visit/key | server expiry authoritative; no sliding cookie | injected clock + browser tests |
| Identity | different external ID but same verified email | self-referral refused; organic remains valid | namespace tests |
| Late response | key rotation/logout or webhook before create response | no leaked token/stale result; succeeded preserved | controlled response tests |
| Refund | duplicate/partial/before payment delivery | one immutable correct adjustment | existing + connector regression |

## Testing Strategy

Unit: tracker first touch/query cleanup/window literal, input boundaries, trusted binding vs legacy event behavior. Integration: private credential isolation, revoke/version/expiry, stable bindings, provider mismatch/duplication/out-of-order and resource pressure. Browser E2E: separate merchant site signup/backend invoice, real N3 redirect/API, provider stub verification, owner and partner metrics, actual desktop/mobile A–D. Public deployment smoke separated from controlled provider proof. Meaningful mutation removes key/tenant check, promo priority, window check, trusted binding preservation or verification, and must fail.

## Test Cases

Happy path: Given enrolled partner and connected merchant; When browser follows referral, merchant verifies signup and creates invoice, then provider verifies payment; Then exactly one bound customer and commission appear.
Error path: Given invalid explicit promo and valid cookie; When merchant binds signup; Then400 and no signup mapping are committed, allowing corrected retry.

## Performance, Security and Accessibility

Reuse current pool/timeouts, no external network/KDF underSQL. Check same-key concurrent admission and one unrelated ordinary request under contention. Keyboard labels/live errors, viewport390/1440, secret response suppression after logout/member switch. No raw integration token in URL/log/localStorage. Unknown MRR represented null with reason. First live commission metric is historical activation, not net collectible balance.

## Technical Debt and Explicit Limits

Single deployment-configured merchant shop remains; no automatic existing-billing import or subscription scheduler. Exact-email self-referral is not alternate-account fraud detection. N3 email verification comes next in approved identity plan. No claim of live merchant acceptance from injected tests. No new tax/hold policy selected.
