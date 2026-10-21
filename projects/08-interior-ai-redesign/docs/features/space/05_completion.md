# space — criterion coverage

The integrated implementation has independent review closure. This document maps every feature criterion exactly once to the best existing literal test title; final production-browser evidence is recorded below.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-space-1 | tests/space/repository.test.ts | SC-US-003-1 shell hash stable, old shell immutable, update creates new revision |
| AC-space-2 | tests/space/geometry.test.ts | accepts exact bounds, touching openings, rejects overlap/outside/duplicate IDs |
| AC-space-3 | tests/space/parser.test.ts | SC-US-004-1 decodes image, strips EXIF, preserves original hash and correct orientation |
| AC-space-4 | tests/space/parser.test.ts | rejects malformed GLB, corrupt image and decoded pixels >20 MP |
| AC-space-5 | tests/space/repository.test.ts | SC-US-004-3 owner and same-project checks reject known foreign assets, pending never served |
| AC-space-6 | tests/space/repository.test.ts | SC-US-005-1/3 stores exact owner pin and reference provenance, no asset/source mixing |
| AC-space-7 | tests/space/http.test.ts | SC-US-005-2 Pinterest import disabled with useful alternative and no write |
| AC-space-8 | tests/space/repository.test.ts | SC-US-005-1/3 stores exact owner pin and reference provenance, no asset/source mixing |

## Evidence boundary

`implementation-receipt.md` records 52 distinct SPACE cases after focused corrections. `review.md` records an independent 5 files / 52 tests pass and a focused 2 files / 3 tests UI closure; SPACE-R1 and SPACE-R2 are closed. For `AC-space-1`, the mapped PostgreSQL test proves the 18 m²/stable immutable shell portion and `tests/space/ui.test.ts` proves plan visibility. The image-8 journey additionally passed actual WebGL, isolated image decode, malformed-GLB rejection, GLB calibration/reload, no-egress Pinterest save and usable-plan fallback. GLB fixtures are synthetic; no actual Scaniverse device sample is claimed.
