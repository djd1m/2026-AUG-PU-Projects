# N3a PRD source evidence — chosen CJM A

Run: `20260909T174821Z-prd-a-1934`  
Work unit: `evidence`  
Date: 2026-09-09  
Donor baseline: `bccd5bb` (`feat(n3a): add reviewed HTML CJM variants for Proofwall pilot`)

## Decided product boundary

N1 Proofwall (`projects/01-testimonials-senja`) is the first and only initial
integration. It accepts a manually initiated 990 RUB, 30-day YooKassa redirect
payment; it has no automatic debit or MRR contract. N3a receives verified N1
business facts, produces an immutable partner ledger and adjustments, then prepares
the preceding calendar month's register on the 5th for an operator's manual payout.
Payment transfer and recipient receipt remain outside N3a. N2 is a source donor only.

Tax, legal classification, payout documents, cutoff timezone, and provider-account
configuration were deliberately not verified here. No claim about them follows from
this evidence.

## Capability evidence

| Capability / requirement | Verdict | Evidence and bounded consequence |
|---|---|---|
| N1 is the first integration | **CONFIRMED** | `projects/03a-affiliate-rewardful/docs/product-discovery-brief.md` at `bccd5bb`, PD-001 and PD-003 name N1 Proofwall; N2 is donor only. |
| Manual 990 RUB / 30-day renewal, no auto-debit | **CONFIRMED** | N1 checkout uses `PAID_TIER_PRICE_RUB` default `990`, creates a redirect payment, and a new UUID per intentional attempt: `projects/01-testimonials-senja/apps/web/src/app/api/checkout/route.ts:17-54`. `payment.ts:184-197` extends `paid_until`; the inspected N1 source has no saved payment method, subscription, or scheduled-charge implementation. |
| N1 partner MRR | **UNCONFIRMED** | No subscription identity, recurring-charge flag, period ledger, or partner MRR projection was found in the inspected N1 payment/schema paths. Treat MRR as unknown; do not derive it from 990-RUB payments. |
| A distinct N1 payment has a stable provider ID | **CONFIRMED** | YooKassa `data.id` is persisted as unique `checkout_sessions.provider_session_id` and later resolves the billing session (`payment.ts:256-260,267-278,170-182`; `005_payments.sql:7-14`). N3a's business uniqueness must include N1 connection plus this provider payment ID, separately from transport event ID. |
| Checkout metadata connects the customer account | **CONTRADICTED** | N1 creates remote payment metadata `{ project_id: projectId }` (`payment.ts:243-249`), but its webhook reads `body.object.metadata.account_id` to convert attribution (`webhooks/payment/route.ts:106-110`). Thus the live checkout path cannot supply that conversion identity. Resolve identity from N1's local checkout/session or a new N1 outbox payload, never webhook metadata. |
| N1 webhook claim is after provider verification | **CONTRADICTED** | N1 claims `event:type:id` before fetching the payment (`webhooks/payment/route.ts:84-101`). Provider lookup errors are thrown, so the transaction rolls back the claim (`:95-99,114-119`); `unknown_payment` and `not_paid` are ordinary early returns, so their claim can commit. N3a must not copy this order. |
| Safe donor ordering | **CONFIRMED** | N2 fetches current remote payment status before its transaction and only then inserts the webhook claim (`projects/02-review-qr-reputation/apps/web/src/payment.ts:169-195`). Reuse the ordering concept only, in N3a-owned ingestion. |
| N1 commission supports renewals | **CONTRADICTED** | N1 selects one pending attribution, marks it `converted`, then has no pending attribution for another payment (`projects/01-testimonials-senja/apps/web/src/lib/referral.ts:99-111,133-159`). N3a must post each eligible confirmed payment under its own recurring-policy snapshot. |
| N1 refund ingestion/reversal | **UNCONFIRMED** | No `refund` occurrence exists in inspected N1 `apps/web/src` or `packages/db`; webhook ignores every event other than `payment.succeeded` (`webhooks/payment/route.ts:85-87`). N3a needs a separately versioned, verified refund/reconciliation contract and linked negative entries; never rewrite a paid register. |
| Provider payment status fetch | **CONFIRMED** | YooKassa documents `GET /payments/{payment_id}` and payment status; N1 uses that endpoint (`payment.ts:107-138`). |
| Provider notifications and retry | **CONFIRMED** | YooKassa documents event notifications for payments and refunds; a non-200 response is retried for 24 hours. N1's 500 on provider unavailability is therefore compatible with a retry, but N3a still needs durable N1→N3a delivery/reconciliation. |
| Refund lookup/status and provider idempotency | **CONFIRMED** | YooKassa documents `GET /refunds/{refund_id}`, refund status, and `Idempotence-Key` for POST/DELETE. This validates provider capability, not an N1 implementation. |
| Provider webhook HMAC/signature | **UNCONFIRMED** | This evidence does not assert a YooKassa webhook signature or invent one. The cited YooKassa notification page prescribes status and IP checks. Internal N1→N3a transport authentication is a separate contract. |

