# F03b backend contract for F04

Attribution is an authenticated account preference. `GET /api/attribution` and `POST /api/attribution` require the configured exact Origin, including GET. Bodies are JSON ≤16 KiB, public rate limit120/IP/min. Session authentication is essential and remains separate from tracking. Responses contain only `{tracking_opt_in, source, partner_code, expires_at}`; no partner/account identity or private metadata.

F04 starts with the tracking checkbox unchecked. GET loads the server state; an absent consent row means false. A cookie cannot establish consent. POST bodies allow only `action` and optional `partner_code`:

| Action | Body | Result |
|---|---|---|
| Explicit consent | `{"action":"accept"}` | Stores opt-in; creates no tracking cookie without a code. |
| Consent and capture | `{"action":"accept","partner_code":"…"}` | Validates active owner-bound nonself code and sets first preference if absent. |
| Later capture | `{"action":"capture","partner_code":"…"}` | Requires server opt-in; preserves existing valid first preference and original expiry. |
| Refuse consent | `{"action":"deny"}` | Stores false, deletes current preference, expires tracking cookie only. |
| Manual preference | `{"action":"manual","partner_code":"…"}` | Replaces preference without needing opt-in; removes previous tracking cookie. |
| Clear preference | `{"action":"clear"}` | Deletes preference and clears tracking cookie; consent remains as chosen. |

Tracking cookie `roomkind_attribution` contains32randombytes, not a partner identifier. Only an account-bound HMAC digest is stored in PostgreSQL. HttpOnly, SameSite=Lax, Path=/, Max-Age2592000; Secure follows existing production/nonlocal cookie policy. A valid token, matching account proof, server opt-in and unexpired preference are all necessary. Missing/blocked/tampered/duplicate cookie removes cookie-based stored attribution on load/use; no fallback to its server preference. Expiry is checked using database time on every use; GET and new payment creation clear the cookie. No periodic cleanup is required for correctness. Consent alone has no attribution effect after expiry; renewed explicit capture can establish a fresh30d preference.

`POST /api/payments` keeps its F03a body `{package:"ROOM20", idempotency_key, partner_code?}`. A supplied manual code is validated before any preference mutation, replaces the preference atomically with a new intent, and works with only the essential session. Without a supplied code, a manual server preference is usable without tracking cookies; a cookie preference requires the protected proof. Invalid code422 leaves preference/consent unchanged. Extra client consent/account/partner-id fields400. Same key/body returns the original immutable intent; changed body409. Preference edits never rewrite existing intents. Consent/preference/payment writes serialize at account lock; payment resolution uses the existing transaction, avoiding nested locks.

No partner registry HTTP route is implemented. Trusted server operators run:

```sh
node scripts/partner.js create ACCOUNT_UUID
node scripts/partner.js activate PARTNER_UUID true
node scripts/partner.js activate PARTNER_UUID false
node scripts/partner.js aggregate PARTNER_UUID
```

Create generates a unique opaque192-bit code, active and bound to an existing account. CLI does not accept client-chosen code or owner edits. Server service duplicate409, missing account404; database enforces immutable id/owner/code. Historic nullable F03a partner records remain inactive and ineligible; NOT VALID owner constraint preserves old records while enforcing all future inserts/updates. Migration removes unprotected legacy cookie preferences. No credentials are printed.

Aggregate returns `{first_conversions: integer, amount_minor: decimal-string, currency:"RUB"}`. Exact integer string avoids JavaScript overflow. Counts distinct valid account-scoped first conversions, sums verified winning90000minorRUB intents, requires verified success event and purchase ledger, excludes held/refunded/review/self/inactive/ownerless/mismatched records. Later or replayed payments never count; refund does not promote a loser. This is an operator-only interface, with no public partner dashboard or commission/reward/payout writes. Operator access means trusted shell/runtime access; no user-facing operator role is introduced.

The author checks use injected fixtures and never prove SQL/runtime behavior. Coordinator must run `N8_TEST_DB_OWNERSHIP=n8-f03b TEST_DATABASE_URL=<dedicated PG16 URL> node tests/attribution.integration.test.js`, plus the affected existing auth/payment PostgreSQL and HTTP regressions using each suite's existing ownership assertion (`n8-f03a` for payments). Schema names are randomized and cleaned; never run against a user database. Fresh Astra review and these runtime checks remain mandatory before acceptance. UI/browser/payment provider acceptance are later stages; no external payment, mail, GPU or deployment action is part of this backend pass.
