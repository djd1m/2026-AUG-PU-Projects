# sharing — criterion coverage

The integrated sharing implementation has independent 9/9 closure. This document maps every feature criterion exactly once to the best existing literal test title, including the final browser-only criteria.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-sharing-1 | tests/sharing/http.test.ts | AC-sharing-1 actual export strips EXIF, applies N8 pixels, discards raw upload, private PNG hash |
| AC-sharing-2 | tests/sharing/http.test.ts | AC-sharing-2 public HTML exposes only selected caption/image, escapes text, sets private attribution cookie; revoke denies page/image |
| AC-sharing-3 | tests/sharing/http.test.ts | AC-sharing-3 auth/origin/owner/version/rights refuse before stream read or reservation |
| AC-sharing-4 | tests/sharing/growth.test.ts | AC-sharing-4 duplicate event keys insert once under concurrency; only pseudonymous IDs and empty data |
| AC-sharing-5 | tests/sharing/growth.test.ts | AC-sharing-5/6 explicit 30-day readonly counts are zero, one, or unknown on storage failure |
| AC-sharing-6 | tests/sharing/growth.test.ts | AC-sharing-5/6 explicit 30-day readonly counts are zero, one, or unknown on storage failure |
| AC-sharing-7 | scripts/e2e.mjs | 390px keyboard/accessibility overflow |
| AC-sharing-8 | scripts/e2e.mjs | actual WebGL failure leaves usable plan measurements and manual save action |
| AC-sharing-9 | scripts/e2e-budget-hydration.mjs | SC-US-023-1 delayed saved-budget hydration preserves active unsaved cost and limit edits |

## Evidence boundary

`implementation-receipt.md` records 4 files / 25 focused tests and 29 files / 208 tests plus build/typecheck/lint, with three killed mutations. `review.md` records the backend/security probes, while `sharing-final-closure-1/receipt.md` independently closes all 9 criteria. The image-8 journey passed the canonical 390 px keyboard flow, public preview/revoke, cross-account derivative denial and actual WebGL failure; the unchanged core UI review passed 21 checks. The delayed-hydration GREEN receipt and independent add-row probe cover all three saved/error form states for `AC-sharing-9`. Growth evidence reports known synthetic counts 8/2/1/1/1; these are test events, not commercial metrics.
