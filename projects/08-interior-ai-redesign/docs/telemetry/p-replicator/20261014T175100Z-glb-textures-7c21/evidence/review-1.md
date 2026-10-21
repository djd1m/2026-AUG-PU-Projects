# Independent GLB texture review

Run-ID: 20261014T175100Z-glb-textures-7c21
Work-Unit-ID: texture-review-1
Attempt-ID: 1
Source-Revision: e00dfdcc1c8df0fea7d5bb0f1168dd0462352c2a
Launch-SHA256: 252c79e254a45c1e3be3521ecd4b0a69addc8652b98c0ea2a7f84680f03d12fb
Finished-At: 2026-10-14T17:55:15.796466+00:00
Verdict: changes_requested
Requested-Model: gpt-6-astra
Actual-Model: null (no host-confirmed model identifier available)
Usage: null (no host token/cost counters available)
Elapsed-From-Launch-Seconds: 102.390
Review budget: 5 minutes; one bounded static pass; no test reruns.

## Finding

**P2 — contradictory normative texture limit.** `docs/Architecture.md:121` still requires embedded decoded image total≤20MP, contradicting its amended security section at line94, amended Specification at line206, and implementation accepting 134217728 aggregate pixels. Update this existing invariant to 8192 per side and 134217728 aggregate. `docs/Refinement.md:10` should qualify >20MP as standalone images so the failure oracle does not contradict newly accepted GLBs. No code blocker identified in the reviewed snapshot.

## Review evidence and limits

- Inspected all six launch-bound files plus parser supervisor, upload transport, and viewer load/error path; compared production diff against unchanged security envelope.
- All image metadata/dimension/aggregate checks precede pixel decode. Buffer views are validated before extraction. Decode runs sequentially with a 1×1 output; unchanged URI rejection, geometry limits, byte limits, standalone20MP, single parser slot, deadline and native RSS supervision remain active.
- 1×1 output limits returned pixels; it does not prove native codecs never allocate a full-resolution internal buffer. Existing 512MiB RSS monitoring and deadline can reject demanding progressive/interlaced encodings. General 8K compatibility and exact owner Scaniverse asset remain unproven by static review.
- Inspected tests for real8192-square JPEG/PNG acceptance, standalone rejection,8193 side rejection,3×8K aggregate rejection, original hash preservation and truncated JPEG rejection. Parent reports focused20/20; this reviewer did not rerun tests or certify pending full-suite/build/browser results.
- Shared uploader selects uploaded GLB for calibration and removes the duplicate GLB-only form. Source metadata additions do not mutate embedded texture or mesh bytes.
- Applied bounded-work lesson: one implementation review; only concrete contradiction requested; no new workflow engine, optional polishing or broad reruns.
- Companion receipt verification used only for source-bound handoff. E2E preflight not_applicable: this reviewer executes no E2E.

## Launch source hashes

- `apps/web/src/components/SpacePanel.tsx`: `d79d51dca1b7b5dc45edf48dce02eeac8d363e2446107aac42b9028a1997da58`; current-at-receipt: `d79d51dca1b7b5dc45edf48dce02eeac8d363e2446107aac42b9028a1997da58`; MATCH
- `packages/adapters/src/asset-parser-worker.mjs`: `f88bf541628a283bf0bde9573d8ab4e5f640501a8ab0cb4badc71d62b42919c4`; current-at-receipt: `f88bf541628a283bf0bde9573d8ab4e5f640501a8ab0cb4badc71d62b42919c4`; MATCH
- `tests/space/parser.test.ts`: `5f326aea261d3f6c3e4d5b8000547339ad8044a6794d8bc9599f1d0c49066a49`; current-at-receipt: `5f326aea261d3f6c3e4d5b8000547339ad8044a6794d8bc9599f1d0c49066a49`; MATCH
- `tests/space/fixtures.ts`: `ebb7404bbc68fc9b5e5a71d7949ed843a2c245bf4d0ad5d6a3df3871dd1d8a4f`; current-at-receipt: `ebb7404bbc68fc9b5e5a71d7949ed843a2c245bf4d0ad5d6a3df3871dd1d8a4f`; MATCH
- `docs/Specification.md`: `78cc13f57489ae6e3b003328467339af90febe1309fc10baff2df38f74e37474`; current-at-receipt: `78cc13f57489ae6e3b003328467339af90febe1309fc10baff2df38f74e37474`; MATCH
- `docs/Architecture.md`: `8d30b2a82ed5b9e3d4d3c9d915cec605a31121aad2591cd98b4a87c8dd75eb73`; current-at-receipt: `8d30b2a82ed5b9e3d4d3c9d915cec605a31121aad2591cd98b4a87c8dd75eb73`; MATCH

Status: completed
