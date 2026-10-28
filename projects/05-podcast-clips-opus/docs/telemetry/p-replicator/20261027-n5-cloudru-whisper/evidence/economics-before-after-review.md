# Independent review of the new before/after comparison

Verdict: PASS_WITH_LIMITS
Material issues: none.

Run-ID: 20261027-n5-cloudru-whisper
Work-Unit-ID: economics-before-after-clarity
Source-Revision: f60215a5199584c5025b65b14b00bfabeacdd003
Source-Path: /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/docs/research/unit-economics-20261026/unit-economics-summary.md
Source-SHA256: c1c2e054d50d013dc76c5633106850296dd38a3cbaaf4132e4d2ff2081f918d9
Launch-SHA256: 425c5f1ae29ad8301b22dcc5abc710f13567ed18098c21e2fe2a2e90c171b561

Scope: only the new first section “Что изменилось: Cloud.ru Whisper → Yandex SpeechKit v3”. Source and launch hashes matched at entry and again before writing this receipt. The output path was absent and non-symlink before exclusive creation.

Independent Python Decimal recalculation (exit 0):

- The same 21 chunks and 3640 planned seconds cost 22.204 RUB under the retained CloudWhisper 0.0061 RUB/second assumption versus 39.5118 RUB under the already verified Yandex streaming per-request tariff: +17.3078 RUB, +77.949018...%, correctly displayed as +77.9%.
- With unchanged DeepSeek/S3 and 10% model-cost reserve, nominal cost is 34.106865→53.145445 RUB/hour: +19.038580 RUB, +55.820375...%. The separate chosen budget comparison 35→57 is +22 RUB/+62.857143...%, displayed as +62.9%. The section explicitly says the budget change includes conditional MP3 padding and rounding and cannot be attributed wholly to the provider price change. This directly addresses the requested comparison.
- Full Start/Pro/addon contributions are 772.727→662.727, 2769.627→2109.627 and 1076.377→856.377 RUB: changes −110/−660/−220. The one-VM thresholds are 4→5, 2→2 and 3→4 purchases. With 100 new fully used trial bonuses, Start is 7→9 and Pro 2→3. All match the added table.
- The chosen trial scenario is correctly identified as one 30-minute upload: old budget17.50→new separate-rounding budget29 RUB. This is consistent with the existing methodology and previously reviewed disclosure that fragmented uploads, per-job LLM/storage, retries and retention can change total trial cost.
- For 200 registrations, acquisition40 RUB, conversion10% and full trial use, CAC including trial is 575→690 RUB; first-period residual is +954.54→−3545.46 RUB. Exact conversion thresholds are 9.382356252596...%→12.674902335351...%, conventionally displayed as 9.38%→12.68%. No new product prices, extra VM or profit claim is introduced.

Calculator formulas: STTold=3640*.0061; STTnew=243*.1626; C=(STT+6.954)*1.1+2.033065; package contribution=price*.9573−hours*Cbudget; break-even=ceil((3000+trial_cohort_cost)/contribution); cohort residual=200*.1*StartContribution−200*40−200*trial−3000; required conversion=(40+trial+3000/200)/StartContribution.

Limits: this narrowly scoped follow-up accepts the unchanged historical CloudWhisper tariff as the previously retained input and does not freshly validate its PDF. The Yandex primary price was independently read in the preceding cold review. The statement about five short Whisper probes is an upstream evidence claim; this review intentionally did not read probe receipts or independently establish recognition quality. Figures remain scenarios rather than measured invoices, conversions or production acceptance. No application/code/build/E2E review, inference, network access or repository edits occurred in this follow-up. The comparison itself clearly communicates the provider impact and reduced acquisition headroom.

Profile: independent bounded documentation comparison review. Requested model/reasoning: gpt-6.1-sol/high; actual model identifier, measured usage and cost: null because reviewer runtime counters are unavailable. Finished within the five-minute attempt budget.

Finished-At: 2026-10-27T23:05:32.079438+00:00
lastStatus: completed
Status: completed
