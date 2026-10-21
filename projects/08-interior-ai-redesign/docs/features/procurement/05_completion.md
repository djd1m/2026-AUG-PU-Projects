# procurement — criterion coverage

The integrated backend implementation and all concrete independent-review corrections are complete. This document maps every feature criterion exactly once to the best existing literal test title; native browser input behavior remains a separate gate.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-procurement-1 | tests/procurement/calculator.test.ts | AC-procurement-1/4 records provenance and calculates exact pack boundary |
| AC-procurement-2 | tests/procurement/calculator.test.ts | AC-procurement-2/3 blocks refresh evidence and makes context mismatch, TTL and future stale |
| AC-procurement-3 | tests/procurement/repository.test.ts | AC-procurement-3 preserves old snapshots and invalidates effective context after region change |
| AC-procurement-4 | tests/procurement/calculator.test.ts | AC-procurement-1/4 records provenance and calculates exact pack boundary |
| AC-procurement-5 | tests/procurement/calculator.test.ts | AC-procurement-5 keeps unmatched expected elements and unknown service/delivery scope |
| AC-procurement-6 | tests/procurement/calculator.test.ts | AC-procurement-6 rejects incompatible units and overflow without mutating input |
| AC-procurement-7 | tests/procurement/calculator.test.ts | AC-procurement-7 derives named wall minus all openings and leaves GLB area unknown |
| AC-procurement-8 | tests/procurement/repository.test.ts | AC-procurement-1/8/13 commits exact revisions and reproduces old budget after mutable line changes |
| AC-procurement-9 | tests/procurement/calculator.test.ts | AC-procurement-9/10 separates known/scenario and compares a limit only for complete scope |
| AC-procurement-10 | tests/procurement/calculator.test.ts | PR-UI converts native RUB input to exact minor units |
| AC-procurement-11 | tests/procurement/repository.test.ts | AC-procurement-11/14 requires explicit substitution confirmation, validates fit, creates a draft and preserves history |
| AC-procurement-12 | tests/procurement/calculator.test.ts | AC-procurement-12 partitions phase movement once and preserves grand total |
| AC-procurement-13 | tests/procurement/repository.test.ts | AC-procurement-1/8/13 commits exact revisions and reproduces old budget after mutable line changes |
| AC-procurement-14 | tests/procurement/repository.test.ts | AC-procurement-11/14 requires explicit substitution confirmation, validates fit, creates a draft and preserves history |
| AC-procurement-15 | tests/procurement/calculator.test.ts | AC-procurement-15 exports immutable provenance and neutralizes leading-whitespace formulas/newlines/quotes |

## Evidence boundary

`correction-receipt.md` and `review.md` record the corrected final focused suite at 3 files / 30 tests, build/lint exit 0 and closure of PR-01..PR-08. For `AC-procurement-10`, the image-8 journey passed native RUB 1600 validity, exact server value 160000 minor, submit and controlled budget rerender. The delayed-hydration browser regression moved from RED on image 7 to GREEN on image 8, and independent add-row coverage confirms active edits survive server hydration; see `docs/reviews/budget-hydration-closure.md`. Retail price/availability remains manual because observed retailer requests returned 401; no bypass is claimed.
