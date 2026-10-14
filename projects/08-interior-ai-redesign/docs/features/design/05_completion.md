# design — criterion coverage

The integrated backend implementation and concrete review corrections are complete. This document maps every feature criterion exactly once to the best existing literal test title; final composed-browser behavior remains a separate gate.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-design-1 | tests/design/scene.test.ts | preserves measured shell and exact catalog dimensions |
| AC-design-2 | tests/design/scene.test.ts | rejects shell edits, URI, changed dimensions and foreign surfaces |
| AC-design-3 | tests/design/revisions.test.ts | ownership, concurrent CAS, immutable approval and restore new draft |
| AC-design-4 | tests/design/revisions.test.ts | ownership, concurrent CAS, immutable approval and restore new draft |
| AC-design-5 | tests/design/revisions.test.ts | ownership, concurrent CAS, immutable approval and restore new draft |
| AC-design-6 | tests/design/jobs.test.ts | manual mode makes no provider request; demo is explicit fixture without credits or spend |
| AC-design-7 | tests/foundation/config.test.ts | all live key/cap/rate/model/output/guardrail fields mandatory; ordered integer caps; no egress |
| AC-design-8 | tests/design/jobs.test.ts | single claim dispatch known cost and stale completion fence |
| AC-design-9 | tests/design/process-crash.test.ts | SC-US-008-4 actual killed worker after dispatch resumes as uncertain with holds and zero redispatch |
| AC-design-10 | tests/design/provider.test.ts | offline HTTP fixture runs complete real-PG worker path once and reconciles both ledgers |
| AC-design-11 | tests/design/jobs.test.ts | exact consent + replay before archive, caps, credit and version, with mismatched replay rejected |

## Evidence boundary

`implementation-receipt.md` records 34 design tests, lint/typecheck/build exit 0 and two killed mutations. `review.md` records an independent 6 files / 34 tests pass plus 3 files / 21 tests after closing DESIGN-R1..R3. The mapped tests establish the domain, PostgreSQL, worker and offline-provider portions. The image-8 journey passed manual design save/approval, equal-camera before/after, explicit manual mode and WebGL-failure save fallback; worker restart retained the exact owned state. No live paid inference or provider-quality result is claimed.

Final crash closure: actual1/1 targeted process test after full229/229; actual SIGKILL/newprocess, watchdog TESTclock+46s, unchanged holds, no realprovider or externalnetwork. Runtime source remains image9.
