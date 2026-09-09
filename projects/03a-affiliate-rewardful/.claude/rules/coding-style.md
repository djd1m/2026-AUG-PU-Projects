# N3a coding style

Sources: `docs/Architecture.md`, `docs/Pseudocode.md`, `docs/ADR.md`, and
`docs/implementation-plan.md`. These rules describe the planned TypeScript/Node/PostgreSQL
direction; exact package versions and paths are fixed only after the donor audit.

## Structure and names

- Organize a modular monolith by business capability: identity/access, program/partner,
  attribution, N1 intake/reconciliation, ledger, settlement/tax, and projections/UI.
- Keep domain logic independent from HTTP, framework request objects, SQL clients, and provider
  payloads. Adapters translate at the boundary into versioned typed values.
- Use descriptive PascalCase types, camelCase functions/values, kebab-case route segments and
  files according to the selected framework convention. Preserve the canonical logical names
  in `docs/Pseudocode.md`; record deliberate renames in the implementation plan.
- Represent money as integer minor units plus ISO currency. Never use binary floating point.
- Represent time with explicit instants and program timezone; distinguish `occurred_at`,
  received time, due date, actual transfer date, and recorded date.
- Model states and error codes as closed unions/enums. Do not use booleans where pending,
  review, failed, sent, confirmed, or unknown have different meaning.

## Persistence and effects

- Put related unique claims, ledger posting, outbox/inbox state, and projection changes in one
  transaction where the pseudocode requires atomicity. Keep provider calls outside long locks.
- Enforce business uniqueness with database constraints; do not use read-then-insert as the
  concurrency guard.
- Append corrections and observations. Never update history to make current totals convenient.
- Rebuild read projections from scoped ledger/provenance. Do not make a projection the source
  of monetary truth.
- Create connection pools, durable rate limiters and circuit breakers once at process startup;
  per-request instances reset their protection state.
- Return stable outcomes for replay and retries. Make the distinction between already applied,
  review required, retryable external failure, and permanent rejection explicit.

## TypeScript gotchas

- `\w` does not match Cyrillic. Use Unicode property escapes such as `\p{L}` with `/u`.
- Avoid unchecked casts for request/provider data. Parse unknown input through a schema first.
- Use `bigint` or a proven integer/decimal boundary for amounts, and serialize it explicitly.
- Avoid module-level mutable money/rate-limit state; process restarts and multiple workers make
  it incorrect.
- PostgreSQL `SET LOCAL` affects only the current transaction/connection. Set tenant context
  inside the same transaction that performs the protected query.

Imports, lint commands, test runner, workspace aliases, and file layout must follow the actual
foundation configuration once it exists. Do not document guessed commands as standards.
