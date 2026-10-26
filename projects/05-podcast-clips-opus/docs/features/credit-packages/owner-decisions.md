# Credit packages — Owner decisions

2026-10-26; approval ledger for this plan only. Root coordinator integrates actual owner replies and binds final plan revision before implementation. “Recommended” does not mean approved.

## Approved direct owner requirements
| ID | Actual direction | Status |
|---|---|---|
| D01 | Ordinary1credit=60seconds; per-second billing, no whole-minute rounding | APPROVED; owner: «Посекундно:1кредит=60секунд,безокруглениядоцелойминуты» |
| D02 | Add-on1490RUB/600credits/10h valid30days from purchase WITH paid features throughout that window; independent of base expiry | APPROVED, direct owner reply relayed by coordinator |
| D00 | Exactly30registration credits once, no monthly renewal; keep Start990/300/5h, Pro3990/1800/30h and visible ordinary hours | APPROVED; canonical pricing-decisions.md and credits-record.json |

## Pending decision table — concrete recommendations
| ID | Choice / recommended concrete contract | Status / approval needed |
|---|---|---|
| D03 | Recommend immediate Start→Pro with ALL current-period eligible purchases credited: Start+2addons3970RUB/1500credits →20RUB+300credits, original base end unchanged; alternative next-period-only | PENDING async owner answer; do not assume deferral or immediate mode approved |
| D04 | Meter canonical integer seconds: ceil(trusted durationSeconds) once; persist it; no whole-minute rounding or fractional credit truncation. Probe subsecond handling is implementationprecision proposal, not owner-approved1msbilling | PENDING explicit plan approval; per-second principle itself APPROVED |
| D05 | Signup30credits never expire | PENDING plan approval |
| D06 | Existing free gets one30credit migration_trial; one lifetime partial unique index across signup/migration sources; historical consumption not inferred | PENDING plan approval |
| D07 | Start/Pro credits available only during30day base period; unused included credits expire, no rollover; active holds remain valid | PENDING plan approval |
| D08 | Manual one-time payments only, no auto-debit. Base renewal/switch scheduled after current committed base periods/legacy protection; future grant unavailable before start | PENDING plan approval |
| D09 | Settle full input on first usable ready clip; zero-result technical failure releases once; retries reuse settled/reserved identity, released retry reserves again | PENDING plan approval |
| D10 | If source grant expired, restore ONLY returned units for24h, once per released allocation; pin original source paid-render entitlement to recovery job, no new paid storage period/fullpackage | PENDING plan approval; minimal fair retry window, no silent post-expiry loss |
| D11 | Existing music/CTA rerenders cost zero customer credits but retain operational quotas; no other priced modes; insufficient trial balance rejects full input, never silent30mincut | PENDING plan approval |
| D12 | For immediate mode, eligible purchases=Start+all succeeded non-refunded addons bought in active base interval and linked at purchase; existing addon seconds/expiry/paidwindow unchanged; new delta ends at original base end; freeze incompatible purchases while quote awaiting provider truth | PENDING alongside D03; excludes prior-period/standalone addons and unsettled refunds, must be disclosed |
| D13 | Existing paid daily terms protected to original expiry; operator/pre021 indefinite unchanged until opt-in; in-flight old jobs and old pending990invoices stay legacy | PENDING plan approval; preserves paid terms, no involuntary downgrade |
| D14 | Earliest expiry spent first, no-expiry last. Active reserved job pins source entitlement across expiry. Paid retention follows actual union end+existing72h; recovery pins rendering only | PENDING plan approval |
| D15 | Cash refunds retain OWN019 operator review; no automatic negative balance, collateral grant clawback or speculative refund. Block quote if eligible purchase refund is unresolved | PENDING plan approval |

## Immediate upgrade arithmetic if selected
Let C be full originally purchased eligible capacity, M eligible money, U already settled usage and R active holds. Target Pro1800credits/3990RUB; added credit=1800−C; cash=3990−M. Available after upgrade is (C−U−R)+(1800−C)=1800−U−R for still-live eligible grants; do not recreate credits already expired. Preserve each addon's independent expiry, so aggregate formula applies at quote time only to still-live eligible capacities. If prior eligible addon expired before quote, exclude it from automatic conversion and offer next-period/manual review rather than issuing an unexpected replacement volume.
Example Start+2addons: C1500,M3970,U100,R0 →cash20,delta300,total remaining1700. U1000,R100 →available700,not1800. Addons keep their original30day windows; delta grant ends at base period end. Processing after quote may change U/R but not C/M or invoice.
If M>3990 or C>1800, no automatic conversion/removal/refund; show Pro next period. One completed upgrade/period, unique delta source per upgrade intent. Do not call zero-money transitions paid provider payments. Separate quote revision and purchase freeze prevent a later addon silently invalidating an already paid20RUBinvoice.

## Approval gate
Before IMPLEMENT root must record D03 answer, accepted/rejected values for all pending financial proposals and immutable spec digest. General implementation instruction authorizes preparation and approved work; it does not authorize guessed money/expiry rules. Unanswered branches remain disabled/pending. XL owner plan gate comes from root `.claude/rules/complexity-router.md`; no new approval rule is invented here.
