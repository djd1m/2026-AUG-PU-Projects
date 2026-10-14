# N8 dimensioned drawing import: bounded reuse and implementation research

Run: 20261014T080942Z-plan-import-8984
Work unit: plan-import-research-1
Attempt: research-1
Role: read-only research / consequential plan advice; integration owner is /root.
Source revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4; N8 source is an untracked baseline, so commit alone does not identify inspected source.
Launch record: plan-import-research-1-launch.json; SHA-256 4db1b4ea562ead36c9cb7693dcc67dcea03107480eee4bfccc654ad77c7292c4.
Formal launch: 2026-10-14T08:10:44.960457+00:00. Dispatch preceded formal record; no start timestamp reconstructed.
Budget: 20 minutes, no extension. Only this new receipt written. No installs, product edits, Docker operations, global changes, paid calls or publication.
Actual model: null (execution model identifier unavailable). Usage and cost: null (counters unavailable).

## Recommended smallest useful result

Privately upload a dimensioned PNG/JPEG/WebP, run real local OCR, show recognized dimension candidates with original text and image boxes, let the user assign length/width and explicitly choose units for unitless numbers, then transfer the values into an editable single rectangular room draft. Height is blank when absent. Openings require explicit entry/review. Only the existing confirmation action creates an immutable shell. This reduces retyping while keeping geometry claims truthful.

A drawing upload is not evidence of detected walls. Do not silently choose the two largest numbers: they may be an overall building extent, area, title-block date, or dimensions from different rooms. Multiroom and irregular outlines exceed existing ManualRoom geometry; label the current operation as one selected rectangular room, with explicit unsupported state where the image cannot supply reliable candidates. A general full-plan image-to-geometry claim would require additional accepted scope and evaluation.

Furniture should remain optional after room/opening confirmation. Existing design catalog and bounding-box fit checks are useful for known dimensions. Furniture OCR and automatic whole-home layout are unnecessary for this import. Current live proposal requires operator authorization/config and spends money; no key or authorization was supplied. Do not represent a demo/manual placement as live AI.

## Local reuse search, completed before GitHub research

Bounded rg searches examined project source paths in 01, 02, 03, 03a, 04, 05, 05a, 06 and 07 for OCR, floor plans, image normalization, upload and subprocess extraction. Missing apps/packages directories were checked by file enumeration instead of treated as implementation. No ready local floorplan OCR or dimension geometry extractor was found.

| Local source | Contract and decision |
| --- | --- |
| N1/N2/N3/N3a | No relevant ready floorplan/OCR donor found in bounded source search; existing ownership/ingress concepts already represented in N8. |
| N4 apps/recognizer/src/provider/live.ts | Vision input + structured output validation pattern, but paid Anthropic integration and food semantics; reference only, no runtime import or provider activation. |
| N4 apps/recognizer/src/photo/normalize.ts and apps/api/src/photo/decode-check.ts | Image resource bounds, Sharp normalization and metadata removal; already adapted in N8, retain current audited dependency. |
| N5 apps/worker/src/media/probe.ts and render/exec.ts | Fixed executable subprocess pattern; N6/N8 wrappers offer stronger resource supervision. |
| N5a | Documentation/source enumeration supplied no current OCR implementation. |
| N6 apps/worker/src/pdf/extract-pdf.ts | Reuse/adapt contract: child process, blank environment, total deadline, RSS, bounded stdout/stderr, structural result validation and close-based settlement. Its PDF text layer parser does not OCR image plans. |
| N7 README.md | Placeholder project, no implementation donor. |
| N8 packages/adapters/src/asset-parser.ts and asset-parser-worker.mjs | Private checked image ingress, one decoder slot, 10 s deadline, RSS supervision, Sharp 20 MP bound. Reuse resource pattern, but OCR needs independent capability/error codes and bounded output. |
| N8 packages/domain/src/space/geometry.ts | Reuse Decimal.js and validateManualRoom; 0.5–50 m sides, 1.5–10 m height; no implicit confirmation. |
| N8 packages/db/src/space.ts | Reuse ownedAsset(account, asset, project), immutable createShell, version conflict and quota handling. Extend provenance carefully. |
| N8 apps/web/src/components/SpacePanel.tsx | Reuse editable room/openings form and confirmation; add focused importer component rather than a second editor. |

Local files are same-owner repository material; no cross-project runtime imports. These are contract adaptations, not wholesale imports of donor locks or dependencies.

