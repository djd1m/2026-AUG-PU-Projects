# N3a reuse inventory — N1/N2 source audit

Run: `20260909T170111Z-discovery-958f`
Work unit: `reuse-audit`
Audited baseline: `89dc14a5b41c8b21e589a331a1bed4b6a8870ff1` (2026-09-09T15:48:34Z)
Method: read-only source/schema/test inspection. No N1, N2, or N3a product code was changed; tests were not run.

## Audit conclusion

Use **N1 as the sole first integration** and N2 only as a donor. Neither project's
database or modules may be imported at runtime. N3a owns its own immutable partner
ledger, reversal entries, and monthly manual-payout registry. It must not reuse N1's
`commissions` as a source of truth, because that would retain N1's one-conversion-only
semantics and create an independent N1 debt beside N3a's debt.

The recommended minimum N1 adapter is an **outbox row written in the same local
transaction as the N1 billing update**, then dispatched only after commit, plus an N3a
pull/reconcile endpoint/job. This removes the crash-loss window between billing commit
and outbox write. The N1 YooKassa webhook must finish its local tariff update even if
N3a is down; outbox retry is the delivery guarantee. N3a deduplicates each received
business payment by a stable N1 connection and provider payment ID. N1 may return
success to YooKassa without waiting for N3a.

## Confirmed N1 flow

| Stage | Existing implementation | Reuse assessment |
|---|---|---|
| Referral selection | Explicit promo code wins over cookie; an invalid explicit code deliberately does not fall back to the cookie. | Export the rule as product behavior, not the SQL module. `referral.ts:28-45`; tests `referral.test.ts`. |
| Registration | N1 resolves the attribution during registration and writes a pending `referral_attributions` record in the same registration transaction. | Useful model for an N1 adapter: capture N3a attribution at registration before first payment. N3a needs its own attribution ID and selected source. `register.ts:141-152`, `referral.ts:61-72`. |
| Checkout | Authenticated project owner starts a 990 RUB/30-day YooKassa redirect payment; each intentional attempt gets a new UUID idempotence key and a N1 checkout-session row. | Strong donor for timeout/idempotency concepts. N3a receives a completed-payment event, never trusts a redirect. `checkout/route.ts:20-65`, `payment.ts:214-278`. |
| YooKassa verification | Source-network allowlist is checked, then N1 retrieves the payment from YooKassa. A failed provider lookup escapes the transaction so the YooKassa retry can reprocess. | Export the ordering and failure semantics. Do not copy the module unchanged: N3a needs its own merchant connection, money/currency validation, and support for refunds. `webhooks/payment/route.ts:51-126`, `payment.ts:66-160`. |
| N1 billing | A verified `payment.succeeded` matches N1's `checkout_sessions`, marks it complete, and extends `projects.paid_until` by 30 days from max(now, prior expiry). | This is genuine manual renewal logic, not recurring charging. Keep N1 as billing authority. `payment.ts:169-197`, `tariff.ts:17-47`; `payment.test.ts:248-323`. |
| N1 commission | N1 converts only the first pending attribution and inserts one commission guarded by unique `payment_event_id`. | Do **not** reuse as N3a ledger. It has no reversal/payout state and consumes the attribution after first payment. `referral.ts:85-159`; `004_growth.sql` tables; `referral.test.ts:259-279`. |
| Partner view | N1 displays signups, converted count, conversion rate and total commission. | UI/projection ideas are reusable only. It has no payable balance, period ledger, payout registry, MRR, or reconciliation. `partner.ts:181-231`, `partner/dashboard/page.tsx:39-60`. |

## N1 defects and gaps that govern the adapter

1. **Current N1 checkout-to-commission linkage is broken for live checkout.** N1 creates
   YooKassa payment metadata with `project_id` (`payment.ts:243-249`), but the webhook
   only calls `convertAttributionOnPayment` when body metadata contains `account_id`
   (`webhooks/payment/route.ts:106-110`). The checkout route does not send that key.
   Consequently the live N1 paid-tier path upgrades N1 billing but skips its referral
   commission call. Tests exercise `convertAttributionOnPayment` directly and therefore
   do not prove the complete registration → checkout → webhook → commission path.
   **N1 integration prerequisite:** fix/replace this linkage by resolving the customer
   identity from N1's local checkout session, never from webhook body metadata.

2. **N1 does not support recurring charges or recurring commissions.** It creates a new
   redirect payment on each checkout and extends the end date after each verified payment;
   it does not save a payment method, schedule a charge, or model a subscription. Its
   commission lookup accepts only `status = 'pending'` and then marks attribution
   `converted`, so a second manual renewal gets no N1 commission. This is verified in
   N2's donor test too (`apps/web/tests/payment.test.ts:162-186`) and follows directly
   from N1 `referral.ts:105,133-150`.

