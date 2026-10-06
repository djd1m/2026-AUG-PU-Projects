# Refinement — expanded-mvp delta v1

## Edge Cases Matrix
| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | empty body/context | hold; no hallucinated reply | typed reason |
| Max size |32KiB+1 body /64KiB+1 thread /6messages | bounded reject/hold | cap before buffering |
| Concurrent access |2 workers/last quota token, approve-edit-revoke | one reservation; stale approval0 sends | PG unique+global first lock |
| Network failure | timeout before/after DATA or LLM request | pre-DATA bounded retry; possible DATA unknown; generation unknown budget held | no blind retry |
| UID reset | changed validity during rescan | paused; durable high-water restart | full coverage+tail mandatory |
| Pair conflict | first pair already served today | next eligible pair, no starvation | persisted bounded cursor |
| Missing arrival | only Date or observed timestamp | unknown provenance, never fake SLO pass | separate count/infinity |
| Automatic/hostile mail | unsubscribe/bounce/OOO/prompt injection | stop/suppress or hold, never model instructions | deterministic filters+scope guard |
| Capacity exhaustion |31st activation/101st connection | connection accepted; activation waiting | atomic admission |
| Retention | stalled pending7days; terminal24h | body/draft gone, metadata bounded | durable cleanup + expiry reads |
| Midnight | prior reservation/current UTC day | re-reserve current budget or defer | inherited final fence |
| Tenant pressure | one noisy tenant dominates queue | other due tenants continue within round target | measured round robin |

## Testing Strategy
Unit: pure policy, limits, intent handling, output validation and SLO denominator math; literal threshold assertions independent of production constants. Integration: real PG migrations/transactions/row locks/unique keys, controlled TLS SMTP+IMAP protocol servers, stop races for each writer, crash before/after commit, bounded receive and secret canaries. No mock-only concurrency acceptance. E2E: own mailbox→verify→consent→draft→approve→dispatch/hold/revoke; desktop/mobile/keyboard in Docker Playwright1.63 only. Performance: A1 fixture load/restart and fair cadence, resource profile, queue age/p95/p99 plus 7day authorized live window separately. Entire existing suite/lint/build remains mandatory after final integration.

## Test Cases
Happy path — Given trusted incoming in separately consented autopilot scope and quota, When arrival is captured, poll ingests and OpenAI produces validated draft, Then parent enrollment stopped and exactly one ai_reply passes existing fence; accepted timestamp contributes to full denominator.
Error case — Given provider timeout after DATA and revoke committed afterwards, When daemon restarts, Then attempt unknown_delivery and no automatic resend; subsequent jobs canceled; event remains error/unknown and not silently dropped from SLO.

## Performance Optimizations
Use bounded indexed PG due scans and fair cursor progression. Reserve separate poll concurrency so generation/send pressure cannot consume all workers. Avoid a new queue/cache platform. Global lock remains until measurements and a separately accepted serialization proof justify change.

## Security Hardening
Adversarial fixtures include DNS rebinding, IPv4/IPv6 private ranges, TLS certificate mismatch/downgrade, AAD swap, forged/foreign thread, unknown intent, business-context exfiltration requests, link-fetch requests, header injection, draft approval drift, duplicate events and all consent writers. Audit only opaque IDs and typed reasons; inspect API/log/DB for credential canaries. Local fixtures must not reach external network.

## Accessibility
Explicit draft/pending/hold/error/live-test distinction, focus order and keyboard controls; 390px/1440px checks; single clear action; consent unchecked and distinct.

## Technical Debt
Provider OAuth expansion, larger fleet benchmarks and stronger output policy can follow measured pilot; never defer tenant/fence/unknown/quotas or AI itself. No promise of deliverability improvement without observation provenance.
