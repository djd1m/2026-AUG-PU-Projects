# Proofwall → N3 read-only architecture receipt

RUN_ID: 20260909T170258Z-proofwall-n3
WORK_UNIT_ID: bridge-proofwall-research-1
Scope: projects/01-testimonials-senja; parent researches N3 independently. Project 02 untouched. No code/config/deployment changes, network calls, secret reads, tests or provider operations performed.
Profile: compact-quality-first-v2; inherited feature risk XL (money, identity, schema, cross-service delivery). This receipt is bounded PLAN research, not feature acceptance.
Actual model: null. Actual effort: null. Host did not expose model/effort execution evidence to this child. Requested model is parent-owned dispatch metadata. Usage/cost/start timestamp/duration: null; no host counters or independently recorded child-start timestamp. Completion timestamp is recorded below, no time reconstructed from memory.
Baseline commit: 89dc14a5b41c8b21e589a331a1bed4b6a8870ff1
P1 git status was clean at inspection. P1 diff SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.

## Existing contracts and safe reuse

All paths below relative to projects/01-testimonials-senja.

- `apps/web/src/app/api/checkout/route.ts:19`: authenticated session resolves account; slug lookup under withAccount/RLS resolves owned project. Server price is Number(PAID_TIER_PRICE_RUB ?? '990'); each request generates random UUID. createRemotePayment runs outside transaction; checkout_sessions insert happens afterward; response is redirect_url plus stub boolean. Preserve native P1 create and return URL to P1 dashboard.
- `apps/web/src/lib/payment.ts:213`: createRemotePayment makes native YooKassa POST /payments, capture=true, RUB, 10s timeout; metadata presently contains ONLY project_id. Existing TEST shop ownership is user-confirmed context, not independently verified here. Preserve credentials ownership. Extend this call with N3-issued metadata.order_id, never substitute N3 payment creation or a second shop.
- `packages/db/migrations/005_payments.sql`: checkout_sessions has UUID id, project FK, unique NOT NULL provider_session_id, pending/completed/expired status; migration 018 adds nullable UUID idempotence_key. This cannot represent pre-provider durable intent without schema evolution or a separate table.
- `packages/db/src/tenant.ts`: withAccount sets app_authenticated and transaction-local account id; withService uses BYPASSRLS and must explicitly scope all sensitive reads. 007 grants checkout SELECT/INSERT to owner role and SELECT/UPDATE to service. `apps/web/tests/payment.test.ts:365` specifically forbids service INSERT into checkout_sessions.
- `apps/web/src/app/api/webhooks/payment/route.ts:50`: source-IP allowlist, body parse, unique event key event:object.id, transactional event claim, then provider GET, tariff and local commission. Provider exceptions roll back claim so redelivery can work. Preserve that property. Native YooKassa webhook is not HMAC-signed; local security.md/Architecture still have obsolete Stripe-style wording; Specification FR-008 and ADR-006 addendum document actual provider behavior.
- `apps/web/src/lib/tariff.ts`: single server authority for badge and active paid tier; duration 30 days; extendPaidUntil computes max(now, old expiry)+30 days. Preserve 990 RUB/30 days and server-side badge checks. No automatic cron downgrade is required for expiry because isPaid evaluates expiry on read.

## Findings that must shape implementation

