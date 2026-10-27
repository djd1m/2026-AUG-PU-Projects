# Cloud.ru Whisper: independent wire and interpretation audit

Run-ID: `20261027-n5-cloudru-whisper`
Work-Unit-ID: `cloud-word-wire-audit`
Source-Revision: `125b655d17e36a5c65754f33471cefe8a4e3eeab` (caller baseline)
Build-Revision: `not_applicable` — saved provider qualification responses, no app E2E
Launch-SHA256: `06e6cdaf7155f66f32af088b75293579128105cf5299972937b7a47439fceab2`

## Verdict

**Segment timestamps are present. Word timestamps are not present in any of the five saved responses.** The four verbose responses each contain one timed segment, `start: 0.0`, `end: 4.66`, and top-level `words: null`. There are no nested word records or alternative word timestamp fields. “Cloud.ru Whisper has no timestamps” is therefore contradicted by these artifacts. “This endpoint/model has not yet supplied the word timing data required by N5 under the five tested requests” is supported. A universal claim that Cloud.ru cannot supply word timestamps is not established.

No omitted, documented Cloud.ru HTTP word-timestamp parameter was found in the primary sources inspected. The exact OpenAI bracketed single-word example has already been tested. An extra `return_timestamps` or `word_timestamps` HTTP field would presently be an unverified backend guess, not a correction established by Cloud.ru documentation.

## Scope and evidence identity

This fresh audit reads only the caller-identified own synthetic probe manifests/raw responses, synthetic fixture, sanitized model catalog record, required project instructions, exact shared transcript parser, and public primary documentation. It executes no inference request, private-key/env read, support contact, runtime change, source change, Git mutation, install, or global change. Only this report and the allocated trace are written.

The fixture manifest identifies locally generated eSpeak NG Russian speech, 5.26175 seconds. Its MP3 is independently verified as 43,245 bytes, SHA-256 `4970a2d1ac36b3e304ff392a8e77786011a6ea3376ea6c748544c396d59f7c4f`. All five manifests identify this same asset and `model=openai/whisper-large-v3`, `language=ru`, `temperature=0`. The endpoint is `https://foundation-models.api.cloud.ru/v1/audio/transcriptions`. Saved results all report HTTP 200, one request, and `secret_echo_detected=false`. HTTP status and transport behavior are manifest/operator evidence, not independently captured HTTP envelopes.

| Probe | Manifest format / granularity fields | Reported status / elapsed | Raw bytes | Raw SHA-256 |
|---|---|---|---:|---|
| 1 `capability` | `json`; no granularity field | 200 / 0.658 s | 167 | `30c7178237e4c3e379da1248ac93e5d1ae8aaf50aa4565dd4677a85bb831926c` |
| 2 `capability-verbose` | `verbose_json`; repeated `timestamp_granularities[]`: `word`, `segment` | 200 / 0.545 s | 605 | `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739` |
| 3 `capability-bare-granularity` | `verbose_json`; repeated `timestamp_granularities`: `word`, `segment` | 200 / 0.439 s | 605 | `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739` |
| 4 `capability-word-only` | `verbose_json`; `timestamp_granularities=word` | 200 / 0.630 s | 605 | `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739` |
| 5 `capability-bracket-word-only` | `verbose_json`; `timestamp_granularities[]=word` | 200 / 0.435 s | 605 | `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739` |

Directory names in this table expand to `/tmp/n5-whisper-cloud-<name>-20261027`; the raw filename is `response-private.bin`.

## Raw schema and parser audit

Probe 1 is a complete JSON object with exactly `text: string` and `usage: object`; usage is `{type: "duration", seconds: 6}`. It has no language, segments, or words property. Plain JSON lacking timestamps does not itself test verbose timing behavior.

Probes 2–5 are byte-identical, complete JSON objects with exactly:

```text
duration: number = 5.26175
language: string = "ru"
text: nonempty string
segments: array(length 1)
  [0]: object
    id: integer = 0
    avg_logprob: number
    compression_ratio: number
    end: number = 4.66
    no_speech_prob: null
    seek: integer = 0
    start: number = 0.0
    temperature: number = 0.0
    text: nonempty string
    tokens: array(length 26; integer token IDs)
words: null
```

I inspected the full raw JSON and recursively checked word/timestamp-like fields: the only `words` occurrence is the top-level null; `segments[0]` has no `word` or `words` child. No text-embedded second JSON object, alternate `chunks`, or envelope hides a word array. Token IDs have no per-token start/end fields; segment timing alone cannot recover measured word alignment. Each raw body parses in full and is far below the reported 1 MiB response cap. Truncation is not an explanation for these saved JSON bodies.

