# Pseudocode — f2-commercial

1. Parse bounded body and validate exact Origin for cookie mutation before password work. Limit auth admission before KDF; no transaction held during KDF/network.
2. Register: hash password → transaction insert unique account + empty real tenant + merchant membership + hashed session. Login verifies password outside transaction, then rechecks password version before issuing session.
3. Real command: resolve session membership in transaction → tenant row lock → verify actor/grant → dispatch → persist immutable facts/idempotency result. Fixture session cannot resolve real tenant.
4. Invite: owner creates random one-use token bound to tenant/role; acceptance locks invite, inserts user membership/actor atomically. Never accept caller-selected role/actor authority.
5. Agent token: authenticated user creates allowed grant + random credential in transaction. Each protocol call resolves hash and membership, then uses the same command authorization; revocation and password changes invalidate before cached data publication.
6. Payment: save immutable order id/amount/attribution under merchant authority → call provider outside transaction using order UUID as idempotence key → save remote binding. Retry same order with same key, never silently create a second order.
7. Webhook: bounded notification → authenticated provider read-back → verify authoritative fields against persisted order → lock tenant → unique business event + ledger correction → commit → HTTP 200. Provider timeout returns retryable failure. No external call holds a DB connection.
8. UI: /account common authenticated workspace in every variant, shared session cookie is host-only; each host login accesses same memberships. Demo index stays labelled synthetic. Agents connect using explicit issued credential, never browser cookie.

## Traceable algorithms

### Algorithm: FR-f2-commercial-1
REQUIREMENT: `FR-f2-commercial-1`
STEPS: Resolve real account membership in transaction; dispatch only within its real tenant.

### Algorithm: AC-f2-commercial-11
REQUIREMENT: `AC-f2-commercial-11`
STEPS: Bound input → Argon2id outside SQL → atomic account/empty tenant/membership/session hash → HttpOnly cookie; me omits raw token.

### Algorithm: AC-f2-commercial-12
REQUIREMENT: `AC-f2-commercial-12`
STEPS: Hash one-use invitation → lock valid invite → server fixed role → membership insert and consumed flag atomically; real action rejects fixture namespace.

### Algorithm: AC-f2-commercial-13
REQUIREMENT: `AC-f2-commercial-13`
STEPS: Cookie mutation requires exact Origin; SQL login counter has expiry/cap, KDF at most2 active; logout revokes hash, password version invalidates all sessions/agent credentials; fresh checks after waits.

### Algorithm: FR-f2-commercial-2
REQUIREMENT: `FR-f2-commercial-2`
STEPS: Create durable local order before fixed-host provider call; verified facts use common journal.

### Algorithm: AC-f2-commercial-21
REQUIREMENT: `AC-f2-commercial-21`
STEPS: Lock tenant and bind actor/price/policy/shop/test-mode to order UUID; repeat same input/key returns saved order. Call provider outsideSQL with orderUUID. After23h ambiguous create requires reconciliation.

### Algorithm: AC-f2-commercial-22
REQUIREMENT: `AC-f2-commercial-22`
STEPS: Read object and originating payment for refund through authenticated provider API; validate returned ID/shop/test/RUB/amount/time, then match durable order before event processing.

### Algorithm: AC-f2-commercial-23
REQUIREMENT: `AC-f2-commercial-23`
STEPS: Lock order and tenant; apply verified payment then optionalrefund; persist immutable facts with unique business key in same transaction. Duplicate input returns prior result; real refund is not subject to demo history cap.

### Algorithm: FR-f2-commercial-3
REQUIREMENT: `FR-f2-commercial-3`
STEPS: Resolve independent agent bearer into membership/grant before any protocol operation.

### Algorithm: AC-f2-commercial-31
REQUIREMENT: `AC-f2-commercial-31`
STEPS: Fixed MCP2025-11-25 StreamableHTTP SDK handler and A2A0.3JSONRPC dispatch; public card advertises only implemented synchronous capabilities.

### Algorithm: AC-f2-commercial-32
REQUIREMENT: `AC-f2-commercial-32`
STEPS: Hash bearer lookup joins current account version/member; tenant lock checks grant expiry/revoke/scope before dispatch and cache publication. Transport reauthenticates after operation.

### Algorithm: AC-f2-commercial-33
REQUIREMENT: `AC-f2-commercial-33`
STEPS: Derive command key from grant+messageId; task.create persists first, task.run applies bounded business action, task.read returns current state; terminal cancellation rejects; UI reads same task.

### Algorithm: FR-f2-commercial-4
REQUIREMENT: `FR-f2-commercial-4`
STEPS: Run semantic/source review, backend regression, guard mutation, real browser and deployment isolation checks.

### Algorithm: AC-f2-commercial-41
REQUIREMENT: `AC-f2-commercial-41`
STEPS: Verify candidate build/imports; isolated PostgreSQL alltests; SDK/HTTP tests; A–D public desktop/mobile and real accountUI; inspect DB networks/hostports/secrets; record source hashes and provider-unconfigured limitation.

