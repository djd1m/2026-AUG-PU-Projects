# Integration map — modular agent payments / Proofwall host

- Run: `20260910T071401Z-agent-payments-implementation-7e80`
- Work unit: `integration-map`
- Repository: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects`
- Project: `projects/01-testimonials-senja`
- Snapshot commit: `4c3bef4c01f5a987c7537674ae6766ce7d5f25f5`
- Scope: read-only inspection; no source mutation, deployment, secret inspection, provider call, or charge.

## Revision history

- Original report SHA-256 before this correction: `986f6dc337a723859f0815ba385f8ed0e71abc1f5e0759ece25a244f814ddb4f`.
- Correction basis: `docs/features/n3-affiliate-bridge/validation-report.md` SHA-256 `5d8604691a4f7868e22c6c7cb52ed12a49d3a8c5392b1121dea4fcd99f81f94d`, especially AC2 and the named identity/attribution scenario.
- Corrected claim: the N3 bridge intentionally excludes native `convertAttributionOnPayment`; its durable `payment.succeeded` outbox event delegates bridge attribution/commission to N3. Calling the native converter there would risk duplicate commission. The original report incorrectly described this as an integration gap.

## Finding

The reusable host seam is the transaction-scoped Proofwall **entitlement** operation, factored from the existing verified-payment effect. It applies one paid period using a stable domain event ID and returns an idempotent receipt. Attribution remains a separately selected host responsibility because native Proofwall and N3 are mutually exclusive commission authorities. The module's `FulfillmentPort` calls the entitlement seam inside its caller-owned SQL transaction; the host then executes exactly one persisted attribution branch (`native`, `n3`, or `none`) in that transaction.

Today the effect is split:

- `apps/web/src/lib/payment.ts:162` (`applyTariffUpgrade`) resolves a persisted `checkout_sessions.provider_session_id`, locks the checkout and project, extends `paid_until`, completes the session, and audits the upgrade.
- `apps/web/src/app/api/webhooks/payment/route.ts:113-123` is the native nonbridge branch: it calls `applyTariffUpgrade`, then resolves the account and calls `convertAttributionOnPayment` in the same `withService` transaction.
- `apps/web/src/lib/referral.ts:85-159` provides idempotent commission creation through `commissions.payment_event_id` and preserves self-referral/rate-missing behavior.
- `apps/web/src/lib/n3-payment.ts:50-59` is the intentional bridge branch: it atomically enqueues `payment.succeeded` for N3 and applies the Proofwall tariff, then returns before the native branch. `services/worker/src/n3-outbox.ts:54-69` delivers that event to N3. AC-n3-affiliate-bridge-2 explicitly requires that a bridge-managed order never enter the native commission path, so adding `convertAttributionOnPayment` here would create duplicate commission risk.

Suggested host signature (name illustrative):

```ts
applyVerifiedProofwallPurchase(
  client: PoolClient,
  input: {
    projectId: string;
    accountId: string;
    domainEventId: string;
    amountMinor: bigint;
    legacyCheckoutSessionId?: string;
  },
): Promise<{ entitlement: 'applied' | 'already_applied' }>
```

The operation should lock the project, extend the 30-day period with the existing tariff helper, update a legacy checkout session only when the legacy caller supplies one, and write the existing tariff audit. Its idempotency guard must be a durable product-effect receipt keyed by `domainEventId`; commission or outbox uniqueness alone does not prevent a second period extension. The module's `FulfillmentPort` passes the module domain event ID. The legacy webhook may retain its current `checkout_sessions`-based behavior until cutover. This preserves one owner of entitlement effects without forcing module service-role code through the deliberately protected `checkout_sessions` insert path.

Attribution is composed beside fulfillment by the Proofwall host from a persisted order binding, never inferred from callback metadata:

- `native`: call `convertAttributionOnPayment` once with the stable event ID;
- `n3`: enqueue one versioned external event for N3 and do not call the native converter;
- `none`: perform no commission action.

The entitlement receipt and the selected attribution effect/outbox insert commit atomically. This preserves native commission CJM and the N3 AC2 no-duplicate rule while keeping the portable core unaware of both systems.

## Minimal host integration

1. Add the standalone `packages/agent-payments` contracts/core/storage/provider packages and additive `agent_payments_*` migration(s). Keep these free of Proofwall and N3 imports. Do not change existing auth/email/payment schemas except for an additive product-effect receipt if needed.
2. Add a thin Proofwall host directory under `apps/web/src/lib/agent-payments/` implementing `IdentityPort`, `OfferPort`, `FulfillmentPort`, and optional `AttributionPort`. Identity reads the existing authenticated session and verifies project ownership; the agent supplies no account/project authority. Offer owns the Proofwall-specific 990 RUB / 30 day policy. Fulfillment calls the entitlement operation above in the module UnitOfWork; Attribution dispatches only the persisted `native`, `n3`, or `none` branch.
3. Add new authenticated handoff/consent pages and `/api/agent-payments/*` routes. Pairing starts after ordinary signup/login and consumes `currentAccountId`; do not edit `/api/auth/register`, `/api/auth/login`, password-reset routes, email primitives, session creation, or their response/cookie contracts. If pairing needs mail, use a new route/template and the existing sender interface without changing password-reset delivery behavior.
4. Leave `POST /api/checkout` byte-for-byte behaviorally unchanged: same slug input, RLS ownership, new UUID per manual click, redirect response, error codes, and legacy `checkout_sessions`. Agent transports call the module command handler, never `/api/checkout`, `beginN3Checkout`, or auth routes.
5. At the provider webhook boundary, route by a persisted `(provider account, provider object id) -> owner` association before either handler claims the event. A modular match goes only to the module inbox/handler; no match executes the current N3/legacy branch unchanged. Never route from untrusted metadata alone. One provider event must have exactly one transition owner. If the PSP supports a separately configured webhook endpoint for the same account and its delivery semantics are verified, a new module-only route is even lower risk; otherwise use the explicit lookup at the existing route.
6. Add module dispatch/reconciliation polling beside the worker's existing pollers, with its own stop function and failure boundary. A module batch/network failure must not stop transcription, rate-limit cleanup, or the existing N3 outbox. Do not reuse `n3_bridge_outbox`; its kinds, acknowledgements, and binding side effect are N3-specific.
7. Keep existing N3 integration as a separate adapter/consumer. Module core emits versioned events to its durable outbox; the N3 adapter receives sanitized events after the local transaction. N3 failure leaves paid entitlement intact and retryable.

## Regression invariants

- Human signup, login, Yandex login, session cookie, password reset, and existing mail responses remain unchanged and do not import agent-payment core.
- Human manual checkout continues to create a fresh redirect payment per click and remains usable when the agent-payment feature/configuration is absent.
- Existing legacy webhook origin/provider verification, retry-on-provider-failure, event claim rollback, tariff duration, RLS, and response codes remain intact.
- A successful payment applies at most one 30-day period and at most one commission in its selected authority. A bridge/N3-owned order produces no native commission row; a native-owned order produces no N3 commission event. Legacy and modular handlers cannot both own the same provider object.
- Referral priority, self-referral rejection, missing-rate result, commission amount, and `payment_event_id` uniqueness remain the authority for commission CJM.
- Module/N3/outbox outages do not roll back an already committed paid entitlement; local fulfillment and outbox insert are atomic.
- TEST/live mode, merchant account, amount, and currency are checked by the provider adapter before fulfillment. No live execution is part of implementation acceptance.

## Acceptance tests to add

- Host fulfillment integration: one verified module event extends the period once; a `native` attribution creates the existing native commission, an `n3` attribution creates one N3 outbox event and zero native commission rows, and `none` creates neither. Replay is a no-op for entitlement and selected attribution; concurrent legacy/module attempts for one provider object have one winner.
- Router integration: persisted modular provider object selects only the module handler; unknown object follows legacy behavior exactly; forged metadata cannot select a handler; provider verification failure leaves claims/effects retryable.
- Manual checkout characterization: with module disabled/unconfigured, authenticated owner gets the existing redirect response; foreign slug is 404; two clicks create distinct provider sessions; webhook still extends the period and converts attribution.
- Auth/email characterization: registration, login, cookie flags, password reset delivery/failure, and Yandex login pass with module disabled and enabled; pairing cannot create/change an account or session.
- Worker isolation: module poll failure leaves transcription, cleanup, and N3 poll scheduled; lease expiry/restart does not double-dispatch or double-fulfill.
- Migration/RLS: two merchant namespaces cannot read each other's grants, methods, orders, inbox/outbox, or receipts; authenticated app role cannot forge server facts.
- Mutation gates: removing merchant scope, event-owner routing, product-effect receipt, native/N3 exclusivity, the native commission call, the N3 outbox insert, revoke/expiry recheck, or fulfillment/outbox atomicity must fail a named test.

## Acceptance commands

From `projects/01-testimonials-senja`, with an isolated migrated test database in `TEST_DATABASE_URL` (no published database port):

```bash
npm run typecheck
npm run test --workspace @proofwall/web -- tests/auth-primitives.test.ts tests/register.test.ts tests/login-route.test.ts tests/sso.test.ts tests/sso-transport.test.ts tests/password-reset.test.ts tests/password-change.test.ts tests/password-change-route.test.ts
npm run test --workspace @proofwall/web -- tests/payment.test.ts tests/tariff.test.ts tests/referral.test.ts tests/n3-checkout.test.ts tests/n3-payment.test.ts tests/n3-billing.test.ts tests/n3-proof.test.ts
npm run test --workspace @proofwall/worker -- tests/n3-outbox.test.ts tests/transcribe-job.test.ts tests/cleanup-job.test.ts
npm run test --workspace @proofwall/db
npm test
npm run build
git diff --check
```

Add the new module conformance, host fulfillment/router, concurrency/restart, merchant-isolation, and mutation commands to this gate once their filenames exist. Run provider E2E only against the verified TEST account and only after the non-charging fake-provider suite passes; live charges and deployment require a separate release gate.

## Source hashes (SHA-256)

```text
3f1e27b17ed1671988bafef56fe5d6c47680bf6efb87601ba1764a8eb347f241  CLAUDE.md
422a1d1952f7755c1ea772b33e9e41e1bd78a239af8a0a490f03bc48eb4e0c70  .claude/rules/complexity-router.md
c4a1f5c1246e93036fbe76e8ae1010d91c6fb28c3a44ec7f9d0d44a5a5de018d  projects/01-testimonials-senja/CLAUDE.md
344d306536d5b4dc20eb29f0a6b9817c0f40cde6dddcbc7e66e0adccad5ab093  projects/01-testimonials-senja/.claude/rules/coding-style.md
c30339155acfa40daa10d6772a6a107661a17b0ae6e82d5be8ea3a47a33a77dd  projects/01-testimonials-senja/.claude/rules/security.md
35eda7906eac59816cfe1f9b50a130915267faa3198d478f188d5925a47dcba3  projects/01-testimonials-senja/.claude/rules/testing.md
538dd9a5a64a8626625fde4e3bc8c6e542f3e192ebe5f7fe4ece0efcb7e859c5  projects/01-testimonials-senja/docs/features/agent-purchase/plan.md
f1dd59c138dd060cecdf619fafc1174b94f652d14c78bccadd287b0be09b6837  projects/01-testimonials-senja/docs/features/agent-purchase/modular-architecture.md
7c6c6284c8c880ead0515856670ae994e03e08134e1e6ebdc643457c5b0cc40d  projects/01-testimonials-senja/apps/web/src/lib/payment.ts
1ece15480c9e777630a732e3ff3e393687b182faf840e19bfa7c7adc520ad0e4  projects/01-testimonials-senja/apps/web/src/lib/n3-payment.ts
1037f9d70399319f413b5e4814e931a0a9ee43855813342ffc656bf18dc200c9  projects/01-testimonials-senja/apps/web/src/lib/n3-checkout.ts
29f1c13077517eb32dd81c2e6ad43afd92cd4f17f4c535a77f86973b1405ae62  projects/01-testimonials-senja/apps/web/src/app/api/checkout/route.ts
5f313d8d08268654ba08f6c1e07310d70d103933f1188de8416edb86298c66f0  projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts
3dc0280b2713c3ba4431dba48a8a64351e3847ad2d0d4238b2626a7e6564b85b  projects/01-testimonials-senja/apps/web/src/app/api/auth/register/route.ts
74c414d7596dff4a5d60d888dbfdf1db03d1880371531868349cb7c37bb4a79c  projects/01-testimonials-senja/apps/web/src/lib/register.ts
86f816ecee7e17acb6bb81e6bff45cad81077a9823ce388fdf526cb7853f5664  projects/01-testimonials-senja/apps/web/src/lib/referral.ts
fe9f244eddd19a8ee4cc6a0eda2aeeb33ee12d3fd6f32da69635431522c44a91  projects/01-testimonials-senja/packages/db/migrations/005_payments.sql
c70edf1ac300aa44f4e79016c7009ff8a6829cd58a68a25fc73a14737610ce1c  projects/01-testimonials-senja/packages/db/migrations/018_paid_until.sql
14bf874507b817637b294ea597f3e6338aaf7048def4f67fe191fbc9d6ab852c  projects/01-testimonials-senja/packages/db/migrations/019_n3_bridge.sql
ddbfb163f7545df97b7bfae95b46bc21e0197a27cacf7a716f41c8b6c5a2c24e  projects/01-testimonials-senja/services/worker/src/n3-outbox.ts
7f7408cbf1de8bcf6dec23e311254ed21600fd4a4197a4aa892a4f8a4b949d3a  projects/01-testimonials-senja/services/worker/src/index.ts
5d8604691a4f7868e22c6c7cb52ed12a49d3a8c5392b1121dea4fcd99f81f94d  projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/validation-report.md
```

No tests were run because this work unit was explicitly read-only and requested integration inspection plus proposed commands. The worktree already contained an untracked telemetry directory for this run; it was not modified.

Status: completed
