# Evidence work-unit receipt

- Run: `20260909T174821Z-prd-a-1934`
- Work unit: `evidence`
- Profile: `compact-quality-first-v2`
- Requested model/effort: `gpt-5.6-terra` / `medium` (bounded evidence collection)
- Actual model/effort: `null` — execution metadata was not exposed.
- Baseline: `bccd5bb`
- Started/completed: 2026-09-09 UTC; exact wall-clock and usage counters unavailable.
- Scope: source evidence only for the chosen CJM-A PRD; no donor/product code, credentials, commits, or pushes changed.
- Checks: committed N1/N2 donor files and source SHA-256 receipts; N1 refund-path absence search; official YooKassa pages for payment status, notifications/retries, refund status/resources, and idempotency.
- Result: N1 is the sole first integration; its 990-RUB/30-day payment is manual renewal. The account metadata mismatch, claim-before-provider-check behavior, rollback/early-return distinction, stable payment ID, absent refund implementation, and conversion-stops-renewal behavior are recorded with exact donor paths and hashes.
- Limitations: tax/legal and provider-account configuration were not checked; actual model, duration, quota, token usage, and cost are `null`/unavailable rather than estimated.
- Artifact: `/tmp/n3a-prd-evidence/projects/03a-affiliate-rewardful/docs/discovery/prd-source-evidence.md`

Status: completed
