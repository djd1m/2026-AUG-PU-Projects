# Specification — f3-referral-funnel

Owner approval 2026-09-09: implement approved commercial plan autonomously, with a working referral funnel as FIRST product priority. XL, compact-quality-first-v2. Full /go → /feature AUTO; implementation gates remain mandatory. Research/brief reuse the source-bound template audit; no repeated broad discovery.

## Scope and decisions

Build a reusable merchant integration, not another N3 customer signup. Partner invite/enrollment already exists. The prospect registers in the merchant SaaS; its trusted backend binds the verified customer and creates an N3-managed YooKassa order. Private integration endpoints are necessary plumbing, not a general public product API. Current one configured shop/tenant per deployment remains explicit. No automatic import of arbitrary subscriptions, MRR, tax engine, auto-payout, badge billing or four native real CJM rewrites in this slice. The approved Resend/verification/reset/Yandex/provider-guides feature follows without renewed permission.

Acquisition window is expressly defined here as visit → verified merchant signup, not visit → every payment. After successful signup binding the customer relationship is durable, so future orders can preserve attribution after the cookie disappears. This resolves the prior pilot paidAt-based expiry for NEW connector orders only; historical manual orders retain F2 semantics. Browser first-touch behavior is convenience, not a claim of fraud-proof identity. Identity self-referral checks compare the merchant-attested verified email with N3 partner/owner account email; alternate accounts/households are not detected, and N3 account email verification follows in the approved identity feature.

Amount is authorized by the private merchant backend, which must derive it from its own product/invoice data, never blindly forward a browser amount. Return URL is a navigation destination, never payment proof. Payment/refund verification continues through the existing provider adapter. Manual payout/hold policy is preserved; this feature does not approve a new payout tax or production hold policy.

### AC-f3-referral-funnel-11 — Published merchant integration and narrow credential

Given an authenticated real merchant with published cash terms; When it saves HTTPS landing/return URLs and issues or revokes its integration key; Then only that tenant receives customer.bind/checkout.create/order.read authority for90days, stored hashed and shown once; account version, expiry and revocation are checked on every use and after waits.

### AC-f3-referral-funnel-12 — Referral visit and first-party capture

Given an enrolled real cash partner and configured program; When GET /r/<actorId> occurs; Then persist a random opaque visit before redirecting only to the configured HTTPS landing, with server time and frozen policy window; the merchant tracker keeps its first unexpired token per program without sliding expiry and removes referral query data. No account authority or PII is in that token.

### AC-f3-referral-funnel-13 — Verified merchant registration and immutable attribution

Given a private merchant backend that has verified its customer email; When it binds a stable customerId, email, emailVerified:true and optional visitToken/promoCode; Then one tenant-scoped customer row is created atomically, explicit valid promo wins, explicit invalid promo refuses without cookie fallback, and repeat binding cannot change email or recipient. No browser-controlled beneficiary, timestamp, tenant, rate or policy is accepted.

### AC-f3-referral-funnel-14 — Isolation, expiry, self-referral and organic purchase

Given missing, forged, cross-tenant or expired referral evidence or a customer whose attested email equals its partner/merchant account email; When binding is attempted; Then cross-tenant/invalid evidence or self-referral refuses explicitly, expired receipt yields an explained organic binding, and absent evidence yields an organic binding with null beneficiary. Such an organic customer can pay with zero commission. Cookie default30days and configured60/90days are literal tested values; server receipt expiry remains authoritative.

### AC-f3-referral-funnel-21 — Authoritative checkout and fulfillment status

Given a valid merchant connector and previously bound customer; When checkout.create receives customerId, amountMinor and an idempotency key from the merchant backend; Then persist price, customer, immutable attribution, current published cash policy, shop/test mode and return URL before provider IO; derive recipient from the binding. Same request/key reuses the order, changed input conflicts. Order status is tenant-scoped and verified success comes only from a persisted authenticated provider event.

### AC-f3-referral-funnel-22 — Stable commission and refund lifecycle

Given a signup bound within its visit window; When a verified initial or later merchant-initiated payment arrives; Then the bound recipient is retained after cookie expiry and promo changes, current order-frozen policy controls rate/hold/recurring, duplicates create one reward, organic pays zero, and partial/reordered refunds append correct reversals. Invalid provider evidence does not consume dedup identity; late create response cannot downgrade verified success.

### AC-f3-referral-funnel-31 — Measured funnel and first commission

Given real and fixture histories and provider test/live mode; When owner or partner reads referral metrics; Then visits, registered customers, unique verified paying customers and first positive commission are computed from stored facts with tenant/partner isolation. Test-provider amounts and activation are labeled test and excluded from live first-commission qualification. Weekly qualification counts this tenant as0/1 according to its earliest live positive commission UTC week; no cross-tenant list leaks. MRR stays unavailable until subscription state exists.

### AC-f3-referral-funnel-32 — Usable owner and partner UI with integration guide

Given the real /account surface on A–D; When owner configures integration, generates/revokes a key and reads progress, or partner views own metrics/link; Then keyboard/mobile UI exposes actual status without late-response secret/data leaks. A runnable merchant browser/server example documents verified registration, authoritative invoice amount, order-status fulfillment and provider-not-configured behavior; browser never receives connector secret.

### AC-f3-referral-funnel-41 — Resource and deployment safety

Given concurrent click/bind/order/webhook calls; When requests contend or provider/DB fails; Then there is no network/KDF while holding SQL, bounded admission and DB timeouts apply, persisted rows have caps, and consistent tenant-before-order locking prevents inversion. Existing A–D/account/protocol tests and meaningful mutation guards pass; test/production DB has no host ports and only backend network.

### AC-f3-referral-funnel-42 — Honest acceptance and migration

Given existing F2 records and a source-bound candidate; When migration, tests, rollout and rollback checks run; Then legacy orders retain their historical attribution behavior while new connector orders use explicit snapshots, no data is erased, UI E2E exercises a separate merchant frontend/backend and provider stub, and reports distinguish that evidence from a real merchant installation/live payment. Missing N3 credentials never enables synthetic fallback.

## User stories and measurement

US-001: As merchant, connect actual SaaS signup/billing to a trustworthy affiliate result. SC-US-001-1 covers AC11–14; SC-US-001-2 covers AC21–22; SC-US-001-3 covers AC31–32; SC-US-001-4 covers AC41–42. Each scenario uses the explicit Given/When/Then in its acceptance criteria.

Sources of metrics: visits/customer bindings/confirmed payment/commission — наша БД; browser journey and responsive widths — ручное измерение: Firefox/WebDriver assertions; model usage — наш журнал from host counters. No user acquisition or savings targets are invented.
