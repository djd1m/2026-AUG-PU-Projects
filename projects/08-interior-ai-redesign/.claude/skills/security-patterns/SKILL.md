---
name: security-patterns
description: N8 server secrets, private asset/share, external provider and fail-closed configuration patterns.
---

# Security Patterns

Read docs/Specification.md NFR-security/integrity/cost and validation amendments. Provider keys only server env; browser never receives key, encryption of exposed client key is not an acceptable replacement. Private env0600, logs redact code/requestId/latency/hashed IDs only.

Origin/cookie/owner checks pre-body; then one bounded JSON/upload reader. Session lookup expiry/revoke/active. Custom ingress overwrites peer headers from socket.remoteAddress, no XFF fallback or alternate Next listener. Atomic rate before malformed-body validation. Scalar/embedded ownership checks both needed.

Fenced once-only paid dispatch, unresolved exposure across midnight, no automatic uncertain retry. Capless live startup refuses. Provider endpoint fixed and response bounded. YooKassa source + remote object re-fetch (not HMAC), verify partial refund linkage before durable ledger/hold. Fake provider only tests.

Ordinary uploads cannot create share_image. Server export provenance and current entitlement checked under Account→Project locks. Reencoded metadata/DTO omit private fields; owner preview covers visible pixels. Token32randombytes, hash only, TTL7days, no-store/noindex, current revoke check on image and page. No auto publication/message or public gallery.
