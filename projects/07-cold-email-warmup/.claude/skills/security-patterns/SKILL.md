---
name: security-patterns
description: N7 credential, consent, session, tenant, SSRF and payment safety patterns. Use for auth, secrets, dispatch, unsubscribe, adapters and security review.
---

# N7 security patterns

Read docs/Specification.md safety-v1 and .claude/rules/security.md. AEAD encrypt
with external versioned key; AAD tenant+mailbox; never return plaintext. All eligibility
writers acquire lock(7,1) first; final submitting commit authorizes one boundedattempt.
Signed tokens bind purpose, tenant and target; GET never mutates unsubscribe. Origin
and durable sessions protect owner mutations; manual complaint additionally operator-only.
Tenant predicates server-derived, never trust requesttenant. Revalidate providerDNS/IP
and pin TLS target; no defaultlive transport. KDF exactboundedparams,2slots/noqueue.
Local payment adapter keeps independent durable providerstate; fetchcanonical state
before exactlyonegrant. Test missing/forged/reordered claims and canary logredaction.
