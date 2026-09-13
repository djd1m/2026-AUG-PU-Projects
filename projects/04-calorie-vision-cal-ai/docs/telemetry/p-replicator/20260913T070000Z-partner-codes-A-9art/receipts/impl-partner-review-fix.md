# Квитанция правки после ревью — `partner-codes-and-cabinet`

RUN_ID: `20260913T070000Z-partner-codes-A-9art`
WORK_UNIT_ID: `impl-partner-review-fix`
Каталог: `/home/dz-projects-2026/n4-wt-partner/projects/04-calorie-vision-cal-ai`
Ветка: `feat/partner-codes-and-cabinet`

Отчёт: `docs/features/partner-codes-and-cabinet/review-report.md` (слепой судья `codex`,
verdict `CHANGES_REQUIRED`, 1 blocker + 2 high + 3 medium). DEC-A-032: второго раунда не будет.

## Находка → правка → тест

| Находка | Правка | Тест |
|---|---|---|
| RV-01 (blocker) — активация недостижима из продакшена (recognizer не зависит от `@n4/api`) | Перенесена в `packages/db/src/partner-attribution.ts`, подключена в `apps/recognizer/src/lease.ts` `recordResult` (та же транзакция, что и fence-защищённая запись `status='done'`) | `tests/integration/partner/activation-production-wiring.test.ts` (4 теста, реальный `acquireLease`+`recordResult`) |
| RV-02 (high) — обратный порядок блокировок, реальный deadlock | codeLock стабилизируется ДО sessionLock (подсмотр без лока, цикл до 5 попыток БЕЗ удержания sessionLock) | `tests/concurrency/partner/activate-vs-apply.test.ts` — управляемое пересечение, ни один `40P01` |
| RV-03 (high) — ключ проверки anti-fraud не совпадал с ключом хранения | `routes/codes.ts` читает ХРАНИМЫЙ `device_session.ip_prefix`, а не свежий заголовок | `tests/integration/partner/anti-fraud-ip-consistency.test.ts` (HTTP, 2 теста) |
| RV-04/05/06 (medium) | НЕ чинились — по прямому указанию владельца, вынесены в `05_completion.md` → «Follow-up, не блокирующий закрытие» | — |

Полная таблица с деталями правок — в `docs/features/partner-codes-and-cabinet/05_completion.md`,
раздел «Правка после ревью».

## Прогоны (факт, 2026-09-13, после правок)

| Проверка | Результат |
|---|---|
| `npm run typecheck` | 0 ошибок |
| `npm run lint` | чисто |
| `npm run build` (все пакеты, включая `@n4/web`) | успешно |
| `npx vitest run` (unit, без `DATABASE_URL`) | 147/147 зелёных |
| `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` | **176/176 зелёных, 43/43 файла** (включая 3 новых теста правки); `web-manifest.test.ts` в этом прогоне тоже зелёный |
| `node ../../.claude/hooks/check-ports.cjs .` | 0 |
| `bash scripts/check-env-wiring.sh` | 0 |
| `bash ../../scripts/check-port-conflicts.sh .` | 0 |
| `node ../../.claude/hooks/check-review-contract.cjs . partner-codes-and-cabinet` | `PASS review-contract feature=partner-codes-and-cabinet AC-ids=19 rows=19` |
| `bash ../../scripts/check-pipeline-gaps.sh . --completion --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md` | код 1, но контур фичи (`docs/features/partner-codes-and-cabinet/`) без открытых пометок-пробелов — все находки вне мандата (managed BaaS упоминание-запрет, source-product-profile трассировка, формат ссылок ADR в корневом `docs/ADR.md`) |
| `docker compose --profile test down -v` | выполнено |

## Коммиты

Готовится один коммит: правки RV-01/02/03 + 3 новых тестовых файла + обновление
`05_completion.md` (раздел «Правка после ревью» + «Follow-up»).

Status: completed
