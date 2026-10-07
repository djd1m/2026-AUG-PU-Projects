# Public OpenAI contract preflight for bounded F12 planning

Read-only public documentation; no API key, inference/provider request, project payload or account lookup. Model, exact account/project eligibility, pricing, currency authorization and retry/idempotency guarantees remain unspecified. This is an input for independent planning, not product approval.

The Responses API provides `max_output_tokens`, covering visible and reasoning tokens, and returned usage. The selected model still needs verified support and a strict input-token budget. [Responses create reference](https://developers.openai.com/api/reference/python/resources/responses/methods/create).

Responses Structured Outputs uses `text.format` with `type: json_schema`, `strict: true` and `additionalProperties: false`. The consumer must reject incomplete/refused output and independently validate the exact approved ID set; schema compliance alone cannot grant authority. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Use explicit `store: false` for a stateless candidate without conversation chaining. [Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses). This does not establish zero provider retention: default abuse-monitoring content retention may be up to30 days, with specific approved controls distinct. The future privacy authorization must state the actual selected organization/project control; local content erasure does not erase provider copies. [Data controls](https://developers.openai.com/api/docs/guides/your-data).

The TypeScript create-reference fetch timed out; the Python parameter reference and official cross-language guide were fetched. No unverified SDK interface or model choice is fixed here. No SDK/dependency installed. Exact local implementation still requires independent planner choices and source-bound tests, then financial/privacy gate for actual-model execution.
