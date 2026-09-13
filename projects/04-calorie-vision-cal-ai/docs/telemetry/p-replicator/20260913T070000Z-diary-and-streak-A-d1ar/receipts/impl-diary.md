# Квитанция: diary-and-streak — реализация [phase 3]

RUN_ID: `20260913T070000Z-diary-and-streak-A-d1ar`
WORK_UNIT_ID: `impl-diary`
Каталог: `/home/dz-projects-2026/n4-wt-diary/projects/04-calorie-vision-cal-ai` (ветка `feat/diary-and-streak`)

## Ревизия незаконченной работы (первый шаг)

На входе — 12 незакоммиченных файлов от погибшей сессии. Ничего не запускалось. Сопоставление
с планом (`docs/features/diary-and-streak/01..05*.md`):

| Файл | Состояние на входе | Что сделано |
|---|---|---|
| `apps/api/src/diary/compute-soft-streak.ts` | готово, соответствует `02_pseudocode.md` `ComputeSoftStreak` | без изменений, добавлены unit-тесты |
| `apps/api/src/diary/confirm-diary-entry.ts` | готово: согласие первым шагом, снимок, атомарная вставка | без изменений, покрыто integration/concurrency |
| `apps/api/src/diary/day-totals.ts` | готово: только персистированные колонки, без `food_item` | без изменений, добавлен страж AC-18 с мутацией |
| `apps/api/src/diary/delete-diary-entry.ts` | готово: транзакция удаление+пересчёт | без изменений, покрыто integration/concurrency |
| `apps/api/src/diary/diary-entry-repository.ts` | готово: `ON CONFLICT DO NOTHING` + идемпотентное чтение | без изменений |
| `apps/api/src/diary/get-diary-day.ts` | готово: владение из сессии, `422` без подстановки даты | без изменений, покрыто integration |
| `apps/api/src/diary/portion-bounds.ts` | готово | без изменений, покрыто unit |
| `apps/api/src/diary/recompute-entry-from-snapshot.ts` | готово: формула по снимку, `unmatched` исключён | без изменений, покрыто unit |
| `apps/api/src/diary/set-diary-entry-portion.ts` | готово: 404/422/409, гонка с delete разрешена в пользу удаления | без изменений, покрыто integration/concurrency |
| `apps/api/src/routes/diary.ts` | готово: два маршрута канона, единый конверт | без изменений |
| `apps/api/src/server.ts` | готово: маршрут зарегистрирован | без изменений |
| `packages/db/migrations/006_diary_entry_recognition_unique.sql` | готово: `UNIQUE (recognition_id)` | без изменений |

**Вывод ревизии:** реализация Phase 3 предыдущим исполнителем была ПОЛНОЙ и корректной по всем
7 FR + 1 NFR. Не хватало ТОЛЬКО тестов (ни одного файла в `tests/unit|integration|concurrency` для
этой фичи не существовало) и подтверждения прогоном.

## Что сделано в этой сессии

1. Написаны unit-тесты: `tests/unit/day-totals.test.ts`, `tests/unit/compute-soft-streak.test.ts`,
   `tests/unit/portion-bounds.test.ts`, `tests/unit/recompute-entry-from-snapshot.test.ts`.
2. Написаны интеграционные тесты: `tests/integration/confirm-diary-entry.test.ts`,
   `tests/integration/set-diary-entry-portion.test.ts`, `tests/integration/delete-diary-entry.test.ts`,
   `tests/integration/get-diary-day.test.ts`, `tests/integration/day-totals-guard.test.ts` (страж
   AC-18, испытан внедрённым дефектом — красный/зелёный).
3. Написаны конкурентные тесты: `tests/concurrency/confirm-diary-entry-parallel.test.ts` (20
   параллельных `confirm`), `tests/concurrency/portion-vs-delete-race.test.ts` (оба порядка
   фиксации `set_portion`×`delete`, принудительные через удерживаемую блокировку строки — тот же
   приём, что `tests/integration/account-delete.test.ts` RV-03).
4. Добавлена общая оснастка `tests/helpers/diary.ts` (`deviceSession`, `grantConsent`,
   `patchDiary`, `getDiary`, фикстуры `recognition`).
