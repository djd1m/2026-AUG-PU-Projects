# N7 coding style

Node22 TypeScript strict; small domain modules and explicit transaction/adaptor boundaries.
camelCase functions, PascalCase types, kebab-case files. Imports standard library, external,
then local. Parameterized SQL only; account-scoped query helpers and typed public errors.
No global mutable tenant context. Coordinator owns shared project manifests/lockfiles.
Use Specification exact numbers; do not duplicate policy constants independently.

## Known Gotchas
JavaScript \w excludes Cyrillic; use Unicode property escapes /u for user text.
PostgreSQL SET LOCAL affects only current connection+transaction; use parameterized
set_config if needed. All transaction steps use one checked-out pg client.
KDF admission/rate controls must be singleton or shared durable state, never per-request.
Do not treat SMTP accepted as inbox delivery; ambiguous failures retain quota and stop retry.
Fixed UTC day must be reevaluated at final submitting, not assumed from reservation.
