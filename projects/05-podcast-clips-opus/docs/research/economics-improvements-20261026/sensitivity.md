# N5: sensitivity of free/paid usage, 2026-10-26

## Main result: daily usage fails before fixed costs

At 35 RUB/input-hour, 1h DAILY costs 1,050 RUB/user per30days against947.727 RUB net receipts from990 RUB. Even100% paid loses102.273 RUB/user/month before VM, tax, CAC or support. Thus100 active all-paid users lose10,227.30 RUB/month and1000 lose102,273.00 RUB before fixed. Buying a cheaper VM cannot close this marginal deficit.

Weekly1h means30/7=4.285714h/month, not4h. Its main-case variable cost is150 RUB/user/month; all-paid contribution797.727 RUB. CaseA (same usage by free and paid) needs15.827% conversion before fixed; daily needs110.791%, impossible. CaseB is only a PROPOSAL: paid retain specified usage, each active free user gets30min perMONTH. Daily paid users still lose money at35/h, so no conversion can balance that case. Existing Free-forever promise is not changed.

## Marginal contribution at35 RUB/h, before any fixed costs (RUB/month)

|Case / paid usage / active MAU|5% paid|10%|20%|30%|50%|100%|
|---|---:|---:|---:|---:|---:|---:|
|A: same / weekly / 100|-10261.37|-5522.73|3954.54|13431.81|32386.35|79772.70|
|A: same / weekly / 1000|-102613.65|-55227.30|39545.40|134318.10|323863.50|797727.00|
|A: same / daily / 100|-100261.37|-95522.73|-86045.46|-76568.19|-57613.65|-10227.30|
|A: same / daily / 1000|-1002613.65|-955227.30|-860454.60|-765681.90|-576136.50|-102273.00|
|B: Free30min/mo proposal / weekly / 100|2326.14|6402.27|14554.54|22706.81|39011.35|79772.70|
|B: Free30min/mo proposal / weekly / 1000|23261.35|64022.70|145545.40|227068.10|390113.50|797727.00|
|B: Free30min/mo proposal / daily / 100|-2173.87|-2597.73|-3445.46|-4293.19|-5988.65|-10227.30|
|B: Free30min/mo proposal / daily / 1000|-21738.65|-25977.30|-34454.60|-42931.90|-59886.50|-102273.00|

A: all active users consume weekly or daily workload; paid share changes revenue only. B: only free usage falls to30min/month; paid users consume full workload. CSV/JSON contain all144 combinations:2cases x2workloads x2MAU x6conversions x3cost levels. Negative numbers are losses.

## Break-even paid conversion before fixed (%)

|Cost per hour|A weekly|A daily|B weekly proposal|B daily proposal|
|---|---:|---:|---:|---:|
|35 primary_local_Pro|15.83|110.79 (impossible)|2.15|no solution|
|30 Flash_unproven_alternative|13.57|94.96|1.80|23.91|
|22.204 Whisper_only_raw_floor|10.04|70.29|1.29|3.79|

35 is the main local Cloud.ru DeepSeek Pro+Whisper planning case with10% model retry reserve and S3 for30days at1.1GB/input-hour.30 is a Flash alternative with geography/residency unproven.22.204 is a raw Whisper-only floor, omitting LLM/render/storage/retry; it is not a full service cost. Fixed costs and additional scaling capacity raise required conversion.

## Fixed VM costs: conditional financial illustrations only

Pilot2vCPU/4GB/60GB =2,973.384 RUB/30days;4/8/80 =5,340.672;8/16/120 =10,075.248. Capacity is UNMEASURED for every configuration. Subtract any listed fixed amount from marginal contribution only as a conditional floor; this does not establish that the configuration handles the workload. In particular,1000 daily full-usage users generate30,000input-hours/month =1000hours/day.

Weekly main-case conversion thresholds including conditional fixed costs:

