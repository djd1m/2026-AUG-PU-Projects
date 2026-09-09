# External-dependencies validation receipt

- `RUN_ID`: `20260909T174821Z-prd-a-1934`
- `WORK_UNIT_ID`: `dependencies`
- Scope: `Architecture.md` → `## External Dependencies`, with cross-checks against PRD, Specification, source evidence, tax-boundary evidence, and the audited N1 donor baseline.
- Baseline revision: `cafe2c4f608ed8262dade750e800e27173517a21`.
- Profile / risk: `compact-quality-first-v2` / XL.
- Requested model / effort: `gpt-5.6-sol` / `high`.
- Actual model / effort: `null` / `null`; no host-attested execution metadata was exposed, so no fallback is claimed.
- Usage, cost, quota, active time, and elapsed time: `null`; no worker-scoped counters or entry timestamp were exposed. Savings are not established.
- Review date: 2026-09-09 UTC.
- Source changes, commits, pushes, subagents, credentials, runtime checks, and live-provider calls: none.

## Revision binding

| Artifact | SHA-256 |
|---|---|
| `docs/Architecture.md` | `4ca5fb6b354031ad283996ce3c392a999244f401b7d28c3e2e1dea139a41d9e1` |
| Exact `## External Dependencies` section bytes, from its heading through the byte before the next `##` heading | `77e2465a2224644d2742afde7bda348ab494cbdcf6d1619a9c998226899c540c` |
| `docs/PRD.md` | `13800427fed04e78d12414c93ff30e8d1a5d61579d1ec7d66d21499537d82384` |
| `docs/Specification.md` | `36cfb78e1ac7e15e3cd5ce386ee54aa24d380af7022a0ecfeefd5c20bfd10732` |
| `docs/discovery/prd-source-evidence.md` | `779a955accbb2d88b2a6ca825965f720924bc0f2408cb778f21af2f33adef167` |
| `docs/discovery/tax-boundary-evidence.md` | `6ad12d82e6fb28cf088933dcc59d00432a5d1f2952d4a217d503d1e31a195353` |

The section hash permits provider-evidence reuse if unrelated Architecture fields are corrected. Any Architecture change still requires a new whole-document hash and a cross-section scan for newly introduced external capabilities. If the section hash changes, re-open every new or changed official URL, re-grade affected rows, recount bounded quotations per page, and re-check the provider-versus-implementation boundary before aggregation.

## Capability verdicts

All cited pages below are primary YooKassa documentation and were opened during this review on 2026-09-09. The review reuses the short quotations already present in Architecture/source evidence; it does not add long extracts.

| Capability | Verdict | Evidence assessment |
|---|---|---|
| Payment/refund status notifications and retry when N1 does not acknowledge with HTTP 200 | **CONFIRMED** | The opened [Incoming notifications](https://yookassa.ru/developers/using-api/webhooks) page lists payment events and `refund.succeeded`, requires HTTP 200 acknowledgement, and says delivery continues for 24 hours. Existing quote: “ЮKassa продолжит доставлять уведомление в течение 24 часов.” |
| Canonical payment lookup performed by N1 | **CONFIRMED** | The opened [API reference](https://yookassa.ru/developers/api) names “Информация о платеже”; the opened [interaction format](https://yookassa.ru/developers/using-api/interaction-format) shows the authenticated `/v3/payments/{payment_id}` request. This confirms provider capability, not N1 adapter readiness. |
| Canonical refund lookup performed by N1 | **CONFIRMED** | The opened [API reference](https://yookassa.ru/developers/api) names “Информация о возврате” under refunds. The provider documentation therefore exposes a refund-information operation; the architecture correctly keeps N1 refund ingestion and bridge implementation outside this confirmation. |
| Merchant-scoped authentication for N1 provider verification | **CONFIRMED** | The opened [interaction format](https://yookassa.ru/developers/using-api/interaction-format) identifies “HTTP Basic Auth (основной)” and defines the username as the YooKassa shop identifier and the password as its secret key. Merchant scope is a supported inference from those documented credentials; no actual N1/N3a credential availability is claimed. |

Overall external-capability verdict: **READY**. Four of four declared external capability rows are `CONFIRMED`; none is `UNCONFIRMED` or `CONTRADICTED`.

## Dependency and product-boundary checks

1. `Architecture.md` explicitly labels N1 atomic outbox, registration/payment/refund bridge, authenticated cursor/checkout reconciliation, and legacy-writer bypass as implementation dependencies absent from audited donor baseline `bccd5bb`. A direct baseline search found N1 YooKassa payment lookup and credentials handling, but no N1 outbox, refund ingestion, or cursor/reconciliation implementation. The signed N1 attestation is proposed internal work, not a confirmed external service.
2. N3a currently contains planning/prototype documents and no application runtime. Architecture assigns YooKassa credentials and canonical GET calls only to N1 and states that N3a receives neither provider credentials nor direct provider access. Live shop configuration, test credentials, and external acceptance remain expressly unverified; no runtime proof is required for this documentation gate.
3. PRD and Specification preserve the owner's selected boundary: N1 Proofwall is the first integration, YooKassa is N1's provider, and the owner prepares the preceding calendar month's register manually on the 5th. Repeated N1 payments remain manually initiated; MRR is unknown without explicit period facts.
4. Tax status, NPD evidence, contract applicability, YTD inputs, and accountant approval are manual/approved inputs. `tax-boundary-evidence.md` does not claim an FNS API, and Architecture explicitly excludes one. The same section excludes automatic debit, MRR API, message sending, and bank payout API; own-platform monetary billing remains unimplemented rather than being substituted with N1 payments.
5. No additional external capability relied on by the reviewed requirements is hidden outside the table. PostgreSQL/Docker/TLS ingress are stated implementation/infrastructure assumptions; the accountant/legal gate and transfer evidence are human inputs; the notification vendor and external broker are explicitly unnecessary for the first stage.

## Findings

No blocker, high, or warning finding in the bounded external-dependencies scope. The documented caveats are accurate readiness gates rather than contradictions: provider capability does not establish N1 bridge implementation, credentials, payment-method entitlement, test-shop acceptance, or production readiness.

Status: completed