5. **Найден и исправлен реальный дефект `foundation`**, вскрытый интеграционным прогоном: `pg`
   парсит колонки `date` (`diary_entry.eaten_on`) в JS `Date`, сконструированный в ЛОКАЛЬНОЙ
   таймзоне процесса; все сервисы (`api`, `recognizer`, `test`) запускаются с `TZ=Europe/Moscow`
   (`docker-compose.yml`) — без фикса `.toISOString()`/JSON-сериализация ответа маршрута сдвигали
   бы московскую полночь в UTC и получали ПРЕДЫДУЩИЕ сутки. Исправлено ОДНОЙ строкой в
   `packages/db/src/pool.ts` (`pg.types.setTypeParser` на колонку `date`, отдаёт строку как есть).
   Подтверждено интеграционным тестом на границе суток (AC-14, момент 2026-09-12T21:30Z = 00:30
   13 сентября по Москве) и явной проверкой формата `eaten_on` в ответе `confirm`.
6. Починены фикстуры ДВУХ старых тестов (`tests/integration/auth-telegram.test.ts::seedDiaryEntries`,
   `tests/integration/account-delete.test.ts::seedCardsAndDiary`): они заводили несколько
   `diary_entry` на ОДИН `recognition_id`, что стало невозможным после `UNIQUE (recognition_id)`
   этой фичи — теперь каждая запись дневника получает свой `recognition`.
7. Обновлён `docs/features/diary-and-streak/05_completion.md`: чеклист отмечен выполненным,
   таблица `## Criterion coverage` подтверждена как ФАКТИЧЕСКАЯ, зафиксирована находка по `pg`.

## Прогоны и коды возврата

| Проверка | Команда | Результат |
|---|---|---|
| unit | `npm test` (vitest.config.ts) | `155 passed` → после добавления новых тестов `159 passed` (24 → 28 файлов) |
| typecheck | `npm run typecheck` | `0`, без вывода |
| lint | `npm run lint` | `0`, без вывода |
| build | `npm run build` | `0`, все пять пакетов и `next build` собраны |
| миграция | `docker compose --profile test run --rm test npm run migrate` | применено `006_diary_entry_recognition_unique.sql`, `skipped: []` |
| integration+concurrency | `docker compose --profile test run --rm test npm run test:integration` | **41 файлов, 159 тестов — все зелёные** (включая 8 файлов этой фичи и все 33 ранее существовавших) |
| `check-ports.cjs .` | `node ../../.claude/hooks/check-ports.cjs .` | `0` — нарушений не найдено |
| `check-env-wiring.sh` | `bash scripts/check-env-wiring.sh` | `0` — api/recognizer все переменные проброшены |
| `check-port-conflicts.sh .` | `bash ../../scripts/check-port-conflicts.sh .` | `0` — хранилища не публикуются, порт 4180 свободен |
| `check-pipeline-gaps.sh --completion` | см. команду ниже | контур `diary-and-streak`: **0 GAP, 0 NOT-ESTABLISHED** (общий вердикт NOT-ESTABLISHED из-за ДРУГИХ, ещё не реализованных фич роадмапа — partner-codes-and-cabinet, share-card-and-growth-events, source-and-correct, pro-interest-and-limits-ui; это вне контура этой фичи) |
| `docker compose --profile test down -v` | выполнено после каждого прогона | контейнеры и тома убраны |

```bash
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --completion --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

## Покрытие 18 AC — таблица в `docs/features/diary-and-streak/05_completion.md` (## Criterion coverage)

Все 18 критериев приёмки и 1 NFR имеют тест по фактическому пути с фактическим заголовком;
таблица проверена воротами `--completion` (`grep -F` заголовка в указанном файле) — 0 GAP.

## Коммиты этой сессии (feat/diary-and-streak)

- `31c7d5c` — реализация подтверждения/правки/удаления/стрика [phase 3] + unit-тесты
- `2e9653c` — интеграционные и конкурентные тесты confirm/set_portion/delete/get-diary
- `aa5833a` — фикс `pg` date-парсера (TZ=Europe/Moscow) + фикстуры двух старых тестов
- (этот файл) — квитанция и обновление `05_completion.md`

Push НЕ выполнялся (запрещено инструкцией координатора).

Status: completed
