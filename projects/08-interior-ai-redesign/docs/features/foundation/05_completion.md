# foundation — criterion coverage

The integrated implementation has independent review closure. This document maps every feature criterion exactly once to the best existing literal test title; final production-browser evidence is recorded below.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-foundation-1 | tests/foundation/integration.test.ts | SC-US-001-1/2 registration duplicate neutral dummy token; login/logout/expiry/disabled persisted |
| AC-foundation-2 | tests/foundation/integration.test.ts | SC-US-001-1/2 registration duplicate neutral dummy token; login/logout/expiry/disabled persisted |
| AC-foundation-3 | tests/foundation/auth.test.ts | SC-US-001-3 permits 72 UTF8 bytes, rejects 73/multibyte suffix before hashing for register/login |
| AC-foundation-4 | tests/foundation/integration.test.ts | SC-US-002-1 and SC-US-020-2 owned SQL/HTML text roundtrips; projects isolated and DTO excludes account/private fields |
| AC-foundation-5 | tests/foundation/integration.test.ts | SC-US-002-2/019-1 foreign and missing resources same404; ownership/CAS persists through races |
| AC-foundation-6 | tests/foundation/http.test.ts | SC-US-016-1 exact Origin required after atomic rate and before body; foreign owner returns404 without parsing |
| AC-foundation-7 | tests/foundation/integration.test.ts | SC-US-016-2 atomic PG 59 attempts then 20 concurrent admits exactly one; rejected attempts counted |
| AC-foundation-8 | tests/foundation/integration.test.ts | SC-US-016-3 route mutation saves, envelope camelCase, me private response safe; foreign HTTP read404 |
| AC-foundation-9 | tests/design/revisions.test.ts | FND-FINAL-1 foreign and absent array scalar JSON design relation IDs return identical404 without side effects |
| AC-foundation-10 | tests/foundation/http.test.ts | SC-US-020-1 malformed/oversized/slow body is counted and bounded before parse |
| AC-foundation-11 | tests/foundation/integration.test.ts | SC-US-002-1 and SC-US-020-2 owned SQL/HTML text roundtrips; projects isolated and DTO excludes account/private fields |
| AC-foundation-12 | tests/foundation/http.test.ts | SC-US-021-1 error envelope/log only allowlisted code/requestId/latency, never secret exception payload |

## Evidence boundary

`implementation-receipt.md` records the author full foundation run at 5 files / 26 tests, plus lint, typecheck and build exit 0. `review.md` records an independent 5 files / 26 tests pass and focused closure of FND-R1..R3 and FND-D1..D2. The source-bound image-8 journey completed 21/21 checks with registration, project persistence, injection-safe rendering and broad cross-account denial. A later independent composition probe found FND-FINAL-1: five design branches return 422 for embedded foreign reference IDs where the literal `AC-foundation-9` boundary requires indistinguishable 404. Focused correction, no-side-effect two-owner coverage and image-9 binding remain required before a final foundation/65-AC verdict.
