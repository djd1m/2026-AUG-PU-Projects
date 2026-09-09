# N3 real referral funnel: independent design challenge

RUN_ID: 20260909T111622Z-f3-referral-3b19
WORK_UNIT_ID: funnel-challenge
REPO_ROOT: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects
PROJECT_ROOT: projects/03-affiliate-rewardful
Scope: read-only consequential design challenge; no project edits, test execution, runtime/provider calls, or subdelegation. References below are relative to PROJECT_ROOT.

## Recommendation

Implement the minimal merchant integration surface first. The prospect must become a customer in the merchant's actual SaaS; creating another N3 account is not sufficient. A hosted merchant-branded offer is legitimate only when it represents a real merchant product and verified payment drives fulfillment. It adds a second customer identity/onboarding surface now, so the integration path is smaller and more reusable.

The bounded operating slice is: published cash program + configured merchant HTTPS landing URL → partner referral redirect → merchant first-party capture → merchant backend registers its authenticated customer → merchant backend requests an N3-created YooKassa order → provider-verified event → commission + merchant-readable verified order status. This is useful without automated bank payouts or a complete subscription engine.

This slice does NOT import arbitrary existing merchant invoices/subscriptions, connect multiple shops automatically, or prove a live merchant installation. Existing payment service supports one deployment-configured shop/tenant; preserve that limit explicitly until merchant-specific provider credentials and routing are implemented. Repeated merchant-initiated orders can earn recurring commission, but are not autonomous subscription renewals.

## Source-bound seams

- `shared/identity/service.mjs:31–50,66–80,123–148`: reuse merchant sessions, membership resolution and invitations; current account registration always creates an owner organization. Do not duplicate auth while the approved identity work follows.
- `shared/identity/schema.mjs:9–12`: one membership per account/tenant means hosted role-specific buyer onboarding would require a deliberate identity decision. External merchant customers should be a separate tenant-scoped customer mapping, not synthetic N3 memberships.
- `shared/application/dispatch.mjs:15–22`, `apps/frontend/server.mjs:18–29`: real share URLs exist, but `/r/:id` has no dynamic handler/proxy. Implement the actual redirect route and allow only published, eligible enrolled beneficiaries.
- `shared/payments/service.mjs:37–55,85–87`: existing owner checkout accepts manual beneficiary/customer/amount and fabricates touch time at order creation. Preserve owner tooling only as explicitly manual; the new integration contract must derive referral recipient from persisted attribution.
- `shared/domain/events.mjs:22–34,71–78`: attribution currently re-resolves promo at payment time and expires against `paidAt`; every payment requires an existing beneficiary. Stable bindings and unattributed purchases need explicit domain handling.
- `shared/payments/service.mjs:57–92`, `shared/payments/yookassa.mjs:302–370`: saved order precedes remote create; provider re-query verifies payment/refund; webhook may precede create response. Reuse these invariants.

## Smallest contract and data

1. Owner configures fixed HTTPS merchant landing/return destinations and publishes cash terms. Public referral locator identifies an eligible program/partner; it grants no account or checkout authority. Redirect targets never come from the incoming query or Host header.
2. `GET /r/:referral` durably issues a random visit token before redirecting to the configured landing URL with `n3_ref`. Token row records tenant/program/partner, server visit time and policy/window snapshot. The merchant first-party snippet stores only this token, then removes it from the URL; it carries no integration secret or customer PII.
3. Choose FIRST eligible touch for this iteration, explicitly. The merchant cookie does not overwrite an unexpired first touch or extend its expiry on page views. Server token timestamps remain authoritative; browser timestamps and cookie lifetime cannot enlarge eligibility. Retain independent touches per program if the integration supports multiple programs.
4. One private integration credential maps to one real tenant and only `customer.bind`, `checkout.create`, `order.read`. Store a hash, issue once, support revocation, and recheck authority on retries. Browser Origin/CORS, a public referral locator, or knowledge of tenant ID never substitutes for that credential.
5. Merchant backend calls customer binding after actual authenticated signup with a stable external customer ID and optional visit token or independently entered promo. UNIQUE(tenant, external customer ID) ensures retries/concurrent signup produce one mapping and one immutable attribution decision. Client cannot supply tenant, partner, rate, policy ID or attribution time.
6. Explicit valid promo outranks an eligible visit; invalid explicit promo returns an actionable error and never silently falls back. A token from tenant A cannot attribute tenant B. Repeat registration cannot switch the beneficiary; a later promo must not hijack an established customer's attribution.
7. Keep signup attribution evidence separate from first-paid qualification: default 30-day window is configurable and counted from actual visit to the first confirmed payment, matching current domain semantics. A delayed first payment outside that window earns zero. If product instead chooses click→signup qualification, record that semantic change explicitly before implementation.
8. Once the first payment qualifies, immutable customer/program binding preserves the recipient and chosen policy contract for later eligible orders beyond the acquisition window. Do not reset `attributedAt` to renewal time or re-run the original click expiry on every renewal. Record provenance and frozen policy in each order/payment for deterministic replay.
9. Checkout request contains stable external customer ID, product/price reference and idempotency key. Prefer an owner-published offer with server-owned minor-unit price; a merchant backend invoice amount is also valid if expressly part of its authenticated authority. Never accept amount/beneficiary directly from a buyer browser. Freeze price, buyer, binding, shop/test mode and policy in the order before any provider call.
10. Add narrowly scoped merchant order status for fulfillment. A provider redirect, browser assertion or create-response status grants neither commission nor entitlement; only persisted verified status does. The merchant application consumes that status to fulfill the actual SaaS purchase.
11. Direct/unattributed customers remain valid customers and can buy successfully with an explained zero commission. Represent nullable/no beneficiary intentionally; `events.mjs:71` currently prevents this. Do not invent a placeholder partner to satisfy the old schema.

