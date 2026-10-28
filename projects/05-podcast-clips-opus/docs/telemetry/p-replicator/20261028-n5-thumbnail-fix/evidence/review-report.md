# Independent cold source review: N5 thumbnail correction

Verdict: CLEAR FOR THE SCOPED SOURCE CHANGE. No blocker, high, medium, or low defect is substantiated by this review. This is a source-review verdict, not a measured runtime PASS or completion of the application acceptance criteria.

- RUN_ID: `20261028-n5-thumbnail-fix`
- WORK_UNIT_ID: `thumbnail-review`; attempt: `review-01`; reviewer family: `codex`.
- Frozen source revision supplied by coordinator: `d6fee35f52926c6b64fa4c79d238859548c8ddff`.
- Snapshot: `/tmp/n5-thumbnail-review-20261028`; all 15 source-manifest file hashes were independently recomputed and match.
- Source-manifest SHA256: `fe68db8916527cb44a10c1fd53af20e57da73361f8a1b85c10e179ad89b9b11d`.
- Plan SHA256: `7bf903e562290852581a9e1053bf9d17d690de5c5dbbe62ff4889afb47b7584e`.
- Addendum SHA256: `4be6c6ecdf29f9f626ee58439bbbd1bc62ba714108cdedef152ec4910820745d`.
- Candidate-diff SHA256: `e7a3e706f77b53af33424211de29620e06ea2cbda5d148d2119b9a9204de5100`.
- Launch SHA256 supplied for binding: `96af20226b68d1a58642412de695d113cf4b58803e6ae0c25b45d834f80dab99`; launch receipt itself was not opened.
- Context isolation: read only the immutable snapshot, coordinator's fresh task packet, and original brutal-honesty-review skill. No author chat/work notes, mutable checkout/build, runtime receipts/logs/outcomes, private configuration, secrets, network, containers, or new dependencies were used. The review uses direct technical criticism without manufacturing findings to meet the skill's quota.
- Profile: `model-routing-econom`, native M direct bugfix. Requested reviewer model/effort: `gpt-6.1-sol` / `high` per task/plan. Actual exact model/effort and usage: null because host execution metadata is not exposed to this child. No new SPARC feature or scope is introduced.

## Mechanism and preserved behavior

`apps/worker/src/render/compaction.ts:75-85` now normalizes the seek-relative video timeline to 25 fps before each trim. That lets the FPS filter use frames preceding an interior cut to represent its 25-fps boundary instead of trimming those frames away first. Per-segment `setpts=PTS-STARTPTS`, pixel format, AVTB time base, two-frame crossfade, and elapsed-length offset calculation remain intact. Audio `atrim`/timestamp reset/format/acrossfade are unchanged. The change addresses the diagnosed supply of too few video frames to chained xfade offsets without changing the planned duration or audio clock.

Timestamp assessment: production `renderClip` still uses input `-ss start`, input `-t sourceDuration`, and no `-copyts`; trims stay relative to that sought input. The new test uses the same `-ss 60 -t 25` convention. FPS does not replace the post-trim timestamp reset. For VFR, each branch still reaches xfade with constant 25 fps, matching time base and zero-based PTS; the existing five-join marker test remains the relevant A/V drift check. A nonzero selection start is covered in source. Arbitrary raw input PTS offsets are not independently exercised by the new fixture; this review does not claim an extra nonzero-origin media run or universal correction of malformed/discontinuous input timelines.

`tests/compaction-media.test.ts:85-130` is a meaningful real-media regression. It generates its own 86-second 5-fps video and audio, uses the captured ten-piece third plan, asserts D'=21.52, probes VIDEO and AUDIO stream durations separately from container duration, and counts decoded video frames. It also decodes an RGB video frame at D'-0.08 (21.44 seconds). Thus a full-length audio stream cannot disguise truncated video. The quarter-offset thumbnail comes through production `generateThumbnail` and is checked by MIME, MJPEG codec/dimensions, and full RGB decode, rather than file existence. Its 64x114 fixture and 360x641 thumbnail are deliberate small test dimensions, not evidence of full 1080x1920 pipeline success. Soft assertions allow old-graph failures to continue to the formerly failing thumbnail path. The required old-order mutation is specified by the plan; its runtime result has not been read or measured by this reviewer.

The only other change is the existing graph-order literal in `tests/compaction.test.ts:26`, exactly as the addendum allows. The diff changes no constants, plan selection, mapTime, subtitles, face mapping, music, contract/version/hash construction, probing, retries, fencing, billing/quota, storage, watermark decision, or watermark ordering. `renderClip` bypasses this graph for absent/single-piece plans, and its audio-only path emits no video compaction branch. Worker thumbnail timing remains planned D' x 0.25, while persisted duration remains the probed rendered format duration. The existing worker's fenced publication and video/mp4 plus image/jpeg upload paths remain untouched. No unrelated edits or optional polish are requested.

## Acceptance criteria assessment

| AC | Source assessment | Runtime observation in this review |
|---|---|---|
| 1: 5-fps, nonzero selection, ten cuts, independent video/audio/frame count and near-end decode | Implemented by the self-contained regression at media-test lines 85-118; expected D'=21.52 and one-frame bounds are explicit. | Unobserved; no test or FFmpeg probe was run. |
| 2: actual decodable production-generated quarter JPEG and old-graph failure | Implemented at lines 119-128 through real generateThumbnail, MIME/probe/full decode; existing generator is unchanged. | Unobserved; old-order RED and candidate GREEN must come from coordinator's exact-source run/mutation evidence. |
| 3: VFR marker/audio-only/noncompacted and all preserved invariants | Existing VFR five-join marker, audio-only render, render argument, and worker contract tests remain present. Scoped diff preserves the relevant semantics described above. | Existing tests not run; no claim they are green. |
| 4: full tests/build/typecheck/lint and independent review | This independent source review clears findings for the frozen candidate. | Full suite, build, typecheck, lint and applicable mutation harness unobserved; coordinator owns required execution. |
| 5: full local 1080 pipeline 3/3 MP4/JPEG and Docker/browser usable cards | Test scope does not substitute for this AC. No source obstacle found in the scoped correction. | Entirely unobserved; coordinator must provide exact-build/source-bound tracks/duration/decoded JPEG/MIME/UI receipts. |

Required next owner: root coordinator. Complete the mandatory runtime and local delivery checks in the accepted plan, reconcile any concrete failures, and bind their receipts to this exact source (or obtain review for changed source). No deployment, publication, new access, spend, or extra scope is authorized by this review.