## Reuse decision, exact donor scope

| Donor block | Exact path at `bccd5bb` | Reuse decision |
|---|---|---|
| N1 checkout/payment ID relation | `projects/01-testimonials-senja/apps/web/src/lib/payment.ts` (`be525af7d1b8a82c4cf3fb5911670a466611b2ecfa44e2da4f26b783b7ca78b7`) | Adapt the stable payment identity concept and per-intent idempotency. Do not import N1 tables or runtime modules. |
| N1 webhook flow and metadata defect | `projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts` (`3c63377a6277040a72df7cd62edc107288bd22da1114cf3d2c49417551d190e3`) | Do not reuse ordering or metadata identity. Preserve the documented rollback-on-provider-error principle only. |
| N1 one-time attribution behavior | `projects/01-testimonials-senja/apps/web/src/lib/referral.ts` (`86f816ecee7e17acb6bb81e6bff45cad81077a9823ce388fdf526cb7853f5664`) | Do not reuse conversion semantics as N3a ledger behavior; it prevents renewal commissions. |
| N2 verification-before-claim sequence | `projects/02-review-qr-reputation/apps/web/src/payment.ts` (`b1da88936f32174c57b78bedf586fe104c57533927ecbb864e1944e578ff6987`) | Adapt the sequence and test shape into N3a-owned code only. |
| N2 schema contrast | `projects/02-review-qr-reputation/packages/db/migrations/004_billing_partners.sql` (`b6ba7086f11fcdbca7888bbe34d1943a5c285e2a1da881b36832b1f7845c5820`) | Donor for separate event/commission uniqueness only; its converted attribution also prevents recurring commissions. |

No donor files were changed. N3a must have its own ledger, reversals, payout-register
state, dedupe constraints, and reconciliation receipt store; it must not read either
donor database or import donor modules at runtime.

## Boundary requirements for the PRD

1. N1 applies its verified local billing result and writes an N1 outbox record in the
   same local transaction. Dispatch happens after commit; N3a outage cannot block N1
   activation. Include immutable event ID/version, N1 connection/customer/project and
   checkout IDs, YooKassa payment ID, amount/currency, occurred-at, attribution IDs,
   and period facts only when N1 actually has them.
2. N3a authenticates the internal N1 transport independently (for example an agreed
   internal HMAC with key rotation and replay controls). That internal HMAC is neither
   a YooKassa signature nor a substitute for provider verification.
3. Where N3a directly ingests a YooKassa notification, authenticate by the published
   provider CIDR and canonical provider API status lookup; verify object identity,
   amount, currency, merchant context, and status before durable event claim. CIDR/API
   verification and internal transport HMAC protect different trust boundaries.
4. N3a deduplicates a positive ledger posting by `(connection_id, provider_payment_id,
   commission_kind)` and keeps transport-event receipt uniqueness separately. Refund
   adjustments link to the refund ID and original payment; partial refunds accumulate
   without deleting history.

## Official YooKassa sources checked 2026-09-09

| Page | Supported fact | Short quote (≤25 words from this page) |
|---|---|---|
| [Incoming notifications](https://yookassa.ru/developers/using-api/webhooks) | Notifications cover object status changes, including payments/refunds; non-200 delivery continues for 24 hours; authenticity can be checked by status or source IP. | “ЮKassa продолжит доставлять уведомление в течение 24 часов.” |
| [API interaction format](https://yookassa.ru/developers/using-api/interaction-format) | Basic Auth/API requests, idempotency-key behavior, 24-hour key retention; GET is naturally idempotent. | “Ключ идемпотентности нужно передавать для POST и DELETE-запросов.” |
| [API reference](https://yookassa.ru/developers/api) | Reference lists payment information, refund creation/listing/information. | “Информация о возврате” |
| [Refunds](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds) | Refund creation takes `payment_id` and amount; full and partial refunds are documented subject to payment-method constraints. | “Частичный возврат доступен не для всех способов оплаты.” |

No required external citation failed during this bounded check. Tax-law sources were not
queried because legal/tax verification is explicitly outside this work unit.

Status: completed
