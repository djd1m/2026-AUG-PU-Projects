# N5 preview defect: minimal implementation plan

RUN_ID: 20261028-n5-thumbnail-fix
WORK_UNIT_ID: thumbnail-plan
Attempt: plan-01
Baseline: 394197e00535c0bd359af76dd5e1a18c52ed529a
Repository: /tmp/n5-acquisition-analytics-20261026
Project: projects/05-podcast-clips-opus

## Confirmed diagnosis

The thumbnail failure is downstream of truncated compacted video, rather than proof that JPEG color-range options require changing. In `apps/worker/src/render/compaction.ts`, `buildCompactionGraph` currently does `trim, setpts=PTS-STARTPTS, fps=25`. On a 5-fps source, trimming first discards the preceding frame needed to represent a cut boundary on the 25-fps plan grid. Resetting PTS then normalizing FPS produces segments shorter than their planned lengths. Chained xfade offsets exceed available video and the video track stops early. Audio and the MP4 format duration remain full length. `probeDuration` sees only format duration, so it cannot reveal this defect. Worker thumbnail offset is correctly derived from the established planned-duration contract, but may consequently point beyond the final video frame.

Observed reproduction used the protected synthetic 200-second file, existing built compaction/envelope helpers, and FFmpeg 8.1.2; direct graph output was scaled to 64×114 to bound scratch. Whole-source probe confirms video/audio both 200 s, video 5 fps. Plans generated for the same 0..25, 30..55, 60..85 ranges have 9 joins and D′ 21.56, 21.44, 21.52 s, matching original worker compaction logs. Cross-check against coordinator-provided `/tmp/n5-thumbnail-original-fixture-20261028.json` confirms all three computed plans exactly equal their original persisted cut_plan arrays (only synthetic timing/plan/status fields inspected). Old graph yields video durations 6.28, 11.92, 4.52 s while audio/format retain D′. Third thumbnail at 5.38 s reproduces exit 234 and MJPEG encoder/no-packets failure. Earlier thumbnails succeed only because their selected offsets precede their prematurely truncated video ends.

Changing only scratch graph ordering to `fps=25, trim, setpts=PTS-STARTPTS, format=yuv420p, settb=AVTB` yields video AND audio durations 21.56, 21.44, 21.52 s, 539/536/538 video frames, and three JPEGs verified with `file --mime-type` plus FFmpeg decode. This is a mechanism-confirming isolated experiment; full 1080×1920 worker/UI validation remains the coordinator's mandatory next stage. The deleted original worker output is unavailable, so its exact video-stream duration cannot be retrospectively asserted.

Evidence: /tmp/n5-support-e2e-20261028/worker-render-02.log; /tmp/n5-thumbnail-diag-20261028/result.log; /tmp/n5-thumbnail-diag-20261028/result-fps-first.log. Experiment scripts remain in that scratch folder. No secrets/config values were read.

## Contract and route

Read `docs/Specification.md` FR-RENDER-003 (fenced, bounded attempts) and `docs/Architecture.md` render component/storage/cleanup contract. Existing `docs/features/pause-compaction/00_brief_codex.md` VALIDATE item 3 explicitly requires the same planned D′ for output `-t`, overlays/music and thumbnail quarter offset; ffprobe is for persisted duration only. Preserve that contract. Existing 25-fps/VFR A/V marker regression remains required. This is a localized correction to satisfy existing output semantics, not a new public contract.

Mechanical ROUTE on initially suspected exec.ts/render-media.test.ts returns M, exit 0 (cache/retries/timeouts lexical lower bound). Conservatively retain M checks for final scope, rerun mechanical ROUTE against final allowlist before implementation. No money/schema/container-boundary/public-route changes. Shared-resource concurrency tests: not_applicable, because the proposed diff changes only per-process FFmpeg video graph construction and media regression; no shared DB/quota/attribution/growth operations change. Existing shared-resource guards must still pass in full suite. E2E preflight: not_applicable during read-only planning; coordinator must perform it immediately before actual E2E.

