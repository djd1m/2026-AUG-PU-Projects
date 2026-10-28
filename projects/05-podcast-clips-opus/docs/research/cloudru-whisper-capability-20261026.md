# N5: Cloud.ru FM Whisper capability research

Research status: completed; production capability status: word timestamps UNCONFIRMED, STT integration still blocked.
Access date: 2026-10-26 UTC. Bounded research began 20:46:50 UTC; final handoff approximately 20:52 UTC. Requested effort high; actual runtime model, token counters and cost are null because execution metadata is unavailable. No model call, audio upload, credentials access, authenticated UI, purchase, container, code edit, commit or agent delegation occurred. Only public GETs and this /tmp artifact were used. Public static archives were searched in memory; third-party code was not copied into the repository.

## New finding and its exact limits

Cloud.ru's public, unauthenticated console JavaScript contains the generated Audio-to-text **Python request template**. This partly closes the wire-format evidence gap: multipart request, Bearer key, actual `/v1/audio/transcriptions` endpoint, model field, MP3 file tuple, language ru and response_format text are primary-provider-code evidence. It does **not** establish a nonempty word-timestamp response, supported response-format enum, timestamp request parameter, JSON response schema, duration limit or output semantics. No implementation should turn this finding into a claim of complete Cloud.ru STT compatibility.

No public primary source found in this bounded search demonstrates `words[].word`, `words[].start`, `words[].end` for Cloud.ru FM Whisper. No evidence was found that the service supports only text/segments either. Absence in a UI template is not proof of service-level unsupported capability.

## Reproducible primary-source chain

