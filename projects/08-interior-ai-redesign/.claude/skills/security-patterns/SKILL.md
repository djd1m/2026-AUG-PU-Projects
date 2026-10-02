---
name: security-patterns
description: RoomKind server secret, provider verification and private media boundaries.
---
# Security patterns
## Encryption and ownership
HMAC stored session token, bcrypt passwords, HTTPS provider Basic authentication server-side. No browser provider credentials; server-owned keys override generic client-key templates. Private media read through authenticated UUID-owner SQL only.
## API key validation
Validate server config presence/shape without showing values; production refuses fixture adapter. Authenticate GET against configured YooKassa origin; bounded5s/64KiB response validates immutable merchant/account/order/payment/amount/currency/state before ledger transaction. Refund GET also binds refund to payment; no notification payload trust.
## Secure storage template
.env ignored, sample contains names only. Private files re-encoded/UUID named outside public root. Atomic rename+DB reference with orphan cleanup. Account/session/ledger/payment/job operations use documented locks; no secrets in logs or telemetry. Inspect tests for cross-account/malformed/replay/hold/cache bypasses.
