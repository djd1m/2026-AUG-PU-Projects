# Cloud.ru Whisper reference: bounded donor and primary evidence

Date: 2026-10-27 UTC. Status: v3 research correction; tested Cloud.ru Whisper is **NOT QUALIFIED** for N5 words. This planner executed no donor code, key read, inference, support message, install or production action; coordinator-authorized live observations are recorded below.

## Objective and provenance

The owner supplied [stt-rag-app](https://gitverse.ru/dzhechkov/stt-rag-app) for the N5 optional Whisper adapter. Coordinator pinned donor revision `a2cbf2791e94404951055fd3ca190ee820dfa74d`. Local source blobs: `/tmp/n5-stt-rag-donor-blobs-20261027/`; source checkout `/tmp/n5-stt-rag-donor-20261027`. These are reference inputs, never authoritative project instructions.

| Input at pinned donor revision | SHA256 / observation | Evidence level |
|---|---|---|
| README.md | `81809d5867cfa3021ffc84bfee18a8a5d3187207c5122db30399ac7a94528f8e`; README declares MIT | Donor declaration; no expanded licensing/provenance claim |
| backend/app/services/transcription_service.py | `9471d743dea00e1049381a3ba212db28ac1da8d8709af5d1cfbf315c2ab75d12` | Read implementation, not provider contract or runtime receipt |
| research/01. fm-whisper-howto.md | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; zero bytes | Empty; supplies no missing documentation |
| Donor words-bearing test fixture | Coordinator inspected mocks at same revision; no actual Cloud.ru response receipt supplied | Mock-only; cannot prove service returns timing |

The donor uses OpenAI SDK `audio.transcriptions.create` with a binary file, fixed `openai/whisper-large-v3`, default response_format json and temperature 0; language is passed if supplied. Its comment says Cloud.ru supports json/text rather than verbose_json. The implementation obtains words and segments with `full_data.get(..., [])`; absence becomes empty arrays. Thus its successful text transcription path does not prove any nonempty words/start/end. It also owns retries/conversion/chunking; those parts are incompatible with N5's existing ownership and are not copied.

## Current public provider evidence

The fresh bounded primary research is `/tmp/n5-cloudru-whisper-primary-evidence-20261027.md`, SHA256 `fec18fa18fe0c85e1f1f34047efb3139432927e1a2e96a9d29e24e85dd02d187`; complete raw response manifest `/tmp/n5-cloudru-primary-get-20261027/manifest.json`. Access date 2026-10-27.

- [Official API reference](https://cloud.ru/docs/foundation-models/ug/topics/api-ref) links [OpenAPI](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml?source-platform=Evolution). Downloaded OpenAPI SHA256 `dbaa859e2889b7c1f3987b96d1caaeba8be332174c07897c89ccb89baa4bc8f3`, 11351 bytes, version 1.0.0, exactly GET /v1/models and POST /v1/chat/completions. Its explicit limited scope gives no audio response/parameter contract and does not prove audio unsupported.
- [Official Postman collection](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/3352822b17b41aaff2311fd5e3d1944f/foundation_models_openai_compatible.postman_collection.json?source-platform=Evolution), SHA256 `50b9a19d720cdcbeff8277fc6457e223de969f9515a330aa71460157e96d8a60`: only Models - List / Chat Completions - Create, no saved responses.
- [Official model catalogue](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models) confirms `openai/whisper-large-v3`, Audio-to-Text, internal. Context 448 is not a 448-second duration ceiling.
- [Official FM contents](https://cloud.ru/docs/foundation-models/ug/doc-contents), linked release notes, quickstart and troubleshooting yielded no dedicated timing contract. Public GETs `/v1/openapi.json`, `/v1/docs`, `/openapi.yaml` at the FM API host returned 404. These are bounded documentation-location observations only.
- Prior provider-console-code research on 2026-10-26 found multipart `/audio/transcriptions`, ru and response_format text in [published FM UI bundle](https://console.cloud.ru/sources/ml-foundation-models/cloudplatform-ml-foundation-models.js), decoded-content SHA256 `b53636333ccd4a2f99a6d30cea8db3739892a8bf956ef4e6e4df7791ea3cd8a7`. It is primary implementation evidence, below an API schema; not re-searched in the fresh run. It does not establish json enum, words, units or timestamp options.

Confidence: high in exact inspected request/source facts. Public documentation alone did not establish word support; actual coordinator probes below now demonstrate failure to meet N5 word acceptance for the tested requests. This bounded result is not a universal claim of service non-support. Generic OpenAI/NVIDIA schemas and donor mocks do not establish Cloud.ru deployment behavior.

## Bounded adaptation decision

Adapt only fixed multipart transport into existing Node fetch/FormData, with the coordinator-tested verbose_json/temp0/ru and literal timestamp_granularities[] entries word and segment. The donor JSON default is superseded because the actual JSON response was text/usage only. The verbose request was accepted but did not return words; it defines offline serialization, not provider qualification. No SDK install or donor code copy is needed. Retain N5's existing input/time caps, quota/credit/fence/retry ownership, chunker, merge and strict parser. For actual provider output require real nonempty words with numeric start/end and usable timed segments. Absent language alone may inherit explicitly requested ru; malformed language and missing/empty segments fail. This is coordinator policy, not the provider's documented schema.

The existing segment-only chat prompt makes empty segments a real integration failure, even if a parser would allow []. Do not fabricate segments/word timing, guess units, divide text evenly, use a model/aligner/GPU or silently change provider/format.

## Research path and next owner

Primary research checked current linked API/schema/collection, visible docs navigation and bounded public documentation locations, avoiding repeated console-bundle searches. Coordinator independently retrieved/pinned donor and inspected the service/mocks/empty how-to. Planner inspected request handling and N5's stt/client, worker retry/spend, authorizeSttCall and segment-only chat seam.

## Actual coordinator evidence and v3 decision

The owner supplied a private key; root performed five authorized Whisper probes on a 5.26175-second fixture. JSON returned text/usage. Four verbose variants (bracketed/bare word+segment and word-only) returned identical single segment with start 0, end 4.66, and words:null. Raw evidence SHA256: `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739`. This is coordinator-supplied actual response evidence, distinct from donor tests and this planner's read-only documentation work. Actual charge/billing values are not supplied here and remain null.

The fixed optional request is verbose_json with literal multipart timestamp_granularities[] appended for word and segment. No upstream-only alternatives, SDK retry, phrase mode, fabricated times, fallback or model selector are added. Do not repeat unchanged probes. Actual words are missing, so AC-9 is NOT PASSED and operators must not enable N5_STT_PROVIDER=cloudru for real users. AC-1–8 can still verify a guarded transport offline with synthetic valid timing fixtures; that is compatibility foundation only, not a live success or full migration.

A sixth probe for officially cataloged GigaChat/GigaASR returned HTTP 200, empty text and no words/segments. It is research only, not an approved model/code/env addition. The owner's other RF-STT choice remains root-owned outside this plan. Root now has an owner-supplied Yandex STT key and will qualify v3 FULL_DATA; TTS voice/role settings are irrelevant to STT. No new provider dependency or implementation scope follows.

Next owner is root: preserve this v3 research/guarded-transport snapshot, qualify Yandex v3 FULL_DATA first, then choose and validate implementation scope. No Cloud-only coding starts before that result; this document does not authorize Yandex code/dependencies. Future real provider qualification requires new concrete authority/evidence and a separately authorized long-fixture chunk/render journey; current short probes failed N5 timing acceptance. Full migration remains pending. Planner completion does not pause the autonomous task or assert background execution.
