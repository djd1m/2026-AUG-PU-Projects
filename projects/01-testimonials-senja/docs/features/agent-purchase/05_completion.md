# Completion — agent-purchase

Status: IMPLEMENTATION IN PROGRESS; not released.

Required gates: scoped packaged traceability and independent specification validation, module build/typecheck/conformance, PostgreSQL concurrency and mutation tests, all P1 regressions, human browser E2E P1→N3 A–D, real MCP/A2A protocol tests, isolated UI pairing/payment demo, separate actual TEST provider acceptance. No live charges.

## Criterion coverage

Candidate `b2343b00208195b3365380146cecdd417f32c6a8`, Next build
`T72HtODyBT3GucyLfM4Wh`: integrated regression 1016/1016 PASS. Initial review fixes
are integrated; browser acceptance and final independent conformance are pending.
The following primary tests do not replace the full scenario evidence required above.

| Criterion | Test file | Test title |
|---|---|---|
| AC-agent-purchase-1 | packages/agent-payments/test/postgres.test.mjs | two independent hosts own different product prices without attribution |
| AC-agent-purchase-2 | apps/web/tests/agent-payments-host.test.ts | pairing is one use; concurrent confirmation issues one grant; polling never returns it |
| AC-agent-purchase-3 | packages/agent-payments/test/postgres.test.mjs | grant alone and saved method alone require human approval; no create call |
| AC-agent-purchase-4 | packages/agent-payments/test/postgres.test.mjs | price, terms, eligibility and expiry changes prevent autonomous dispatch |
| AC-agent-purchase-5 | packages/agent-payments/test/postgres.test.mjs | explicit human payment saves method, separate consent, public DTO never reveals reference |
| AC-agent-purchase-6 | apps/web/tests/agent-payments-host.test.ts | price and last-three-days policy are authoritative with Moscow calendar boundary |
| AC-agent-purchase-7 | packages/agent-payments/test/postgres.test.mjs | manual spending reduces agent budget but explicit extra human payments bypass caps |
| AC-agent-purchase-8 | packages/agent-payments/test/postgres.test.mjs | fulfillment rollback rolls back entitlement, spend, events; query recovery commits once |
| AC-agent-purchase-9 | apps/web/tests/agent-payments-host.test.ts | bridge fulfillment queues only external commission and replay preserves entitlement |
| AC-agent-purchase-10 | services/agent-api/tests/gateway.test.mjs | MCP SDK and A2A share order identity, preserve human handoff and survive gateway restart |
| AC-agent-purchase-11 | apps/web/tests/agent-payments-compatibility.test.ts | expired or revoked-grant preparations cannot hold manual checkout hostage |
| AC-agent-purchase-12 | packages/agent-payments/test/provider.test.mjs | reject live configuration before network |

## Evidence and remaining gates

[Telemetry and receipts](../../telemetry/p-replicator/20260910T071401Z-agent-payments-implementation-7e80/run.json),
[integrated regression](../../telemetry/p-replicator/20260910T071401Z-agent-payments-implementation-7e80/integrated-tests.json),
[setup and human involvement](operations.md).

Real YooKassa TEST saved-method acceptance is separate and has not been performed.
No live payment or public rollout is claimed. P1 gateway container build passed;
web production Next build and Docker dependency stage passed. A complete new web
runtime Docker image has not yet been built or deployed.

Deployment only from source-bound tested candidate; module disabled until activation. Human CJM must remain available with module disabled and enabled; P2 untouched. Existing public payment behavior cannot be used to claim new agent checkout works.
