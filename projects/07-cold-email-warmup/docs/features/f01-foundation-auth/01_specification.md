# F01: application foundation and tenant identity

Source: validated docs/Specification.md FR-n7-001 and NFR-n7-001 identity boundaries;
SC-US-001-1..6 and security catalog auth Example branches. No new product behavior.
Requirement inheritance: original/revalidation reports close V04/V05; canonical
validation index now READY at1ed1bc40, runtime not accepted.

### AC-f01-foundation-auth-001

AC-F01-1: runnable Node22/TypeScript web/API+PostgreSQL16 isolated Compose; DB has
no host port; loopback web port variable, health/readiness reflects migration/DB.
### AC-f01-foundation-auth-002

AC-F01-2: register creates tenant/account and usable7day opaque session; login/logout;
only HMAC token digest persists, old/revoked/expired/inactive session rejected.
### AC-f01-foundation-auth-003

AC-F01-3: no/forged/revoked cookie401, badOrigin403 with0writes; secondtenant mailbox
fixture returns404; malformedUUID400; parameterized SQL cannot bypass tenant.
### AC-f01-foundation-auth-004

AC-F01-4: exact Argon2id v19 m65536/t3/p1/salt16/out32 only; password8–200Unicode
chars<=800bytes, reject before KDF;2active/noqueue, excess503RetryAfter1 and finallyrelease.
### AC-f01-foundation-auth-005

AC-F01-5: atomicDB fixedUTC windows login email5/15min+trustedIP10/min,
registerIP5/hour; attempts count; exceeded429RetryAfter. Ignore untrustedforwardedIP.
### AC-f01-foundation-auth-006

AC-F01-6: build/typecheck/lint/authunit+realPGintegration pass; secretcanary scan;
record direct/transitive dependency licenses and donor adaptation exactsource.

Registration does NOT grant mailing consent. No SMTP/IMAP/paymentlivecalls.
Minimal accessible auth page permitted; full CJM cabinet is F06. Mailbox table
and owned read endpoint needed only to establish FR001 two-tenant boundary;
connection/provider/AEAD/consent implementation belongs to F02.
