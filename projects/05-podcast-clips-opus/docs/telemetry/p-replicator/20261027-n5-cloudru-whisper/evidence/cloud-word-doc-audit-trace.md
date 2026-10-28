# Cloud.ru Whisper word documentation audit trace

- Started UTC: 2026-10-27 22:08:48
- Launch SHA256 verified: 55b9eb61a5dc93d356bb58faca7efe775bcb68c329c8a2f9527b6e8c8bcc64d5
- Baseline: 125b655d17e36a5c65754f33471cefe8a4e3eeab; N5 projects/05-podcast-clips-opus.
- Scope: read-only primary documentation/code/sample audit; no inference POST, credentials, support messages, Git/app/global/resource writes.
- Requested model: gpt-6.1-sol high; actual runtime model externally unverified; token/cost usage null.
- Default exec sandbox failed before command execution (bwrap .codex directory permission); narrow escalated reads work. Python executable unavailable; python3 available.
- Initial official model catalog independently confirms openai/whisper-large-v3 is internal Audio-to-Text; does not specify word timestamps.
- Next: dedicated audio guide and donor service/tests, distinguish declared/mock/live results.
- 22:12 UTC: pinned donor service lines 144/187 claim json/text only; request lines 169–182 no timestamp parameter; lines 200–201 default missing segments/words to empty. Unit test lines 763–770 inject word result with MagicMock. Dedicated research/01. fm-whisper-howto.md is zero bytes at pinned revision.
- Independently found integrator primary catalog https://tsarrouter.ru/models/openai/whisper-large-v3 explicitly characterizes Nexara as word timing and Cloud.ru/MTS fallback as segment timing; this is an integrator claim, not Cloud contract/live evidence.
- Public Cloud-owned SDK https://github.com/cloud-ru/evolution-openai-python commit e2e9b67d6e65050cdc1fcc746d974f24460b46cb subclasses OpenAI; no dedicated audio/transcription path in public tree, no audio strings in client.py or changelog. Compatibility wording alone is not endpoint capability evidence.
- Cloud-owned evo-aifactory-skills api-usage.md advertises Whisper but documents only model list/chat; no audio parameters.
- Official Cloud docs public HTML GET returned HTTP 403; web index has catalog and TOC. No inference performed. Next: derive exact official release/API links, inspect model-specific provider sample if available.
- 22:14 UTC: official API reference/downloads independently inspected: YAML explicitly limited to models/chat; Postman also models/chat only; metadata.readme is strongest next model-specific docs hypothesis.
- Final provider tree checks complete; no concrete Cloud word contract or real nonempty word response found. Integrator segment evidence kept separate from direct Cloud evidence. No inference run.
- Report: /tmp/n5-cloud-word-doc-audit-report-20261027.md. Remaining N5 live acceptance and next authorized action owned by root; no background work claimed.
Status: completed
