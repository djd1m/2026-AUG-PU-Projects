# Credit packages — Authority and implementation decisions

Version: credits_v1-code-plan-20261026-v2. Finite first code release under owner-authorized autonomous work. This ledger distinguishes direct owner replies from delegated coordinator decisions; it does not assert production-approved terms or authorize current live activation.

## Direct owner answers
| ID | Actual direction | Authority |
|---|---|---|
| D00 | Exactly30registration credits once, no monthly renewal; Start990/300credits/5h, Pro3990/1800credits/30h; hours visible | Direct owner decision in canonical pricing-decisions.md / credits-record.json |
| D01 |1credit=60seconds, billed per second without whole-minute rounding | Owner: «Посекундно:1кредит=60секунд,безокруглениядоцелойминуты» |
| D02 | Add-on1490RUB/600credits/10h valid30days from purchase WITH paid features throughout its independent window | Direct owner answer relayed by coordinator |

## COORDINATOR IMPLEMENTATION CHOICES under autonomy
These finite code choices permit implementation without fabricating unanswered owner preferences. They are not direct owner answers or a production activation approval.
| ID | Selected first-release contract | Scope |
|---|---|---|
| D03 | Immediate upgrade DISABLED because owner answer absent; reject before payment intent/provider; offer full-price next-period base switch/manual renewal and addon now | No quote/delta/proration implementation |
| D04 | Canonical integer seconds=ceil(trusted probe seconds), computed/persisted once;1second=1/60credit, no whole-minute rounding or fractionalcredit loss | Implementation precision under per-second principle |
| D05 |30signup credits have no expiry | Credit-mode registrations only |
| D06 | Schema migration gifts/converts no existing account; only explicit audited effective-free operator opt-in in enabled credits_v1 may grant migration_trial; at most one lifetime trial across signup/migration | Require no active legacy entitlement or unresolved legacy intent; no historical usage guess |
| D07 | Base Start/Pro grants last30days, unused included credits expire; active holds remain valid | No rollover |
| D08 | One-time payments only; base renewal/switch starts after current committed periods; future credits unavailable before start | No auto-debit/card-save subscription engine |
| D09 | Settle full input on first usable accepted clip; zero-clip technical failure releases once; retries reuse video identity, released retry re-reserves | Separate customer input and provider attempt expense |
| D10 | Expired refund returns ONLY released units as a once-only24h recovery grant; pin original-source paid-render authorization to recovery job | No full package reissue or unrelated paid storage renewal |
| D11 | Music/CTA rerenders cost zero extra customer credits and retain current operational quotas | No new priced modes; no silent trial truncation |
| D12 | Future immediate-upgrade eligibility/credit formula remains proposal only, outside code release/mandatory current AC | Never auto-enable from config or missing answer |
| D13 | Legacy paid daily terms preserved through old term; operator/pre021 rights unchanged; old pending intents/in-flight jobs stay legacy | No involuntary cutover; future enrollment flag never reprices historical purchases |
| D14 | Earliest expiry first, no-expiry last; overlapping paid windows form union; spending addon credits does not end its30day paid rights; active job pins source entitlement | Retention follows actual entitlement union end+existing72h; recovery is job-scoped |
| D15 | Cash refunds retain OWN019 operator review; no automatic negative balance/collateral clawback/cash refund | Existing operator review semantics |
| D16 | N5_BILLING_MODE=legacy|credits_v1; undefined→legacy, empty/unknown fail startup; integration owner owns shared config/compose/env/tests | Gates new credit enrollments/sales; pinned old credit jobs/intents remain honored after enrollment disable; no production activation |

## Future immediate-upgrade proposal — NOT current release AC
Owner has not answered immediate-vs-next-period preference. Preserve discussion example: Start+2addons3970RUB/1500credits could upgrade to3990RUB/1800credits by20RUB+300credits; never1800new credits. Candidate formula cash=3990−eligible money, delta=1800−eligible full purchased capacity; consumed U and holds R remain deducted, base end unchanged, each addon keeps its independent expiry/paid window. Example U100,R0 would leave1700credits; U1000,R100 would leave700available.
If eligible money or capacity exceeds Pro target, offer next period; no destructive conversion/automatic refund. Future design must explicitly settle which period addons belong to, partial refunds, expired grants, quote changes/payment lateness and duplicate financial credit. None of this formula/quote machinery is implemented or required by release1; tests instead prove immediate requests are rejected with zero payment side effects.

## Process and activation boundaries
Owner explicitly authorized selected-scope traceability exception and seven-hour autonomous work. Root coordinator may integrate this finite code plan, run official frozen selected-snapshot gate, cold validation, implementation and independent review. Existing aggregate gate failure remains disclosed, not relabeled PASS. No extra owner D03 answer is required to implement the disabled branch. Production activation, VM spend and real provider/payment actions retain their separate authorization/evidence gates.
