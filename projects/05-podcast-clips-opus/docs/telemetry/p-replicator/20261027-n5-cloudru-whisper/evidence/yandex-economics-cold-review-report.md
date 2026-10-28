# Independent cold review: N5 SpeechKit unit economics

Verdict: PASS_WITH_LIMITS. No material findings or documentation blockers in the 11-file diff.

Source-Revision: 1333e1b556b6b31ecaa886582c97fd0a10d16c85
Baseline-Revision: 081d286051fcf1ae18468b6f71cc785710301f1d
Worktree: /tmp/n5-speechkit-economics-20261027
Run-ID: 20261027-n5-cloudru-whisper
Work-Unit-ID: economics-cold-review
Launch-SHA256: be38f5b7d1ffc814d2fd52d3837f1183c2c17786a0db3e1750fa83981f1ec4fb
Diff-SHA256: a068a64ce00f4791661e52dd83ee5794e683b96643df0f1ec1b9b7dbbb7cddeb

The reviewed scope is a documentation-only re-estimate for Yandex SpeechKit API v3 gRPC RecognizeStreaming FULL_DATA/general/ru-RU mono MP3. It retains Cloud.ru DeepSeek/S3, one VM, product prices 990/3990/1490 RUB for 300/1800/600 credits, 30-day paid validity, once-only non-expiring 30-credit signup bonus, and per-second debit at 60 seconds per credit. No product code, deployment, new price or traffic decision is included.

Verification:

- Independently opened the [official SpeechKit pricing page](https://aistudio.yandex.ru/ru/docs/speechkit/pricing). Its streaming API v2/v3 rules specify started 15-second mono units per request, 0.1626 RUB including VAT, and one minimum unit after a config-only request. The async rates are correctly excluded. The internal-server-error exception is retained without assuming every failed attempt is free.
- Read chunker.ts, extract.ts, transcript constants and the STT worker. The actual planner targets 180 seconds, allows the nearest pause within ±20 seconds, and advances to end−2. No-pause 3600 seconds gives 21 requests, 3640 planned seconds and 243 billed units. The 264-unit positive-padding scenario and loose pause/padding bound of 288 units are correct under the explicitly conditional padding assumption.
- An independently written Python Decimal calculator executed from a shell heredoc checked 2302 numeric comparisons with 1e−12 tolerance: all nine hourly scenarios, package fees/contributions/thresholds, recurring weekly/daily users, acquisition and activation cases, all 72 new sensitivity rows and their complete CSV joins. Exit code 0; no mismatches. Independent totals: C53.145445 nominal, C56.901505 padding scenario, C61.194145 conditional stress, rounded to 54/57/62 RUB per input hour. Start contribution is 662.727 RUB; the 200-signup 40-RUB/10% case leaves −3545.46 RUB and CAC including trial is 690 RUB. The conversion threshold is 12.674902335350755...%.
- Recomputed the separate 30-minute upload: 122 nominal or 133 conditional-padding units; with retained linear other costs and 10% model-cost reserve, 26.6621525 or 28.6296125 RUB. The pause/padding bound gives 30.7759325 RUB. Budgets 27/29/31 follow the stated scenarios.
- Specifically checked fragmentation: the source accepts uploads from 120 seconds, so 30 bonus minutes can fund fifteen minimum-length uploads. Under the same padding assumption those use 135 units rather than 133. The summary and JSON trial assumption explicitly disclose short-file mixes, fixed per-job LLM/output effects, retries/config-only calls and retention as reasons costs can increase. They do not promise 29 or 31 RUB as a universal upper bound. No pricing change is needed to resolve this check.
- The three historical JSON documents are semantically identical to their baseline contents after removing the new addendum member. The existing 144 CSV rows are an unchanged byte prefix, and exactly 72 current rows were appended. Acquisition cases join identically between the two current JSON addenda. The retained DeepSeek value also reconstructs from the old exact C34.106865 model as 6.954 RUB/hour.
- 30 days, weekly 30/7 hours and daily 30 hours are distinguished; daily usage uses Pro. Trial cohorts are new signups, include future payers once, and add paid usage separately. Contributions and first-period residuals are explicitly before unknown taxes, CAC where applicable, labour, support and excluded costs; they are not described as net profit. Optional 6% taxation is labelled illustrative. Historic C35 statements are visibly archived.
- git diff --check returned 0. The immutable HEAD was checked twice and git status --porcelain was empty. The diff contains exactly the assigned 11 documentation files.

Limits: this pass validates the documented arithmetic and distinctions, not provider invoices, actual MP3 padding, a real-hour recognition result, billable DeepSeek token counts, storage/egress bills, tax treatment, conversions, production adoption or VM capacity. Those are explicitly left unmeasured in the documents. Builds, application tests and E2E are not applicable to this read-only documentation review. The five-second protocol claim is treated as an unverified upstream evidence limit; this review ran no inference.

Profile: independent cold documentation/economics review. Requested model/reasoning: gpt-6.1-sol/high. Actual model identifier: null (not exposed in reviewer execution metadata); usage tokens and cost: null (no measured counters available). Review completed within the 10-minute attempt budget. No author conversation, root telemetry, author trace or author reports were read.

Finished-At: 2026-10-27T22:49:06.210672+00:00
Status: completed
