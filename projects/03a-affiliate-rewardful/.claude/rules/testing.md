# N3a testing rules

Sources: `docs/Refinement.md`, `docs/test-scenarios.md`, Specification SC IDs, and
`docs/Completion.md`. A planned scenario is not a passing test.

## Layers

- Unit: attribution resolution, policy snapshots, minor-unit rounding, refund allocation,
  period assignment, tax marginal brackets, and state-transition tables.
- PostgreSQL integration: unique constraints, transaction rollback, locking/serialization,
  append-only history, tenant isolation, queue claims, freeze/post races, and restore guards.
- Contract: signed N1 envelopes, version/type rejection, merchant/environment/order/amount/RUB
  mismatch, authenticated cursor reconciliation, retry and out-of-order delivery.
- Browser: owner and partner paths, separate N1/N3a origins, cookies, keyboard/focus/status text,
  320/390/768/1440 layouts, and visible separation of accrual from payout.
- External acceptance: a real ЮKassa test store and N1 integration. Keep this result separate
  from mocks and from production readiness.

## Required negative and mutation cases

Every guard needs a test that fails when the guard is removed or inverted. Cover unauthenticated
duplicates, forged MAC/key IDs, foreign tenant/partner identifiers, self-referral, invalid promo
without cookie fallback, signup without payment, duplicate/concurrent payments and refunds,
refund-before-payment, over-refund, failures before commit, restart/replay, and recovery R1–R4.

Compare economic totals and allocation hashes independently from audit-history order. Verify
aggregate equals the sum of the scoped ledger. For money concurrency, use real PostgreSQL;
mock-only tests cannot establish constraint or lock behavior.

## Completion evidence

- Map every implemented outcome to its FR/SC and executable test; preserve UI-only markers.
- Record the exact source/build revision and commands actually executed.
- A check that is missing, unavailable, skipped, or exit 2 is not green.
- Existing 110 prototype browser checks apply only to the CJM HTML, not the application.
- Do not claim runtime build, database, load, restore, N1/ЮKassa E2E, or deployment success
  until each was executed against the stated environment.
- Before release, require N1 regression for bridge changes, independent money/security review,
  backup/restore, port conflict checks, and the explicit release authority in Completion.