3. **N1 cannot provide trustworthy MRR by partner.** Available data are one current
   `paid_until` value per project, a paid/free tier, checkout sessions and one historical
   commission. There is no subscription identity, billing-period record, cancellation
   state, recurring-payment flag, or partner-scoped recurring revenue projection.
   N3a should show MRR as `unknown` for N1 until its N1 event contract supplies explicit
   subscription/period facts. It must not infer MRR from arbitrary 990-RUB payments.

4. **N1 does not handle refunds.** The webhook records any non-`payment.succeeded`
   event as ignored (`webhooks/payment/route.ts:82-87`) and the examined source has no
   `refund.succeeded` handling. N3a requires a separate reversal/correction event and
   never silently rewrites a paid registry row.

5. **N1 webhook order is serviceable but should not be coupled to N3a.** It claims the
   N1 webhook key before the remote payment lookup (`webhooks/payment/route.ts:84-100`),
   while N2's corrected donor implementation verifies remote status before claiming the
   key (`02.../apps/web/src/payment.ts:169-195`). In N1, provider unavailability is
   correctly thrown and rolls back the claim, but a non-paid/unknown remote result can
   commit the claim. N3a must independently verify and deduplicate its delivered event;
   it cannot treat a N1 notification as provider proof.

## Exportable blocks

### N1 — adapt, do not import

| Block | Files / tests | Dependencies | Adaptation |
|---|---|---|---|
| Attribution precedence and pending state | `apps/web/src/lib/referral.ts:9-72`; `apps/web/tests/referral.test.ts` | PostgreSQL `partner_codes`, `referral_attributions` | Extract/adapt with provenance and its relevant tests, substituting N3a program/partner/customer IDs and explicit 30/60/90-day policy; preserve promo-over-cookie. |
| Self-referral and fraud guard patterns | `referral.ts:113-130`; `partner.ts:145-179`; tests `partner.test.ts` | accounts, audit log, rate limiter | N3a must define identity matching and review policy; N1's email-only fallback is insufficient as an external integration contract. |
| YooKassa network + remote verification + timeout | `payment.ts:20-160`; `ip-range.ts`; `payment.test.ts:88-166,419-495` | env credentials, fetch, pg, trusted proxy topology | Extract/adapt the existing primitives and relevant tests after rechecking current provider docs. N3a receives N1 business events and should verify the N1 connection authentication separately. |
| Atomic event claim and distinct commission uniqueness | `payment.ts:150-160`; `referral.ts:144-151`; migrations `005_payments.sql`, `004_growth.sql` | PostgreSQL uniqueness | Extract/adapt the two-layer primitive and its tests with N3a keys: `unique(connection_id,event_type,provider_payment_id)` and `unique(connection_id,provider_payment_id,commission_kind)`. A new N3a ledger is needed only for absent reversal, recurring-eligibility, and payout-registry behavior. |
| Manual renewal extension | `payment.ts:169-197`; `tariff.ts:17-47`; tests `payment.test.ts:248-323` | N1 checkout session/project | Remains N1 billing behavior. N3a records a distinct confirmed payment for every renewal event; it does not mutate N1's tariff. |

### N2 — donor only

| Block | Files / tests | Why it is stronger / adaptation |
|---|---|---|
| Correct provider-verification order | `projects/02-review-qr-reputation/apps/web/src/payment.ts:158-242`; `apps/web/tests/payment.test.ts:62-121` | Verifies YooKassa's remote status before an atomic `webhook_events` claim, preserving a real delivery after a forged/status-mismatched notification. Extract/adapt the sequence and its tests to N3a's own YooKassa ingestion where N3a is the merchant. |
| Subscription-period storage | `packages/db/migrations/004_billing_partners.sql:3-14`; `payment.ts:206-210` | Useful contrast for period fields, but it remains a 30-day manual renewal and has no automatic charge evidence. N3a should model business-provided subscription periods only when its contract carries them. |
| Atomic commission plus duplicate and second-payment tests | `004_billing_partners.sql:61-71`; `apps/web/tests/payment.test.ts:162-186` | Demonstrates deliberately one-time commission, so it is a guardrail against accidentally copying the wrong behavior for N3a recurring commissions. |

## Recommendations: N1 ↔ N3a boundary

N1 owns registration, checkout, YooKassa receipt, and activation. N3a owns program
policy, attribution mirror, commission ledger, reversal adjustments, payout registry,
and partner projections. The contract must use opaque IDs; no cross-project database
access or runtime source import.

In the same N1 local transaction that applies a verified billing update, N1 writes an
outbox record containing:

- `event_id` (N1-generated immutable UUID), event type/version and occurred-at;
- N1 connection/customer/project IDs; N3a attribution/program/partner IDs captured at
  registration; N1 checkout ID and YooKassa payment ID;
