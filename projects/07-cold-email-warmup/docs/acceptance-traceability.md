# AC-N7-001…012: приёмка и доказательства

Контракт: [утверждённый XL-план](plans/mvp-xl-plan.md), frozen Specification и
feature SPARC. PASS означает локальную программную проверку, не живую отправку.
Повтор неизменной зелёной PG-проверки после CSS не требуется; source-map diff
сопоставлен независимым reviewer. Статус PR обновляется отдельно.

| AC | Результат | Проверено | Доказательство | Источник |
|---|---|---|---|---|
| AC-N7-001 | PASS | 3 standalone CJM, self-selection A, responsive/keyboard; final cabinet | [CJM selection](decisions-owner.md) | Discovery + F06 |
| AC-N7-002 | PASS | Auth/logout, tenant404, encrypted credential/no-secret proofs | [F01 review](features/f01-foundation-auth/review-report.md), [F02 closure](features/f02-mailboxes-consent/review-r1-report.md), [F06 review](features/f06-cabinet-e2e-delivery/review-b.md) | 3b8763a1/b8abcd53 + final |
| AC-N7-003 | PASS | Separate pool/campaign consent; no consent zero transport | [F03 closure](features/f03-dispatch-pool-campaign/review-b-r1.md) | 55fffed2 |
| AC-N7-004 | PASS | 20 concurrent claims cap3 and shared pool/campaign quota | [F03 completion](features/f03-dispatch-pool-campaign/05-completion.md) | 55fffed2 |
| AC-N7-005 | PASS | Body/header unsubscribe, native confirmation, repeated zero extra effects | [R2 closure](features/f06-cabinet-e2e-delivery/review-b-r2.md), [full browser](features/f06-cabinet-e2e-delivery/implementation-b3.md) | f127abf2 + final |
| AC-N7-006 | PASS | All stop writers before0/after≤1; unknown no retry; post-lock time | [F03 closure](features/f03-dispatch-pool-campaign/review-b-r1.md), [F04 closure](features/f04-reply-suppression/review-b-r1.md) | 55fffed2/06ed2f9d |
| AC-N7-007 | PASS | Disclosed peer headers/body, private tenant data, waiting/withdrawal | [F02 review](features/f02-mailboxes-consent/review-r1-report.md), [full browser](features/f06-cabinet-e2e-delivery/review-b.md) | b8abcd53 + final |
| AC-N7-008 | PASS | Allowlisted personalization/missing fields, escaped preview and injections | [F03 completion](features/f03-dispatch-pool-campaign/05-completion.md), [browser](features/f06-cabinet-e2e-delivery/implementation-b3.md) | 55fffed2 + final |
| AC-N7-009 | PASS | Unknown/no-evidence blocked, source/date/counts, comparable public whitelist | [F05 closure](features/f05-evidence-billing-growth/review-b-r1.md), [final layout](features/f06-cabinet-e2e-delivery/review-b-r3.md) | f0fb8556/21e42881 |
| AC-N7-010 | PASS | Growth happy/edge/security; canonical TEST success, one grant, self/replay blocked | [F05 A](features/f05-evidence-billing-growth/review-a.md), [F05 B](features/f05-evidence-billing-growth/review-b-r1.md), [browser](features/f06-cabinet-e2e-delivery/review-b.md) | f0fb8556 + final |
| AC-N7-011 | PASS | Type/lint/build, unit39, previously full PG115, meaningful mutations, canary audit | [A receipt](features/f06-cabinet-e2e-delivery/correction-a-r1.md), [R3 receipt](features/f06-cabinet-e2e-delivery/implementation-b-r3.md) | final source map; unchanged PG reused |
| AC-N7-012 | PARTIAL | Actual shared Docker browser/source/image/screenshots accepted; PR blocked: GitHub403 | [full browser](features/f06-cabinet-e2e-delivery/review-b.md), [layout closure](features/f06-cabinet-e2e-delivery/review-b-r3.md), [PR draft](pr-draft.md) | final + external403 |

## Финальная привязка

- Product commit: `21e42881` (donor `f460a2b0`); accepted metadata `9413b431`.
- Source SHA256: `1144c60cfff6a30ae94be77971274102d5239adbfc8b19f3ee7f7f47f7d98e6a`.
- Compiled SHA256: `2b5c0c6b974feff5774b064f1fe038a3ff4345e9eb520c089945987ed107774c`.
- Image: `sha256:e04c5647ca2e18e97a104b8ee348a1fc5880c9310d3a102371504571e066aeeb`.
- [93-file source map](telemetry/features/20261003T023900Z-f06/sol-b-r3-readable-frozen-source.json),
  [image receipt](telemetry/features/20261003T023900Z-f06/sol-b-r3-readable-image-receipt.json),
  [acceptance](telemetry/features/20261003T023900Z-f06/coordinator-b-acceptance.json).

B3 matrix receipts are `sol-b-b3-*`; final layout receipts are
`sol-b-r3-report-layout-4/` and **sol-b-r3-readable-***. Earlier `sol-b-r3-*` image
is a superseded candidate, not the accepted build. [B3 implementation](features/f06-cabinet-e2e-delivery/implementation-b3.md)
contains exact runs, assertions, screenshots, commands and classified negatives.
[Final R3 review](features/f06-cabinet-e2e-delivery/review-b-r3.md) verified 218 checks,
source/script hashes and reviewed actual desktop/mobile images.

Local p95:100 actual reads/series, concurrency10, CPU2; desktop109.1ms,
mobile85.2ms, additional mobile78.5ms, all200. Excludes KDF/provider I/O.
[Raw summary](telemetry/features/20261003T023900Z-f06/sol-b3-performance-summary.json).
UI checks use real API/DB, no business-response mocks. Expected failures and earlier
harness/product failures remain in telemetry; a ready preflight alone is not a pass.