The exact parser read is `/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/packages/shared/src/transcript.ts`, SHA-256 `2471bb6ddd58e5b12003fd2b96c461449cf2f0c9ec0092c36153379ee034c2ab`. Static inspection finds an immediate reject unless `Array.isArray(row.words)` and `row.words.length > 0`. Each word must have nonblank string `word` and finite numeric start/end. It also requires a nonblank string language and `segments` as an array. **The parser does not require the segments array itself to be nonempty.** All five raw bodies fail the words precondition. The verbose bodies already supply language and a usable segment. This finding is a source-derived result, not an executed app test.

The saved bytes rule out an N5 parser or SDK hiding supplied words for these responses: the word array is absent/null before N5 sees it, and the operator used raw HTTP rather than an SDK output model. They do not rule out provider-side parsing, forwarding, validation, caching, or response transformation.

## Multipart audit and its limit

The manifests preserve field names and ordered duplicate fields for probes 2/3. Probe 5 requests a single bracketed `word`, so “the second duplicate value `segment` overwrote the first” cannot by itself explain all four results. Probe 4 separately tests a single bare `word`; “only bracketed names were the problem” cannot by itself explain probe 4, while the bracketed standard case is covered by probe 5.

However, **the transmitted multipart body and HTTP headers were not retained**. The reported standard CRLF boundary encoding, file part `audio/mpeg`, no redirects, TLS verification, and raw urllib path are operator attestations. I cannot independently inspect `Content-Disposition` spelling, boundary/header agreement, final boundary, filename, accidental field overwrite during construction, or exactly what bytes reached the server. Successful transcription and the json→verbose response-shape change support audio/model and response_format recognition; they do not prove that granularity fields were correctly serialized, parsed, or forwarded. HTTP 200 is not an acknowledgement of every optional field.

The expected OpenAI serialization is correct as recorded: its primary reference requires `verbose_json` for timestamp granularities and shows multipart `timestamp_granularities[]=word`. The reference describes optional top-level word records with `word`, `start`, `end`. Probe 5 covers that exact format/name/value combination. The hosted reference uses `whisper-1`, whereas Cloud's model ID is `openai/whisper-large-v3`; this establishes a protocol comparison, not a Cloud support guarantee. [Official OpenAI Create transcription reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)

## Primary Cloud and upstream documentation

Cloud's official model list identifies `openai/whisper-large-v3` as internal Audio-to-Text. The saved catalog record names the exact audio endpoint, audio input, and text output, but contains no supported request-parameter schema or word-timestamp capability flag. Text output modality does not prohibit structured timing metadata. [Cloud model list](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models)

