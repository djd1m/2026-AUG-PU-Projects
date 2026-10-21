# billing — algorithms

Logical data/ports/API source: ../../Pseudocode.md (exact current hash af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59). No second model list/schema.

### Algorithm: Checkout
REQUIREMENT: `FR-billing-1`
REQUIREMENT: `AC-billing-1`
REQUIREMENT: `AC-billing-2`
REALISES: SC-US-012-1, SC-US-012-2
INPUT: authenticated account, server SKU, idempotencyKey. OUTPUT: pending order/redirect or disabled.
1. GuardRequest; config off→503, live incomplete→startup failure. Test provider only constructor injection with NODE_ENV=test. Read trusted SKU; lock account, unique(accountId,key), compare requestHash; save immutable intent/amount/credits before provider I/O.
2. Call donor PaymentProvider.createPayment using order.id as remote idempotency key outside transaction; timeout keeps created intent for same-key reconciliation, not new payment.
3. Conditionally store remoteId/status/HTTPS confirmation URL after matching amount/currency/order metadata. GET return page only reads owned status; it never grants credits. RETURN same order on replay.
COMPLEXITY: O(1) DB + one bounded provider request.


### Algorithm: ApplyVerifiedPayment
REQUIREMENT: `FR-billing-2`
REQUIREMENT: `AC-billing-3`
REQUIREMENT: `AC-billing-4`
REQUIREMENT: `AC-billing-5`
REQUIREMENT: `AC-billing-6`
REALISES: SC-US-013-1, SC-US-013-2, SC-US-013-3, SC-US-013-4
INPUT: raw bounded webhook, direct/trusted peer IP. OUTPUT: 200 applied/duplicate, 400 invalid or 503 retry.
1. Provider off→404. Reject untrusted source; parse only to identify event/object; Payment event: re-fetch fixed payments/:id and validate full shop/test/currency/amount/paid/status/orderId/remoteId. Refund event: re-fetch refunds/:refundId, verify succeeded/RUB/positive amount≤original, fetch payment at verified refund.payment_id, validate linked original order/payment; never compare partial refund amount to full amount for equality. On provider error throw before event transaction; do not reserve event key.
2. Transaction locks Account then PaymentOrder (same order as checkout), recomputes identity checks against immutable intent; dedupe by provider + kind + remoteObjectId. succeeded transition only from created/pending with no refund_hold/billingHold: insert event and increment credits once, set paidExport if SKU permits; replay returns same result. Late succeeded after refund_hold is recorded as ignored audit, never regrants credits or export.
3. Verified refund: insert unique refund event, state refund_hold, billingHold=true, paidExport=false; revoke existing unwatermarked ShareLinks/derivative access. Admitted-but-undispatched jobs fail eligibility before mark. Do not guess unused-credit refund arithmetic. Rollback all local mutations on any error; no webhook body content in logs. Remote event ordering cannot restore entitlement after billingHold.
COMPLEXITY: O(1) indexed DB + bounded verification request.


