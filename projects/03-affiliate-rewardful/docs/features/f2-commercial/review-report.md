# Review — f2-commercial
Reviewer family: codex
Spec revision: sha256:6d666a880f34fb399f0bf89e1476c37e69c3d75cd4051211457b26cc08669161
Source: backend823a82a; UI3713b38 plus coordinator two-line form-reset closure, final SHA manifest in telemetry; final codea71c269868395394a620ae19dd0340ec0cf0355d.
Status: implementation accepted after final browser confirmation of form-reset closure; no full commercial launch claim.

Coordinator consolidates independent Astra reviews: [identity](../../telemetry/p-replicator/20260909T085312Z-f2-auth-payments-agents/identity-review.md), [payments](../../telemetry/p-replicator/20260909T085312Z-f2-auth-payments-agents/payment-review.md), [ten-AC source review](../../telemetry/p-replicator/20260909T085312Z-f2-auth-payments-agents/final-review.md), [UI closure and payout-date delta](../../telemetry/p-replicator/20260909T085312Z-f2-auth-payments-agents/ui-final-review.md). Models were actual Astra high for these reviews and root integration, actual Sol high for adapter/UI implementation. All earlier blocking findings resolved. Nonblocking retained business form fields were cleared by coordinator per reviewer suggestion; browser red control reproduced retention first.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-f2-commercial-11 | met | Argon2id, hash-only sessions, empty tenant; SQL identity and public signup/reload tests. |
| AC-f2-commercial-12 | met | Server membership resolution, one-use role-bound invite, fixture isolation; SQL and partner UI tests. |
| AC-f2-commercial-13 | met | Origin/cookie/body/rate guards, password version/revoke, late-expiry checks; SQL/HTTP/mutation plus delayed UI tests. |
| AC-f2-commercial-21 | met | Durable provider-bound order and constant idempotence key; lost response retry; unavailable when unconfigured. No live merchant claim. |
| AC-f2-commercial-22 | met | Authenticated read-back before dedup; shop/test/id/amount binding; hostile input tests. Provider sandbox NOTPERFORMED(no-provider). |
| AC-f2-commercial-23 | met | Parallel/repeated/refund-first events, frozen policy, late refunds past fixture quota; original core money invariants and unpaid due-date regression. |
| AC-f2-commercial-31 | met | Official MCP SDK client over public HTTPS, A2A JSON-RPC/card, shared SQL effects; no unsupported LLM/streaming claim. |
| AC-f2-commercial-32 | met | Bearer hash, hour TTL, membership/grant/version checks, revoke on cached and late responses; mutants and API tests. |
| AC-f2-commercial-33 | met | Persistent replay-stable task and artifact, cancellation/scopes; public MCP/A2A test reads identical task via UI API. |
| AC-f2-commercial-41 | met | 83 backend tests,49 public CJM browser tests, real account desktop/mobile, protocol interoperability, isolated DB/secrets; provider live gate explicitly not performed. |

## Verification limits

Original 16 core/HTTP and5 F2 mutation guards were killed; subsequent changes did not change their predicates. Source-bound actual executions and screenshots are in the run evidence. User authorized provider code/docs without merchant onboarding: no external financial call performed; generic webhook-contract gate reports NOTPERFORMED(no-provider), not PASS. Native provider uses authenticated read-back, not a nonexistent webhook HMAC. Email verification/recovery, fiscal receipt payloads, integrated subscription invoice billing, variant-native real UX and production scale remain outside the delivered foundation; [operations](../../f2-operations.md) lists pilot caps and setup.
