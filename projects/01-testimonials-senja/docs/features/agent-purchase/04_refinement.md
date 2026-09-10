# Refinement — agent-purchase

Mandatory negative cases: foreign merchant/buyer/resource/order/method; malformed money, payload hash conflict, stale quote/terms; grant without consent; expired/revoked consent; auth replay/CSRF; two agents plus UI; provider lost response, expired idempotency window and worker crash; duplicate and early webhook; refund before payment event; N3 outage; gateway restart; TEST/live mismatch.

Budget uses persisted merchant/buyer/currency/calendar bucket shared across grants; new mandate never resets spend. A 30-day subscription can need two renewals in one calendar month: 990 RUB monthly cap then requires human action and never silently raises the limit. User may still buy manually with explicit consent.

Revocation before dispatch fence prevents network call; after fence result is reconciled. No blind automatic retry after terminal denial. Partial refunds do not refill spend allowance. Same-event synchronous fulfillment and outbox consumer must share effect identity during cutover.

Availability of agent gateway must not affect ordinary human pages. No rollout when legacy human CJM regression fails.
