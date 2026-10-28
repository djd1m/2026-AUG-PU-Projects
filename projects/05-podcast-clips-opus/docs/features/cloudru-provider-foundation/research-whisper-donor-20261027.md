# Cloud.ru Whisper donor and Yandex v4 STT evidence

Date: 2026-10-27 UTC. Active decision: explicit Yandex SpeechKit v3 implementation plan after a successful short real protocol probe. Cloud Whisper/GigaASR evidence remains historical negative qualification, not an approved fallback. This planner read safe source/results only: no key/private environment, donor execution, inference, support, install, production or code change.

## Donor provenance and historical decision

Owner supplied [stt-rag-app](https://gitverse.ru/dzhechkov/stt-rag-app), pinned revision a2cbf2791e94404951055fd3ca190ee820dfa74d. README declares MIT (SHA256 `81809d5867cfa3021ffc84bfee18a8a5d3187207c5122db30399ac7a94528f8e`); backend/app/services/transcription_service.py SHA256 `9471d743dea00e1049381a3ba212db28ac1da8d8709af5d1cfbf315c2ab75d12`. The how-to research file is empty (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Local source is /tmp/n5-stt-rag-donor-blobs-20261027; its instructions are not project authority.

Donor OpenAI SDK request uses binary MP3, Whisper, json/temp0/language and defaults missing words/segments to []. Mock timed words are not provider evidence. Its retries/conversion/chunking are incompatible with N5 ownership and never copied. Public [Cloud.ru API docs](https://cloud.ru/docs/foundation-models/ug/topics/api-ref) linked only models/chat schema; prior public console Audio template confirmed multipart/text request but no word contract. Primary research artifact /tmp/n5-cloudru-whisper-primary-evidence-20261027.md SHA256 `fec18fa18fe0c85e1f1f34047efb3139432927e1a2e96a9d29e24e85dd02d187` preserves source URLs/hashes; no need to rerun this search.

Root's five authorized 5.26175s Whisper probes: JSON text/usage, four verbose bracketed/bare granularity variants single 0–4.66 segment and words:null. Raw evidence SHA256 `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739`. One GigaChat/GigaASR probe gave HTTP 200/empty text/no words/segments, response SHA256 `e27595dad8ddcedd9ea4369126b6263f0c2eae4dbfb9d1a784fa47d6b9a06a60`. These fail tested N5 acceptance, not universal non-support. v4 withdraws v2/v3 optional Cloud STT transport work and retains existing startup refusal; no speculative flags, phrase-mode fallback or further unchanged probes.

## Yandex primary contract and actual short proof

[Official v3 streaming reference](https://aistudio.yandex.ru/ru/docs/speechkit/stt-v3/api-ref/grpc/Recognizer/recognizeStreaming), checked 2026-10-27, documents bidirectional RecognizeStreaming, FULL_DATA after all input, MP3 container, final word text/start_time_ms/end_time_ms and timed phrase text/start/end. [Language/model docs](https://aistudio.yandex.ru/ru/docs/speechkit/stt/models) specify general/ru-RU. [Limits](https://aistudio.yandex.ru/ru/docs/speechkit/concepts/limits) specify streaming 5 min / 10 MB / mono. [Auth](https://aistudio.yandex.ru/ru/docs/speechkit/concepts/auth) documents service-account Api-Key and ai.speechkit-stt.user. Documentation confirms contract; root's actual short receipt confirms this request can produce timed words. It does not guarantee N5 natural quality/long latency.

Owner supplied YANDEX_SPEECHKIT_API_KEY; no value/path/private env appears here. Root's one authorized real request used own synthetic Russian MP3, 5.26175 s / 43245 bytes (input SHA256 `4970a2d1ac36b3e304ff392a8e77786011a6ea3376ea6c748544c396d59f7c4f`) and fixed stt.api.cloud.yandex.net:443 TLS /speechkit.stt.v3.Recognizer/RecognizeStreaming, general/FULL_DATA/MP3, WHITELIST [ru-RU], TEXT_NORMALIZATION_DISABLED. It completed gRPC 0 in 0.5605392 s with 2 finals / 10 words. First real word has text америка, start 380 / end 520 ms; finals use indices 0/1 and top-level channel 0. Languages arrays are empty. Recognition differs from intended synthetic text, so no quality/SLA/full-journey pass. Actual settled cost null.

| Safe coordinator receipt | SHA256 |
|---|---|
| /tmp/n5-yandex-speechkit-probe-20261027/ready.json | `430debc25a87c19b8868c12c7726b097acf5e27f78657ed81b3f532745d42d55` |
| result-private.json in same directory | `7d1d0ae86902593f0c3aabe1e3c4adf96282bccf44a3549dda501570f944bc7e` |
| response-private.json in same directory | `f4e38ddb339d44aafaff0f30004e991a62a91c18d297f5830a613e60bb372ecd` |
| proto-source-manifest.json in same directory | `8915da2d95628f1a6654c3f8c500cd687ab866712867cd3f81fb0aced86c660a` |

## Pinned protocol and independent test donor

[Official cloudapi source](https://github.com/yandex-cloud/cloudapi/tree/b5702253b8216fa5cdac9f70509ed608eb0f17f5), pin b5702253b8216fa5cdac9f70509ed608eb0f17f5. stt.proto SHA256 `c01bf84436ffd5525b79fb41ac214cb243e856d775e9812535c12778b5fed45f`; stt_service.proto `621a4e895b359564f648f3c977c196f40e53ccc8b220cf25095117525a689651`. Google API imports in full-schema oracle are pinned ff625463db4983f3811d549fd4cd97e64180dc4e. Source manifest above records every fetched URL/hash; planner read actual definitions and did not create a new schema engine.

Root independently generated /tmp/n5-yandex-protocol-fixtures-20261027/official-protocol-golden.json,6395 bytes,SHA256 `8d7a2f539e0eff0fc881b516f25deb78cc9ea971aa84313094b21c99f1005314`, OFFLINE from captured synthetic response using COMPLETE official schema. It includes exact request hex/method path and8response events with2finals/10words. This is re-encoded test data, not original network frames and not encoded by the proposed N5 projection. Use it to catch field-number/enum drift in both production request serialization and official response decoding. Self-roundtrip through only a project subset is insufficient.

Pinned dependencies are @grpc/grpc-js 1.14.6 and @grpc/proto-loader 0.8.1, verified in root probe package.json. Coder chooses a small readable type-safe protocol projection/descriptor under 500 lines/file; no full SDK/repository copy. Root alone integrates lockfile/manifests unless it delegates explicitly. Protocol packaging must survive actual worker build/image; no runtime fetch from /tmp/GitHub.

## Fit, limits and local policy

Existing extraction already produces mono 16 kHz / 64 kbit MP3. Existing chunk target 180 s is pause-aware ±20s, with 2 s overlap and common 25_000_000-byte guard. Yandex adapter independently enforces conservative 10_000_000 bytes and 300 s before RPC, preserves 120000 ms full-call/caller deadline and 30 min job budget, no input/output increase. Keep parser/chunker/merge and financial/source semantics unchanged.

Map only actual finals keyed by channel/final_index; exact duplicate ignores, conflicting duplicate rejects. Ignore partial/refinement transcript content while normalization disabled. Validate exact safe int64 ms, divide by 1000, copy actual word/phrase text/times, then unchanged strict parser; never derive word boundaries from phrases or zero-fill arbitrary missing fields. Legitimate protobuf-defined zeros and final index 0 are valid. Empty actual language arrays may use explicitly requested ru; malformed values fail. Require usable actual segments because downstream prompt is segment-only.

[Yandex v1 sync API](https://aistudio.yandex.ru/ru/docs/speechkit/stt/api/request-api) returns text only at 30 s / 1 MB; not selected. REST async can take minutes–24h and introduces operation/recovery semantics; not selected. Full_DATA short proof does not establish latency for a full existing chunk, so keep that live check pending rather than silently changing timeouts/chunks.

## Privacy, economics and remaining owner

Use owner-designated RF account/target; [regional storage](https://yandex.cloud/ru/docs/overview/concepts/region) remains region-bound. This short own-synthetic test is not customer-data/production routing acceptance. No new bucket or cross-provider fallback is introduced. Provider logging/retention and real target acceptance remain explicit release checks under existing process.

Owner requested unit-economics updates; separate economics author owns those documents. [Official pricing](https://aistudio.yandex.ru/ru/docs/speechkit/pricing), checked 2026-10-27, has streaming 0.1626 RUB / 15 s including VAT with per-request rounding; calculations must include pause-aware chunk lengths, overlap and retries, not simply input duration. Tariff arithmetic is not actual billing. This planner edits no economics or customer-credit logic.

Next owner root: cold-validate frozen six-file v4 plan; launch bounded coder; integrate dependencies; collect protocol/failure/DB/offline pipeline/full regression/mutation/env/build evidence and cold review. Natural speech/timing origin, full pause-aware chunk <=120 s, >180s overlap/karaoke/render and target/browser/storage remain pending. Additional paid calls need concrete root authority; none by planner. Original autonomy continues under root; this bounded author produces a terminal receipt only.