1. **Durability gap (confirmed code path).** Provider payment exists before any local checkout row. Process crash/DB failure after POST loses mapping and original retry key. Fast webhook sees unknown_session, commits webhook_events, returns 200; later checkout insertion cannot recover through that webhook key. A fresh route retry also creates a fresh provider payment. Durable intent and stable same-attempt recovery must precede provider POST; explicit new purchase still gets a fresh attempt, preserving renewals.
2. **Insufficient verified payment fields.** fetchRemotePayment returns id/status/paid/numeric amount, discarding currency, metadata, shop recipient, test flag and refund facts; route does not compare returned id with requested id, amount with expected amount, or currency. Bridge must persist expected 99000 minor units/RUB and require N3 independently to fetch and verify exact payment/order/shop/test/customer binding before reward. Do not use P1 stub amount=0 as proof of a real or TEST provider payment.
3. **Untrusted attribution metadata.** Native create emits project_id only, but webhook calls convertAttributionOnPayment using body.object.metadata.account_id. That id is not from provider GET or trusted checkout mapping and conversion runs even for unknown_session. Derive account from durable local owned-project intent; never bridge raw body account/email/referral as verified identity. N3-managed orders must have one reward owner; retaining both old local commission conversion and N3 conversion can duplicate obligations. Keep unrelated historical local accounting readable and explicitly route bridge-managed orders to N3 only.
4. **Tariff idempotency bug at helper boundary.** applyTariffUpgrade unconditionally adds 30 days even if same checkout already completed. Its comment says no-op, but code has no status guard. Existing repeat test at payment.test.ts:186 asserts only tier='paid'/alreadyPaid and misses expiry changing twice. Webhook event dedup currently masks this in normal route; reconciliation/retries must use conditional pending→completed or a unique tariff application ledger. Two distinct payments for same project also read expiry without row lock, then overwrite each other: lock project before read/extension or atomic SQL extension, preserving both 30-day credits. Concurrency finding is code-based, not runtime reproduced.
5. **No email verification fact.** accounts contains email/password hash, no verification timestamp/source/revision. Registration validates email syntax then issues a session, not mailbox proof. Yandex identity data explicitly lacks verified-email guarantee. Password reset demonstrates mailbox token possession but does not record a reusable verified-email fact; no retroactive verification should be inferred from historical rows.
6. **SSO inheritance risk.** sso-account.ts case 3 links a new external_id to an existing passwordless account by equal unverified email. Therefore a newly added verified-email flag on that account could be inherited by a different unproven SSO identity. Gate new linking on proven identity/account ownership, or fail closed for every existing email with an unlinked external id; do not preserve that unsafe email-based join as evidence for reward.
7. **Privilege risk.** 007_rls.sql grants app_authenticated SELECT/INSERT/UPDATE on accounts and sessions without RLS. Adding email_verified_at to accounts would inherit that broad write authority. Prefer separate service-only email-proof table, or deliberately revoke/regrant account column privileges and test wider auth regressions. Checkout-intent fields such as verified/order/provider status must not be writable by arbitrary owner-context SQL.
8. **Refund absence.** Route commits any non-payment.succeeded event as ignored. No refund fetch, refund schema, tariff reversal or commission reversal implementation exists. Do not pretend forwarding payment.succeeded is a complete lifecycle.

## Recommended minimal P1 placement

### Email proof and signup

New service-only `account_email_verifications` and `email_verification_tokens` tables in a new migration after 018. Proof identity: account UUID + normalized exact email snapshot + proof version/id + verified_at/method; user cannot supply verified_at. Token table: 32 random bytes hashed SHA256, expiry, used_at, unique hash and partial unique active token per account/email/version. Account/email bindings must be immutable per proof; future email changes invalidate previous proof. New token namespace separate from sessions and password-reset hashes.

Reuse `apps/web/src/lib/password-reset.ts` atomic UPDATE ... WHERE unused AND expires_at > now() RETURNING, no raw token in SQL/logs, service-only grants, and no session issuance upon verification. Reuse `apps/web/src/lib/email.ts` EmailSender boundary, timeout and mailConfigured. Do not send mail inside DB transaction. For durable mail retry, encrypted short-lived payload is needed (hash alone cannot reconstruct original token); do not accidentally persist raw bearer token in general N3 outbox. Simpler initial verification mail can be after-commit with honest retry/resend UX; N3 delivery itself must be durable.

Capture referral context at registration transaction in a separate immutable pending binding. On successful token consume, atomically write proof plus durable N3 signup outbox event. Existing register continues to create native account/project/session; email verification gates exported verified signup/reward, not an unrequested replacement of P1 login. SSO-created accounts must traverse same proof path. Preserve stable account UUID across slugs/projects; never merge N3 customers using unverified email.

### Checkout intent

New `payment_checkout_intents` table, preserving old checkout_sessions contract: UUID local attempt, account/project binding, expected integer amount/currency, provider shop environment alias, provider idempotence UUID, N3 external order id, provider id/confirmation URL, state, timestamps, attempts, lease/next_attempt fields where used. Unique stable attempt/order/provider mappings. Prefer owner SELECT/INSERT with RLS and service-only state updates; do not allow account-role mutation of server-verified fields. Service recovery can use trusted stored account id to invoke existing owner-role checkout insertion, preserving current GRANT invariant.

Flow: authenticated/RLS project check → commit local intent → deliver/ensure verified signup if necessary → reserve N3 external intent idempotently with local attempt as external id → persist returned order id → native P1 create with SAME persisted provider key and metadata.project_id + metadata.order_id → persist provider mapping and native checkout_session → redirect. No remote API inside DB transaction. If N3 reservation fails, keep local intent retryable; never create unmanaged reward-bearing payment without order id. Define explicit same-attempt resume endpoint/request key or server-issued attempt token so a transport retry does not become another purchase. Fresh conscious purchase remains a fresh key.

