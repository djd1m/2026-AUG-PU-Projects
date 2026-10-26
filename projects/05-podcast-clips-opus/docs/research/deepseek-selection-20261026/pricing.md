# DeepSeek pricing research — 2026-10-26

Official public sources only. No paid calls, credentials, registration or user data. Requested execution profile: gpt-6.1-sol/high; actual model/usage not exposed (null). Research began 14:15UTC.

N5 example is illustrative: 30,000 uncached input + 2,000 total billed output tokens, not observed application usage. Baseline Sonnet5 $2/$10 per million gives **$0.080000 = 6.443048RUB** at the supplied calculation rate **80.5381RUB/USD**. Cloud prices include22%VAT; OpenRouter credit purchase fees/taxes/FX costs excluded.

## OpenRouter: exact versions and provider routes

Rates are USD per million tokens. Each row is one complete endpoint price pair, not independently selected input/output minima. Endpoints below declared `structured_outputs`, `response_format` and `reasoning`; status0 at snapshot. Provider region unknown unless explicitly constrained and verified; no Russia residency established.

| Model ID (dated version) | Provider tag | Input / output / cache read | Context / max output | Example USD (RUB) | Saving vs baseline |
|---|---|---:|---:|---:|---:|
| `deepseek/deepseek-v4.1-flash-1017` | `deepinfra/fp8` | 0.098 / 0.294 / 0.00294 | 1,048,576 / 131,072 | $0.003528 (0.284138) | 95.59% |
| `deepseek/deepseek-v4.1-flash` | `deepinfra/fp8` | 0.14 / 0.42 / 0.0042 | 1,048,576 / 131,072 | $0.005040 (0.405912) | 93.70% |
| `deepseek/deepseek-v4-flash-0731` | `deepinfra/fp8` | 0.06 / 0.18 / 0.015 | 1,048,576 / 384,000 | $0.002160 (0.173962) | 97.30% |
| `deepseek/deepseek-v4-flash` | `deepinfra/fp8` | 0.09 / 0.18 / 0.018 | 1,048,576 / 65,536 | $0.003060 (0.246447) | 96.17% |
| `deepseek/deepseek-v4-pro-0813` | `deepinfra/fp8` | 1.3 / 2.6 / 0.1 | 1,048,576 / 16,384 | $0.044200 (3.559784) | 44.75% |
| `deepseek/deepseek-v4-pro` | `streamlake/fp8` | 0.789264 / 1.57853 / 0.065772 | 1,024,000 / 384,000 | $0.026835 (2.161238) | 66.46% |
| `deepseek/deepseek-v3.2` | `deepinfra/fp4` | 0.26 / 0.38 / 0.13 | 163,840 / 147,456 | $0.008560 (0.689406) | 89.30% |

