# F05a implementation and handoff

Scope A1–A6 only, OWN-N7-002. Full SPARC PLAN/VALIDATE inputs: exact 01–04 feature documents and validated SC-US-009/011/013. Repeated substantive/mechanical ROUTE XL before IMPLEMENT (script exit1). Fresh independent Astra acceptance belongs to parent and is pending until its actual receipt.

Server free=3 mailboxes/3 active campaigns, TESTteam=10/10, 100 minor RUB/30days. `BILLING_MODE` defaults disabled; `N7_BILLING_MODE=local_test` is explicit Compose opt-in. No live adapter/network fallback. Session, Origin and tenant404 preserved. Creation/activation checks happen under existing eligibility lock using post-lock server clock; expired resources remain readable/editable/pausable and active duplicates remain idempotent.

Durable interfaces for B:

- `currentEntitlement(db, tenant)` from `src/billing/plans.ts`: current authoritative plan, limits, expiry, TEST label and hardMailQuota30. No paid query/body flag authority.
- `GET /api/billing/status`: current entitlement plus mode/checkoutAvailable/testPlan.
- `POST /api/billing/checkout`: closed `{plan:'team', idempotencyKey:8–128 ASCII key, code?:string}`; returns intent, canonical status, TEST price, same-origin status checkout URL and current entitlement. `GET /api/billing/intents/:uuid` is owner scoped.
- `POST/GET/PATCH /api/partner`: create/status/active; `GET /api/partner/:code` checks ownership. Status exposes counts only, TEST label, reward null, no other buyer identity.
- `GET /r/:code`: active validated nonPII code, HttpOnly purpose-HMAC 30day cookie, same-origin `/` redirect. Explicit valid code wins; invalid explicit errors with no cookie fallback. Absent/tampered/expired cookie reasons survive in intent. Self/inactive reject. Snapshot freezes before providercreate; later deactivation preserves attribution.
- `POST /api/operator/billing/simulate`: existing operator bearer auth, no session cookie, bounded JSON `{paymentId,status,...fixture overrides}`. Monotonic canonical version and terminal transitions. Test amount/currency/metadata/paidAt/unavailable overrides only here.
- `POST /api/operator/billing/reconcile`: authenticated wakeup closed `{intentId}` only. Canonical fetch outside transaction, then `(7,1)`→`(7,5)` atomic current-version/status fence, complete immutable-field comparison and unique fixed-expiry grant/conversion in one apply. No event/redirect authority. Terminal state cannot become succeeded. Expired paidAt never grants.

Additive migration010: partner_code, billing_intent, local_provider_payment, billing_entitlement, partner_conversion; intent immutable trigger; unique tenant/key, provider key, grant intent and conversion buyer. Provider separate transaction supports crash-before-bind retry. Tests needing aggregate capacity use explicit TEST entitlement and additional tenants without bypassing guards.

Validation commands: typecheck, lint, build, full unit, full realPG integration, billing guard mutation RED then restoration/affected GREEN, own runtime secret scan and source/build/image hashes. Actual exits and immutable source evidence are in F05 `sol-a-receipt.md` and associated files. Pending is never pass. B public reports, sharing/evidence and whole-cabinet browser F06 excluded.
