# Квитанция реализации — `partner-codes-and-cabinet`

RUN_ID: `20260913T070000Z-partner-codes-A-9art`
WORK_UNIT_ID: `impl-partner`
Каталог: `/home/dz-projects-2026/n4-wt-partner/projects/04-calorie-vision-cal-ai`
Ветка: `feat/partner-codes-and-cabinet`

## Ревизия унаследованных 7 незакоммиченных файлов (первый шаг)

Прежняя сессия погибла в 07:54 UTC, оставив без коммита: `apps/api/src/server.ts` (mod),
`packages/shared/src/index.ts` (mod), `packages/shared/src/log/logger.ts` (mod), и новые
`apps/api/src/partner/{normalize-code,anti-fraud,apply-partner-code,activate-attribution,
manual-unblock,dashboard-query}.ts`, `apps/api/src/routes/{codes,partner}.ts`,
`packages/shared/src/partner-types.ts`.

Построчная сверка против `01_specification.md`..`04_refinement.md` — результат: ГОТОВО почти
полностью, один дефект логики (см. ниже). Гейт до записи (codeLock→чтение статуса→self-referral→
anti-fraud→sessionLock→три исхода по source→growth_event), оба advisory-лока в правильном порядке,
audit-события, wiring в `server.ts`/`shared/index.ts`/`logger.ts` (`SERVICE_LOG_FIELDS`) — приняты
БЕЗ ИЗМЕНЕНИЙ.

## Найденный и исправленный дефект

`anti-fraud.ts`: сравнение `count <= 50 → allow` (буквально по `02_pseudocode.md`, шаг 3: `count >
50 → block` на count СУЩЕСТВУЮЩИХ применений) на единицу расходится с явным AC-9 («50 засчитанных
→ 51-е применение блокируется») и с собственным разъяснением FR-3 в `01_specification.md`.
Исправлено на `count < 50 → allow` (существующих 50 → блокирует). Обоснование и решение задним
числом зафиксированы в `docs/features/partner-codes-and-cabinet/05_completion.md`
(«Расхождение плана и факта»). Пойман конкурентным тестом AC-9(а) на реальном PostgreSQL.

## Что добавлено

- Тесты на все 19 AC (11 файлов: `tests/unit/partner/*` — 3, `tests/integration/partner/*` — 6,
  `tests/concurrency/partner/*` — 2) + общий helper `tests/helpers/partner.ts`.
- Оба стража по исходнику (AC-11, AC-17) испытаны внедрённым дефектом
  (`guard-must-be-able-to-fail.md`) — обе строки квитанции (красный/зелёный) — в
  `05_completion.md`.
- `docs/features/partner-codes-and-cabinet/05_completion.md` дополнен фактом: расхождение
  anti-fraud, фактическая таблица Criterion coverage, фактический прогон проверок.

## Прогоны (факт, 2026-09-13)

| Проверка | Результат |
|---|---|
| `npm run typecheck` | 0 ошибок |
| `npm run lint` | чисто |
| `npm run build` (все пакеты, включая `@n4/web`) | успешно |
| `npx vitest run` (unit, БЕЗ DATABASE_URL) | 147/147 зелёных |
| `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` | 166 зелёных / 3 скип; единственный красный файл — `tests/integration/web-manifest.test.ts` (не тронут этой фичей, `next start` не поднимается в контейнере — воспроизведено изолированным повторным прогоном, не регрессия партнёрских тестов) |
| `node ../../.claude/hooks/check-ports.cjs .` | 0 |
| `bash ../../scripts/check-env-wiring.sh` | 0 |
| `bash ../../scripts/check-port-conflicts.sh .` | 0 |
| `bash ../../scripts/check-pipeline-gaps.sh . --completion --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md` | код 1, но ВСЕ находки (managed BaaS упоминание как запрет в `Architecture.md`, `FR-LOOK-*` трассировка source-product-profile, формат ссылок на ADR-002/004/008 в `docs/ADR.md`, 4 `[GAP]`) лежат ВНЕ контура этой фичи — `docs/features/partner-codes-and-cabinet/` без единого `[GAP]` |
| `docker compose --profile test down -v` | выполнено |

## Известный, честно названный пробел (не блокирует)

FU-partner-codes-and-cabinet-1 (унаследован от плана, не тронут): `attribution.reject_reason =
antifraud_ip_burst` этой фичей никогда не пишется — см. `05_completion.md`.

## Коммиты этой сессии

1. `feat(partner-codes-and-cabinet): применение кода, anti-fraud, активация, кабинет партнёра` —
   принятие унаследованной реализации + 11 тестовых файлов.
2. (готовится) фиксация anti-fraud-исправления, guard-квитанций и обновлённого `05_completion.md`.

Status: completed
