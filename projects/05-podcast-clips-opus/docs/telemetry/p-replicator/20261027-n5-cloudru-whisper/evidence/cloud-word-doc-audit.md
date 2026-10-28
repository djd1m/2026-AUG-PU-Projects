# Independent audit: Cloud.ru Whisper timestamps for N5

Completed 2026-10-27; scope was primary public documentation/code/sample research, not inference. Baseline `125b655d17e36a5c65754f33471cefe8a4e3eeab`, project `projects/05-podcast-clips-opus`. Launch SHA256 verified `55b9eb61a5dc93d356bb58faca7efe775bcb68c329c8a2f9527b6e8c8bcc64d5`.

## Decision

**Cloud.ru FM Whisper word timestamps remain unverified by this audit.** I found no Cloud-authored contract or captured real Cloud response establishing nonempty `words[{word,start,end}]` in seconds. Do not promote Cloud Whisper to N5-ready based on the donor repository. This is a bounded evidence conclusion, not proof that the live service cannot return words.

There is independently discovered **integrator evidence for segment timing**: Tsar Router's own model catalog distinguishes Nexara word timing from Cloud.ru/MTS fallback segment timing. That supports the possibility that someone correctly observed Cloud timestamps while N5's word requirement still fails. It does not establish Cloud's exact wire contract or current live behavior.

## Evidence, strongest first

1. **Cloud's model catalog confirms the product/model, not word timing.** `openai/whisper-large-v3` is listed as internal Audio-to-Text. No word/segment schema or granularity parameter is supplied there. [Cloud catalog](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models).

2. **Cloud's public API specification is explicitly incomplete for this question.** Its description limits it to model listing and chat completion. The linked Postman collection also contains those two operations. Neither supplies an audio contract. This absence cannot prove audio or words unsupported. The model metadata schema includes `readme` and `type`, making model-specific metadata a concrete next documentation lead. [API reference](https://cloud.ru/docs/foundation-models/ug/topics/api-ref), [official YAML](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml), [official Postman collection](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/3352822b17b41aaff2311fd5e3d1944f/foundation_models_openai_compatible.postman_collection.json).