|Case / active MAU|Pilot2/4/60|4/8/80|8/16/120|
|---|---:|---:|---:|
|A / 100|18.96%|21.46%|26.46%|
|A / 1000|16.14%|16.39%|16.89%|
|B proposal / 100|5.79%|8.70%|14.51%|
|B proposal / 1000|2.51%|2.80%|3.38%|

Full conditional balances and conversion thresholds for all cases/costs are in CSV/JSON. No fixed-cost capacity or throughput inference is valid from these tables.

## Credit and add-on floor before CAC/fixed/tax

Target contribution is a percentage of GROSS selling price, after 4.27% payment fees and variable costs. Minutes are MAXIMUM at990 RUB before subsidizing any free users. Prices below are mathematical minimum gross prices rounded UP to kopecks; they are not market-price recommendations.

|Cost/h|Target|Max whole minutes/mo at990|60min add-on floor|300min floor|1800min /30h floor|
|---|---:|---:|---:|---:|---:|
|35|50%|776|76.54|382.69|2296.09|
|35|70%|436|136.03|680.14|4080.84|
|30|50%|905|65.61|328.02|1968.08|
|30|70%|509|116.60|582.98|3497.87|
|22.204|50%|1223|48.56|242.78|1456.64|
|22.204|70%|688|86.30|431.49|2588.89|

Main-case weekly paid use is257.143minutes/month, within both990RUB credit targets; daily is1800minutes and exceeds them. Free subsidies, measured rendering capacity, support and tax must still be funded. Formula: allowed_minutes=60*990*(1-.0427-target)/cost; minimum_price=(minutes/60)*cost/(1-.0427-target).

## One-time new signup allowance: a different cohort budget

Proposal: grant30minutes ONCE per NEW signup, with full redemption. This is not a monthlyMAU allowance and does not alter existing promises. At35/h the cost is17.50 RUB/signup:1,750 RUB per100 or17,500 per1000 new signups. At30/h:1,500/15,000 RUB; raw Whisper-only22.204/h:1,110.20/11,102.00 RUB. Grant is counted for every new signup including eventual payers, independently of conversion. Do not double-count the same redeemed minutes inside recurring workload.

The main35/h and Flash30/h cohort figures include processing and the baseline first30days of storage, with zero beyond30days modeled. The22.204/h Whisper-only floor excludes storage, LLM and retry costs entirely. Actual original retention is not bounded by a fixedTTL and paid outputs can persist indefinitely on renewal, so the real lifetime cohort cost is unknown and can continue accumulating after the free credit is consumed.

## Product/policy constraints and scope

Observed Free900min/DAY versus Paid270min/DAY is a dangerous demo inversion; align the promise and controls before billing. Existing global20LLMcalls/day +2000minutes/day cannot support1000 daily users (about1000calls/day +60,000minutes/day for one60min job each) or1000weekly users (about143calls/day +8571minutes/day on average). Retries increase calls. Any cap change needs owner-approved budgets; no quota, promise, payment or provider setting is changed here.

Payment fee is a SCENARIO:3.5% x1.22 =4.27%, actual contract/method unverified. Income-tax regime is unknown and tax is excluded. Payments were off in the observed runtime: revenue here is hypothetical. CAC/support/wages, extra compute/disk, backup, billed egress, storage after30days, output beyond2k tokens and retries above10% reserve are excluded.

Baseline: `/tmp/n5-unit-economics-20261026/final-calculations.json`; preserved source references: `infra-pricing-sources.json` and `workload-sources.json` in that directory. This exercise recalculates supplied assumptions; it does not independently reverify current vendor prices.

Requested model:gpt-6.1-sol/high. Actual runtime model metadata, token use and cost are unavailable (`null` in JSON); no inferred usage. Python Decimal precision 50. Checks passed:144 rows, receipts identity, A/B equality at100%paid, and main daily all-paid loss. Artifacts: `sensitivity.csv`, `sensitivity.json`, `sensitivity.md`.
