# F16 calibration — NOT_EXECUTED

Run `20261003T064351Z-release-gate`, author attempt `implementation-1`.
Tool baseline `58b49da642298d991679241ce26c508b22392aee`; exact dirty source hashes:
`tests/artifacts/release-gate/implementation-source-hashes.json`.
No live provider invocation, actual PG calibration, website crawl, stand CJM or browser check was performed by the author.
F16 acceptance and public readiness remain pending. Offline synthetic scorer tests are not calibration results.

## Frozen UTF8 fixture

Fictional Lumen Workshop corpus, exactly 20 known + 10 unknown questions.
The HTML contains the exact corpus paragraphs. Expected factual terms and document locators are in questions.json;
each negative names an omitted detail on a documented topic. Similarity eligibility is UNMEASURED.

| File | SHA256 |
|---|---|
| tests/calibration/questions.json | 3f924f6a4e3ee8e332d60340473a697e3d9e8c470e2ee86a8dec3f54f17d3bd6 |
| tests/calibration/corpus.json | 61f9cf3f700c99d84a9187e777fd8e88810265f29e9043305a022ca7bb054bbf |
| tests/calibration/site.html | 8f625bb45091a9782745da255c7b81b47e1cd1f892cb4408eba8f950de17a85f |

Do not change any fixture question after observing live output within an attempt.
If negatives are below the configured threshold, the attempt fails eligibility; preserve the report.
Any redesigned dataset is a new frozen attempt with a fresh receipt and hashes; never tune the production threshold to pass.

## Coordinator execution prerequisites and command

Before spending, coordinator obtains applicable live authorization, provisions secrets privately,
verifies source/build/environment and quotas, and allocates a fresh report path in an existing evidence directory.
No credential values belong in commands, reports or logs. Required existing environment names:
`DATABASE_URL_SERVICE` (n6b_app_service), `OPENROUTER_API_KEY`, `MIN_SIMILARITY`, all seven `LIMIT_*`.
`VISITOR_SECRET`, when present, must also satisfy the existing gateway's validation.
No `.env` is read by these tools; provision the environment through the authorized coordinator mechanism.

Build workspace exports from the frozen source before live use:

```sh
npm run build --workspace @n6b/db
npm run build --workspace @n6b/rag
CALIBRATION_LIVE_AUTHORIZED=yes CALIBRATION_MODE=live node --import tsx scripts/calibrate.ts --live --seed-fixture --report tests/artifacts/release-gate/live-attempt-1.json
```

This explicitly seeds a fresh is_test account and unpublished bot in the existing DB; no actual crawl claim.
One gateway.embedIndexBatch only; ≤20 chunks, ≤32000 UTF8 bytes, conservative ≤8000 token reservation.
At most 30 sequential answerQuestion attempts, ≤30 question embeddings and ≤30 generations, existing max400 output tokens.
No retries; 1200-second overall deadline and existing provider deadlines, bounded DB statements.
Missing live switch/configuration exits2 before a paid call. Failure/provider unavailability/deadline exits1.
Reports use a fresh exclusive file, never overwrite an existing attempt; they retain failed observations and safe DB evidence.
Costs remain null without billing measurements. Global quota rows can include concurrent work; account-specific rows and
model_call_log IDs isolate this attempt. Generated dist JS hashes are recorded separately from source hashes;
their correspondence is verified by the coordinator, not inferred from the declared baseline.

## Acceptance

Exit0 requires a complete run, valid successful ledger, all 10 unknowns with measured top similarity ≥ MIN_SIMILARITY
and outcome model_unknown, and ≥17 known answers with matching factual terms and expected, retrieved citation.
below_threshold and invalid_citation do not substitute for the model's unknown judgment.
The question vector is captured by delegation to the existing AnswerAttempt, with no additional paid embedding.
The tool repeats only the free real-PG search to observe unfiltered similarity; the isolated seeded corpus stays unchanged.
Per-case JSON preserves answer text, status, outcome, retrieval similarity/text, citations, elapsed time and actual call usage.
Review answers for contradictions, unsupported extra facts and ambiguity: term matching is a transparent guard,
not a substitute for human semantic review. Elapsed times are observations, not the 200k-chunk NFR benchmark.

Actual threshold: null. Actual live outcomes: null. Actual token usage/cost: null (not executed).
Prompt/model/provider hashes are captured at live launch; the accepted offline source snapshot captures their baseline.

## Separate CJM and browser gates

Use the issued base URL literally; no fallback to localhost. Required metadata/configuration:
`CJM_RUN_AUTHORIZED=yes`, `CJM_REPORT_PATH` (fresh path), `DATABASE_URL_OWNER` (n6b_owner),
`SOURCE_URL` (fixed authorized controlled fixture URL reachable by the worker), `FOREIGN_ORIGIN` (different origin),
`CJM_QUESTION`, `CJM_EXPECTED_TERM`, `CJM_EXPECTED_CITATION_URL`.
The latter values must be established before execution from the source content.

```sh
bash scripts/check-cjm.sh https://n6b.194.85.249.105.sslip.io
```

The script registers a fresh account, marks and verifies is_test with the owner DB before queuing the source,
checks the new bot against that DB, polls the job ≤180 times with 5-second intervals and no job retry,
asks once in sandbox, publishes, checks exact issued embed URL, visitor config/preflight/one ask without session cookie,
then checks badge302 and landing ref. Overall1200s, ≤200 HTTP requests, ≤30s per request; no mutation retries.
Safe statuses/IDs and actual model_call_log rows are retained; passwords/session/DB URL are excluded.
Exit0 means passed_api_protocol; exit1 is failure; exit2 is missing prerequisites/NOT_EXECUTED.
Node fetch Origin headers are API proof only. A separately authorized real browser on a foreign host must prove
CORS, CSP, hostile CSS isolation, privacy notice, badge behavior and the actual deployed build.
