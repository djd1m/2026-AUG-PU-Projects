# F07-R1 correction

Only the reviewed model URL removal defect is corrected. Protocol-relative addresses are removed alongside existing schemes and `www.` URLs. Bare dotted addresses use a general Unicode-letter suffix rule rather than a TLD allowlist; ports, paths, queries and fragments are consumed. Ordinary spaced prose, decimal numbers, version numbers and dates remain intact in the fixed regression case. Existing scheme/Markdown/HTML stripping assertions pass.

Fixed cases `//offers.example.shop/pay` and `offers.example.shop/pay` fail against unchanged sanitizer source (2 assertion failures, exit 1); identical cases and the prose-preservation assertion pass after the minimal patch (3 passed, exit 0). Node v22.22.3 typecheck passes (exit 0); focused citation/answer-flow/ask tests pass (40 tests, exit 0). No answer-flow changes were necessary.

Source revision: `8f088d8fbba3cf674cd62e7029d60d438df29c19`. Correction snapshot: `22d10ce93a822b96bfe58225045eb2ede772572897bf4bcddb9993a25de77b9f`. The historical 21-file snapshot is preserved: 21/21 matched before the change, 19 remain unchanged, and the explicit two-file delta is in `tests/artifacts/rag-answer-sandbox/correction-1-source-hashes.json`. Patch and check logs reside in this run's evidence directory.

Profile: compact-quality-first-v2. Requested model/effort: gpt-6.1-sol/high. Actual model, usage, cost and active time are null because native metadata is unavailable; coordinator reconciles. Elapsed through receipt creation: 265.884 seconds from caller launch. No children, Docker, network, installs, manifest/schema/global/donor changes, commits or pushes.

PostgreSQL/integration, full-suite, build and browser/UI remain pending and coordinator-owned, outside this correction. E2E readiness is not applicable to this unit. Completion is a bounded handoff, not overall feature acceptance.

Receipt: `docs/telemetry/p-replicator/20261002T202425Z-rag-answer-sandbox/evidence/correction-1-receipt.md`.
