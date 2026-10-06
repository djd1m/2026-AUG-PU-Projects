# F03 owned paths and interfaces

Sol writer owns src/campaigns/, src/pool/, src/dispatch/, additive db003/004,
necessary src/server/config/db and consent/store integration, focused tests,
project package scripts, isolated compose/runtime test harness and own evidence.
Auth algorithms, F02 crypto/network and historical receipts are unchanged unless
specific integration defect requires a documented correction. Root/other projects
read-only. Review report/roadmap/plan integration belongs to coordinator.

Reuse F02 versioned AEAD and transaction helper; use separate external keyed
recipient digest secret, not plaintext address or public hash as suppression key.
All owner queries derive tenant from session. F04 will use actual F03 enrollment,
sent Message-ID, poll-state and stop/suppression primitives; names are documented
in implementation handoff. F03b local sink must be durable and visibly TEST.
No new distributed queue, broker, scheduler engine or external email service.
Worker tick bounded and explicit; a minimal separate worker process may invoke
those same durable methods when local Docker integration is ready.
