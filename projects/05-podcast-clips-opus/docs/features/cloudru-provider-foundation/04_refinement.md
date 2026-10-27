# Cloud.ru provider foundation — Refinement

v3 PLAN, 2026-10-27; this planner executes documentation checks only; coordinator live evidence is recorded separately. v1 observations remain in the historical completion section.

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | Blank provider/key/model or missing response content | Configuration/schema error before dispatch or persistence | No default on blank; absent selectors alone preserve OpenRouter |
| Max size | Existing 25 MB STT ceiling / long transcript | Existing limits retained; no new chunk/output assumptions | Strict conditional Cloud.ru request; nonempty bytes <=25_000_000 before HTTP |
| Concurrent access | Two select handlers share attempt | At most one claim/dispatch | Existing transaction/fence and quota, real isolated DB test |
| Network failure | 429/5xx, abort, stalled response body | Provider/timeout outcome, one attempt remains counted | No repair/fallback/new retry |
| Shape error | Refusal, invalid JSON, extra fields, truncated finish_reason | Local schema failure; no persisted fragment | Existing strict validator plus envelope checks |
| Semantic error | Invalid score/time/language/overlap among valid candidates | Existing candidate filtering and word snapping | No broadening validator rules |
| Explicit optional STT | Cloud.ru selected, valid key; output lacks words/segments | Conditional request allowed; untimed/unusable output rejected | No fabricated timing, empty context, alternate format or fallback |
| Secret mixing | Cloud.ru LLM with no OpenRouter key | Works with selected Cloud.ru synthetic key | No inference from which key exists |
| Fake execution | Test fake with Cloud.ru LLM backend | No external request; actual provider recorded fake | Never allowed in production |
| Storage host | Public signing origin differs from internal endpoint | Signed URLs bind public origin, transport internal | Independent SigV4 assertion; no host rewrite after signing |

## Testing Strategy

Unit: new `tests/cloudru-provider.test.ts` uses injected fetch and mocked SDK handlers, synthetic keys and transcript fixtures. Cover every closed selector/model combination, strict optional STT multipart request/response policy, documented Cloud.ru chat body and prompt schema, unchanged OpenRouter body, strict local shape/semantics, refusal/truncation/body timeout/no retry, provider identity and no real requests.

Integration: existing isolated PostgreSQL/Redis/MinIO suite validates actual provider stored on an exclusively claimed attempt, per-user/global refusal before dispatch, timeout attempt attribution and stale fencing. Run on existing authorized test environment only; no container/image creation authorized by PLAN. Offline S3 signing is not a Cloud.ru integration pass.

E2E: fake-provider regression journey in existing isolated test environment preserves upload → processing → ready/refusal semantics. Actual RF target/long-fixture and real S3/browser journeys remain pending. AC-9 is not passed: completed short Cloud.ru Whisper probes returned no words; do not enable Cloud.ru STT for real users or report synthetic pipeline success as live qualification. Immediately before any actual E2E, companion read-only preflight binds source/build/inputs/allowed environment/receipt; no preflight in this docs-only stage.

Performance/benchmark: deterministic count benchmark asserts exactly one mocked HTTP call per accepted LLM attempt, zero on refused quota and zero fallback calls on failure. Simulated body stalls hit existing 240000 ms timeout using fake timers rather than waiting. No latency percentile or token-price target is invented. Actual model token usage, billing, CPU and target latency remain null until measured in separately authorized work.

## Test Cases

