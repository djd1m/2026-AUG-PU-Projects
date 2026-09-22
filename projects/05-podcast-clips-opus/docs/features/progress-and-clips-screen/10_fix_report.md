# Исправления фичи 7, раунд 2 — FP-001

Исправлено: `ScreenService.markDownloaded` вставляет `day` параметром `$3::date`,
полученным через существующую `moscowDay(this.clock())` из `@clipmaker/shared/upload`.
Второй реализации календарных московских суток нет.

Проверено **5 мест вставки** в исходниках: **1 рабочее** (`apps/web/src/server/screen.ts`)
и **4 тестовые фикстуры** (три в `tests/database.integration.test.ts`, одна в
`tests/upload-migration.integration.test.ts`). Все фикстуры уже задавали `day` явно;
их даты служат входом тестов ограничений/миграций, а не расчётом дня пользовательского события.
Других рабочих вставок в `apps`, `packages`, `scripts` не найдено.

`tests/growth-day.test.ts` рекурсивно проверяет вставки в `apps`, `packages`, `scripts`,
`tests` (без зависимостей, сборок и архивных артефактов), требует явную колонку `day`
и отказывает на пустом наборе вставок. Два теста сервиса проверяют переход
`2026-09-22T20:59:59.999Z` → `2026-09-22`, `2026-09-22T21:00:00Z` → `2026-09-23`.
В существующем интеграционном тесте добавлено чтение двух записанных дат из БД.

Мутация:

- RED: удалить `day` из списка колонок рабочей вставки; `npx vitest run tests/growth-day.test.ts -t 'каждая вставка'` → **exit 1**, 1 failed, 2 skipped; сообщение `apps/web/src/server/screen.ts: вставка growth_event без day`.
- GREEN: восстановить исходник; `npx vitest run tests/growth-day.test.ts` → **exit 0**, 3 passed.

Доказательства: [RED](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/evidence/mutation-red.log),
[GREEN](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/evidence/mutation-green.log).

Ворота выполнены последовательно, как в брифе:

| Проверка | Результат | Лог |
|---|---|---|
| `npm run build` | exit 0, включая Next.js production build | [build](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/evidence/build.log) |
| `npm run lint` | exit 0 | [lint](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/evidence/lint.log) |
| `npm run typecheck` | exit 0 | [typecheck](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/evidence/typecheck.log) |
| `npm test` | exit 0; **228 passed, 89 skipped**, 30 наборов passed, 11 skipped | [test](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/evidence/test.log) |

89 пропусков — интеграционные тесты без инфраструктуры, включая дополненный тест дат.
`git diff --check` — exit 0. Проверенный снимок исходников после ворот не менялся.

Docker недоступен согласно брифу, интеграционные на настоящих PostgreSQL 16,
Redis 7 и MinIO не запускались; их выполняет integration owner.
E2E/deployment не входят в этот раунд, preflight: `not_applicable`.
Независимое Anthropic-ревью недоступно в этом хосте; локальные проверки его не заменяют.

Профиль: `compact-quality-first-v2`, тир **S** (роутер: exit 0; перед реализацией
границы подтверждены). Один исполнитель Codex, семейство GPT-6 из контекста хоста;
точный model ID и effort не предоставлены метаданными, переключения не выполнялись.
План и разрешение: постановка `09_fix_brief_codex.md` и запрос пользователя выполнить её.
Область: FP-001, страж, мутация, локальные ворота; без смены схемы и индексов.

Телеметрия: [run.json](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/run.json),
[events.jsonl](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/events.jsonl).
Исходная ревизия: `2d5abc774e4b6baf939d5c2438c48fe44032cb40`;
SHA-256 трёх изменённых исходников: [manifest](../../telemetry/p-replicator/20260922T213545Z-progress-clips-fp001/evidence/source-manifest.json).
Расход токенов и стоимость: `null`, счётчики недоступны. Начальное чтение инструкций
предшествовало созданию записи; полная длительность от запроса не измерена и не восстановлена.

Измеренный интервал от создания записи до отчёта: **281.8 с**; начальное чтение инструкций в него не входит.

Status: completed
