# Active dispatch: N5 support-access

**Пишущий фан-аут:** да
**Координатор пишет:** да
**Разрезы файлов:** нет
**Канон:** docs/features/support-access/interface-contract.md
**Хеш канона:** 560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
**Проверка канона:** ВЫПОЛНЕНА
**Проверка владения:** ВЫПОЛНЕНА
**Причина:** —

RUN_ID:20261028-n5-support-implementation. Previous active declaration is retained in Git at01db4688.
Profile:model-routing-econom; separate Sol/medium coding owners; fresh Sol/high review gets only planner sources.
Owner approved support-access native scope28.10.2026; all other checks preserved.

## Единицы

| Единица | Что пишет |
|---|---|
| support-backend | backend/API/packages/config/migration/tests only |
| support-ui | non-API UI/styles/browser and responsive adapter only |

## Владение

| Файл | Владелец |
|---|---|
| packages/** | support-backend |
| apps/web/src/server/** | support-backend |
| apps/web/src/app/api/** | support-backend |
| apps/web/src/preflight.ts | support-backend |
| apps/web/src/instrumentation.ts | support-backend |
| apps/web/next.config.* | support-backend |
| package.json | support-backend |
| package-lock.json | support-backend |
| apps/*/package.json | support-backend |
| packages/*/package.json | support-backend |
| docker-compose.yml | support-backend |
| .env.example | support-backend |
| tests/fixtures/environment.ts | support-backend |
| tests/database.integration.test.ts | support-backend |
| tests/support-backend*.test.ts | support-backend |
| tests/support-email*.test.ts | support-backend |
| tests/support-mail*.test.ts | support-backend |
| tests/support-staff*.test.ts | support-backend |
| tests/support-widget-server*.test.ts | support-backend |
| scripts/check-env* | support-backend |
| scripts/test-support-backend*.mjs | support-backend |
| apps/web/src/app/support/** | support-ui |
| apps/web/src/app/verify-email/** | support-ui |
| apps/web/src/app/forgot/** | support-ui |
| apps/web/src/app/reset/** | support-ui |
| apps/web/src/app/admin/support/** | support-ui |
| apps/web/src/app/SupportLauncher.tsx | support-ui |
| apps/web/src/app/layout.tsx | support-ui |
| apps/web/src/app/AuthForm.tsx | support-ui |
| apps/web/src/app/globals.css | support-ui |
| apps/web/src/app/dashboard/** | support-ui |
| apps/web/src/app/videos/** | support-ui |
| apps/web/src/app/upload/** | support-ui |
| apps/web/src/lib/support-client.ts | support-ui |
| tests/support-ui*.test.ts | support-ui |
| tests/support-widget-ui*.test.ts | support-ui |
| tests/support-responsive*.test.ts | support-ui |
| tests/browser/support*.test.ts | support-ui |
| scripts/check-support.mjs | support-ui |
| scripts/check-responsive.sh | support-ui |
| scripts/responsive/container*.mjs | support-ui |
| docs/dispatch-plan.md | координатор |
| docs/source-versions.md | координатор |
| docs/features/support-access/** | координатор |
| docs/telemetry/p-replicator/20261028-n5-support-implementation/** | координатор |
| docs/BACKLOG.md | координатор |
| docs/cloudru-launch-plan.md | координатор |
| docs/features/README.md | координатор |

A newly needed path must get one owner before creation. No wildcard is permission to touch another named owner.
Existing unrelated regression test changes require a concrete source finding and root ownership assignment.
All shared manifests/migrations belong only to backend coding owner in its isolated tree; root only merges.
