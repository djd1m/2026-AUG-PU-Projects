# Completion — f2-commercial

Status: implementation accepted; external merchant acceptance unavailable. Final code revision: `a71c269868395394a620ae19dd0340ec0cf0355d` (backend823a82a, final account UIa71c269). Real identity, scoped invitations, password/session revocation, durable YooKassa order plus verified payment/refund ingestion, official MCP Streamable HTTP and A2A JSON-RPC implemented. Shared real `/account` workspace deployed on A–D; original fixture CJMs remain separate.

Verification: build82 modules; PostgreSQL-backed suite83/83; actual account Firefox desktop1440/mobile390 passed signup/login/invite/enrollment, MCP, revoke, reload and A–D membership persistence. Delayed responses after logout/membership switch cannot restore old data or credentials. Final repeated public A–D regression49/49 and public official MCP/A2A interoperability passed. Independent review closed prior blockers; coordinator implemented its remaining form-reset suggestion and demonstrated browser red/green. Build and mandatory pipeline/review-contract gates passed.

Provider boundary: dedicated N3 shop credentials absent, integration disabled explicitly. No live merchant financial operation performed. Contract HTTP/SQL tests verify adapter, lost-create-response retry, binding, duplicate delivery and refund ordering. Native YooKassa read-back contract has no HMAC; generic webhook gate returns NOTPERFORMED(no-provider), not a fabricated pass. Owner previously authorized documentation/code without merchant onboarding.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-f2-commercial-11 | tests/identity.test.mjs | real registration, persistent login, tenant isolation, fixture isolation and logout |
| AC-f2-commercial-12 | tests/identity.test.mjs | one-use role-bound invitations, concurrent acceptance, partner cannot take merchant authority |
| AC-f2-commercial-13 | tests/account-http.test.mjs | real cookie HTTP protects CSRF, keeps tokens out of responses, and connects scoped MCP/A2A to PostgreSQL |
| AC-f2-commercial-21 | tests/payment-integration.test.mjs | lost create response keeps durable order and retries same provider idempotence key without another payment |
| AC-f2-commercial-22 | tests/payment-integration.test.mjs | forged and mismatched provider objects never reserve dedup; later authentic delivery succeeds with frozen policy |
| AC-f2-commercial-23 | tests/payment-integration.test.mjs | real durable checkout survives retry; verified duplicate and refund-before-payment accrue and reverse once |
| AC-f2-commercial-31 | tests/e2e/public-agent.mjs | public HTTPS official MCP Client and A2A share durable authorized state |
| AC-f2-commercial-32 | tests/identity.test.mjs | agent token scopes, durable task replay, revocation and password rotation invalidate credentials |
| AC-f2-commercial-33 | tests/agent-transport.test.mjs | A2A card and durable application task mapping: replay, changed input, current get, terminal cancel |
| AC-f2-commercial-41 | tests/e2e/account.mjs | real account UI desktop/mobile signup login invite scopes agent transport and durable organization across A–D |

## Evidence and operational limits

[Run and receipts](../../telemetry/p-replicator/20260909T085312Z-f2-auth-payments-agents/run.json); [operations and exact public endpoints](../../f2-operations.md); [review](review-report.md).

This accepts the verified implementation scope; it does not claim a complete commercial launch, provider sandbox acceptance, email ownership verification/password recovery, integrated subscription billing, fiscal receipts, autonomous LLM execution or bank payout automation. Manual payout facts remain distinct from CSV and bank credit. Pilot capacity limits are documented in operations.
