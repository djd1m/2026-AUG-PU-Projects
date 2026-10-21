# N8 Phase 2 — validator-dependencies receipt

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-dependencies-1`
- TRACE_PATH: `/tmp/n8-validator-dependencies-20261013/projects/08-interior-ai-redesign/docs/validation/validator-dependencies.md`
- Launch UTC: `2026-10-13T21:24:33.051203+00:00` (coordinator event `validator-dependencies-start`).
- Finished UTC: `2026-10-13T21:29:36Z`; measured receipt interval: `302.949 s`.
- Profile: `compact-quality-first-v2`; stage `VALIDATE`; requested model `gpt-5.6-sol`, effort `high`.
- Actual model/effort/fallback: `null` — this worker received no host-authoritative execution metadata; the requested route is not proof of a model switch.
- Token/cost usage and available spend: `null` — no attempt-exclusive provider counters or budget telemetry were exposed.
- Repository revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`; project documents are dirty/untracked inputs, so the hashes below bind the reviewed bytes.
- Aggregate SHA-256 of the ordered current `sha256sum` manifest below: `a009b3da5be0ad7fdc967672dd71b8ae6b51db3e08421f88744ed0bafbc74df5`.
- ROUTE: overall N8 delivery remains XL (payments, external calls, geometry invariants). This unit is a bounded read-only external-dependency lens. E2E preflight: `not_applicable` because no implementation or E2E was run.
- Memory precheck: Russian `dz recall "внешние зависимости OpenRouter ЮKassa вебхуки GLB Babylon Phase 2 валидация" --project /home/2026-AUG-PU-Projects --limit 5 --no-semantic` returned no matching patterns.

## Exact project sources read

| Source | SHA-256 |
|---|---|
| `docs/Architecture.md` | `84535d8d3e854041f9a76accea581a56cb4b13841dcc2ef5010e9f01687ffbf3` |
| `docs/Specification.md` | `fcfefeb2285784120c5614162f394d47ae895d6022eeca7371d8ed24f3a20fa1` |
| `docs/Pseudocode.md` | `1f53f758a978135b9ee29806c1544b5af1793dbaa22bbff4c3f43bbccb844ad7` |
| `docs/research/spatial-ai.md` | `67141f17a0a4091cee4780d187fe3780703e778f672090446d55a78a3069f8af` |
| `docs/research/references-commerce.md` | `a3599d204cb10fe593daabbb7270b576d4078bcbc13946b57c07363ee0682efc` |
| `docs/research/retail-browser-addendum.md` | `040b352f336705637b9b7479dee5c6cdd745c4cc99b85ee194fc6578e42749ad` |
| `docs/research/receipt-spatial.md` | `0eee84878c16f391aaab4c59ecf88465ed6e0e6b4557e33241c8ee87726bc070` |
| `docs/research/receipt-commerce.md` | `bf068a9e9f72b91894bd8e6890a173daf7287cb71f1f1d3b4c718adb7761cd2c` |
| `docs/research/receipt-retail-scraping.md` | `8c1007aab8ab8ef1483e1a4ed596ac09efafc06ad3e481ccf219a43e69840718` |

During the review `Architecture.md` changed from `765968d146d03c3524e999e8a1771272e310773b99c4e6bb21ff9916a26e5f99` to the current hash above. I re-read the changed section: the only observed drift was removal of the stray word `Checked` from the External Dependencies table header; row dates, capabilities, verdicts and requirement consequences were unchanged. The verdict therefore binds the current hash without semantic rework.

## Verdict and score

**Lens verdict: CAVEATS, no blocking dependency defect for the accepted local MVP.** The inventory has exactly **9 rows: 5 CONFIRMED and 4 UNCONFIRMED**. All five CONFIRMED capability claims were found on provider-owned primary sources on 2026-10-13. The four UNCONFIRMED claims are named individually and removed from mandatory scope; no mandatory FR depends on them. No live inference, paid request, merchant action, OAuth action, retailer scrape or external mutation was performed.

