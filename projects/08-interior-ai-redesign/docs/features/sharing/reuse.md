# F6 reuse evidence — sharing-author-1

Run 20261013T220722Z-sharing-0e60. Canonical repository /home/2026-AUG-PU-Projects; isolated author root /tmp/n8-sharing-author-20261013/projects/08-interior-ai-redesign. Feature canon SHA256 70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d. Local search preceded fresh GitHub primary search and implementation. No runtime imports from donor projects.

Local search: `rg -n 'watermark|shareToken|share_token|export_created|share_viewed' projects/0[1-7]* --glob '*.{ts,sql}'`, then targeted N6 growth and N8 asset/space reads. Followup complete inventory using token_hash/growth_event found N1 22 files, N2 11, N3 0, N3a 11, N4 55, N5 79, N5a 0, N6 24, N7 0. These are lexical candidate counts, not applicability or coverage claims. N1 public token pattern and N4 image share candidate require different product schemas; N3/N3a affiliate, N5/N5a video and N7 email contracts are not imported.

| Contract | Source inspected | Decision |
| --- | --- | --- |
| Private exclusive file upload, normalized hash verification, pending cleanup | N8 adapters/assets.ts SHA256 cd469ab768a39fcf1708c7651d471374cd3d3ca139f171eb02df4f5d8590843e; adapters/cleanup.ts; asset-parser.ts | Reuse exact file helpers and stale/orphan sweep; adapt supervised subprocess for bounded PNG/watermark in owned image-exporter.ts. Raw upload is deleted before readiness; retained file is normalized PNG only. |
| Account→Project lock, count64/200MiB project/1GiB account reservations | N8 db/space.ts SHA256 0bcd7126756457e715ad049f1fecd8a9c64edb0d8cbe1e6a8f44a77676c6fed5 | Adapt quota SQL in export repository; existing Space reservation disallows server-only share_image. Reuse releaseReservation, lockOwnedProject, transaction, version increment. |
| Unique growth event / observed metrics | N6 packages/db/src/growth.ts SHA256 275bbc9a2c10d141bfa60998db5fe39bd9df031c05dc723834432a5765f5c538 and growth-report.ts | Adapt INSERT ON CONFLICT and bounded window aggregation. N8 requires five event names, 30 days, no conversion estimate, unknown on DB failure. No donation of MSK-day attribution or bot/domain fields. |
| Watermark enforcement | N5 packages/shared/src/watermark.ts SHA256 21776cb12282dbd090d63b0697926c03ae1af236818fb96a4c54516f2f0fc603 | Contract inspiration only; FFmpeg/video/teaser geometry not applicable to frozen room image. New fixed N8 raster composite using existing Sharp dependency. |

Fresh primary GitHub searches 2026-10-13: `site:github.com/lovell/sharp limitInputPixels timeout metadata`, `site:github.com/nodejs/node crypto randomBytes createHash`. GitHub API commit and license endpoints checked after search:

- https://github.com/lovell/sharp/tree/857281ae51452eb0e3678520d8a3462958638a4a — Apache-2.0. Constructor raster pixel limit, timeout and compositing evaluated; installed project's existing pin sharp0.35.5 retained. Default output metadata stripping verified by actual EXIF tests. No source copied.
- https://github.com/nodejs/node/tree/04fb145b6a3d0dc3cf06fcbcd1d3c0414fdc193c — GitHub license detection NOASSERTION (multi-license repository); use built-in runtime crypto API only, no vendored source. randomBytes32 and SHA256 token hash contract evaluated from doc/api/crypto.md.

Custom gaps: no donor enforces N8 current entitlement/refund serialization, immutable design provenance, scene-only before/after user preview, and private image-only public DTO together. These small N8 domain/repository functions are new. HTTP JSON envelope/owner/Origin/rate and filesystem lifecycle remain existing shared implementations. Ordinary uploads cannot create share_image. Root integrates migration005 and generic asset-route guard; author cannot claim this integration complete.

Memory: `dz recall 'приватный экспорт watermark отзыв ссылки платежи provenance' --project /home/2026-AUG-PU-Projects --limit 4` returned no lexical matches. No claim of empty global memory; no unverified teaching/reward.
