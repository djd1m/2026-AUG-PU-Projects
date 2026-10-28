# N5 Cloud.ru Whisper: current public primary evidence

Verdict: **real word timestamps remain UNCONFIRMED**. Current official public documentation provides neither a supported word-timing request nor a response schema with `words[].word/start/end`. No documented statement that word timings are unsupported was found either. This research cannot authorize an adapter to invent optional parameters, synthesize timing, or claim strict-parser compatibility.

Access date: 2026-10-27 UTC. Read-only public GETs and searches only; no credentials read, paid POST, audio upload, support message, install, application change, git change, or runtime change. Root owns independent donor-repository analysis. Source revision: `0c42dfb1acd7f5085517ddde57f11d1f04781e66`.

## Reproducible current sources

Snapshots and a full URL/status/byte-length/SHA256 inventory are in `/tmp/n5-cloudru-primary-get-20261027/manifest.json`. Hashes below cover raw response bytes, not browser-rendered content. Public documentation HTML includes dynamic fields, so different reads can have different hashes.

- [api-ref](https://cloud.ru/docs/foundation-models/ug/topics/api-ref), HTTP 200, 355791 bytes, SHA256 `80bf9c9289d541787b3ebca8e5bd7e2c9cc3d7a2b196171cdb8497e4bec048d2`. Official API reference links the following schema and Postman collection; describes model listing and text/chat use.
- [openapi](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml?source-platform=Evolution), HTTP 200, 11351 bytes, SHA256 `dbaa859e2889b7c1f3987b96d1caaeba8be332174c07897c89ccb89baa4bc8f3`. Published OpenAPI 3.0.1 / API version 1.0.0 explicitly scopes itself to GET /v1/models and POST /v1/chat/completions. These are its only paths. No Whisper, transcription, verbose_json, timestamp_granularities or /audio/ contract. Its chat response_format object is not an audio response-format enum.
- [postman](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/3352822b17b41aaff2311fd5e3d1944f/foundation_models_openai_compatible.postman_collection.json?source-platform=Evolution), HTTP 200, 1879 bytes, SHA256 `50b9a19d720cdcbeff8277fc6457e223de969f9515a330aa71460157e96d8a60`. Downloaded official collection contains Models - List and Chat Completions - Create only; no audio contract or stored audio response.
- [doc-contents](https://cloud.ru/docs/foundation-models/ug/doc-contents), HTTP 200, 390272 bytes, SHA256 `afa19f77f55f26f5b723a533ad0f4ba573c009c96666b5c9d9ad0447938024a1`. Published Foundation Models contents lists current sections and tutorial pages but no dedicated Whisper/audio/transcription page. Negative evidence is limited to these visible links.
- [overview](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models), HTTP 200, 1038767 bytes, SHA256 `4011f668b082de7b9a6cad298dd8a3a0f446c7be50840a807012f45cd81c4a7e`. Catalogue confirms openai/whisper-large-v3 as internal Audio-to-Text with context 448. This value is not a duration limit or proof of timing support.
- [guides__models-ui](https://cloud.ru/docs/foundation-models/ug/topics/guides__models-ui), HTTP 200, 381481 bytes, SHA256 `5e73f366bd1efec54f68cb25dada0a1913a756fb306df3c537fb5ea356ae4749`. Official instructions direct users to the chosen model's Use dialog. No audio response or timestamp parameters are shown.
- [overview__release-notes](https://cloud.ru/docs/foundation-models/ug/topics/overview__release-notes), HTTP 200, 380149 bytes, SHA256 `a1b332d9a738e255dde456a7dd1dd76439e61db4453b61f1d909258c5a2cff72`. No Whisper/audio/transcription contract in the retrieved current release-notes page.
- [quickstart](https://cloud.ru/docs/foundation-models/ug/topics/quickstart), HTTP 200, 458443 bytes, SHA256 `140efe830d5366e50dca9676ab449b64c202d5fc9a34947c9b633dd271fd7218`. No audio timing contract in retrieved quickstart.
- [troubleshooting](https://cloud.ru/docs/foundation-models/ug/topics/troubleshooting), HTTP 200, 349343 bytes, SHA256 `6fc5f5bc2160d7ca409fe1fb70f00cd6edc6af807e9c199fe38ad790c6fbe11b`. No audio timing contract in retrieved troubleshooting.

Public documentation-location GETs returned HTTP 404 for:

- https://foundation-models.api.cloud.ru/v1/openapi.json
- https://foundation-models.api.cloud.ru/v1/docs
- https://foundation-models.api.cloud.ru/openapi.yaml

Those statuses establish only that these documentation locations were absent; they say nothing about audio inference capabilities. The prior research already tried unversioned /openapi.json, /docs and /swagger.json; those were not repeated. No inference endpoint was POSTed.

Official-domain searches for Cloud.ru Whisper with `timestamp`, `таймкод`, `verbose_json`, `timestamp_granularities`, and transcription response-format terms produced no relevant primary timing documentation. Search absence is not proof of unsupported functionality. The public console bundle was not re-searched: the previous bounded result already isolated its request template and no new version was established.

## Evidence levels and unresolved acceptance criteria

- Current published API contract: **confirmed documentation scope**, no audio endpoint/schema in its two paths. Its explicit limited scope prevents treating absence as a service-level denial.
- Prior provider-generated console template: **prior primary-code evidence**, multipart POST `https://foundation-models.api.cloud.ru/v1/audio/transcriptions`, model `openai/whisper-large-v3`, language `ru`, response_format `text`. This run relies on the previous hashed observation and does not claim current bundle revalidation.
- Actual Cloud.ru word/start/end output, segment structure, units, punctuation handling, relative origin, accepted timing parameters and formats: **unconfirmed**. Generic OpenAI/NVIDIA support is not evidence for this deployment.
- Non-support: **not established**. No retrieved primary statement says Cloud.ru cannot produce word timing.

The existing strict parser must continue to require nonempty real `words[{word,start,end}]`, valid segments and language. Plain text cannot pass it. An adapter may fail closed on missing timing; it must not silently fabricate words or timing.

## Minimal next step and ownership

Next owner: **root**. Complete donor-specific evidence inspection independently. If that supplies no actual Cloud.ru request/response receipt, obtain the key-redacted tenant Whisper Use instructions or a provider-published/explicitly supplied audio contract stating exact word-timing fields, supported format, units and response example. No support message is authorized or sent by this research unit. Existing generic text template alone does not justify a guessed verbose_json/timestamp_granularities request.

A separately authorized one-request capability probe should be considered only with the confirmed word-output request, permitted rights-cleared fixture, target environment/key authorization, and spend authorization. Accept only actual nonempty words under current strict parsing, then require existing chunk/overlap/subtitle checks for full N5 delivery. This unit runs no background continuation; root remains responsible for the autonomous task and independent implementation work.

Research task status: completed. N5 integration status: not claimed complete.
