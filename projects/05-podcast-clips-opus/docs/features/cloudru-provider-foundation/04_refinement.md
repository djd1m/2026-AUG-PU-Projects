# Cloud.ru provider foundation — Refinement

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | Blank provider/key/model or missing response content | Configuration/schema error before dispatch or persistence | No default on blank; absent selectors alone preserve OpenRouter |
| Max size | Existing 25 MB STT ceiling / long transcript | Existing limits retained; no new chunk/output assumptions | STT contract unchanged; Cloud.ru STT rejects selection |
| Concurrent access | Two select handlers share attempt | At most one claim/dispatch | Existing transaction/fence and quota, real isolated DB test |
| Network failure | 429/5xx, abort, stalled response body | Provider/timeout outcome, one attempt remains counted | No repair/fallback/new retry |
| Shape error | Refusal, invalid JSON, extra fields, truncated finish_reason | Local schema failure; no persisted fragment | Existing strict validator plus envelope checks |
| Semantic error | Invalid score/time/language/overlap among valid candidates | Existing candidate filtering and word snapping | No broadening validator rules |
| Deferred provider | Cloud.ru STT, any mode | Exact startup error; zero requests | No placeholder transcriber |
| Secret mixing | Cloud.ru LLM with no OpenRouter key | Works with selected Cloud.ru synthetic key | No inference from which key exists |
| Fake execution | Test fake with Cloud.ru LLM backend | No external request; actual provider recorded fake | Never allowed in production |
| Storage host | Public signing origin differs from internal endpoint | Signed URLs bind public origin, transport internal | Independent SigV4 assertion; no host rewrite after signing |

## Testing Strategy

Unit: new `tests/cloudru-provider.test.ts` uses injected fetch and mocked SDK handlers, synthetic keys and transcript fixtures. Cover every closed selector/model combination, unsupported STT, documented Cloud.ru body and prompt schema, unchanged OpenRouter body, strict local shape/semantics, refusal/truncation/body timeout/no retry, provider identity and no real requests.

Integration: existing isolated PostgreSQL/Redis/MinIO suite validates actual provider stored on an exclusively claimed attempt, per-user/global refusal before dispatch, timeout attempt attribution and stale fencing. Run on existing authorized test environment only; no container/image creation authorized by PLAN. Offline S3 signing is not a Cloud.ru integration pass.

E2E: fake-provider regression journey in existing isolated test environment preserves upload → processing → ready/refusal semantics. Actual RF Cloud.ru server, Whisper capabilities and real S3/browser journey are deferred and must not be reported passed. Immediately before any actual E2E, companion read-only preflight binds source/build/inputs/allowed environment/receipt; no preflight in this docs-only stage.

Performance/benchmark: deterministic count benchmark asserts exactly one mocked HTTP call per accepted LLM attempt, zero on refused quota and zero fallback calls on failure. Simulated body stalls hit existing 240000 ms timeout using fake timers rather than waiting. No latency percentile or token-price target is invented. Actual model token usage, billing, CPU and target latency remain null until measured in separately authorized work.

## Test Cases

```gherkin
Scenario: Selected Cloud.ru LLM configuration
  Given live mode, cloudru LLM and synthetic CLOUDRU_FM_API_KEY
  And exact deepseek-ai/DeepSeek-V4-Pro model and no OpenRouter key
  When configuration loads and a mocked selection is authorized
  Then one Cloud.ru JSON-object request includes the exact schema in its prompt
  And strict local validation precedes fragment persistence

Scenario: Unsupported transcription and invalid response
  Given Cloud.ru STT is selected
  When configuration loads
  Then the exact unsupported capability error is raised before HTTP
  Given a refused, truncated or structurally invalid Cloud.ru chat response
  When selection runs
  Then no invalid fragment is persisted and no fallback request occurs

Scenario: Authentication bypass attempt
  Given live Cloud.ru mode with missing selected key and an OpenRouter key
  When worker starts
  Then startup fails without using the other provider's credentials

Scenario: Input injection
  Given transcript text contains commands or SQL-like strings
  When the existing data prompt and provider attribution are processed
  Then transcript remains user data and SQL values remain bound parameters

Scenario: Cross-tenant dispatch attempt
  Given an account requests another account's existing or absent video
  When existing ownership/fence authorization runs
  Then existing indistinguishable 404 behavior and zero external dispatch remain
```

Rate-limit/brute-force: no auth endpoint is added; existing rate/quotas are regression-tested, not replaced. Security scenarios above supplement six acceptance scenarios in Specification; they do not introduce machine AC IDs.

## Guard mutation and regression sequence

One implementation pass → independent requirements/code review → fixes for concrete findings. Mutate Cloud.ru request route/prompt schema, hardcode provider to OpenRouter and bypass local validation; focused guard must turn red, restore and prove green. Keep existing OpenRouter provider pin guard scoped to its branch. Shared dispatch requires concurrent DB test. Do not change a production constant merely to make timing tests pass.

After affected changes run focused tests, then required complete build/typecheck/lint/test + existing selection mutations and env wiring with synthetic fixture. No repeated unchanged green runs without new findings. Completion gate validates actual test file/title, not this planned table.

## Performance Optimizations

Reuse segment-only prompt, existing indexes/claims and one dispatch. No additional caches, validation engine, output repair loop or benchmark framework.

## Security Hardening

No keys in error messages/receipts; no URL override; HTTPS fixed transport and redirects rejected. Account ownership, parameterized SQL, quota-before-spend, fsynced attempts and fence acceptance preserved. Test requests use synthetic credentials only and never reach internet.

## Accessibility

No interface change; existing responsive/WCAG/keyboard behavior is unchanged. New configuration errors are operator-facing diagnostics, not product UI or a new interaction.

## Technical Debt

Deferred: official Whisper wire/timestamp contract, DeepSeek output ceiling and target quality, actual Cloud.ru storage acceptance and target-server launch. Strict generation capability is deliberately unused, not implemented speculatively. Keep deferred items visible without blocking unrelated offline foundation implementation.
