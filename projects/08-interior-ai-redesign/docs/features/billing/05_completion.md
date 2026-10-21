# billing — criterion coverage

The integrated billing backend implementation has independent review closure. This document maps every feature criterion exactly once to the best existing literal test title; browser availability/history remains part of final E2E.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-billing-1 | tests/billing/http.test.ts | AC-billing-1 default off checkout503 webhook404 before body; offers honest empty and no external calls |
| AC-billing-2 | tests/billing/repository.test.ts | AC-billing-2 parallel same-key checkout has one durable order and provider id; client prices rejected |
| AC-billing-3 | tests/billing/repository.test.ts | AC-billing-3 verified concurrent delivery grants exactly one package and one event; return GET is read-only |
| AC-billing-4 | tests/billing/repository.test.ts | AC-billing-4 merchant/test/amount/currency/paid/status/metadata/bound-id negatives leave ledger empty |
| AC-billing-5 | tests/billing/repository.test.ts | AC-billing-5 verification outage occupies no event key; later retry grants once |
| AC-billing-6 | tests/billing/refund.test.ts | AC-billing-6 partial refund distinct object verified via payment_id; replay cannot restore export or new billing |

## Evidence boundary

`implementation-receipt.md` records the final billing suite at 4 files / 35 tests, build/lint exit 0 and two killed mutations. `review.md` records an independent 4 files / 35 tests pass and a focused closure of the private-export defect. The image-8 journey passed the honest disabled-payment state in an actual private account. These rows cover the server payment boundary with offline provider fixtures; payments remain off by default and no live merchant payment is claimed.
