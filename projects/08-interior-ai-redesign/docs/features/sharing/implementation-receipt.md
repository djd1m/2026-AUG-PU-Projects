# F6 sharing backend implementation receipt

RUN_ID: 20261013T220722Z-sharing-0e60
WORK_UNIT_ID: sharing-author-1
Canonical project: /home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign
Author project: /tmp/n8-sharing-author-20261013/projects/08-interior-ai-redesign
Source baseline: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4 plus parent frozen snapshot
Canon SHA256: 70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d
Launch SHA256: dc6c2cb5611845f968dbfc0bebb01db2f39cada2386159edc59fd4a5af881694
Profile: compact-quality-first-v2. Tier XL inherited approved plan; no new approval, spend, deployment or schema expansion. Requested gpt-6-astra/high; actual model/effort null because no authoritative host metadata. Usage/cost null, no estimated savings claim.
Started: 2026-10-13T23:41:01.839524+00:00
Backend finished: 2026-10-13T23:58:15.469935+00:00
Measured elapsed_wall_ms: 1033630; active_wall_ms: null (wait intervals not independently instrumented).

## Implemented

Pure sharing contracts; server-only asset reservation/finalization with immutable design ID/hash and normalized image hash/schemaVersion/exact boolean watermarked; owner PNG export and preview; publish/revoke/list; random32-byte token stored only as hash, seven-day TTL; every public page/image checks current project/account/link and paid entitlement. Account→Project publication locks serialize with verified refund. Paid export completion and private delivery recheck current entitlement. Public image bytes are hashed on read; disk forgery also blocks publish. Raw uploads are deleted, only normalized PNG retained.

Existing Space filesystem helpers, pending reservation release, cleanup sweep, owner/Origin/rate/JSON guards reused. Quotas include pending bytes: count64, project200MiB, account1GiB; exporter reserves20MiB for input/output and settles actual retained PNG bytes. Upload10MiB/10s, raster-only PNG/JPEG/WebP, Sharp20MP, one decoder child,256MiB V8/512MiB RSS,10s external kill and8s Sharp timeout. Fixed N8 watermark is composited unless current server entitlement allows removal. Metadata EXIF/ICC are stripped. Server does not claim to detect private words or photographs baked into pixels: root UI must render scene-only equal-camera before/after, show preview and explicit rights confirmation.

Allowlisted minimal events and hashed dedupe keys; fixed30-day readonly report returns exact observed counts or status unknown/counts null on storage failure. Public page sets signed30min HttpOnly/Lax attribution cookie without source IDs/token. Root must count new_project_from_share only after actual successful project creation and valid signature; URL query is merely a UI hint.

## Public integration contract

- POST `/api/projects/:p/exports`: raw PNG/JPEG/WebP body; Cookie, exact Origin, If-Match projectversion, X-Design-Id UUID, X-Rights-Confirmed:true. Returns201 `data:{id,designId,imageURL,watermarked,width,height}`, meta.version/ETag. GET same endpoint returns `data.items`.
- GET `/api/projects/:p/exports/:assetId`: current owner and entitlement, actual hash-verified PNG, no-store/noindex. Generic Space asset route MUST refuse share_image (root owns this guard; author snapshot does not claim it integrated).
- POST `/api/projects/:p/shares`: JSON `{designId,assetId,caption,rightsConfirmed:true,previewConfirmed:true}`, same owner/Origin/If-Match. Returns201 `data:{id,url:'/s/<token>',expiresAt}`, meta.version. GET returns owner descriptors without raw token recovery. DELETE `.../shares/:shareId` returns data.revoked and newversion.
- GET `/s/:token`: standalone dynamic HTML with image, chosen escaped caption and start-own-project link only. GET `/api/shared/:token/image`: guarded frozen PNG. Both successful/failed responses no-store/noindex/no-referrer.
- `createSharingRepository(pool).assertExportAccess(actorId,assetId,projectId?)` returns internal validated AssetRow; `readExportImage(assetDir,asset)` hashes exactly the bytes returned.
- `firstDesignViewed(actorId,projectId,designId,requestId)` and `newProjectFromShare(actorId,projectId,requestId)` are internal owner-bound deduped ports. Root wires actual UI event/project creation.
- `validShareArrival(request,secret,now?)` from server/sharing validates signature and30min TTL of n8_share_arrival. Clear cookie after actual attributed creation. `growthReport(pool,until?)` provides known/unknown fixed-window report; root owns operator CLI.

## Evidence and limitations

`tests/sharing/checks/results.json` records commands and known measurements. Typecheck, lint and build passed. Focused4files/25tests passed (26.34s); full author snapshot29files/208tests passed (65.40s). `tests/sharing/checks/full-suite.txt` and `build.txt` hold actual output. Next build emits pre-existing notice about missing Next ESLint plugin; standalone strict lint passed.

Three meaningful guard mutations produced assertion failures: watermark disabled; rights literal broadened; actual project ID inserted in public HTML. Evidence in `tests/sharing/mutation-evidence/`. Source restored and full suite/build rerun afterward. Initial watermark mutation accidentally swallowed a brace and failed parsing; script rejected it as insufficient evidence, corrected it, and reran the semantic mutation. This failure is disclosed, not counted among the three validated mutations.

Named tests cover private ownership, preview/rights, token entropy/hash/TTL, every resolver after revoke/archive, immutable provenance/share identity, actual EXIF removal/watermark pixels, current entitlement/refund, two PostgreSQL independent lock barriers, pending quotas/storage release, stale cleanup, original upload deletion, failed commit cleanup, slow upload no held DB client, strict raster/no arbitrary external photo, byte forgery, public DTO/escaped caption, rate59+20 =>1 success/19 denied, concurrent event dedupe, exact0/1/unknown reporting, signed cookie forgery/expiry. Local reuse and fresh GitHub evidence: `reuse.md`.

Backend parts AC-sharing-1/2/3 and AC-sharing-4/5/6 have passing author evidence; AC1 scene composition/equal camera and UI adjacency remain parent integration. AC7/8/9 (390px/desktop keyboard, WebGL fallback, form restoration) are root-owned pending E2E and cannot be called passed here. First-design UI event, attributed actual project creation, operator CLI and generic Space bypass guard are root integration dependencies. Parent migration005 copied for tests is shared-root owned, excluded from owned manifest. Node_modules local symlink repair and build outputs are excluded. No Git commit, live paid call, public deploy, or vendor/global config mutation.

Companion delivery: own backend scope ready for integration/independent review, full feature acceptance pending. E2E preflight not_applicable to author: only direct HTTP/unit/realPG integration and build executed; browser/actual composed app E2E remains root work. Prior supported rules: existing approved XL scope; source-specific reuse; no retrospective usage estimates. dz canonical Russian recall returned no lexical matches; no new unconfirmed lesson taught/rewarded.

Owned source and evidence manifest: `tests/sharing/artifact-manifest.json` (SHA256 per file). Independent review is deliberately pending parent assignment; author tests are not independent review.

Status: completed
