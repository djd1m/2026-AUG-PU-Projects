---
name: coding-standards
description: >
  Apply N3a implementation conventions for TypeScript, PostgreSQL, money, time,
  idempotency and module boundaries. Use while writing or reviewing N3a code.
---

# N3a coding standards

First read `.claude/rules/coding-style.md` and the relevant algorithms in
`docs/Pseudocode.md`. For changes to trust, schema, transactions, or integration, also read
`.claude/rules/security.md`, `docs/Architecture.md`, and the applicable ADR.

## Required patterns

1. Parse every external value from `unknown` into a versioned typed boundary object.
2. Resolve authorization from the authenticated session/connection and local records.
3. Use integer minor units with explicit RUB and deterministic rounding.
4. Enforce payment/refund/posting uniqueness in PostgreSQL; return stable replay outcomes.
5. Keep append-only ledger, policy, snapshot, preparation, observation and confirmation history.
6. Separate HTTP/provider adapters from domain decisions and database transaction code.
7. Use explicit result/error variants for rejected, retryable, review-required, already-applied,
   and applied states. Preserve correlation and business IDs without logging sensitive payloads.
8. Make time basis and timezone visible in names and types. Never replace missing provider time
   with delivery time.
9. Build projections from source records and validate `aggregate = sum(scoped ledger)`.
10. Keep D7 types/routes absent or visibly proposal-only until its owner decision lands.

## Review before reuse

Read `docs/discovery/reuse-inventory.md`, then inspect the current N1/N2 source and local rules.
Record source path, revision/hash, selected dependency closure, adaptations and tests. Copy code
into N3a; do not add runtime imports or a shared database. Preserve N1 regression coverage when
the bridge changes.

Exact workspace tools, aliases, commands and dependency versions come from the implemented
foundation configuration. If they do not exist, report the gap rather than invent syntax.