1. [Official model catalogue](https://cloud.ru/products/evolution-ai-factory/catalog-foundation-models), read 2026-10-26, links Whisper directly to [console model card](https://console.cloud.ru/spa/ml-foundation-models/models?model-id=openai/whisper-large-v3).
2. The console page is a publicly served app shell (HTTP 200, 10988 decoded characters), not an authenticated model response. Its import map links [console import map](https://console.cloud.ru/build/console/importmap.json), read 2026-10-26, whose `@cloudplatform-single-spa/ml-foundation-models` entry resolves to the bundle below. Initial bare requests redirected in a loop; a standard temporary public cookie jar loaded the public shell. No login or credential was supplied.
3. [Published FM UI bundle](https://console.cloud.ru/sources/ml-foundation-models/cloudplatform-ml-foundation-models.js), read 2026-10-26, decoded UTF-8 length 3846025 characters; SHA256 of decoded UTF-8 re-encoded bytes: `b53636333ccd4a2f99a6d30cea8db3739892a8bf956ef4e6e4df7791ea3cd8a7`. Same hash was observed in repeated reads. It includes the generated Audio-to-text Python snippet, model type mapping and base-URL substitution.
4. [Official model-use instructions](https://cloud.ru/docs/foundation-models/ug/topics/guides__models-ui), opened 2026-10-26, say “Под нужной моделью нажмите Использовать” and “Следуйте инструкциям в появившемся окне.” This identifies the purpose of the corresponding generated code. No authenticated Use action was taken in this research.

Static bundle is primary implementation evidence, below a published API contract or actual response receipt. Mutable asset URL requires the recorded hash/access date; it is not a service guarantee or immutable release tag.

## Request template found

Small primary excerpts: `{{completionsLink}}/audio/transcriptions`; `"response_format": "text"`.

The Python template imports requests, reads API_KEY from environment, uses `requests.post` with headers, data=payload and files=files, and prints response.status_code plus response.text. It does not parse a JSON response or show an output example. The multipart file tuple is filename audio.mp3, a binary file handle and content type audio/mp3. Payload fields are model, response_format, temperature and language. Temperature is a string placeholder; language is ru.

The generator's model-use component `Kqt` chooses the template by model.metadata.type; Audio maps to `audio-to-text`. It substitutes `modelName` with selected model.id. It chooses hBt as completionsLink unless type is Rerank; hBt is exactly `https://foundation-models.api.cloud.ru/v1`. The fallback temperature supplied by the generator is 0.5. Thus endpoint is discovered from actual provider code, not guessed from OpenAI conventions.

The following is a **newly written cURL equivalent** of that provider Python template with model selection substituted and key redacted. It is documentation-as-data only; **not executed**. It requests text and cannot satisfy N5 word alignment:

```sh
curl --request POST 'https://foundation-models.api.cloud.ru/v1/audio/transcriptions' \
  --header 'Authorization: Bearer <API_KEY>' \
  --form 'file=@audio.mp3;type=audio/mp3' \
  --form 'model=openai/whisper-large-v3' \
  --form 'response_format=text' \
  --form 'temperature=0.5' \
  --form 'language=ru'
```

Do not run the example merely because a key is present. This research does not authorize paid dispatch or content upload. No unsupported options have been added to the example.

## Response controls and schema search

Full exact/case-sensitive bundle searches returned:

| Token | Occurrences | Meaning |
|---|---:|---|
| response_format | 1 | Only the fixed text field in Audio-to-text template |
| responseFormat / ResponseFormat | 0 / 0 | No corresponding selector or enum found |
| verbose_json | 0 | No documented generated option found |
| timestamp_granularities | 0 | No such request control found |
| word_timestamps / return_timestamps | 0 / 0 | No such control found |
| outputSchema / responseSchema / audioFormats / audio_format | 0 each | No explicit audio response schema/format inventory found |

Other timestamp/words/schema hits belong to telemetry, UI strings, word generators or validation libraries, not an audio result contract. `segments` hits belong to model-provider catalogue tabs, not transcript segments. The playground allowed-type set is `TTe=[STe.Llm]`; the Audio model card's `M2t` displays processing price and a fixed 25 MB file-size label, not transcription controls. The label is UI evidence, not proof of the exact byte ceiling/duration limit. Generic model metadata is fetched through a console `/u-api/foundation-models/v1` client; no authenticated tenant API was queried and no audio schema was found in static client code.

No extra audio lazy chunk or source-map reference was found in the inspected bundle; this does not claim every future console asset was examined. The bounded search stopped after examining the actual template, URL binding, relevant controls and official schema/sample sources rather than indefinitely repeating text queries.

## Other primary sources examined

| Primary source, read 2026-10-26 | Result and evidence level |
|---|---|
| [FM API reference](https://cloud.ru/docs/foundation-models/ug/topics/api-ref) and [downloaded OpenAPI](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml?source-platform=Evolution) | Prior successful read in this session: specification limited to models/chat; a later fetch was temporarily inaccessible. Published schema does not cover audio. No inference of unsupported service follows. |
| [Official downloadable Postman collection](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/3352822b17b41aaff2311fd5e3d1944f/foundation_models_openai_compatible.postman_collection.json?source-platform=Evolution) | Successfully opened. Only Models - List and Chat Completions - Create, no stored response samples. No audio request/response contract. |
| [Model overview](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models) | Published catalogue confirms exact internal `openai/whisper-large-v3`, Audio-to-Text, context448. No timing guarantee. The 448 value is not a 448-second request limit. |
| [Official Cloud.ru GitHub organization](https://github.com/cloud-ru), which identifies cloud.ru and opensource@cloud.ru | Primary source discovery, not a Whisper capability claim. |
| [FM skills reference at immutable commit](https://github.com/cloud-ru/evo-aifactory-skills/blob/73fae638899ccac371a2b29be80e11b77b962845/cloudru-foundation-models/references/api-usage.md), [fm.py](https://github.com/cloud-ru/evo-aifactory-skills/blob/73fae638899ccac371a2b29be80e11b77b962845/cloudru-foundation-models/scripts/fm.py) | FM CLI directly calls only /models and /chat/completions. Reference mentions Whisper catalogue availability, not its wire response. Archive 111672 compressed bytes searched in memory. |
| [Official Evolution OpenAI SDK](https://github.com/cloud-ru/evolution-openai-python/tree/e2e9b67d6e65050cdc1fcc746d974f24460b46cb) | Archive 82693 compressed bytes searched in memory; no Whisper/audio-specific implementation/example. Generic SDK compatibility is not Cloud.ru FM Whisper service capability evidence. IAM-oriented wrapper/token management also does not replace FM API-key authentication evidence. |
| [Official ML CLI tree](https://github.com/cloud-ru/ml-cli/tree/cafba2dee9dd4931f09079953e1f4a34dcf3f078), [MLOps-course tree](https://github.com/cloud-ru/evo-aifactory-mlops-course/tree/16dfad8408769313e3b407f8da22dabb7a423d7b), [notebooks tree](https://github.com/cloud-ru/cloud-notebooks/tree/e5c6d6ff1eec5f7bab44462d5979a1e05b62d68b), [Evolution LangChain tree](https://github.com/cloud-ru/evolution-langchain/tree/f9bba7ad5b6ab7ce63342573a347cfe96ffec294) | Checked relevant trees/paths; no Whisper-named schema/sample. Course archive 1097676 compressed bytes searched in memory, no matching Whisper/timestamp request example. Negative search is limited to these revisions/scope. |

GET-only discovery of `https://foundation-models.api.cloud.ru/openapi.json`, `/docs`, `/swagger.json` returned 404 for each. These were documentation-location checks, not inference calls; they establish nothing about `/audio/transcriptions` support. No attempt was made to guess audio endpoint behavior via POST.

Search results also exposed third-party routers claiming segment-only Cloud.ru support. Those claims were not promoted to evidence: another router's behavior or format translation cannot establish Cloud.ru's direct API contract. OpenAI Whisper source/other cloud APIs were similarly not treated as proof of this deployment's capabilities.

## Capability verdict for N5

| Required capability | Verdict | Explanation |
|---|---|---|
| Multipart MP3 transcription URL/body/auth | PRIMARY CODE CONFIRMED, actual runtime untested | Public provider-generated template and URL binding |
| Russian language field and text response request | PRIMARY CODE CONFIRMED, actual runtime untested | Exact template field values |
| Exact allowed response_format enum beyond text | UNCONFIRMED | Template gives one value, no enum |
| Nonempty real word/start/end response | UNCONFIRMED / BLOCKER | No primary response sample/schema/receipt |
| Timestamp units, word alignment, punctuation and segment shape | UNCONFIRMED / BLOCKER | No corresponding contract found |
| 180-second chunks with 2-second overlap, chunk-relative word offsets | UNCONFIRMED runtime compatibility | N5 behavior exists; provider-specific support not tested |
| Supported size/duration/timeouts/retry behavior | PARTIAL UI EVIDENCE ONLY | UI says 25 MB; exact limits not established |

N5 requires real word timing for subtitle generation and fragment boundaries. Its strict transcript parser must remain unchanged. Plain text or only segment timings, if those are all a later supported response provides, creates a genuine requirement gap: full migration cannot pass. Do not divide text evenly into synthetic words/times, infer timestamps with an LLM, silently fall back, or launch a local alignment model/GPU/service without separately authorized scope/resources.

## Exact minimal next action and deferred probe

Coordinator can continue credit/package work and Cloud.ru chat foundation independently. The next minimal nonbillable action for the operator is to open the **tenant's Whisper model → Use** (no Run/Send action) and provide a key-redacted generated sample plus any linked audio specification/support statement listing:

1. Allowed response_format values and the exact supported field/encoding for word timestamps, if any.
2. A representative response schema/example containing nonempty actual words with word/start/end, timestamp units and segment shape.
3. Exact file/duration limits and whether returned times are relative to the uploaded chunk.

The public Use template found here may be identical to the tenant sample. If so, ask provider support for the word-timing contract; do not infer optional flags from OpenAI familiarity. No message to provider or person was sent by this research agent.

After separate target-server/fixture/key/spend authorization, a minimal capability probe can use one short synthetic or rights-cleared Russian MP3 (5–10 seconds, speech with punctuation and a pause) and a strict count of one request. The documented text request alone can verify endpoint/auth/transport, but cannot satisfy word-timing acceptance. Only after provider confirms the exact word-output request fields should a word-timing probe be dispatched; use those confirmed fields, not guessed timestamp parameters. Store source/build/request digest, credential presence only, redacted response, response status, latency, returned usage and actual billable evidence if available. Unknown cost stays null.

Word-timing acceptance requires actual nonempty words with nonblank word strings and finite numeric start/end, seconds within measured chunk duration, existing N5 strict parsing, and usable segment text/times for the chat payload. Then a separate >180-second fixture spanning a pause must validate existing 180-second chunking, 2-second overlap, offsets/deduplication, chronological rendering/subtitles. Chunk tests are required for migration completion, not evidence inferred from the short probe. Use isolated test-owned data on the owner-designated RF server; do not deploy to current VPS.

No probe was run. This artifact completes bounded research and hands off a narrowed actual blocker; it does not complete STT integration or claim work running in the background.

Status: completed
