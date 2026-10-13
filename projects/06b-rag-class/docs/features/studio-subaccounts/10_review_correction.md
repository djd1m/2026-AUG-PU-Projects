# F13 narrow correction review — review-2

Verdict: **ACCEPT_WITH_CAVEATS**. No blocking source-correctness finding in the two-file correction. This accepts the bodyless-request fix for coordinator integration; it does not close full regression or actualUI acceptance.

## Obligation and independent review order

Derived first from Specification FR-n6b-13 / SC-US-013-1 and the approved plan: an authenticated same-origin studio using “New client” must create a child and select it. The existing UI sends no body or Content-Type (`apps/web/src/app/cabinet/studio-clients.tsx:10`) and selects the returned account at line 29. An optional nonempty body must remain bounded by actual bytes before creation and must be a JSON object. Origin, server-session identity, studio eligibility, cap and referral authority must remain intact. Architecture preserves actor-session RLS and child ownership; no change to that model is authorized here.

Read actual UI attempt2 failure, changed handler/tests and supporting source before the author's `09_correction.md`. `tests/artifacts/studio-subaccounts/ui-attempt2/ui-output/report.json` records a real production create-select-1440 failure, 422 instead of 201, on the earlier source/image. It is failure evidence, not a pass for this candidate.

## Source conclusions

- `apps/web/src/server/studio-handler.ts:23–43`: absence is determined by bytes, not by nonnull stream identity. A closed zero-byte stream, including repeated empty chunks, reaches creation. Empty chunks are not retained. A null body still reaches creation. This fits the unchanged browser client.
- Lines 17–22 retain Origin then session authentication before body reading. Line 44 still passes only authenticated actor and validated referral cookie to the existing DB operation. Parsed body fields never become authority. Studio rejection/cap handling remains unchanged.
- Lines 29–36 count each chunk's byteLength before retaining it; the first chunk crossing 4096 triggers cancellation and rejection before creation. No aggregate oversized buffer is constructed. A transport may supply an already-large chunk, but the handler does not concatenate or retain that chunk. Both understated and overstated Content-Length are irrelevant to this actual-byte decision. Zero-byte requests are treated as absent even if headers claim otherwise.
- Line 39 supplies an explicit replacement body to `new Request(request, ...)` after consuming the original stream. This does not attempt to reread the consumed stream. It preserves headers, including Content-Type; the existing `readJson(..., { objectOnly: true })` checks the media type and rejects malformed JSON, whitespace, null, arrays and JSON strings. Parameters such as charset remain accepted. Header length lies do not bypass either reader's byte accounting. The original request remains available for header-only referral-cookie access.
- Read/getReader/construction failures are caught at lines 49–51 and return the existing safe 503 without reaching creation. Oversize cancellation is awaited; rejection of cancellation also follows that 503 path rather than the normal 413 path. This is fail-closed and consistent with the existing shared reader; no demonstrated AC regression. Normal EOF already exhausts the stream, so lack of explicit releaseLock does not leave unread network content. Read-error and cancellation-rejection paths were inspected statically, not newly executed.

## Evidence and binding

Independently recomputed exact-byte SHA256 for all 22 entries in `tests/artifacts/studio-subaccounts/final-source-hashes.json`: all match the working tree. Compared with `implementation-source-hashes.json`: exactly the handler and its unit test differ; 20 entries, including the client UI, are unchanged. Recomputed canonical map digest:

`dd55491ba57d829f51f15a1b2a6c6ffb2b055151d852986d54afb53327085b02`

HEAD: `902d31343bcfb05819dcca0d8009873679d0f292`. Launch digest independently matches `8efd1fcda34c35cdc387db3f1963ec28204680cf1aeb00f5a26973ea467d13c6`.

Saved focused/recovery logs show 10 passing tests across handler and client UI suites. The mutation log shows two assertion failures (422 versus 201 and 422 versus 403), with eight passing tests: a behavioral RED, not an import/setup failure. The saved mutation identity for the old handler matches independently hashed HEAD bytes (`9212cdaae85c59041934f6a397c0b413d8c8f4a6c780b7db7e4f3b92b0130fe9`). The restored handler hash matches the current fixed bytes (`48676070704e23610ee46c675bfd9fbe710e2f4de4979c58857185e2261a2f60`), and the same fixed suites then pass. Typecheck log and checks manifest record exit 0. These are reviewed saved results, not reviewer reruns.

## Caveats and handoff

Full regression attempt2, production build/source binding and fresh actualUI at the required viewports remain coordinator gates. The available full-regression log was still partial when read; no completion is inferred. Unit UI tests do not prove browser navigation or production Next stream behavior. Review E2E preflight: not_applicable, because this launch forbids execution. No tests, runtime probes, network, Docker, ports, children, product edits, commits, donor reads or global configuration changes were performed. Only this report and the allocated CLI receipt are written; coordinator-owned telemetry/TRACE is untouched.

Profile: compact-quality-first-v2. Inherited substantive risk M; correction's recorded mechanical ROUTE S does not remove mandatory M gates. Requested reviewer gpt-6-astra / medium; actual native model and effort are unknown because execution metadata is not exposed. No fallback is evidenced. Tokens, cost and active time are null/unavailable; no savings claim. Run telemetry: `docs/telemetry/p-replicator/20261003T031332Z-studio-subaccounts/`. Existing launch is the attempt record; coordinator owns event reconciliation.

Finished-At: 2026-10-03T04:10:27.845681+00:00
Elapsed from supplied launch through review preparation: 166134 ms (includes instruction reading, inspection and report preparation; final file writes follow immediately). Budget: 240 seconds.
