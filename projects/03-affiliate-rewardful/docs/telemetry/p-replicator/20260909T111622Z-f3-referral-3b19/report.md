# F3 referral routing experiment — final report

Accepted pilot revision: 4998a45c485e74b9c9ec562cba35081d3047c9b3. Profile compact-quality-first-v2, XL. Actual models confirmed by host turn_context: coordinator/core Astra high, independent challenge/review Astra xhigh, client/UI Sol high. No model fallback/global configuration switch.

Quality: 10/10 ACs,118/118 backend,2/2 isolated browser,49/49 public CJM,1/1 public account (including referral settings/key/revoke),1/1 public MCP/A2A,6/6 targeted guard mutants. Formal review, source/ownership/canon and packaged gates pass. Five containers healthy; DB no host ports, internal network only API+DB, random0600 secrets verified without values.

Measured wall interval: 9362.645 seconds; includes user/approval/tool/environment interruptions. Active time: unavailable. Provider response usage snapshot: 2026-09-09T13:52:24.649507+00:00. Input 37029646 (cached subset 35954048, uncached 1075598); output 206535 (reasoning subset 57489). Cost unavailable; no claim of token/time savings without a comparable baseline. See evidence/usage-snapshot.json for exclusive agent breakdown and dedup method.

Defects fixed: connector test money could enter payout totals; malformed order UUID reached SQL; production guide omitted test/live/full-invoice gates and advertised wrong503 code. Shared-pool test improved; sequential test-file provisioning avoids the existing global fail-fast auth lock while preserving deliberate concurrency assertions. Browser harness needed snap-compatible profile root and its frontend network; failures were not counted as acceptance.

Limits: no live merchant/ЮKassa acceptance; one selected shop/tenant per deployment; no subscription import/MRR or automated payouts. Historical F2 test records retain prior semantics and require operator reconciliation before production settlement. N3 Resend/Yandex/verification is the next approved feature. Seven-day follow-up pending; no background monitoring installed.