Source: [official endpoint API](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints); all seven exact endpoint URLs, raw responses and timestamps are preserved in pricing-sources.json. [Model API](https://openrouter.ai/api/v1/models) provides canonical dated slugs and reasoning metadata.

The current Flash candidate is **`deepseek/deepseek-v4.1-flash-1017`**, not the older unsuffixed V4.1(0910), V4Flash0423 or0731. For strict schema pricing, DeepInfra standard is$0.098/$0.294(cache$0.00294): example$0.003528=0.284138RUB,95.59%below baseline. This is a cost result, not evidence of equal clip selection quality. DeepInfra Flex$0.0784/$0.2352 and Priority$0.147/$0.441 are separate service tiers, excluded from standard comparison.

Flash1017 through the DeepSeek provider has different rates: offpeak$0.15/$0.60/cache$0.003, peak$0.30/$1.20/cache$0.006. Examples$0.0057/$0.0114,92.88%/85.75%below baseline. That endpoint declares `response_format` but omits `structured_outputs`, so this price is not the strict-schema route price. Peak overrides are01:00–04:00 and06:00–10:00UTC weekdays; direct DeepSeek docs additionally exclude Chinese public holidays. Endpoint override details are saved.

OpenRouter cached cards, `/models` top-provider summaries and endpoint lists gave different prices. Example cached1017/0910 headline$0.02/$1 belongs to a different endpoint; it must not be used as if it were the DeepSeek or DeepInfra route. Do not combine the minimum input price from one route with output/cache prices from another.

Thinking: saved metadata permits reasoning off (mandatory=false). V4Pro0423/Flash0423 expose high,xhigh,none; newer versions expose high,low,max,none; V3.2 defaults off. Tables assume reasoning disabled, or2,000 output tokens inclusive of reasoning. [OpenRouter bills reasoning tokens as output](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), including hidden/excluded reasoning. There is no separately published thinking per-token surcharge in the selected endpoint records. Cache-write rate absent means unpublished, not free.

## Cloud.ru: tariff261023, effective23October2026

Rates below are grossRUB per million; cache is read price. Exact API IDs use the [available-models documentation](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models). Prices use the [current tariff PDF](https://cdn.cloud.ru/docs/legal/tariffs/evolution/current-version/foundation-models.pdf),15pages/header261023, linked by the [current tariff page](https://cloud.ru/documents/tariffs/evolution/foundation-models). The PDF distinguishes partner and internal model rows.

| ID / catalog family | Placement | Input / output / cache | Context | ExampleRUB (USD) | Saving vs baseline |
|---|---|---:|---:|---:|---:|
| `deepseek-ai/DeepSeek-V4-Pro` | internal | 183 / 732 / unpublished | 1,048,576 | 6.954000 ($0.086344) | -7.93% |
| `deepseek-ai/DeepSeek-V4-Pro` | internal; night promotion | 122 / 292.8 / unpublished | 1,048,576 | 4.245600 ($0.052715) | 34.11% |
| `deepseek-ai/DeepSeek-V4-Flash` | external partner | 43.2978 / 86.5834 / unpublished | 1,048,576 | 1.472101 ($0.018278) | 77.15% |
| `deepseek-ai/DeepSeek-V4.1-Flash [API ID unverified]` | external partner | 64.9406 / 194.8096 / 6.5026 | 1,048,576 | 2.337837 ($0.029028) | 63.72% |
| `deepseek/deepseek-v3.2` | external partner | 113.919 / 329.981 / 25.53 | 131,072 | 4.077532 ($0.050629) | 36.71% |
| `deepseek/deepseek-v3.2-speciale` | external partner | 113.919 / 329.981 / 39.284 | 163,840 | 4.077532 ($0.050629) | 36.71% |
| `deepseek/deepseek-chat-v3-0324` | external partner | 37.3175 / 170.89 / 26.519 | 163,840 | 1.461305 ($0.018144) | 77.32% |
| `deepseek-ai/DeepSeek-V3` | external partner | 37.0758 / 148.291 / unpublished | 163,840 | 1.408856 ($0.017493) | 78.13% |
| `deepseek-ai/DeepSeek-V3.1-Terminus` | external partner | 74.1394 / 222.4182 / unpublished | 163,840 | 2.669018 ($0.033140) | 58.58% |
| `deepseek-ai/DeepSeek-R1-0528` | external partner | 74.1394 / 296.5698 / unpublished | 163,840 | 2.817322 ($0.034981) | 56.27% |
| `deepseek/deepseek-r1-distill-llama-70b` | external partner | 137.494 / 157.136 / unpublished | 131,072 | 4.439092 ($0.055118) | 31.10% |

Cloud local Pro costs6.954RUB per example,**7.93%more** than the baseline before OpenRouter fees; this is not a universal cost saving. [Night promotion](https://cloud.ru/documents/promotions/active/night-tariff-foundation-models)22:00–07:00MSK,October1–December31,2026 reduces it to4.2456RUB,34.11%below baseline; eligibility applies.

V4.1Flash is present in the [public catalog](https://cloud.ru/products/evolution-ai-factory/catalog-foundation-models),[quotas](https://cloud.ru/docs/evolution/overview/topics/quotas) and tariff. The overview omits it, so its exact API ID remains unverified here. Cloud does not publish dated0423/0813/0910/1017 revisions in these sources. Thus these family prices cannot establish same-version Cloud-versus-OpenRouter savings. Cloud max output limit and per-mode billing of reasoning require additional confirmation; no separate thinking tariff was identified.

Cloud documents local Pro as internal: data stay inside Cloud infrastructure. PartnerFlash/V4.1Flash/V3.2 and the older alternatives are externalAPI routes; their inference region is not verified. A Cloud.ru endpoint alone does not establish Russian residency for those partner models.

[Direct DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) maps its own API to Flash1017/Pro0813 and retires its legacyFlashaliases. This does not prove OpenRouter or Cloud reuses those mappings: OpenRouter explicitly preserves older dated variants; Cloud revision is undisclosed.

## Limits and handoff

No quality, validJSON, timestamp accuracy, Russian comprehension, clip count/duration or latency benchmark was run. N5 passes segments+duration, not word timestamps. The illustrative token counts are not application measurements. Recommended pricing candidate for an approved offline or paid evaluation: Flash1017, pinned to a schema-capable provider, reasoning explicitly disabled, fail on unsupported required parameters; keep Sonnet5 baseline. Final model decision depends on N5 acceptance checks.

Evidence: `pricing-sources.json` contains raw OpenRouter metadata, selected routes, Cloud tariff row numbers, calculations and measurement gaps.