## Primary GitHub and official documentation verification

Read GitHub repository metadata, contents, pinned raw files and official Tesseract docs on 2026-10-14. SHA values below are observed remote heads, not installed dependency claims. Nothing was downloaded into the product or executed.

| Candidate | Observed revision / license | Decision |
| --- | --- | --- |
| [tesseract-ocr/tesseract](https://github.com/tesseract-ocr/tesseract) | b2544450ca01407259ed53c870b7e5e4c67f7789; VERSION 5.5.3; Apache-2.0 | Preferred actual offline OCR engine behind a narrow adapter; pin actual image package/build receipt separately. |
| [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) | 87416418657359cb625c412a48b6e1d6d41c29bd; Apache-2.0; eng and rus available | Suitable language resources; packaged versions/checksums must be recorded, no runtime model downloads. |
| [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | a1ca80d9e31c34512d0ded75ff8821ddcf3f2f91; Apache-2.0 | Viable Node/WASM alternative but adds dependency and language/core packaging; native CLI is simpler for the proposed image deployment. Non-text outputs require explicit enablement in recent versions. No PDF support. |
| [GrishaSethi/OCR_Tesseract](https://github.com/GrishaSethi/OCR_Tesseract) | 7beeeb5268e39fa9d5b408a71224b17327b24c3d; GitHub license null, no LICENSE at root | Do not copy. Python/OpenCV/pandas/TextBlob stack is excessive here. Source strips punctuation before classification, assumes unitless meters and has asymmetric feet-pair conversion. |
| [pradhankukiran/floor-plan-scale-engine](https://github.com/pradhankukiran/floor-plan-scale-engine) | 1c902b2c181834647701a95585786f4b26d38fea; README/package badge claims MIT but linked LICENSE absent and GitHub license null | Reference only until licensing resolved. Requires supplied wall polygon and OCR strings, so does not recover geometry from image by itself. |
| [CubiCasa/CubiCasa5k](https://github.com/CubiCasa/CubiCasa5k) | c34440266665a11f4484eb06cd2e4b7d72ad76c1; LICENSE CC BY-NC 4.0 | Reject for this bounded delivery: noncommercial terms and historical Python/PyTorch/CUDA pipeline; metric accuracy not established. |
| [grebtsew/FloorplanToBlender3d](https://github.com/grebtsew/FloorplanToBlender3d) | 2da4c9532e9866b025c67aee17f87ff7e0b8db98; GPL-3.0 | Reject for this scope: Blender/OpenCV stack and geometry conversion are much larger than the current domain need. |

[Official CLI documentation](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html) provides TSV word rows with text, confidence and coordinates. [Official quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) supports trying sparse text PSM 11, image rescaling, deskew, modest white borders and dictionary disabling for non-word content. These are implementation hypotheses to verify on fixtures, not measured N8 accuracy.

## Module, parsing and UX contracts

- Domain module: pure dimension parsing and candidate types under space public export. Preserve raw text, box coordinates, engine confidence and explicit unit provenance. Confidence concerns recognition, not association with a particular wall or physical accuracy.
- Adapter: fixed native executable/arguments with TSV parsing; return bounded candidates and image size. No shell, URL fetching, filenames from user strings, arbitrary executable path, network AI or dynamic code.
- API: guarded POST using an existing owned ready image ID and project ID. Guard/rate/ownership before body consumption or OCR. OCR does not need to mutate the project or hold a database transaction. Reuse the existing save-shell command for confirmation/version checks.
- UX: preview original drawing with selected OCR evidence; choose length and width from candidates; edit detected values; explicit unit selection for bare numbers; clear all old confirmation/default geometry when applying draft. Keep user edits on recoverable error. Disabled/not-available states must explain missing OCR capability.
- Strict metric conversion: support decimal dot/comma and explicit mm/cm/m plus Cyrillic equivalents; Decimal.js conversion yields canonical metre strings. Bare 4500 requires explicit unit choice; do not infer millimetres solely from magnitude. Reject unsupported imperial strings with actionable guidance unless deliberately implemented/tested.
- Reject area labels (m2, m², кв.м), scale ratios (1:100), signed/exponential values, dates and unsupported fractions as side dimensions. Do not remove arbitrary punctuation or replace O with 0 silently. Preserve ambiguous 4.500/4,500 text for review.
- Adjacent tokens may encode 4.5 + m or 4500 + мм; merge only within the same OCR line with bounded gap, retaining combined evidence. Multiword room labels never become dimensions.
- Rotated vertical dimension labels are common: either a bounded second 90-degree OCR pass with boxes mapped back into original coordinates, or a visible rotation/retry action. Whole-image coordinate transforms and deduplication need tests.
- Existing manual createManualShell forces sourceAssetId=null; repository transaction currently accepts sourceAssetId only when kind=glb. Retain image provenance by extending both the domain and owning transaction consistently; canonical hash should bind retained source identity. Never merely accept and discard sourceAssetId.
- Current SpacePanel defaults 6×3×2.7 and old openings: importer must clear guesses and reset confirmation. An omitted height remains unknown, not 2.7 m. Existing opening list must not carry over to a different imported room unnoticed.

## Security and operational limits

Run native Tesseract directly where feasible, with a minimal environment and OMP_THREAD_LIMIT=1. Bound total wall time, resident memory, stdout, stderr, pixel count, word/candidate count and concurrency. Release slots after process close and clean temporary artifacts after all outcomes. Use normalized, owned, validated asset bytes and fixed opaque file paths. Include abort/crash/unavailable errors; none may report a successful empty extraction.

A Node child that spawns native Tesseract creates a supervision trap: watching/killing only the Node PID neither bounds the grandchild RSS nor guarantees native process termination. Avoid nested children or supervise the whole process group. Long synchronous Sharp preprocessing in the main server is also outside the established decoder isolation; keep it bounded/isolated.

N8 normalization currently outputs WebP quality 90. Tiny labels may degrade through lossy normalization; Leptonica WebP support depends on build codecs. Verify actual packaged codec and clean drawing OCR in the final runtime. Any PNG conversion or upscale must retain decoded pixel/memory limits. No claim of successful native OCR is made by this research.

## Required meaningful checks for implementation owner

1. Real engine fixture: dimensioned drawing with decimal metric dimensions; recognizes expected raw dimensions and transfers correct metres into editable draft. Distinguish synthetic fixture success from real-user-image accuracy.
2. Real rotated label fixture or explicit rotate workflow; correct displayed evidence boxes and duplicate handling.
3. Unit/area/scale ambiguity: 4500 mm, 450 cm, 4.5 m, 4,5 м, unitless 4500, 18 m², 1:100, low-confidence text, multiroom candidate choices; no automatic confirmed dimensions.
4. Missing height/default clearing, malformed/empty OCR, parser unavailable, crash, timeout, stdout overflow and concurrent slot rejection; prior shell unchanged on every failed extraction.
5. Unauthorized actor, wrong project image, reference/GLB mismatch, archived project, origin/rate guards, oversized body/file/pixels and secret-free child environment.
6. Successful explicit confirmation creates a new immutable shell with drawing provenance; editing draft does not mutate prior shell; stale version fails; old budget invalidation remains correct.
7. Browser end-to-end upload → evidence → dimension choice/edit → height/openings review → confirm → 2D/3D dimensions, including narrow viewport and keyboard flow.

## Evidence boundaries

This unit ran read-only source enumeration/searches, source reads, SHA-256 reads, primary web searches and GitHub HTTP metadata/raw-file reads. No implementation tests, OCR smoke, accuracy benchmark, package audit or deployment check were run. The first GitHub metadata script failed because command python was unavailable; rerun with python3 succeeded. That is a tool invocation correction, not a product test.

Inspected N8 file SHA-256 values:
- asset-parser.ts: a9c275f36a34ec5bcf4406103dab68f1694c7f05a19b580da3977b5d452e95ab
- asset-parser-worker.mjs: 10a9f8e044b39268838cc4333f1a5f3a3225da3789abdf0ebdff559dee1507ad
- space/geometry.ts: f1a0c793ec97c9d9098ca3a0ca0c826d0e1f9097269294bcbb70af3b5113c861
- db/src/space.ts: 0bcd7126756457e715ad049f1fecd8a9c64edb0d8cbe1e6a8f44a77676c6fed5
- SpacePanel.tsx: 001680e9c6af4281b14b14e280f823688e12b34b183aa21473a0f3275b401d23
- N6 extract-pdf.ts: a5a302630a9378d821fa1b964dd0905c4cccc8b0422c3aec89a25217bbbbc061
- N4 provider/live.ts: 41f74a379be96c83ac5459d9d0c5f21c35010b24522f6807a76e7e5138ba7724

Receipt completed at: 2026-10-14T08:15:53.603949+00:00

Status: completed
