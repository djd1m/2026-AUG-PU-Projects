---
name: security-patterns
description: >
  Apply N3a authentication, tenant isolation, signed N1 intake, replay safety,
  secret handling and payout authorization patterns. Use at any trust boundary.
---

# N3a security patterns

Load `.claude/rules/security.md`, `.claude/rules/secrets-management.md`,
`docs/webhook-contract.md`, and the relevant `docs/Pseudocode.md` algorithm.

## Pattern: authenticated intake before claim

1. Read bounded raw body bytes without parsing JSON.
2. Resolve key ID and connection; reject unknown/retired keys.
3. Verify MAC over the exact raw body plus signed timestamp/method/path/connection/key ID with constant-time comparison; only then check freshness and parse the versioned JSON envelope.
4. Authorize program, merchant and environment from local connection state.
5. Validate event type, object IDs, timestamps, amount and RUB.
6. Verify N1's provider attestation and local checkout/customer mapping.
7. In one transaction, claim the transport identity and apply or return the unique business result.

Never reply "duplicate success" before authentication. A receipt claim alone cannot suppress
an unprocessed or differently keyed business event.

## Pattern: scoped object access

Resolve the authenticated actor, load the requested object through its tenant/program/partner
scope, then authorize the specific action. Use indistinguishable not-found/forbidden responses
where foreign-object disclosure matters. Audit denied monetary and policy actions without
storing secret input.

## Pattern: payout fail closed

Preparation requires a current terms/policy snapshot, verified recipient and contract evidence,
applicable tax-rule version, correct payer/person/year opening state and accountant approval.
Any unknown remains a review blocker. `ConfirmManualTransfer` requires owner/operator scope,
preparation identity, evidence, actual date and restore reconciliation state. Export has no state
transition.

## Pattern: safe output

Use HttpOnly/Secure/SameSite cookies, CSRF/Origin checks for mutations, escaped HTML, bounded
pagination, CSV formula neutralization, opaque identifiers, and field-level response projection.
Do not expose full provider payloads, tax evidence, session tokens or internal secrets.

Verify each pattern with a negative or mutation test. For replay and locking, use real PostgreSQL.
Do not claim a security tool, hook, rate limiter or secret store is installed until inspected.
