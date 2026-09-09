# F1 shared-core dispatch

**Пишущий фан-аут:** ДА
**Канон:** docs/runtime-contract.md
**Хеш канона:** 0ff2e66a413947b8948b974bb53ad0d9c242008112ec4dfff7e7b0cead6fb6c2
**Проверка канона:** ВЫПОЛНЕНА
**Координатор пишет:** ДА
**Разрезы файлов:** НЕТ
**Проверка владения:** ВЫПОЛНЕНА

## Единицы

| Единица | Что пишет |
|---|---|
| core-implementation | shared/domain, shared/application, shared/infrastructure, tests/core* |
| container-integration | apps/api, apps/frontend, scripts, config, Dockerfiles, Compose, tests/http* |

## Владение

| Файл | Владелец |
|---|---|
| shared/domain/** | core-implementation |
| shared/application/** | core-implementation |
| shared/infrastructure/** | core-implementation |
| tests/core*.test.mjs | core-implementation |
| tests/helpers/core*.mjs | core-implementation |
| apps/api/** | container-integration |
| apps/frontend/** | container-integration |
| config/** | container-integration |
| scripts/** | container-integration |
| docker-compose.yml | container-integration |
| variants/*/docker-compose.yml | container-integration |
| variants/*/Dockerfile | container-integration |
| tests/http*.test.mjs | container-integration |
| package.json | координатор |
| package-lock.json | координатор |
| docs/** | координатор |
| shared/client/** | координатор |
| shared/ui/** | координатор |
| shared/contracts/** | координатор |

Scope ownership is by directory; exact new paths must be listed in worker receipt before integration. Only core writer uses isolated worktree /tmp/n3-shared-core-work. container-integration is executed by coordinator in primary checkout; no second writer there. Variants app implementation starts sequentially after core acceptance. No cross-owned files are edited concurrently. New file split keeps the owning directory scope; any split across scope requires coordinator update before write.