3. **Pinned owner donor contains compatibility code and mocks, not Cloud word-response evidence.** Public repository [dzhechkov/stt-rag-app](https://gitverse.ru/dzhechkov/stt-rag-app), revision `a2cbf2791e94404951055fd3ca190ee820dfa74d`, inspected from supplied Git metadata without execution:
   - `backend/app/services/transcription_service.py:144,187`: author comments claim Cloud supports JSON/text and does not return verbose JSON. These comments are developer experience claims, not provider guarantees.
   - `:169–182`: request sets model, file, response format, temperature, optional language. No timestamp granularity is requested.
   - `:197–202`: parser supplies empty segment/word arrays when response lacks those fields. The presence of a `words` key in the application result proves nothing about provider words.
   - `:295–306`: chunk merge offsets existing timings by chunk start in seconds. This consumes timings if present; it does not create evidence of them.
   - `backend/tests/unit/test_transcription_service.py:743–770,776–781`: SDK is patched; a MagicMock is populated with a word-shaped object and the test checks application result keys. This is no live API test.
   - `backend/tests/fixtures/test_data.py:834–875`: a mock builder fabricates word timestamps at fixed half-second increments. They are synthetic test data.
   - `research/01. fm-whisper-howto.md` is zero bytes at the pinned revision, independently verified with `git show`.

4. **A direct integrator explicitly distinguishes provider granularity.** [Tsar Router Whisper catalog](https://tsarrouter.ru/models/openai/whisper-large-v3) identifies Nexara as its primary channel with word timing and Cloud.ru/MTS as fallback with segment timing. Its generic word example calls `api.tsarrouter.ru`, so it cannot be used as a Cloud.ru word example. Its [audio API documentation export](https://tsarrouter.ru/llms-full.txt) describes a multipart word request and response fields for its own gateway, not Cloud's. This is primary evidence about the integrator's advertised routing, secondary evidence about Cloud capability. No integrator call was made.

5. **Cloud-owned SDK does not resolve this.** [cloud-ru/evolution-openai-python](https://github.com/cloud-ru/evolution-openai-python), public tree commit `e2e9b67d6e65050cdc1fcc746d974f24460b46cb`, imports OpenAI base classes (`src/evolution_openai/client.py:19–21`) and subclasses them (`:67,:360`) for token/auth handling. No dedicated audio/transcription paths or audio examples appeared in the tree; inspected client, changelog, and remaining Markdown/Python doc/examples contained no speech parameter support evidence. Its broad SDK compatibility claim is not a hosted model contract. [Pinned client source](https://github.com/cloud-ru/evolution-openai-python/blob/e2e9b67d6e65050cdc1fcc746d974f24460b46cb/src/evolution_openai/client.py), [changelog](https://github.com/cloud-ru/evolution-openai-python/blob/e2e9b67d6e65050cdc1fcc746d974f24460b46cb/CHANGELOG.md).

6. **Other bounded Cloud-owned checks:** `evo-aifactory-skills/cloudru-foundation-models/references/api-usage.md` mentions Whisper in catalog prose but documents model listing/chat only. Provider repositories `cloud-notebooks`, `enterprise-education-labs`, `evo-app-services-workshop`, `evo-foundation-models-ai-development-workshop`, `evo-aifactory-mlops-course` had no speech/audio/Whisper/transcription paths in nontruncated public trees. This is path-level negative evidence, not a full content audit. Official [FM release notes](https://cloud.ru/docs/foundation-models/ug/topics/overview__release-notes) expose no audio granularity change in the retrieved text (latest displayed FM section July 2026).

## What is established about the request/response

| Item | Cloud-specific evidence | Remaining limit |
| --- | --- | --- |
| Endpoint/model | Assigned known endpoint `/v1/audio/transcriptions`; independently verified catalog model `openai/whisper-large-v3` | Public Cloud audio schema not found |
| Request content type | Donor invokes OpenAI SDK with file; standard SDK uses multipart | Not a Cloud-authored content-type guarantee |
| `response_format` | Donor author says `json`/`text`; code defaults to `json` | No verified exhaustive Cloud enum; no real rejection captured here |
| Word option | Donor requests no granularity; no Cloud-authored parameter contract found | Acceptance of `timestamp_granularities[]`, bare name, or provider-specific alternatives unknown |
| Segment fields/units | Integrator advertises Cloud segment timing | Exact raw Cloud response field layout/units not established here |
| N5 word fields/units | No qualifying Cloud response found | Nonempty words, numeric finite seconds, valid intervals and audio alignment remain to test |

**Upstream is not the Cloud contract.** OpenAI's own [transcription reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) documents multipart input, `response_format=verbose_json`, and the form field `timestamp_granularities[]=word`; its word objects have `word`, `start`, `end`, times in seconds. This is a precise test hypothesis for an OpenAI-compatible provider, not evidence Cloud implements it. Open-source Whisper model ability also does not imply the deployed service exposes its alignment output.

## Concrete next action, owned by root

1. First inspect any already captured, authorized Cloud `/v1/models` result for the exact Whisper model's `metadata.readme` (or authorized read-only model metadata retrieval). Cloud's own public schema says this field exists. A model-specific README/generated console sample could resolve unsupported format or parameter spelling without another paid inference. Do not expose credentials or read unrelated configuration.
2. Only if not already tested exactly, root's authorized probe executor can use a short known-speech file and raw multipart request to the assigned endpoint with model `openai/whisper-large-v3`, `response_format=verbose_json`, and literal form name `timestamp_granularities[]=word`. Preserve sanitized raw HTTP status/content type/body, so the SDK/parser cannot mask a field or change format. This is the upstream hypothesis above. Distinguish an explicit format rejection from a successful response that omits words; ignored unknown parameters remain possible.
3. Compare against existing JSON/segment results using the same audio. Passing N5 requires nonempty actual word objects, finite `0 <= start < end` seconds within duration, sequence and word/audio alignment. Sentence segments, subtitle cues, fabricated equal intervals, or parser-added empty `words` do not pass.
4. If the exact probe already exists unchanged, **do not repeat it merely because this audit found the upstream example**. Record the limited result and pursue another provider or documented forced alignment. No Cloud-specific alternative spelling was found to justify parameter guessing.

Separate fresh lead sent to root: integrator [changelog](https://docs.tsarrouter.ru/guide/istoriya-izmenenij) dated 2026-10-23 adds `sber/GigaASR` from Cloud.ru; its [full catalog export](https://tsarrouter.ru/llms-full.txt) advertises word timestamps for that model (the individual model page could not be retrieved in this audit). This is a different model and needs official Cloud endpoint/availability/response verification; it does not validate Whisper.

## Execution and handoff

- Scope checks: no private key/env reads; no inference POST; no support communications; no app/code/Git/global writes; only assigned trace/report written under `/tmp`.
- No repo tests executed: this is a documentation audit; repository code was treated only as evidence.
- Default sandbox failed before execution due `.codex` bwrap permission; narrow escalated reads/public GETs and assigned `/tmp` artifact writes worked. Direct official Cloud HTML GET gave HTTP 403; built-in browser retrieved indexed official pages/specifications. Gitverse browser fetch timed out; pinned local Git objects supplied evidence.
- Measured research/artifact interval: 2026-10-27 22:08:48–22:14:31 UTC (343 seconds); launch allocation was 22:08:00 UTC.
- Requested model: `gpt-6.1-sol`, high. Actual runtime model identity not exposed to child; root should use host launch metadata. Tokens/cost: null, not estimated.
- Responsible continuation owner: root (`/root`), including secrets/probes and provider decision. This bounded documentation unit is complete; N5 live word acceptance is not claimed complete.
