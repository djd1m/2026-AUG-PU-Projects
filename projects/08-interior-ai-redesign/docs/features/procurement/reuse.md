# Procurement reuse decision

Observed at: `2026-10-13T22:58:24Z`  
Source baseline: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`  
Scope: exact quantities, immutable budget snapshots, provenance/freshness, substitutions and owner-only CSV. Retail crawling, paid providers and public release are excluded.

## Local projects checked first

Fresh source search covered projects `01`–`07`, including `03a` and `05a`, before implementation. No local source supplied a compatible quantity/pack calculator or immutable renovation-budget aggregate.

| Candidate | Source / evidence | Decision |
|---|---|---|
| CSV cell escaping | `projects/06-rag-sales-chatbase/packages/db/src/ops-partners.ts`, exercised by `tests/partners.unit.test.ts` | **Adapt.** Preserve quote/newline escaping and formula-neutral text. Extend the dangerous prefix check across leading whitespace and all exported text columns. Do not reuse payout-specific separators, BOM, dates or business labels. |
| Unknown-cost treatment | Canonical N8 pseudocode plus recalled lesson `teach:8d34121cb3afb17d` | **Use contract.** Every expected material/object and both service scopes remain represented; missing evidence is `unknown`, never zero or omission. |
| Design approval invalidation | Canonical N8 design contract plus recalled lesson `teach:8552f9d9f133292e` | **Use contract.** A confirmed substitution that changes appearance or dimensions creates a draft design revision and clears the current budget; approval is never carried forward. |
| N6 crawl safety primitives | `projects/06-rag-sales-chatbase/apps/worker/src/crawl/{robots,safe-get,crawl-site,limits}.ts` (already evaluated in `docs/research/retail-scraping.md`) | **Reject for MVP runtime.** The two supported retailer pages returned ordinary-browser HTTP 401. The adapter therefore returns `blocked/manual_required` with a fixed official deep link and performs no network fetch. |
| Partner/business logic | projects `03`, `03a`, `04` and N6 partner modules | **Reject.** Payout/affiliate ledgers do not model homeowner purchase quantities, source freshness or immutable design-linked budget inputs. |

## Primary-source dependency check

Fresh GitHub repository/tag checks were made after the local search.

| Dependency | Exact source revision | License / tests | Decision |
|---|---|---|---|
| `decimal.js@10.6.0` | `MikeMcl/decimal.js` tag `v10.6.0`, SHA `1a6e845004b29a3b7dcef78fe92b8d786634f4e2` | MIT; upstream repository contains a comprehensive `test/` suite and documents `ceil` plus explicit rounding modes. | **Use existing dependency.** Parse canonical decimal strings, keep quantity arithmetic in Decimal, ceil only at sale-unit boundaries, and convert to JS numbers only after safe-integer checks. |
| `zod@3.25.76` | `colinhacks/zod` tag `v3.25.76`, SHA `7baee4e17f86f4017e09e12b0acdee36a5b1c087` | MIT; upstream source contains boundary/schema tests. | **Use existing dependency** for strict HTTP/domain input schemas; relational ownership remains a transactional DB check. |
| `fast-json-stable-stringify@2.1.0` | `epoberezkin/fast-json-stable-stringify` tag `v2.1.0`, SHA `e92e40b4c38a6782a6f353c77521d95de271d132` | MIT; upstream repository contains deterministic ordering tests. | **Use existing dependency** through `domain/common.canonical` for semantic hashes and reproducible snapshot results. |
| OWASP CSV Injection guidance | `OWASP/www-community` master observed SHA `48870d69c5946f3020e906a66db077721a3e5543` | CC BY-SA repository content; describes dangerous formula prefixes and quote/cell-boundary risks. | **Adapt guidance, no dependency.** Prefix formula-capable text after leading whitespace and quote every cell using doubled quotes. |

No shared manifest or lockfile change is required. Production code will contain only the bounded pure calculator, repositories, disabled catalogue capability, guarded HTTP handlers and private CSV serializer required by the 15 acceptance criteria.

## Root UI binding — local first then GitHub, 2026-10-13T23:44Z
Fresh01–07 TS/TSX search for budget/shopping/priceMinor/payment found no renovation budget UI or surface-to-product matrix. Existing N8 typed forms/api-client and exact domain calculator are reused; no second calculator. Read N6 UpgradeScreen for busy/errors/native form/one retry key. Fresh GitHub search `cost-estimator react budget table renovation license` and YooKassa React alternatives found no compatible immutable design/unknown-scope screen. Existing Decimal/Zod pinned above supply exact input parsing; bespoke thin UI is simpler than importing unrelated finance/table app. Native RUB input uses domain rubToMinor; allPages accepts explicit cursor parameter for actualF3/F4 APIs. Backend stays reusable without React.
