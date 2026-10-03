# F05a reuse receipt

Owner-authorized internal reuse; no root software license was present, so no OSS license is invented. Donors read only, no donor/package/framework dependencies imported.

| Donor | Exact last-change revision / SHA256 | Adapted fragment |
|---|---|---|
| N6 `projects/06-rag-sales-chatbase/apps/web/src/server/billing-handler.ts` | `aa5f01b25468c1ae332ef920935264bf1e3c6a8e` / `0c814f2262aff80b7873c69becae6a36d57a9a5412b669ecd3d3b4a07657d685` | Closed checkout schema; immutable intent first; reuse binding; provider key=intent UUID; create/fetch outside application transaction; typed failure; redirects grant nothing. |
| N3 `projects/03-affiliate-rewardful/shared/payments/yookassa.mjs` | `6775b833c306f93e45c7fd6b03c32e8585a56349` / `4bf17f1be41dbb7d9ad235a94a36ca96aa9bd128492b14fccf0af2dd2cc21ccd` | Exact safe integer minor amount; currency/status/metadata verification; bounded body and separate provider error. |
| N7 auth/session/config/operator | baseline `33a165cfcc31cd33f3f3288624cc58c59cb4c3d2` | Existing session/tenant/Origin guards, SHA256 operator-token authentication, external HMAC key with new `n7-referral-v1:` purpose, `(7,1)` lock. |

Reject Next handlers, `@n6/*` coupling, provider live HTTP/IP assumptions and live SDKs. Local provider is its own durable table, not intent truth. Billing writers use `(7,1)` then `(7,5)`; the canonical version/status is checked in the application commit. No I/O or adapter call survives an application transaction. Fixed TEST100 minor RUB/30 days; no new dependency. Existing hard mail quota/unsubscribe remain.