## Smallest allowlist and implementation

Only two implementation files: `apps/worker/src/render/compaction.ts` and `tests/compaction-media.test.ts`, relative to the project. Move existing FPS normalization before each video trim; preserve audio graph, offsets, constants, timestamps reset after trim, format/timebase, plan/hash/version, render timeout, and watermark ordering. Add a small real-FFmpeg regression in the existing media test file; do not create an engine, schema, spec directory or dependency. No need to edit exec.ts, worker render.ts, render-media.test.ts or render-worker.test.ts unless independent review demonstrates a separate defect.

Use an isolated writing worktree, explicit ownership and a bounded coder attempt. Profile model-routing-econom: separate gpt-6.1-sol medium coder, independent gpt-6.1-sol high reviewer with clean context containing this plan, immutable candidate source/tests and the plan SHA; no author chat/work notes. Coordinator owns integration and project-local telemetry. Proposed coding attempt budget: 12 min; on timeout inspect artifact and report remaining AC/next named executor rather than silently repeating.

## Acceptance criteria

1. A self-contained real 5-fps source with nonzero selection start (60..85 s) and captured ten-piece cut plan produces video duration and audio duration within one 25-fps frame of D′=21.52 s. Assert video stream and frame count independently of MP4 format duration; decode a frame near D′ end.
2. Thumbnail generated by the existing generateThumbnail at D′×0.25 is actual decodable JPEG (MIME and codec/dimensions or full decode), including the formerly failing third selection. The test fails on the original graph, independently of mere file existence.
3. Existing compaction tests, especially VFR five-join A/V marker and audio-only rendering, remain green; no change to K/XF, cuts, source-word timing, persisted duration, contract hashes, retries/fences, quotas, watermark, storage/publish guards or noncompacted behavior.
4. Full project tests, build, typecheck and lint pass against the integrated candidate, with independent review clearing blocker/high findings. Distinguish any unavailable mandatory check from success.
5. Coordinator's allowed local fake-provider pipeline reruns the protected 200-s synthetic source: three selected clips (0..25,30..55,60..85) all finish, with 3/3 real MP4 video+audio tracks spanning planned output and 3/3 actual decoded JPEGs served with correct MIME. Existing local Docker/browser checks show three usable previews/clip cards and no failed selection; bind screenshots/browser receipt and storage/worker logs to exact candidate/build.

## Meaningful verification / delivery sequence

First add regression without production change, run `npx vitest run tests/compaction-media.test.ts -t '<new low-FPS regression name>'`, retain nonzero exit plus old video 4.52 s vs D′21.52 s and failed thumbnail, then reorder filter and rerun green. Mutation evidence: reverting only the FPS/trim order must make that same regression fail; restore candidate and do not rerun unchanged successful suites unnecessarily. Existing captured plan: [[60,62.8],[63.12,65],[65.28,68.04],[68.36,70.28],[70.56,73.32],[73.64,75.52],[75.8,78.56],[78.88,80.8],[81.12,83.84],[84.16,85]]. Generate a small 85+s 5-fps synthetic fixture inside test scratch; do not depend on the external protected file for committed regression. Decode final output near 21.44 s and thumbnail at 5.38 s.

Then run focused compaction/render media+worker suites and existing mutation harness applicable to compaction. Run the complete authorized project `npm test`, `npm run build`, `npm run typecheck`, `npm run lint` with Node22 and existing FFmpeg wrappers. Full integration suite needs the coordinator's existing local DB/S3 environment; this planning agent did not access DB, containers, network or paid providers. No guard/billing/state changes are permitted to manufacture green. Independent review uses the frozen final source and this source-bound plan. Coordinator completes E2E and UI checks and records exact commands/revisions/exits.

No publication/deployment/new access or spend is authorized here. Root coordinator owns next actual launch; this plan is a completed planning deliverable, not a claim that the application defect is fixed. All implementation and delivery AC remain pending.