The official API-reference page links a downloadable YAML and Postman collection. The YAML explicitly limits its coverage to `/v1/models` and `/v1/chat/completions`; neither download defines an audio transcription schema. Their incompleteness is not evidence that the working audio endpoint or word support is absent. No `return_timestamps`, `word_timestamps`, alternative granularity alias, or required enablement flag for Cloud audio is established by these sources. [Cloud API reference](https://cloud.ru/docs/foundation-models/ug/topics/api-ref), [downloaded official YAML](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml?source-platform=Evolution), [official Postman collection](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/3352822b17b41aaff2311fd5e3d1944f/foundation_models_openai_compatible.postman_collection.json?source-platform=Evolution)

The model card linked by the saved Cloud catalog documents local Transformers pipeline `return_timestamps=True` for sentence timing and `return_timestamps="word"` for words in `result["chunks"]`. That is a Python pipeline contract. There is no evidence here that Cloud uses that pipeline or exposes its arguments as multipart aliases. The card establishes model/ecosystem capability, not Cloud endpoint support. I therefore do not recommend a blind `return_timestamps` HTTP probe. [OpenAI Whisper large-v3 model card](https://huggingface.co/openai/whisper-large-v3)

## Strength of negative evidence and remaining explanations

The narrow negative result has high confidence conditional on the saved artifacts' stated provenance: these exact requests, fixture, endpoint/model, and observation times yielded no word timing records. Segment timing is positively demonstrated. Four correlated verbose calls on one sample are not four independent estimates of capability. No statistical confidence interval for global support, other accounts, future backend versions, languages, audio lengths, or model routes can be calculated from them.

The observations remain compatible with:

1. A service/backend limitation or disabled word-alignment path, despite verbose segment support.
2. A provider parser/gateway accepting or ignoring the optional granularity field, or not forwarding it upstream.
3. A multipart-construction oversight not discoverable from manifests because the request bytes were not saved.
4. Undocumented provider-specific enablement or request requirements. These are unknowns, not grounds to try arbitrary parameters.
5. Reuse of an inference/alignment result keyed by audio/model but not granularity, or another repeated-input effect. No cache is evidenced. Deterministic output at temperature zero also explains identical bodies; the five subsecond elapsed values cannot distinguish cache hits from ordinary execution. A cache of only the final JSON body across response_format is inconsistent with the actual format change, but an intermediate wordless result cache plus format-specific rendering remains possible.
6. Fixture-specific behavior of the short synthetic Russian speech. Recognized text and a segment reduce concern about complete non-speech, but do not prove behavior on fresh, longer, or natural speech.

The evidence does not identify which explanation applies. It justifies keeping this Cloud path unqualified for N5's existing words contract; it does not justify silently synthesizing word intervals or weakening that contract.

## Bounded next action for the root coordinator

Preferred next action is vendor clarification of the exact supported Cloud HTTP word-timing contract and whether alignment is enabled for this endpoint/model, using existing permitted documentation/support processes. This audit sends no message and grants no new authorization.

If the root independently decides that one more paid control is justified within existing authorization, **at most one useful control** is a genuinely fresh, distinctly spoken own synthetic Russian fixture (new audio content and hash, not merely re-encoding the existing sample), whose *first ever request* is exactly `verbose_json` plus one `timestamp_granularities[]=word`, same endpoint/model/language/temperature. Retain a sanitized exact multipart body (audio is own synthetic; exclude Authorization) and response headers/body. Do not add speculative parameters. This single control tests the repeated-input/first-request and sample-dependence alternatives together; it cannot discriminate those two explanations if it succeeds. A nonempty timed words array would qualify that tested combination; another null would strengthen the bounded negative result but still not prove universal non-support. No such call was executed here.

Root owns the decision and continuation. Audit AC are complete: all five saved schemas/hashes/status metadata checked; word vs segment distinguished; protocol coverage and request-byte gap identified; N5 compatibility explained; primary-source gaps and one optional bounded control reported.

## Telemetry and checks

Profile: `model-routing-econom`; task is bounded independent read-only research, no feature implementation. Requested model/effort: `gpt-6.1-sol` / `high`. Actual model: `null` (child runtime exposes no independent execution-model metadata); fallback: none requested/observed. Model tokens and cost: `null` (not exposed). New inference calls/spend in this audit: zero; actual billing cost of prior probes remains `null` rather than inferred from catalog metadata. No build or app test is applicable because no application code/runtime was changed. Checks performed: launch SHA, fixture bytes/SHA, five full JSON parses and recursive field inspection, raw-byte equality, manifest/result field comparison, exact parser static inspection, primary documentation fetch. No test pass or E2E claim is made.

Default sandbox command launch failed at bwrap before execution; narrow read-only/write-to-allocated-/tmp commands subsequently ran under reviewed escalation. There was no approval rejection.

## Input digest index

- `/tmp/n5-whisper-cloud-capability-20261027/ready.json`: `a08512f1ff920ff4369c3d6c3c771027d87038a5c9d9ed613b7179950c992408`
- `/tmp/n5-whisper-cloud-capability-20261027/result.json`: `8a0607e9b3e99a237e22696e299c7e802309e571f4983795e84667cbb64cafd8`
- `/tmp/n5-whisper-cloud-capability-verbose-20261027/ready.json`: `57d3f0fc905cd5be43386595a3f6779cf1a67382f60236a9e567df8a789de6a6`
- `/tmp/n5-whisper-cloud-capability-verbose-20261027/result-private.json`: `8244db9a86fdc43abc4ca475718e7e336ba91c6a230853fb1937f4a7eae10963`
- `/tmp/n5-whisper-cloud-capability-bare-granularity-20261027/ready.json`: `307e0c9413549b497ba47bb76279e0f14173e2f724d5048a1f3e3d34f1a5a839`
- `/tmp/n5-whisper-cloud-capability-bare-granularity-20261027/result-private.json`: `4fee3b5bfb74261f3545f4a2c404970e6c041be55282cc64ffa968105b4538f1`
- `/tmp/n5-whisper-cloud-capability-word-only-20261027/ready.json`: `158fb944a2e88983888b8af063c0f3e8547460c13d498392aa5bd79e1ee02a99`
- `/tmp/n5-whisper-cloud-capability-word-only-20261027/result-private.json`: `7ad32a1d7635c6566015f9c74ed27105c05f5a7fe7de47d3917b2722a7fc8291`
- `/tmp/n5-whisper-cloud-capability-bracket-word-only-20261027/ready.json`: `c283207ade63bf2ebb107bc14344a024e3d65d17e75d16ec18c5a792fd78d822`
- `/tmp/n5-whisper-cloud-capability-bracket-word-only-20261027/result-private.json`: `3f0292f53287ed8027e010a0e995d6535bd062d2cf2237b172a12306e1c4efe9`
- `/tmp/n5-whisper-speech-fixture-20261027/fixture-source.json`: `0d70c61e52834612c00dfda7a6b7317d9d02b09ddf2c50257d29a2b4382e19fa`
- `/tmp/n5-whisper-cloud-doc-metadata-20261027/whisper-model-private.json`: `e6b9c82b5388b5bac44cd1e60a23080a726fd87baf3d92e3d98027a669603d8a`

Finished-At: 2026-10-27T22:12:52.090424+00:00
Duration from caller allocation: 291.789 seconds (includes dispatch/read/coordination; exact model-active duration unavailable).
Verdict: audit_complete; segment_supported_observed; word_not_observed; global_unsupported_not_established