```gherkin
Scenario: Selected Cloud.ru LLM configuration
  Given live mode, cloudru LLM and synthetic CLOUDRU_FM_API_KEY
  And exact deepseek-ai/DeepSeek-V4-Pro model and no OpenRouter key
  When configuration loads and a mocked selection is authorized
  Then one Cloud.ru JSON-object request includes the exact schema in its prompt
  And strict local validation precedes fragment persistence

Scenario: Conditional transcription and invalid response
  Given Cloud.ru STT is explicitly selected with a synthetic FM key
  When injected fetch returns text-only or missing actual word timestamps
  Then transcript acceptance and select enqueue are refused without schema retry
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

Rate-limit/brute-force: no auth endpoint is added; existing rate/quotas are regression-tested, not replaced. Security scenarios above supplement nine acceptance scenarios in Specification; they do not introduce machine AC IDs.

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

Pending: a qualified RF provider and actual word/segment evidence after the observed Cloud.ru Whisper incompatibility; official Whisper timing schema, DeepSeek output ceiling and target quality, actual Cloud.ru storage acceptance and target-server launch. Strict generation capability is deliberately unused, not implemented speculatively. Keep deferred items visible without blocking unrelated offline foundation implementation.

## v3 meaningful acceptance and mutations

New checks are planned, not test-title/coverage receipts. Reuse existing suites; do not create a validator engine or tests that merely restate an implementation expression.

| Property | Meaningful check / failure injection | Existing seam |
|---|---|---|
| Cloud.ru request | Decode received multipart and compare actual MP3 bytes/filename/fixed Whisper model/verbose_json/temp0/ru; literal timestamp_granularities[] has word and segment, no routing/other timestamp flags; OR control retains existing wire | cloudru-provider / transcription tests |
| Selected credentials | Execute actual STT entrypoint projection + resolved synthetic compose; missing selected FM key fails, unrelated key does not substitute; fake records fake | config/env/provider tests |
| Parser/metadata | Real numeric word+segment fixtures pass; observed words:null with segment 0–4.66, text-only, segment-only, [] words, absent/string/nonfinite times, malformed JSON/language, absent/empty/textless segments fail; absent language alone becomes ru | transcription tests; parser source unchanged |
| Bound/cancel | Empty and >25_000_000-byte file gets no fetch; stalled body hits 120000 ms, caller abort cancels, redirect cannot forward key; no alternate-format request | injected transport, fake timers |
| Financial/dispatch | Two real DB handlers compete same ordinal: one call; identity present in DB before fetch; fsync attempt before dispatch; refusal/stale zero calls; retry/quota/credit finalization controls | transcription integration/order/quota + credit packages |
| Downstream | >180-second synthetic audio with overlap speech: merge once, nonempty segment prompt, word snapping and rendered subtitle timing | existing merge/select/render media suites |

Mutate one guard at a time, restore bytes and retain red/restored-green evidence: select wrong multipart route/format/body; leak the wrong selected key or omit STT entrypoint projection; bypass actual-word/usable-segment validation; end timeout before body read; hardcode DB/JSONL provider; remove fsync-before-call or ordinal condition. Existing quotas, source ownership, parser timing clamps and customer-credit guards remain mandatory. Only modify existing mutation runner where this is enough; coordinator owns any exact runner allocation. No changes to constants to ease tests.

After concrete affected changes: focused unit/integration checks; full `npm test` with mandatory no-skip reporter, `npm run build`, `npm run typecheck`, `npm run lint`; relevant existing mutation runners; synthetic env completeness/wiring and model-cost source guard. Preserve v1 LLM/S3 tests, existing concurrency/credits/source invariants and all eight limits. No UI changes planned. If a browser/UI receipt is used for acceptance, its existing required Docker/browser setup and fresh build remain required; an HTTP request cannot replace it.

Live AC-9 is **NOT PASSED**, not blocked by a missing key: the owner supplied one and the coordinator completed five Whisper probes using a 5.26175-second fixture. JSON returned text/usage; four verbose bracketed/bare word+segment and word-only requests returned identical segment 0–4.66 and words:null (raw SHA256 `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739`). Retain this incompatible fixture as a nonretryable rejection control; no automatic/unchanged paid reprobe. The selected offline adapter serializes the accepted verbose bracketed shape only, without assuming live words. GigaChat/GigaASR's sixth HTTP-200 result had empty text/no timing and is research only. Root owns the owner's different RF-STT choice outside this scope; the owner has supplied a Yandex STT key and root will qualify v3 FULL_DATA before any Cloud coding. A future qualified response and separately authorized >180-second fixture with independently checked timing/origin remain required for full migration. No guessed wall time, charge or runtime pass.
