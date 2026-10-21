# PG fixture correction review — review-3

Verdict: ACCEPT_WITH_CAVEATS — targeted static closure of the PG fixture defect; not feature acceptance.

Run-ID: 20261003T021046Z-demo-page
Work-Unit-ID: demo-page-review-pg
Attempt-ID: review-3
Source-Revision: 24d7e6fb85c425347ae31205f43888575e84594c
Source-Snapshot-SHA256: a7ce1d5c28fa33d7d2de07a17a47cca86f68c9ff48de3f12fa8bd59c1de4de83
Build-Revision: none
Launch-SHA256: ed18b051daad9562a109a201318c54bd15df96e100900e0e777a9283f239bfa9
Finished-At: 2026-10-03T02:59:30.972845+00:00

## Canonical obligations derived before inspecting the fixture

Specification FR-n6b-12 (docs/Specification.md:198) requires demo and widget to share visitor identity and limits; SC-US-012-3 requires daily exhaustion to refuse with the owner's contact. Pseudocode Answer question (docs/Pseudocode.md:172–188) requires visitor, bot and global reservations atomically before any paid call, rollback of all reservations if any cap refuses, and a limited log plus 429 without embedding or generation. Demo questions must not count as external widget installations. The bounded race must therefore exercise shared visitor and shared bot caps separately across both channels, count only admitted provider calls, retain the cap counter, and retain channel/limited logs and install assertions.

## Exact defect and correction

The recorded full-regression-attempt2/final-full-regression.txt:444–461 fails at constructGateway with visitor=50 > bot=3; it never reaches the bot race. The saved output reports 610 unit passes and 246 PG passes with one failure, not a green corrected snapshot.

apps/web/tests/int/demo.int.test.ts:86–113 now uses visitor=3 in both cases, bot=3 for the bot case and bot=50 for the visitor case. It asserts visitor <= bot. Global remains 3000 from answer-fixture.ts. In the bot case, 50 different /24 prefixes each issue one request; the actual visitorKey helper assertion requires 50 distinct keys, so no visitor can exhaust its cap of 3. In the visitor case all 50 requests use one key and bot=50, making visitor=3 the binding cap. Request builders pass the selected IP through X-Forwarded-For; both handlers derive identity with clientIp and visitorKey for the same stored bot. No artificial key mock replaces that path.

Both cases still launch 50 promises with alternating widget/demo requests. All prior assertions remain: exactly 3 HTTP 200, 47 HTTP 429, 6 provider calls, 6 model-call rows, selected quota counter used=3, 25 demo and 25 widget logs, 47 limited outcomes, and no widget installs. The independent single-demo exhaustion test still checks owner contact. No new targeted finding; the fixture correction closes the demonstrated configuration failure without weakening the race assertions.

## Read-only evidence checks

Local exact-byte verification exited 0:

- Launch file digest matches the caller-supplied digest; HEAD matches Source-Revision.
- Preserved correction-1-source-hashes.json digest matches bc6745c42326bcee3c84194b84fdb93a36a45d4667e7b94b2b79b46a4542d7fb.
- Previous and final maps have exactly the same 25 paths; only apps/web/tests/int/demo.int.test.ts differs. All other 24 hashes match, including every mapped production file.
- Every current file matches the final map. Sorted compact JSON canonicalization of its files map produces the stated a7ce1d5c…de83 snapshot.
- Reversing only the recorded fixture delta in memory reproduces the previous test's exact hash, confirming that no other test body changed.
- Git status lists no changed/untracked apps, packages or services source outside the final map. Existing feature changes relative to HEAD are preserved; production is unchanged relative to correction-1.

Inspected 11_pg_correction.md and correction-2-fixture.diff against the actual source and saved failure. No product edits, children, tests, runtime probes, Docker, network, ports, commits or donor reads were performed.

## Caveats and handoff

Coordinator-owned fresh real-PG execution and remaining build are pending evidence for this review; neither was run or awaited here. Actual UI verification also remains pending. Prior passing tests cannot establish a pass for the corrected snapshot. This verdict accepts only the fixture correction's semantics and source scope. Runtime/feature acceptance must use the coordinator's fresh source-bound receipts. E2E readiness: not_applicable — static review only, no E2E run or build claim.

Profile: compact-quality-first-v2. Bounded review of an S fixture correction within the existing feature pipeline; budget 180 seconds, no delegation. Requested model/effort: gpt-6-astra / medium. Actual native model/effort, usage and cost: null (no authoritative runtime metadata exposed); fallback unknown, no model switch requested by this executor. Launch-to-report elapsed: 152.36 seconds; active time unavailable. Existing launch is the attempt's pre-stage record; coordinator telemetry was not edited. CLI captures the final receipt at docs/telemetry/p-replicator/20261003T021046Z-demo-page/evidence/review-3-receipt.md; no TRACE file is written manually.

Status: completed
