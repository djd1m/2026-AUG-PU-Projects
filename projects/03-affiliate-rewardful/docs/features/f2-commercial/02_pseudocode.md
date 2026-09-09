# Pseudocode — f2-commercial

1. Parse bounded body and validate exact Origin for cookie mutation before password work. Limit auth admission before KDF; no transaction held during KDF/network.
2. Register: hash password → transaction insert unique account + empty real tenant + merchant membership + hashed session. Login verifies password outside transaction, then rechecks password version before issuing session.
3. Real command: resolve session membership in transaction → tenant row lock → verify actor/grant → dispatch → persist immutable facts/idempotency result. Fixture session cannot resolve real tenant.
4. Invite: owner creates random one-use token bound to tenant/role; acceptance locks invite, inserts user membership/actor atomically. Never accept caller-selected role/actor authority.
5. Agent token: authenticated user creates allowed grant + random credential in transaction. Each protocol call resolves hash and membership, then uses the same command authorization; revocation and password changes invalidate before cached data publication.
6. Payment: save immutable order id/amount/attribution under merchant authority → call provider outside transaction using order UUID as idempotence key → save remote binding. Retry same order with same key, never silently create a second order.
7. Webhook: bounded notification → authenticated provider read-back → verify authoritative fields against persisted order → lock tenant → unique business event + ledger correction → commit → HTTP 200. Provider timeout returns retryable failure. No external call holds a DB connection.
8. UI: /account common authenticated workspace in every variant, shared session cookie is host-only; each host login accesses same memberships. Demo index stays labelled synthetic. Agents connect using explicit issued credential, never browser cookie.
