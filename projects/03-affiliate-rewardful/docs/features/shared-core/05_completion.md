# Completion — shared core F1

All25 backend criteria supported by independent source review and actual PostgreSQL tests, including multi-process concurrency, restart/idempotency, immutable journal, stale-source settlement, credit unknown and task/grant lifecycle. Latest full suite40/40; original3core invariant mutants plus current8HTTP/UI/registry mutants killed. H1malformedURL fixed and independently rechecked; Acurrentrevision correction also reviewed and tested. Backend acceptance does not assert production-provider or real MCP/A2A interoperability; global acceptance awaits allfour UI variants.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-shared-core-11 | tests/core-access.test.mjs | SC-US-001-1 SC-US-006-1 foreign tenant resource is denied across UI/MCP/A2A fixture contexts |
| AC-shared-core-12 | tests/core-access.test.mjs | SC-US-001-2 partner cannot read merchant registry or known other partner |
| AC-shared-core-13 | tests/core-access.test.mjs | SC-US-001-3 server checks selected membership, limited token cannot gain merchant through variant switch |
| AC-shared-core-21 | tests/core-events.test.mjs | SC-US-002-1 SC-US-006-3 concurrent business payment across processes and retry after restart accrues once |
| AC-shared-core-22 | tests/core-events.test.mjs | SC-US-002-2 recurring payment IDs accrue separately and frozen policy versions survive changes |
| AC-shared-core-23 | tests/core-events.test.mjs | SC-US-002-3 unverified and unknown events cannot claim identity; verified retry can |
| AC-shared-core-24 | tests/core-events.test.mjs | SC-US-002-4 explicit promo wins and invalid promo, self-referral and expired attribution explain zero reward |
| AC-shared-core-31 | tests/core-domain.test.mjs | SC-US-003-1 integer rounding preserves original reward under cumulative partial refunds |
| AC-shared-core-32 | tests/core-registry.test.mjs | SC-US-003-2 SC-US-004-1 selected month cash registry explains held, refunded and credit exclusions |
| AC-shared-core-33 | tests/core-events.test.mjs | SC-US-003-3 refund after simulated sent fact creates debt exception and never frees sent obligations |
| AC-shared-core-41 | tests/core-registry.test.mjs | SC-US-003-2 SC-US-004-1 selected month cash registry explains held, refunded and credit exclusions |
| AC-shared-core-42 | tests/core-registry.test.mjs | SC-US-004-2 SC-US-004-7 refund invalidates approval, exports including cached command and releases only unsent allocations |
| AC-shared-core-43 | tests/core-registry.test.mjs | SC-US-004-3 SC-US-004-6 export does not send; repeated send with new key preserves one fact; mixed partner sends survive |
| AC-shared-core-44 | tests/core-registry.test.mjs | SC-US-004-4 SC-US-004-5 same artifact snapshot is stable and competing approvals cannot share obligations |
| AC-shared-core-45 | tests/core-registry.test.mjs | SC-US-004-4 SC-US-004-5 same artifact snapshot is stable and competing approvals cannot share obligations |
| AC-shared-core-46 | tests/core-registry.test.mjs | SC-US-004-3 SC-US-004-6 export does not send; repeated send with new key preserves one fact; mixed partner sends survive |
| AC-shared-core-47 | tests/core-registry.test.mjs | SC-US-004-2 SC-US-004-7 refund invalidates approval, exports including cached command and releases only unsent allocations |
| AC-shared-core-48 | tests/core-registry.test.mjs | SC-US-004-8 historical CSV actual payment creates one reconciliation and never authorizes a second transfer |
| AC-shared-core-51 | tests/core-grants.test.mjs | SC-US-005-1 SC-US-005-3 SC-US-006-2 scoped deterministic task yields same persisted artifact for owner handoff |
| AC-shared-core-52 | tests/core-grants.test.mjs | SC-US-005-2 revoked grants reject cached task results and reads while owner keeps independent artifact rights |
| AC-shared-core-53 | tests/core-grants.test.mjs | SC-US-005-1 SC-US-005-3 SC-US-006-2 scoped deterministic task yields same persisted artifact for owner handoff |
| AC-shared-core-54 | tests/core-grants.test.mjs | SC-US-005-4 canceled task ignores late execution and never publishes into another task |
| AC-shared-core-61 | tests/core-access.test.mjs | SC-US-001-1 SC-US-006-1 foreign tenant resource is denied across UI/MCP/A2A fixture contexts |
| AC-shared-core-62 | tests/core-grants.test.mjs | SC-US-005-1 SC-US-005-3 SC-US-006-2 scoped deterministic task yields same persisted artifact for owner handoff |
| AC-shared-core-63 | tests/core-events.test.mjs | SC-US-002-1 SC-US-006-3 concurrent business payment across processes and retry after restart accrues once |
