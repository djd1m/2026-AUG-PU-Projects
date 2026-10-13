# Independent validation2 — finite scenario correction

Source3776b81b review closed original findings1,2,4,5,6; preserve those design closures. Finding3 identified six concrete scenario gaps only. No architecture, price, authorization or specification changed in this correction.

| AC | Correction to existing named scenario |
|---|---|
| JOB-04 | Existing reserve+final failure/deadline races require exactly1 +1release, balance restoration and zero extra replay; no-reserve case alone requires0 |
| ATTR-03 | First successful payment without eligible partner followed by partnered payment/refund keeps first marker and0conversions |
| PERF-03 | Valid actual-GPU cohort p95≤25s passes; valid>25s fails; unavailable/ineligible unknown |
| PUBLIC-01 | Context0/1/160/161 and description39/40/2000/2001 explicitly accepted/rejected at boundaries |
| AUTH-02 |32random-byte token/HMAC storage, seven-day expiry boundary and instrumented unknown-account dummy-hash call |
| GALLERY-01/02 | More than50 entries/page cap plus distinct alt text, visible focus, aria-live and reduced-motion assertions |

Fresh revalidation is limited to these six changes and their adjacent AC. Previous≥70 scores and five closed design findings are preserved unless an actual regression is identified. No new product code, runtime evidence or generic validator is introduced. Original report remains byte-for-byte unchanged.
