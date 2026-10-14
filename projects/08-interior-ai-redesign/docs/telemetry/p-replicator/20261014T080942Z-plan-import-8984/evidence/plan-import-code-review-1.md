# Independent code review / anti-drift: floorplan import

Run ID: 20261014T080942Z-plan-import-8984
Work unit ID: plan-import-code-review-1
Attempt ID: code-review-1
Source revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4; untracked implementation bound by hashes below.
Build revision: null (not supplied; runtime/build proof pending)
Launch record: plan-import-code-review-1-launch.json
Launch SHA-256: ed146f41cc6344441610f42496919698e7c56213e1b4df9d3cfa47557c67840b
Launched: 2026-10-14T08:28:33.951855+00:00
Finished: 2026-10-14T08:31:58.199565+00:00
Duration from formal launch: 204.248 seconds
Actual model: null (authoritative execution metadata unavailable)
Usage/cost: null (counters unavailable)
Verdict: CHANGES REQUIRED — CR-P01, CR-P02, CR-P03

One bounded review pass, 15-minute budget, no extension. Read only the assigned specification, changed source and new targeted tests/fixture/native-check script. The research and plan-review receipts were not modified. No product writes, installs, Docker actions, global changes, external research or full application/test reruns.

## Concrete findings

### CR-P01 — P2: ordinary area/scale tokens survive as side dimensions (AC-P02)

Location: packages/domain/src/space/floorplan.ts, extractDrawingDimensions, lines 15–22 in inspected snapshot.

Direct execution of the actual pure parser via node --import tsx reproduced:

- Same-line words `18`, `кв.м` produce numeric candidate `18` instead of excluding the area.
- Same-line words `18`, `м`, `2` produce `18 м` and a separate `2` candidate. OCR may split the square exponent this way.
- Same-line words `Масштаб`, `100` produce candidate `100`: JavaScript word boundaries around Cyrillic text do not implement the intended Russian label match.

The user still chooses and confirms dimensions, which limits impact, but these results violate the explicit area/scale exclusion contract and can lead to incorrect measurements. Use Unicode-aware scale boundaries and bounded recognition of common adjacent area suffix sequences. Add focused parser cases. Keep low-confidence neighboring context for exclusion rather than deleting it before interpreting a confident number: both worker and domain currently filter low-confidence words before context analysis. Unknown or weak unit context must not silently become a confident inferred metre value.

### CR-P02 — P2: a distant same-line unit is automatically attached (AC-P02)

Location: packages/domain/src/space/floorplan.ts, nextText/unit selection, lines 20–26.

Actual parser repro with candidate `4.5` at x=.1, width=.05 and token `м` at x=.9 on the same OCR line produces explicit `4.5 м`. The function checks next-array position and line identity but no geometric proximity. A line containing multiple annotations can therefore inherit another label's unit, bypassing explicit unit selection and changing conversion.

Require bounded visual adjacency appropriate to OCR orientation before binding a separate unit, or retain the number as unitless. Preserve the merged unit's confidence and evidence when binding; currently the candidate retains only the numeric word's confidence and box. Test far and near unit tokens, including rotated coordinates. Do not add a general geometry-inference system.

### CR-P03 — P2: native per-pass timeout loses the typed timeout result (AC-P04)

Locations: packages/adapters/src/floorplan-worker.mjs line 7; packages/adapters/src/floorplan.ts line 21.

The native pass timer fires after 6000 ms; both that timer and stdout overflow set the same boolean and reject `OCR_LIMIT`. Parent mapping handles only `OCR_UNAVAILABLE` specially, mapping `OCR_LIMIT` to generic `INVALID_DRAWING`. Thus native timeout is reported as an unreadable drawing rather than `DRAWING_TIMEOUT`; the existing timeout test exercises the separate parent deadline, not this branch.

Preserve distinct native timeout and output-limit codes through the worker and parent, with actionable typed messages. Add a focused controlled-worker-message mapping test and, where feasible, a deterministic native-wrapper overflow/timeout check. This finding is from source control flow; no actual installed Tesseract timeout was run on the host.

## Positive boundary and anti-drift checks