Provider success before local mapping commit must resolve from independently fetched metadata.order_id to preexisting durable intent and validate expected project. It can safely attach provider mapping, or return retryable failure without terminal event claim until recovery attaches it. Persist provider confirmation URL so restart can resume redirect without creating a second payment. Ambiguous provider timeout retries use original key within provider retention; after retention expiry, quarantine/reconcile rather than mint replacement payment automatically.

### Durable N3 delivery

New P1 `n3_bridge_outbox` table: immutable event UUID/kind/aggregate/version/payload, unique semantic event key, pending/leased/delivered/quarantined, attempts, next_attempt_at, lease expiry/token, sanitized last error. Service-only write; RLS enabled for project_id as local policy requires, no grants to authenticated role unless explicitly justified. Enqueue payment outcome in SAME transaction as native checkout status/tariff commit. Payment event is a hint containing local intent/order/payment ids; N3 fetches authoritative provider data itself.

Add `services/worker/src/n3-bridge-job.ts`, call independent schedule from existing index.ts and stop it on shutdown. Current worker has independent transcript and cleanup loops only. Use short claim transaction with FOR UPDATE SKIP LOCKED, commit lease, network outside transaction, then conditional acknowledgement matching lease token. Exponential bounded backoff, lease recovery after crash, duplicate-safe remote delivery, visible quarantine; no in-memory-only queue. Current worker raw pool config does not prove deployed DB role; inspect actual configured authority at implementation/release without exposing credentials. Bridge outbound secret belongs worker/server only, never browser. Avoid copying web-only aliases into worker; place shared transport/types deliberately if necessary.

### Refunds and tariff semantics

Accept refund.succeeded as durable provider event hint; independently fetch refund and parent payment, validate refund id/status, amount/currency, parent payment id and order metadata. N3 must suppress/reverse matching reward exactly once even when refund arrives before success or deliveries reorder; dedup by refund id, not payment id. Partial refunds need explicit amount ledger and cannot silently reuse full-refund semantics.

P1 currently has no refund entitlement policy. Minimal bridge behavior forwards verified refunds for N3 accounting without inventing automatic tariff rollback. If approved contract requires P1 revocation, add explicit payment-credit ledger and recompute entitlement under project lock; simply setting free or subtracting 30 days can erase other legitimate paid renewals. Parent should make this commercial behavior concrete in the plan.

## Recommended logical interface to reconcile with N3 owner

- Signup: event_id, source='proofwall', external_customer_id=P1 account UUID, normalized verified email, proof_id/proof_version, verified_at, server-captured referral context; signed/authenticated server request. N3 must authenticate source and bind customer identity consistently.
- External intent: stable external_id=P1 checkout attempt UUID, customer reference, expected amount_minor=99000, currency='RUB', product reference for 30 days, source/project reference. Response: stable order_id. Same key+same payload returns same order; changed payload conflicts.
- Outcome hint: stable event_id, source, kind payment.succeeded/refund.succeeded, order_id, provider='yookassa', provider payment/refund ids, local intent id. N3 independently validates provider and shop/test environment; sender booleans such as paid/verified never authorize reward alone. Response acknowledges durable receipt or accepted duplicate, not merely transport parsing. Keep strict schema/version and idempotent replay semantics.

## Validation required before acceptance (not run here)

Existing suites: web payment.test.ts, register.test.ts, password-reset.test.ts, sso.test.ts, tariff.test.ts, referral.test.ts; DB rls.test.ts/idempotency.test.ts; worker skip-locked.test.ts and retry patterns. payment.test.ts requires TEST_DATABASE_URL (falls back DATABASE_URL; implementation must pin isolated test DB, never production). Root test/build/typecheck scripts span workspaces.

New behavioral tests: unsigned/untrusted identity cannot become verified; token expiry/replay/concurrent consumption exactly once; service-only proof and cross-tenant intent RLS; unsafe SSO linking rejected; N3 reservation outage; crash after reservation/provider create/before mapping; same-attempt provider key stable versus genuine renewal new key; webhook before response; provider mismatched id/order/amount/currency/shop/test rejected; stub cannot emit verified reward; native webhook provider outage rolls back; duplicate same payment leaves exact expiry unchanged; two distinct parallel payments add 60 days; signup pending before payment delivers correct ordering; outbox crash after remote acceptance before local ack; two worker leases; poison event quarantine observable; refund-before-payment and partial refund/reversal semantics. Mutation-test critical guards per repository rules, then full relevant suites/typecheck/build and source-bound receipts.

