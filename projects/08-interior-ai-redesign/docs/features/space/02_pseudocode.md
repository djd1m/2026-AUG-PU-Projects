# space — algorithms

Logical data/ports/API source: ../../Pseudocode.md (exact current hash af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59). No second model list/schema.

### Algorithm: CalibrateSpace
REQUIREMENT: `FR-space-1`
REQUIREMENT: `AC-space-1`
REQUIREMENT: `AC-space-2`
REALISES: SC-US-003-1, SC-US-003-2
INPUT: ManualRoom or ready owned GLB + anchors/measurement/confirmation. OUTPUT: new immutable shell.
1. GuardRequest; validate positive finite bounded decimal dimensions/anchors. Manual: validate openings in walls and pairwise no overlap; derive floor area length×width exactly.
2. GLB: validate nonzero anchor distance, compute uniform scale=measured/distance; no automatic geometry repair. Compare additional anchors after scale; require explicit tolerance and delta≤tolerance when present. Show control data and require owner confirmation; floorArea remains null unless separately entered/confirmed.
3. Persist normalized transform and immutable source hash, derive shell hash from canonical geometry/calibration; transaction CAS Project.currentShellId/version. Prior design approval becomes ineffective by shell mismatch; clear currentBudgetId. RETURN revision + limitations.
COMPLEXITY: O(openings² + anchors), counts bounded.


### Algorithm: StorePrivateAsset
REQUIREMENT: `FR-space-2`
REQUIREMENT: `AC-space-3`
REQUIREMENT: `AC-space-4`
REQUIREMENT: `AC-space-5`
REALISES: SC-US-004-1, SC-US-004-2, SC-US-004-3
INPUT: owned project, bounded stream, declared kind. OUTPUT: ready Asset or typed refusal.
1. GuardRequest pre-body-only returns actor after auth/rate/Origin/owner/header checks without any body consumption. Uploader is the only stream reader; enforce actual streaming byte limit even without trustworthy Content-Length. Write private random temp path with exclusive mode; never use submitted filename as path.
2. In bounded parsing task inspect magic/dimensions/mesh resources; GLB validator + explicit URI/extension/count checks, image decode/reencode strips EXIF. No remote asset fetch; fail/timeout cleans temp, never marks ready.
3. Preserve original bytes at random originalKey. Images write separate reencoded normalized/thumbnail bytes at random normalizedKey and verify both hashes/files before readiness; GLB retains its validated original key without a fabricated normalized image. Account→Project transaction rechecks owner/version/reservation and sets ready only after required keys exist, settling storedBytes to actual total. Any parse/write/CAS/DB failure cleans both original and normalized keys plus pending reservation best-effort; stale pending cleanup settles leftovers. Orphan cleanup only unreachable keys older than grace period; no arbitrary path input. Serving requires owned DB asset lookup and fixed MIME/nosniff, not raw public path.
COMPLEXITY: O(bytes + primitives), hard limits/deadline.


### Algorithm: SaveReference
REQUIREMENT: `FR-space-3`
REQUIREMENT: `AC-space-6`
REQUIREMENT: `AC-space-7`
REQUIREMENT: `AC-space-8`
REALISES: SC-US-005-1, SC-US-005-2, SC-US-005-3
INPUT: note/tags and owned asset or public URL. OUTPUT: Reference.
1. GuardRequest; validate bounded note/tags, exactly one assetId or sourceURL, HTTPS no userinfo and supported absolute URL. Do not fetch URL.
2. Verify linked asset same project, rights flag for image use. Save provenance/observedAt and original canonical input URL (including owner pin path), not vendor homepage; render escaped text and safe external link.
3. IF Pinterest import requested RETURN CAPABILITY_DISABLED with upload/link alternative, preserving existing reference.
COMPLEXITY: O(input bytes), bounded.


