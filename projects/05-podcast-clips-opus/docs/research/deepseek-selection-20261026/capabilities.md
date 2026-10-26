# DeepSeek capability research for N5

As of 2026-10-26. Read-only official sources and public OpenRouter catalog; no paid API, inference, user transcript, login or credential access. Profile: econom; requested executor GPT-6.1 Sol / high; actual execution model metadata, token usage and spend: null (not exposed). Research is evidence gathering, not an N5 benchmark.

N5 fit criterion supplied by coordinator: select 3–8 independent Russian clips of 20–75 seconds from long segment-level transcript plus duration; generate titles, three scores/explanations and their sum; preserve chronology, bounds and no overlap. Input is segments, not word timestamps. Example: 88 minutes ≈39k input tokens; local validateFragments later snaps word boundaries. Selection timeout 240 seconds. Thus1M context is ample capacity, not evidence of editorial quality or240s completion.

## Current models and exact IDs

| Model | Direct DeepSeek ID | OpenRouter ID | Direct context / output cap |
|---|---|---|---|
| DeepSeek-V4.1-Flash-1017 (October17) | `deepseek-flash` | `deepseek/deepseek-v4.1-flash-1017` |1,048,576 /393,216 tokens|
| DeepSeek-V4-Pro-0813 (August13 GA) | `deepseek-v4-pro` | `deepseek/deepseek-v4-pro-0813` |1,048,576 /393,216 tokens|

Sources: [current direct pricing](https://api-docs.deepseek.com/quick_start/pricing/), [metadata example](https://api-docs.deepseek.com/api/list-models/), [OpenRouter1017](https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017), [OpenRouterPro](https://openrouter.ai/deepseek/deepseek-v4-pro-0813).

Both direct models support thinking (enabled by default; high effort) and nonthinking. ChatCompletions uses `thinking.type=enabled/disabled` and `reasoning_effort=low/high/max`; Responses uses `reasoning.effort=none/low/high/max`. Thinking ignores temperature. [Mode documentation](https://api-docs.deepseek.com/guides/thinking_mode/)

ChatCompletions output defaults are8192 nonthinking,65536 thinking and131072 at max effort; explicit cap393216. Input plus generation remains within context. Responses output budget includes reasoning tokens. These generous limits should not be used as an N5 target budget. [Chat reference](https://api-docs.deepseek.com/api/create-chat-completion/), [Responses reference](https://api-docs.deepseek.com/api/create-response/)

Do not select V3.2/R1 from memory. Direct legacy `deepseek-chat/reasoner` retirement was scheduled July24. `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` now route to Flash1017, not separate current models. OpenRouter still lists older snapshots, including `deepseek/deepseek-v4.1-flash` (September10). [Changelog](https://api-docs.deepseek.com/updates/), [older snapshot](https://openrouter.ai/deepseek/deepseek-v4.1-flash)

Source conflict: September10 launch news says Pro will route to Flash on September14. The current changelog explicitly retains Pro beyond that date, and current pricing/model metadata still list0813. Prefer current API documentation over the original announcement; authenticated availability was not tested. [Original news](https://www.deepseek.com/en/news/deepseek-v4-1-flash/), [current changelog](https://api-docs.deepseek.com/updates/)

## JSON schema: distinguish interface and provider

Direct ChatCompletions documents `response_format:{type:json_object}`: syntax-valid JSON, not exact schema enforcement. Empty content and truncation remain documented failure modes. [JSON guide](https://api-docs.deepseek.com/guides/json_mode/)

Direct Responses documents `text.format:{type:json_schema,name:...,schema:...}` as conforming to the supplied schema for both current model IDs. The page does not document a `strict` switch or detailed supported schema subset. This is documented native schema support, not independently tested strict-schema compatibility with the existing N5 request. [Responses reference](https://api-docs.deepseek.com/api/create-response/)

Direct beta tool calling offers explicit `function.strict=true` with `/beta` base URL, in both modes. It requires all object properties and `additionalProperties:false`; array minItems/maxItems and string minLength/maxLength are unsupported. Numeric bounds are supported. This can emit a submission tool's arguments without actually executing an external function, but would require an interface adaptation. Count 3–8 still requires local validation. [Strict tool schema guide](https://api-docs.deepseek.com/guides/tool_calls/)

OpenRouter schema enforcement is provider-specific. Its live public endpoint catalog, inspected without auth/inference, reports:

| Provider for1017 | Context / max completion | Advertised schema-related parameters |
|---|---|---|
| DeepSeek |1,048,576 /393,216|response_format; no structured_outputs|
| DeepInfra |1,048,576 /131,072|response_format and structured_outputs|
| BaseTen |1,048,576 /262,144|neither|

[Public endpoint metadata](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints). Catalog flags do not prove successful enforcement of the exact N5 schema. Pin a provider supporting the required parameters and require parameter support for a future authorized comparison. Do not infer provider support from aggregate model-page FAQs, which disagree on output cap and schema.

JSON Schema cannot establish that a clip is standalone, worthwhile, faithful to the speaker, or precisely anchored to source timestamps. Cross-field duration, score sum, chronology and overlap require local validation/recomputation even with structured output. That is a task-design inference, not a published DeepSeek performance result.

## Relevant evidence and recommendations

The official V4.1 model card reports LongBench-V2 EM for BASE models: Flash 4.1=45.2, Pro=51.5, old Flash=44.7, under a shared internal setup. This is limited long-context evidence; it does not establish the ordering of current instruct/API snapshots for Russian editing. The instruct table lacks Sonnet5 and focuses on STEM and agents. No matched primary evaluation of Sonnet5 versus Flash1017/Pro0813 for Russian editorial selection, source boundaries, scoring calibration or exact N5 schema was found in this bounded research. Generic coding/agent wins cannot establish N5 parity. [Official model card](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)

Quality-first evaluation candidate: **Flash1017 with thinking high**, explicit schema-capable provider/interface, limited output budget and existing validators. This is a provisional current-generation candidate, not a claim of Sonnet5 equivalence. **Pro0813 thinking high** is a useful second quality challenger if Flash misses standalone relevance: its older base long-context score is stronger, but there is no task-matched proof that it wins.

Economy evaluation candidate: **the same Flash1017 with thinking disabled**, or low if disabled loses selection quality. The model price is unchanged by mode; economy would come from fewer generated reasoning tokens and potentially lower latency, not a measured N5 saving. Current direct offpeak/peak uncached input rates are$0.15/$0.30 per1M and output$0.60/$1.20; Pro$0.66/$1.32 and$1.98/$3.96. OpenRouter provider rates differ. [Current direct prices](https://api-docs.deepseek.com/quick_start/pricing/)

Evidence gaps: no inference performed; no measured Russian N5 quality/noninferiority, instruction/schema failure rate, score calibration, end-to-end latency/p95 against 240s, reasoning token distribution, retry cost, or exact N5 schema subset compatibility. Existing Sonnet5 prompt/interface may need adaptation;1M context alone cannot justify replacement. No V4.1 Pro was established as currently available in the inspected official API catalog.