Read-only validation result: source paths and schema/contracts inspected; no runtime behavior asserted as tested. Deployment configuration, actual TEST shop settings, live email delivery, N3 interface details and external provider contract currentness were not examined due explicit no-secrets/no-network boundary. Old Architecture/Pseudocode contain stale forever-paid/HMAC prose; updated tariff code/018 and Specification/provider ADR take precedence for present facts.

## Input SHA256 manifest
- `apps/web/src/lib/payment.ts`: `be525af7d1b8a82c4cf3fb5911670a466611b2ecfa44e2da4f26b783b7ca78b7`
- `apps/web/src/app/api/checkout/route.ts`: `38a24d900efc9fa2737edae8148d6cbbb13a5282ecd0a25e6fa895ba12d05098`
- `apps/web/src/app/api/webhooks/payment/route.ts`: `3c63377a6277040a72df7cd62edc107288bd22da1114cf3d2c49417551d190e3`
- `apps/web/src/lib/register.ts`: `fda786592c7387b73e4c0c86450cc9cba09d640cb75d9ad1fdcd1940d5bad8b3`
- `apps/web/src/app/api/auth/register/route.ts`: `781a0550017accfc412e729fb3602b2c1a4f4f81e3a143cf4f337959fe3daf65`
- `apps/web/src/lib/current-session.ts`: `b849d831a642c78178b6e1f8bd55812e35cfa18e5413f32b3e85a850c9965b70`
- `apps/web/src/lib/password-reset.ts`: `152c849d94df91016278695094a838067eb5404d54dc0669f200cf576e0c85ac`
- `apps/web/src/lib/email.ts`: `b6bebcf9958418eed12ebe609c864d36d1cf4a053497c559e911cbed3a14a7c0`
- `apps/web/src/lib/sso-account.ts`: `f7b977408953cf18994504fb004599cef03175e2013ff6f865889ace4a48fdf3`
- `apps/web/src/lib/referral.ts`: `86f816ecee7e17acb6bb81e6bff45cad81077a9823ce388fdf526cb7853f5664`
- `apps/web/src/lib/tariff.ts`: `9ffaa8f26c53888e5b2a390bf4fe08aacccf9b0c696adbcd1365be8da87b0958`
- `packages/db/migrations/003_core.sql`: `49a7f63d740917ecc9aaa9ef40495b99a7c68d36fa9e9051c8ace2f71154da72`
- `packages/db/migrations/005_payments.sql`: `fe9f244eddd19a8ee4cc6a0eda2aeeb33ee12d3fd6f32da69635431522c44a91`
- `packages/db/migrations/007_rls.sql`: `cc20479ff4a9b25d24713f59b45f3247938c7857c3374bb7994109c8f26e1d33`
- `packages/db/migrations/014_password_reset.sql`: `7ab612d41ee8cf051d344973e3c697aeecd564d71537ebc23a7df50b66b05fab`
- `packages/db/migrations/015_sso.sql`: `0bc0207993ebf62be28962d33e0173fb3aeb029caed0e710f57a005635aed5ef`
- `packages/db/migrations/018_paid_until.sql`: `c70edf1ac300aa44f4e79016c7009ff8a6829cd58a68a25fc73a14737610ce1c`
- `packages/db/src/tenant.ts`: `1c50acb656e47ba47c5a622c2a0fa0ed5f29637cbb9e5a1c3c4c60dc1b006064`
- `services/worker/src/index.ts`: `e9b9e33157ad59cadcd4613409e2c86bcf47a87c89b364dc40b784eea28c41eb`
- `services/worker/src/config.ts`: `b9100ebbf2d80dcd7303e5bcdf05dde1fdfb7187f2258acd60a07aa75104c3bf`
- `services/worker/src/db.ts`: `17cda99393afb693f7a30a2a161d6119ff8322d1b3cc858e5d09d34fb3a1d308`
- `apps/web/tests/payment.test.ts`: `bd35f543fa2723d514d18735b9ea3113506975cbe43a0788fcdfad0f2353512b`
- `apps/web/tests/password-reset.test.ts`: `269ce4d3c182283854deec07acc8f430ac6579847120b2bcfcb5cd2e63341073`
- `apps/web/tests/tariff.test.ts`: `7e7fe9337dca6e295c8068ec0ec5030bfde8f7f81e9961aa3b2105b2b9828cb5`
- `packages/db/tests/rls.test.ts`: `547a93cb4bcf774ab7cede22cc799cf0b8642430fbce97bf957edbdfe3fd96c0`

Completed_at: 2026-09-09T17:07:08.295025+00:00
Status: completed