## Critical pitfalls and decisions

- Self-referral: external customer ID and N3 actor ID inhabit different namespaces. Equality of these strings proves nothing. Compare merchant-attested VERIFIED customer identity to the partner's verified N3 identity, or block/defer rewards until that identity evidence exists; disclose any remaining household/alternate-account limits. Do not accept browser email as verified identity. This is an explicit dependency on upcoming email verification, not a reason to clone its implementation here.
- Binding a signup and authorizing money are distinct. An invalid referral must not poison the customer's identity mapping forever; persist provenance/no-attribution reasons, and define any correction before first payment narrowly. Never allow correction to rewrite already accrued commissions or attach referrals to pre-existing paid customers.
- Define one lock order across connector authorization, customer binding, order and tenant rows. Current webhook locks order→tenant (`payments/service.mjs:77–83`); adding tenant→order updates elsewhere can deadlock. Keep provider calls outside all transactions; the pool has only four connections (`shared/infrastructure/postgres.mjs:18–19`).
- First-paid qualification must use provider payment time, not webhook arrival. Concurrent first orders and delayed earlier notifications require a deterministic qualification rule; do not let arrival order arbitrarily decide partner or policy. Any repeat order still uses an immutable customer binding.
- Verify provider truth before claiming effective event identity. Commit ledger, order status and any first-paid qualification atomically before ACK. Preserve provider/account/object id deduplication, unknown-provider retry, refund-before-notification behavior, and succeeded state when a late create response returns.
- Freeze acquisition settings into issued visits/bindings; publishing a new window must not silently reinterpret old receipts. Affiliate URL/promo changes after order creation must not make a verified webhook produce a different event hash on replay.
- Metrics should distinguish observed referral visits, unique registered external customers, unique verified paying customers and commission. No MRR or automatic subscription claims follow from counts of repeated one-off orders. A refresh can count as another observed visit unless deduplication is explicitly implemented; avoid labeling it a unique person.
- The JS snippet cannot prove a human click or defend against all attribution theft. The visit token is a referral receipt, not authentication. Remove it from merchant URLs promptly and keep it out of logs/third-party requests; do not present opaque randomness as customer identity verification.

## Twelve acceptance tests to implement

1. Real HTTP journey through an isolated merchant frontend/backend: referral redirect → merchant cookie → real merchant customer registration → backend checkout → provider-stub verified notification → one commission and merchant verified-status fulfillment; label stub evidence correctly.
2. Tampered/unknown/expired/cross-tenant visit and unpublished/unenrolled partner cannot produce a rewarded binding; open redirect and browser integration-credential use are rejected.
3. First touch survives a competing later referral and page refresh without extending expiry; cookie time forgery cannot extend the server window; legitimate configured non-30-day window works.
4. Promo works with no cookie; valid promo wins a conflicting visit; explicit invalid promo produces no silent fallback; established binding cannot be overwritten by new promo.
5. Concurrent duplicate signup and duplicate checkout with matching keys converge; changed payload/key reuse conflicts; identical external IDs in two tenants remain isolated; credential revoke defeats cached retries.
6. Same verified identity self-referral earns zero/refuses attribution even when external customer and partner actor IDs differ; unverified/missing identity follows the documented fail-closed rule.
7. Direct customer without referral completes payment with zero commission and no fake beneficiary; repeated signup cannot turn a pre-existing direct paid customer into a new referred customer.
8. Buyer-provided price/beneficiary/policy/customer substitution fails; order uses authenticated merchant customer mapping and trusted price. Provider shop/mode/amount/order mismatch creates no ledger effect.
9. First payment at/after the window boundary uses provider time; a qualifying customer's month-2 payment earns a new reward only with recurring enabled and preserves recipient after cookie expiry/promo/policy changes.
10. Two concurrent first orders plus out-of-order notifications preserve deterministic qualification and immutable binding; concurrent customer/order/webhook paths complete without lock inversion or pool exhaustion.
11. Webhook before create response leaves one succeeded order/commission; provider timeout then retry does not consume event identity; ambiguous-create retry uses the saved order/idempotence key and respects reconciliation cutoff.
12. Duplicate, partial and reordered refunds reverse exactly the appropriate commission, including delayed payment notification and post-payout cases; restart preserves visit/binding/order/ledger identity. Run existing A–D regression and mutation guards in the parent implementation phase.

Validation: source inspection and architecture challenge only; tests above are required proposals, not executed results. Reviewed root/project CLAUDE, applicable risk/money/concurrency rules, runtime/architecture/PRD context and the prior tracking audit. Observed root HEAD: a87b7e9c0182b1104bfc8c3d49cb5b4cd8f827c7; another writer may be active.
Telemetry: compact-quality-first-v2; actual model/effort/usage/cost/weekly quota null in this receipt because attributable host metadata was not supplied to this worker; coordinator owns dispatch measurements. No fallback or subdelegation. Economic savings not established.
Trace: /tmp/n3-funnel-challenge.md; coordinator project telemetry: docs/telemetry/p-replicator/20260909T111622Z-f3-referral-3b19/.
Status: completed