- amount in kopecks, ISO currency, `payment.succeeded` or a separately modeled refund;
- explicit subscription ID, period start/end and state when available, otherwise null;
- a monotonic N1 sequence/version for the subject and enough reference data to reconcile.

After the transaction commits, N1 dispatches the outbox asynchronously with authenticated
requests and retains failures for operator replay. N3a responds idempotently; its receipt
record is atomically inserted with its ledger posting. A N1 retry or N3a replay cannot
create a second N3a commission. N3a periodically asks N1 for a bounded, cursor-based
outbox/reconciliation feed, so a lost callback is recoverable. No request to N3a sits in
the N1 checkout/webhook transaction; an N3a outage cannot block N1 payment confirmation
or activation.

For the intended recurring policy, N3a creates one positive commission per verified,
eligible payment ID, rather than consuming attribution on the first payment. A refund
creates a linked negative adjustment (including partial amount) and preserves history.
The payout registry groups finalized ledger entries by configured calendar month and
timezone, is generated for the preceding month on the 5th, and is marked paid only by a
manual action. There is **no mandatory 30–45-day hold**; late refunds appear as linked
adjustments and do not silently rewrite an already-paid registry.

## Migration policy to prevent double commission

1. Before enabling N3a for a N1 program, choose a cutover timestamp and enable the N1
   outbox/attribution adapter. No historical N1 commission is imported or altered.
2. For payments before cutover, N1's existing `commissions` remains the only potential
   N1-side obligation. For payments at/after cutover, N3a is the only partner-debt
   ledger. N1's `convertAttributionOnPayment` must be disabled/bypassed for the program
   once the N3a adapter is authoritative, or N1 cannot show/settle that amount as a
   payable commission.
3. N3a stores the N1 connection plus YooKassa payment ID as the business identity and
   rejects a duplicate positive commission regardless of transport retry/event ID.
4. Reconcile N1 checkout/outbox rows to N3a receipts before each registry generation;
   unresolved rows are visible exceptions, not assumed zero. A registry export does not
   mark anything paid.

## Source receipts (SHA-256)

All hashes below were read from the baseline above.

| Source | SHA-256 |
|---|---|
| N1 `apps/web/src/lib/referral.ts` | `86f816ecee7e17acb6bb81e6bff45cad81077a9823ce388fdf526cb7853f5664` |
| N1 `apps/web/src/lib/register.ts` | `fda786592c7387b73e4c0c86450cc9cba09d640cb75d9ad1fdcd1940d5bad8b3` |
| N1 `apps/web/src/app/api/checkout/route.ts` | `38a24d900efc9fa2737edae8148d6cbbb13a5282ecd0a25e6fa895ba12d05098` |
| N1 `apps/web/src/lib/payment.ts` | `be525af7d1b8a82c4cf3fb5911670a466611b2ecfa44e2da4f26b783b7ca78b7` |
| N1 `apps/web/src/app/api/webhooks/payment/route.ts` | `3c63377a6277040a72df7cd62edc107288bd22da1114cf3d2c49417551d190e3` |
| N1 `apps/web/src/lib/partner.ts` | `114bc01fea3c06d64c25af636ed5b0e4917c46f5133e31b4384f5494f52323e0` |
| N1 `apps/web/tests/referral.test.ts` | `96fd67dae089aca919404a40766a5e865acd27656199a5fd98e8d7204abf5d50` |
| N1 `apps/web/tests/payment.test.ts` | `bd35f543fa2723d514d18735b9ea3113506975cbe43a0788fcdfad0f2353512b` |
| N1 `packages/db/migrations/004_growth.sql` | `4cf50d27335465d46a0ad8b29e7eaf96fe85c4f14bbe4bf09d6acc5d7143f888` |
| N1 `packages/db/migrations/005_payments.sql` | `fe9f244eddd19a8ee4cc6a0eda2aeeb33ee12d3fd6f32da69635431522c44a91` |
| N1 `packages/db/migrations/009_partner_owner.sql` | `6c13a43137a88372ed405137b3151e0b6b17dc16b90b9ad68b40e4d7c79e038d` |
| N1 `packages/db/migrations/018_paid_until.sql` | `c70edf1ac300aa44f4e79016c7009ff8a6829cd58a68a25fc73a14737610ce1c` |
| N2 `apps/web/src/payment.ts` | `b1da88936f32174c57b78bedf586fe104c57533927ecbb864e1944e578ff6987` |
| N2 `apps/web/tests/payment.test.ts` | `fb067a93a3fbf9c9c65c7f45198d5471d05d6d6b11044bd7c986b6dbf5ab396b` |
| N2 `packages/db/migrations/004_billing_partners.sql` | `b6ba7086f11fcdbca7888bbe34d1943a5c285e2a1da881b36832b1f7845c5820` |

Status: completed
