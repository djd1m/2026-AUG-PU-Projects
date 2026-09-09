# Foundation dispatch

**Пишущий фан-аут:** да
**Координатор пишет:** да
**Разрезы файлов:** нет
**Проверка владения:** ВЫПОЛНЕНА
**Канон:** docs/foundation-contract.md
**Хеш канона:** 30bfab6c7459af5c7df8da2fd28922214db50b0dbf17d8fdf610bf7c6a821bdc
**Проверка канона:** ВЫПОЛНЕНА

## Единицы

| Единица | Что пишет |
|---|---|
| foundation-core | Auth/database source and tests |
| координатор | Workspace, manifests, infrastructure and integration evidence |

## Владение

| Файл | Владелец |
|---|---|
| packages/db/src/index.ts | foundation-core |
| packages/db/src/pool.ts | foundation-core |
| packages/db/src/migrate.ts | foundation-core |
| packages/db/src/auth-repository.ts | foundation-core |
| packages/db/migrations/001_identity_sessions.sql | foundation-core |
| packages/db/migrations/002_runtime_grants.sql | foundation-core |
| scripts/init-foundation-db.sh | foundation-core |
| packages/db/tests/migrate.integration.test.ts | foundation-core |
| packages/db/tests/auth-repository.integration.test.ts | foundation-core |
| packages/db/tests/roles.integration.test.ts | foundation-core |
| packages/db/tests/helpers.ts | foundation-core |
| apps/web/src/lib/auth/config.ts | foundation-core |
| apps/web/src/lib/auth/password.ts | foundation-core |
| apps/web/src/lib/auth/kdf-admission.ts | foundation-core |
| apps/web/src/lib/auth/session.ts | foundation-core |
| apps/web/src/lib/auth/credentials.ts | foundation-core |
| apps/web/src/lib/auth/cookie.ts | foundation-core |
| apps/web/tests/password.test.ts | foundation-core |
| apps/web/tests/kdf-admission.test.ts | foundation-core |
| apps/web/tests/session.test.ts | foundation-core |
| apps/web/tests/credentials.integration.test.ts | foundation-core |
| apps/web/tests/auth-config.test.ts | foundation-core |
| package.json | координатор |
| package-lock.json | координатор |
| tsconfig.json | координатор |
| vitest.config.ts | координатор |
| vitest.integration.config.ts | координатор |
| .gitignore | координатор |
| .dockerignore | координатор |
| .env.example | координатор |
| compose.yaml | координатор |
| Dockerfile | координатор |
| apps/web/package.json | координатор |
| apps/web/tsconfig.json | координатор |
| apps/web/next-env.d.ts | координатор |
| apps/web/next.config.ts | координатор |
| apps/web/src/app/layout.tsx | координатор |
| apps/web/src/app/page.tsx | координатор |
| apps/web/src/app/globals.css | координатор |
| apps/web/src/app/api/health/route.ts | координатор |
| packages/db/package.json | координатор |
| packages/db/tsconfig.json | координатор |
| scripts/check-foundation-infra.mjs | координатор |
| scripts/run-foundation-integration.mjs | координатор |
| scripts/start-web.ts | координатор |
| tests/workspace.test.ts | координатор |
| tests/infra.test.ts | координатор |
| docs/discovery/foundation-reuse-provenance.md | координатор |
| docs/features/foundation/05_completion.md | координатор |
| README.md | координатор |
| DEVELOPMENT_GUIDE.md | координатор |

Runtime files are assigned before creation. Coordinator also owns dispatch/source-version declarations, roadmap and run/events; the child owns only its assigned terminal receipt. New split files require an explicit ownership update before writing. This dispatch becomes active only after the independent validation receipt and packaged gate pass.