Role-bounded score: **94/100**. This is an evidence-readiness score for this lens, not the requirements-validator INVEST/SMART score.

| Dimension | Score | Evidence |
|---|---:|---|
| Inventory and row verdicts | 20/20 | 9/9 rows have a capability, provider/evidence, checked date, verdict and consequence. |
| Primary evidence accuracy | 27/30 | Five quotes/capabilities verified. OpenRouter now explicitly warns that strict-schema enforcement varies by endpoint, so local validation remains required. |
| Mandatory-scope isolation | 25/25 | Retail automation, anonymous B2C API, arbitrary Pinterest reading and metric/25-second reconstruction are excluded from mandatory MVP with working manual paths. |
| Entitlement/live-call honesty | 14/15 | Documents say credentials, account tier, merchant access and successful live calls are not proven; live modes fail closed. |
| New dependency boundary | 8/10 | Babylon.js and Khronos glTF Validator capabilities are supported by official repositories and live locally; exact installed versions and sample compatibility remain implementation evidence. |

## Five CONFIRMED rows — independent provider check

| Capability | Independent result | Requirement consequence |
|---|---|---|
| OpenRouter chat completion | **CONFIRMED.** [OpenRouter API reference](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) says: “Sends a request for a model response for the given chat conversation” and documents `POST /api/v1/chat/completions` with Bearer authorization. This proves the endpoint surface, not this deployment's key or a successful call. | `FR-design-3` can have a disabled-by-default adapter. |
| OpenRouter structured response request | **CONFIRMED with endpoint caveat.** [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs) says compatible models can follow a JSON Schema and tells callers to set `require_parameters: true`; it also says support is per endpoint and exact enforcement is not guaranteed on every endpoint. `Pseudocode.md` correctly requires `require_parameters` plus local strict schema and semantic validation. | No blocker; never treat provider schema mode as the only validator. |
| OpenRouter spend controls | **CONFIRMED as a platform capability.** The provider page at [spend controls](https://openrouter.ai/docs/guides/best-practices/spend-controls) returned HTTP 200 and contained “Per-person or per-key limit that stacks with workspace budgets”; current guardrail material says requests are rejected when a configured limit is reached. This does not prove that the owner's plan/account has the feature or that a limit is configured. | Keep the startup gate and project-owned caps. Live enablement remains blocked until an operator records the effective key/member/workspace limits. |
| ЮKassa redirect checkout | **CONFIRMED.** [Quick start](https://yookassa.ru/developers/payment-acceptance/getting-started/quick-start) documents `POST https://api.yookassa.ru/v3/payments`, `Idempotence-Key`, redirect confirmation and: “Для оплаты перенаправьте пользователя на confirmation_url.” It requires merchant credentials; none were exercised. | Offline adapter/contract tests are implementable; real checkout stays off. |
| ЮKassa webhook verification | **CONFIRMED for source-IP and remote-status verification.** [Incoming notifications](https://yookassa.ru/developers/using-api/webhooks) says to verify authenticity “например по статусу объекта или по IP-адресу,” publishes the source networks and says to re-check the current object status. The inspected provider contract describes IP/refetch verification; it does not supply an HMAC-signature workflow. | `Specification.md`/`Pseudocode.md` correctly use trusted proxy-chain source checking plus provider refetch, merchant/amount/currency/test/order checks, replay protection and fail-closed provider errors. The generic raw-body-HMAC checker must remain `not-verified`, as `Completion.md` says. |

### Observed OpenRouter model IDs

An unauthenticated, non-inference `GET https://openrouter.ai/api/v1/models` was observed on 2026-10-13; response SHA-256 was `b5f8906b12759e38f8f12c0b9ac0b7730356d5347d5cc87194c14e37c86d2043`. No paid model call was made.

| ID present | Relevant catalog fields observed |
|---|---|
| `google/gemini-4-argon` | `text+image+file+audio+video->text`, context `1048576`, `response_format`, `structured_outputs`, tools |
| `google/gemini-2.5-pro` | multimodal-to-text, context `1048576`, `response_format`, `structured_outputs`, tools |
| `google/gemini-3-pro-image` | `text+image->text+image`, `response_format`, `structured_outputs`, tools |
| `google/gemini-3.1-flash-image` | `text+image->text+image`, `response_format`, `structured_outputs` |
| `google/gemini-3.1-pro-preview` | multimodal-to-text, context `1048576`, `response_format`, `structured_outputs`, tools |

Presence in the public catalog proves a point-in-time identifier and advertised parameter set. It does not prove account entitlement, endpoint availability at dispatch time, quality, schema compliance for the exact project schema, cost of a completed scene or suitability for metric reconstruction. The architecture's allowlist, fail-closed configuration, local validator and pre-production eval remain necessary.

## Four UNCONFIRMED rows — scope check

| Capability | Verdict remains | Mandatory-scope result |
|---|---|---|
| Automatic current retailer price/stock | `UNCONFIRMED` | Correctly excluded. Manual `ProductSnapshot`, explicit date/region/source, stale/unknown/blocked states and official links complete `FR-procurement-1`. Two sampled browser 401 responses prove only the sampled local no-go, not global impossibility. |
| Anonymous B2C catalogue API / N8 entitlement to Лемана ПРО B2B | `UNCONFIRMED` | Correctly excluded. Provider marketing/API documentation does not grant this consumer deployment access. No entitlement is inferred. |
| Read any public Pinterest board/pin | `UNCONFIRMED` | Correctly excluded. Upload plus stored link completes `FR-space-3`; OAuth/API import stays optional and disabled. Public-page visibility is not universal API authorization. |
| Metric 3D reconstruction or exact 25-second redesign | `UNCONFIRMED` | Correctly excluded. Manual measurements/calibration and immutable shell geometry carry the mandatory path; no accuracy or latency guarantee is claimed. |

These rows justify **CAVEATS**, not `CONTRADICTED`: the evidence does not prove provider-wide impossibility. Because the mandatory product path does not depend on them, they do not block local Phase 3/implementation under the approved no-live-call scope.

## Manual GLB and Babylon.js boundary

The manual GLB path introduces local package/build dependencies, not a new network service, account entitlement or paid-call dependency:

- [Babylon.js loader documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/loadingFileTypes.md) lists `.gltf` and its binary `.glb` form, plus the other formats discussed in research. This confirms a loader capability, not compatibility with every Scaniverse export or safe handling of hostile input.
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) says validation is against glTF 2.0, writes a JSON issue/statistics report and checks GLBv2 format correctness. This confirms format validation, not metric accuracy, semantic room extraction or parser isolation.

`Architecture.md` already places both in Technology Stack/reuse research, while `Specification.md` bounds the accepted GLB subset and requires calibration. No additional external-service row is required for the current inventory convention. Implementation must still pin audited package versions and prove the exact GLB fixture path, limits, external-URI rejection, timeout/isolation and Babylon coordinate transforms before claiming the feature works.

## Blocking fixes and handoff

**Blocking fixes for the accepted local, manual-first implementation: none in this lens.** The coordinator may aggregate this result as a CAVEATS dependency receipt.

Before any live-provider enablement, the following remain hard gates rather than current defects:

1. Record OpenRouter account/key/workspace entitlement and the effective provider-side limit; verify the allowlisted model endpoint still advertises `structured_outputs`, send the exact schema only under separate paid-call authorization, and retain local validation regardless of result.
2. Record ЮKassa merchant/test-shop access and exercise create/get/webhook flows in the allowed environment. Verify trusted proxy-chain source-IP extraction and remote object refetch; do not invent an HMAC signature requirement absent from the inspected provider contract.
3. Keep retailer automation, arbitrary Pinterest import and metric/25-second reconstruction disabled until each gets its own dated provider evidence or measured acceptance dataset and a deliberate scope change.
4. Pin Babylon.js/glTF Validator versions and pass offline hostile/representative GLB fixtures before the manual GLB path can be marked implemented.

No source document was edited by this validator.

Status: completed
