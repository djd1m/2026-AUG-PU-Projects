# N8 writing dispatch — foundation and space

**Пишущий фан-аут:** да
**Канон:** docs/canon.md
**Хеш канона:** 40f78b39c85769cfcb70f6a9d3b6cdcdc1f14193f4d34e4e255738c22e0813cc
**Проверка канона:** ВЫПОЛНЕНА
**Координатор пишет:** да
**Разрезы файлов:** нет
**Проверка владения:** ВЫПОЛНЕНА

## Единицы

| Единица | Что пишет |
|---|---|
| foundation-author | domain identity/auth ports,db core/auth/project repositories,HTTP/config/composition/custom server,foundation API routes/tests |
| координатор | manifests/lock/all migrations/Docker/setup/test harness,shared domain common,web UI,docs/telemetry/source integration |

## Владение

| Файл | Владелец |
|---|---|
| packages/domain/src/identity/** | foundation-author |
| packages/adapters/src/auth.ts | foundation-author |
| packages/db/src/pool.ts | foundation-author |
| packages/db/src/common.ts | foundation-author |
| packages/db/src/identity.ts | foundation-author |
| apps/web/src/server/{config,http,composition,handlers,peer,health}.ts | foundation-author |
| apps/web/src/server.ts | foundation-author |
| apps/web/src/app/api/auth/** | foundation-author |
| apps/web/src/app/api/me/** | foundation-author |
| apps/web/src/app/api/projects/route.ts | foundation-author |
| apps/web/src/app/api/projects/[projectId]/route.ts | foundation-author |
| apps/web/src/app/health/** | foundation-author |
| tests/foundation/** | foundation-author |
| docs/features/foundation/implementation-receipt.md | foundation-author |
| package.json | координатор |
| package-lock.json | координатор |
| apps/*/package.json | координатор |
| packages/*/package.json | координатор |
| packages/domain/src/common.ts | координатор |
| packages/db/src/migrations/** | координатор |
| packages/db/src/migrate.ts | координатор |
| packages/db/src/schema.ts | координатор |
| apps/web/src/app/*.tsx | координатор |
| apps/web/src/app/dashboard/** | координатор |
| apps/web/src/components/** | координатор |
| apps/web/src/app/globals.css | координатор |
| docker-compose.yml | координатор |
| Dockerfile | координатор |
| scripts/** | координатор |
| tests/helpers/** | координатор |
| docs/** except assigned receipt | координатор |

No source files split at this dispatch. Only foundation-author+coordinator write, two different worktrees. Shared source/canon frozen before author launch; future units require updated ownership. Core fields/interfaces in canon, public module contracts/test harness sent explicitly. No alternate direct Next listener.

## Space author dispatch (2026-10-13T22:33Z)

Space-author isolated /tmp/n8-space-author-20261013; owns packages/domain/src/space/**, packages/adapters/src/{assets,asset-parser,asset-parser-worker,cleanup}.{ts,mjs}, packages/db/src/space.ts, packages/viewer/src/**, apps/web/src/server/space.ts, API projects/[projectId]/{shells,assets,references}/**, api/assets/[assetId]/**, tests/space/**, docs/features/space/{reuse,implementation-receipt}.md. Root alone shared manifests/lock/SQL/helpers/UI. Timebox70min checkpoint45min; stop deliver evidence/files if budget reached. Same frozen canon hash. Existing foundation author owns its three server files; new space.ts never overlaps.

Foundation author terminal delivered25files22:36:31Z; verified owned SHA manifest and copied once. Ownership transferred to coordinator for concrete review/integration corrections; immutable author receipt preserved. Foundation reviewer read-only code/source, own docs/features/foundation/review.md only. Space writer remains isolated and sole owner of its files.

Design-author dispatch2026-10-13T22:46:24.420346+00:00: isolated /tmp/n8-design-author-20261013; owns domain/src/design/**, db/src/design.ts+design/**, adapters/src/openrouter.ts, worker/src/{jobs,watchdog}.ts, web/server/design.ts, api/projects/[projectId]/{catalog,designs,jobs}/**, api/jobs/[jobId]/**, tests/design/**, docs/features/design/{reuse,implementation-receipt}.md. Root remains index/runtime/UI/manifests/SQL. Timebox90mincheckpoint45; source canon same, actualArchitecture FND-D1 correction noted. Space dependency geometry copied read-only stable public contract.

Space author terminal22:46:52Z;22filesverified/copied, ownershiptransferredrootforconcretereviewintegration. Space review read-onlyproduct andwritesdocs/features/space/review.md only; noSpaceauthorfurthereditsunlessexplicitisolatedconcretecorrection.

Procurement author dispatched 2026-10-13T22:55:28.676683+00:00 isolated /tmp/n8-procurement-author-20261013; owns domain/procurement/**, db/procurement.ts+procurement/**, adapters/catalogue.ts, server/procurement.ts, api/projects/[projectId]/{products,lines,budgets}/**, tests/procurement/**, docs/features/procurement/{reuse,implementation-receipt}.md. Root UI/sharedSQL/helpers/manifests/scripts. Sol high explicitboundedmanual algorithm rationale;70min/checkpoint45. Designpuretypes read-only snapshot, catalogsource/snapshotId serverUUID correction forthcoming; nootherauthorfilewrites.

Design author terminal23:03:12Z;33manifestfiles verified/copied plus manifest+receipt. Ownership transferredrootforconcretefindings/integration. Designreviewer read-onlyproduct, writesdocs/features/design/review.md only. RootF7entryserverUI/config/DDL remainroot. Procurementwriterownsdisjointfilesstillactive.

Billing author 2026-10-13T23:14:08.735185+00:00 isolated /tmp/n8-billing-author-20261013,70min/checkpoint45. Owns domain/billing/**, db/billing.ts+billing/**, adapters/yookassa.ts, server/billing.ts, api/billing/**, tests/billing/**, docs/features/billing/{reuse,implementation-receipt}.md. RootUI/sharedSQL/config/helpers/manifests/scripts. Procurementwriterdisjointactive; Designreviewterminal androotownsitsconcretefixes.

Procurement terminal23:14:21Z;22ownedfilesSHAverified/copied. Ownership transferredrootforconcreteintegration/reviewfix. Procurementreviewer read-onlycode andwritesdocs/features/procurement/review.md only. Billingauthorisolateddisjointstillactive.

Sharing-author launch 2026-10-13T23:41:01.839524+00:00: isolated /tmp/n8-sharing-author-20261013; owns domain/sharing/**, db/sharing.ts+sharing/**, adapters/image-exporter.ts, server/sharing.ts, api/projects/[projectId]/{exports,shares}/**, api/shares/**, app/s/**, tests/sharing/**, docs/features/sharing/{reuse,implementation-receipt}.md. Root remains all shared SQL/manifests/helpers/UI/scripts. Billing reviewer read-only product; own billing/review.md. Canon unchanged; budgets70/45 minutes respectively.

Final coordinator clarification after all author terminals 2026-10-14T00:08:08.242987+00:00: GLB descriptor surfaces explicitlyopaque mesh:n:primitive:n, no inferred semanticwalls/floor. Original70ae... launchcanon remainshistorical in author manifests/receipts. No activewriterunderchangedcanon; currenthashabove binds integration review.
