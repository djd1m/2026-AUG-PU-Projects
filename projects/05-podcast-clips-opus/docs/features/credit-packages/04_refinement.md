# Credit packages — Refinement

Required tests, not executed results. [Specification](01_specification.md) is acceptance authority; [owner decisions](owner-decisions.md) distinguishes direct answers, delegated code choices and the disabled future upgrade.

## Edge Cases and Error Paths
| Case | Required result |
|---|---|
|120/121sec, decimal probe duration |2credits /121÷60credits; ceil trustedseconds applied once and stored |
| Duplicate registration/login/schema replay | No old account gift/cutover; credit new signup/operator opt-in has one lifetime signup-or-migration trial; no monthly reset |
| Two grants, last units and expiry boundary | Earliest expiry first; atomic full reservation, no partial debit |
| Crash after reserve before provider; chunk retry; new fence | Stable customer charge; real provider attempts still counted |
| Terminal failure vs late first ready clip | Video-lock/current-fence decides once; no refund after accepted success |
| Base expired, addon active; overlapping windows | Paid rights through addon30days; overlap not summed |
| Expiry while reserved | Reserved units valid; paid-render source pinned, no clip downgrade |
| Failed zero-result after grant expiry | Only released units get24h recovery, original paid source preserved |
| Same idempotency key/differentSKU; alternate event/payment ID |409conflict or review, no extra fulfillment |
| Provider unavailable, then same webhook retry |503with no poisoned event claim; later complete transaction |
| Immediate20RUBupgrade request, including Start+2addons | Refused before intent/provider call; no charge/delta; next-period full-price Pro or addon now |
| Duplicate renewal fulfillment; two separate purchases race | Same intent schedules once; separate paid purchases serialize successive30day base periods |
| Legacy default, invalid config, new mode enabled/disabled | Undefined→legacy; empty/unknown refuses startup; new credit registrations only when enabled; existing credit intents/jobs never reinterpreted |
| Legacy paid, operator, pending old invoice | Preserve old daily/indefinite rights, no old990→newStart inference |
| Account deletion races any financial path | No deadlock; no unauthorized late grant; holds removed/canceled; payments anonymized |

## Test Plan
| Scenario IDs | Meaningful tests / target files |
|---|---|
| SC-US-001-1/2 | New real SQL registration/migration tests; auth.test.ts plus credits.integration.test.ts;20same-emailrace, rollback session+trial, unique source across signup/migration |
| SC-US-002-1/2 | billing.integration.test.ts, retention.integration.test.ts: exact three offers, addon alone, gap/overlap boundaries, effectivePlan SQL/TS and storage expiry mirror |
| SC-US-003-1/2 | credits.integration.test.ts, queue-probe.integration.test.ts:120/121/fractional seconds,20competing lastbalance reservations, no provider dispatch on shortage |
| SC-US-004-1/2 | transcription-quota.test.ts, queue-probe.integration.test.ts: chunk retry, restart, new fence, select/render retry; firstsuccess/failurebarrier; stale no-refund |
| SC-US-005-1/2 | credits.integration.test.ts, billing.integration.test.ts:immediate-upgrade rejection before provider/intent, full-price scheduled Pro, duplicate fulfillment/separate concurrent renewals, independent addon expiry and unchanged spent/held volume |
| SC-US-006-1 | billing.integration.test.ts, migration cohort fixtures, retention integration: activepaid, expiredpaid, operator, pre021, old pending invoice, alreadyinflight jobs |
| SC-US-007-1/2 | Existing billing.integration.test.ts+payments-guards.test.ts; tests/browser/billing.test.ts mobile balance/catalog/return/shortage/nextperiod |
| SC-US-008-1/2 | credits.integration.test.ts, retention.integration.test.ts; expiry refund/recovery idempotency; payment/probe/erase/finalize transaction races |
Future test titles will be authored during implementation and copied verbatim into completion coverage only after files exist; this plan does not invent test evidence.

## Mandatory Concurrency and Mutation Checks
Barrier-based PostgreSQL tests:20grant/reserve requests; duplicate success20deliveries; success/refund reversed+concurrent; account erasure vs payment/probe/finalizer; concurrent renewal/addon purchases; expiry/reserve; ready-output/failure; retry/late success. Keep all existing required shared-resource races.
Mutate uniqueness, balancepredicate, chargeidentity=workerfence, customer charge onproviderretry, differentpayment sameintent, stale release and legacyprotection; each new guard must demonstrate red then restored green receipts. Do not replace concurrency with mocks or source-regex assertions.

## Performance and Budget
Allocation complexity O(eligible grants), indexed `(account,available_at,expires_at)`; bounded watchdog batches; no new model call. No numeric latency/savings claim without measurement. Keep8configured quota ceilings and real-attempt cost logs; change customer/provider accounting without raising authorized cost caps. Daily operational limits may constrain processing independently of package volume and must remain visible.

## Security and Compatibility
Preserve existing authenticity/order/404/rate-limit invariants. Strict SKU bodies and immutable provider identity. Immediate upgrade is unconditionally unavailable in release1; unknown SKU/policy fails closed. SQL uniqueness must enforce intent fulfillment even when distinct webhook event keys arrive. Existing cash refund policy remains operator review, not negative balances or automatic clawback. Source-grant expiry/paid rights never restored by merely revisiting old success pages.

## Required Gates
`npm test` full suite on real isolated PostgreSQL/Redis/MinIO with mandatory skip reporter; `npm run typecheck`, `npm run lint`, `npm run build`; targeted red/green mutation receipts; browser billing/upload/dashboard and responsive check. Environment wiring, port-conflicts before any container start, model-cost/webhook/long-job contracts and rebuild-doc checks. Companion read-only preflight immediately before actual E2E. MinIO/fakes prove local logic only, not Cloud.ru/payment/provider compatibility. No repeated unchanged successful suite without a relevant change/failure.

Default legacy must preserve prior1067-test behavior except explicitly versioned fixtures; test count is a historical baseline supplied by coordinator, not a fresh pass. Add credits_v1 config fixtures under integration owner ownership; no edit of historical migration/financial evidence to make new gates green.