- Domain parsing remains pure; adapter and web implementation do not enter domain imports. Parsing emits selectable candidates without assigning room roles or confirming geometry.
- Fixed native `/usr/bin/tesseract`, argument array, stdin image bytes, stripped environment and no arbitrary URL/executable input avoid command injection and provider/secret leakage in normal operation.
- OCR reads only an owned ready asset selected by ID; route checks project/auth/Origin/version before JSON body and 5-per-actor drawing admission before extraction.
- Original image bytes are hash-checked, size-checked and decoded with Sharp's 20 MP limit, then processed in an isolated worker. OCR has at most three rotations and a 20-second parent deadline.
- Detached worker group and group SIGKILL cover the native grandchild; aggregate worker/native RSS is sampled against 256 MiB. Shared withAssetParserSlot covers both upload decoding and OCR, releasing after operation settlement/child close.
- Slot, malformed-result/secret-env and native-grandchild RSS/group-kill tests are meaningful. Their actual pass results were not independently rerun by this reviewer.
- Manual shell source image is checked before append and revalidated as owned-project, ready, allowed image kind and rights-confirmed inside the owning transaction. Canonical content includes source identity before hashing; history, optimistic version check and budget invalidation are retained.
- UI makes furniture optional, uses explicit selections and unit choice, clears imported height when absent and old openings on application. Applying draft and editing dimensions/openings clear confirmation. Existing manual/GLB/editor components are reused.
- Native check script uses an actual synthetic PNG with horizontal/vertical/height labels and checks rotated evidence coordinates plus a blank image. This is suitable bounded acceptance evidence once run; it cannot establish real-user-drawing accuracy.

## Validation gaps and closure requirements

No full regression, build, lint, browser, AXE, deployment or native Tesseract execution was performed by this review. Root reported an initial targeted run of 10 passing tests and one assertion mismatch (PostgreSQL version integer versus string), with its correction pending at dispatch; this review does not convert that report into an independently verified pass. AC-P06 remains open until root records actual required results against the final corrected source/image.

Tests inspected do not yet exercise CR-P01 common area/scale variants, CR-P02 distant unit binding or CR-P03 per-pass failure mapping. Fix these concrete findings, run affected checks, and request a bounded closure review. No new exploratory research or optional UI polishing is requested.

## Source hashes captured before receipt

These hashes identify the inspected pre-correction snapshot; concurrent coordinator corrections after capture are outside this verdict.

```
e4a1ed0ff6b6156f6f935d072debee3dd82ec1b0b48249965eadf43979ef65d7 docs/features/floorplan-import/01_specification.md
8108bc79339fd22023206c6f64646ec2512383459dcf5b976082f42c6bdc21a8 packages/domain/src/space/floorplan.ts
ea6174ac42f8c7bc2920d810afc98095f436124535c1d1b81b172ed83e5978e9 packages/domain/src/space/index.ts
ad0c14f38569fad2632cf6a0af6b661686346d095313ed9a5bf40a936b961d6b packages/adapters/src/floorplan.ts
d2d360cb1ff46a8c5985b3586cfb4f53be02d2cd3aee7580777deaf6ae6a3cf8 packages/adapters/src/floorplan-worker.mjs
76103600c07d08ae512c9d228008c02f4871c1e9227e09de4692687f06781649 packages/adapters/src/asset-parser.ts
c8ab359160c06f3a9a18af395a820d3623960280b38318bf9ccc60502c228407 packages/db/src/space.ts
e35e6718ae1972c51252a794397431ca562930d5b41da6c9cf2f629a96975bd1 apps/web/src/server/space.ts
70a6d5bd4079dd7555ebd6681a3285193021d95778bc700e0f76fa9f44b8db1b apps/web/src/app/api/projects/[projectId]/drawing/route.ts
5e5694ade30da8d240e66de3da96f5d97b660603ede37922fd107dfb32877a27 apps/web/src/components/DrawingImport.tsx
7ef6611450d2659fe4445db79bc5b52d9415afcdc2b08178018004bf2d001771 apps/web/src/components/SpacePanel.tsx
4fa789921d6a31a286426ff719fd91c118cb2cea2b0f8c608718c3d57ec0b30a apps/web/src/lib/upload-asset.ts
030a169348d0ad6020fda4437866f193950d0176cb8b20fb667b1b5469f1dfe8 apps/web/src/app/globals.css
fbec2c4408ee14411ec44d581f571e466c25f2f53deed2a398f623a179646e43 Dockerfile
b14b9615786e112f96c9b1027f7b6ae9e5d7e9f6af49572c099e534cad052c8b tests/space/floorplan.test.ts
1ac345963f4b385db05a0448e7d607a756266267a5514417927fe98125b62223 tests/space/floorplan-child.test.ts
a55620fae774f95bbaccca1b343dcbc5bbb69273ebee0255cc7e3d55710236d7 tests/space/floorplan-http.test.ts
a3be1f20798dcacc6827eb10b63eeb3162da09cf78e87a9e16a4180d21d2f0f0 tests/space/drawing-fixture.ts
29c2efbe832859c3d91c7c2d4ec465388a5b7fb4e045108b904298d4e2fe2f65 scripts/floorplan-native-check.mjs
```

Status: completed
