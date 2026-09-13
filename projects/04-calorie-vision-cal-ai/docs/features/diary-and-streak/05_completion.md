# Фича `diary-and-streak` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Phase 3 ЗАВЕРШЕНА (2026-09-13). Код, миграция `006_diary_entry_recognition_unique.sql` и тесты —
на месте; `## Criterion coverage` ниже заполнена ФАКТИЧЕСКИМИ путями и заголовками, каждый
проверен воротами `check-pipeline-gaps.sh --completion` (контур `diary-and-streak` — без GAP).
По DEC-A-032 фича идёт РОВНО через один раунд слепого ревью: исправляются `blocker`/`high`,
остальное уходит в follow-up без повторного раунда.

**Побочная находка при реализации (не относится к плану, зафиксирована как факт):** интеграционный
прогон вскрыл существовавший в `foundation` дефект — `pg` парсит колонки `date` (`diary_entry.eaten_on`)
в JS `Date`, сконструированный в ЛОКАЛЬНОЙ таймзоне процесса, а все сервисы запускаются с
`TZ=Europe/Moscow`; без фикса `GET /diary` отдавал бы `eaten_on` на сутки раньше сохранённого.
Исправлено в `packages/db/src/pool.ts` (`pg.types.setTypeParser` на колонку `date`), подтверждено
интеграционным тестом на границе суток (AC-diary-and-streak-14) и явной проверкой формата
`eaten_on` в ответе `confirm`.

## Порядок выполнения Phase 3

1. **Миграция.** `packages/db/migrations/NNN_diary_entry_recognition_unique.sql` — `UNIQUE
   (recognition_id)` на `diary_entry`; номер файла подставляется на месте (после миграции
   `consent-and-telegram-auth`, см. `02_pseudocode.md`).
2. **Итог дня.** `apps/api/src/diary/day-totals.ts` (`RecomputeDayTotals`) — реализуется ПЕРВЫМ
   модулем, потому что три следующих алгоритма его вызывают. Тест на страж пишется вместе с модулем,
   не после.
3. **Подтверждение.** `apps/api/src/diary/confirm-diary-entry.ts` — импорт
   `EnforceConsentBeforeDiaryWrite`, атомарная вставка. Критерий готовности: последовательные тесты
   зелёные ДО конкурентного — конкурентный пишется отдельным шагом и обязан сначала показать красный
   на «прочитать, потом вставить» (испытание стража на самом алгоритме, не только на его описании).
4. **Правка и удаление.** `set-diary-entry-portion.ts`, `delete-diary-entry.ts` — границы 5–2000 г,
   условные записи, различение `404`/`409`.
5. **Стрик и чтение дня.** `compute-soft-streak.ts`, `get-diary-day.ts` — таймзона, окно 60 суток.
6. **Маршрут.** `routes/diary.ts` — `GET`/`PATCH`, разбор `op`, единый конверт ответа.
7. **Конкурентные прогоны.** Двойной `confirm`, гонка `set_portion`×`delete` — на настоящем
   PostgreSQL профиля `test`.

Коммиты — по логическим группам (`feat(diary-and-streak): …`), с трейлером
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`; push делает координатор.

## Команды

```bash
# 1. Сборка и проверки монорепо (из каталога проекта)
npm ci
npm run build
npm run lint
npm test                      # unit + integration + конкурентные, vitest 3

# 2. Миграция и тесты, которым нужна настоящая база
docker compose --profile test run --rm test npm run migrate
docker compose --profile test run --rm test npm test

# 3. Порты — ДО любого up
node ../../.claude/hooks/check-ports.cjs .
bash ../../scripts/check-port-conflicts.sh .

# 4. Ворота трассировки фичи
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --completion --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

## Чеклист готовности

- [x] `npm ci`, `npm run build`, `npm run lint`, `npm test` — код `0` каждая, вывод в квитанции.
- [x] `UNIQUE (recognition_id)` применена; повторный `npm run migrate` применяет ноль файлов.
- [x] Подтверждение без согласия отклоняется `403` без чтения `recognition` (проверено и для
      аккаунта, и для анонимной сессии — DEC-A-019, два прогона).
- [x] Подтверждение скана не в статусе `done` отклоняется `409`.
- [x] Чужой и несуществующий `recognition_id`/`entry_id` дают ОДИН и тот же `404` во ВСЕХ трёх
      операциях маршрута 11; `403` на этом маршруте не встречается ни разу ни при каком входе.
- [x] Конкурентный тест двойного `confirm`: 20 параллельных вызовов одного `recognition_id` дают
      ровно одну строку и один и тот же `entry_id` во всех ответах; тот же тест краснеет на
      «прочитать, потом вставить» — обе строки в квитанции.
- [x] Граница порции (5–2000 г, дробное, отрицательное, строка, `null`, индекс вне списка) отклоняет
      ввод ЦЕЛИКОМ во всех перечисленных формах, с сохранением прежнего значения.
- [x] Удаление и пересчёт итога дня видны атомарно (проверено ЧТЕНИЕМ сразу после ответа `delete`, не
      только самим ответом); повторное удаление отвечает `409`.
- [x] Конкурентный тест гонки `set_portion`×`delete`: оба возможных порядка фиксации проверены
      отдельно, ни один не теряет и не воскрешает запись.
- [x] `GET /diary?date=` возвращает только записи вызывающего владельца; непригодная и будущая дата
      дают `422` без подстановки «сегодня».
- [x] Граница суток по `Europe/Moscow` проверена на записи в 23:50 (не съезжает в UTC-дату).
- [x] Мягкий стрик: один пропуск сохраняет счёт и помечает день замороженным; два подряд обнуляют до
      единицы без текста об обратном отсчёте или потере.
- [x] Страж `day-totals.ts`: не читает `food_item`; испытан внедрённым дефектом (красный/зелёный —
      обе строки в квитанции).
- [x] `## Criterion coverage` ниже заполнен ФАКТИЧЕСКИМИ заголовками тестов, и ворота
      `--completion` возвращают `0` для контура этой фичи.

## Что эта фича НЕ доказывает

- Экран согласия и его текст — реализует `consent-and-telegram-auth`; эта фича только вызывает готовую
  границу и проверяет, что вызов сделан ПЕРВЫМ.
- Правильность самого распознавания и расхождения модель/база — снимок берётся как данность
  (`scan-pipeline`, `source-and-correct`).
- Перенос анонимного дневника при входе через Telegram — отдельный алгоритм `TelegramLogin` шаг 7 в
  `consent-and-telegram-auth`; эта фича читает `owner_key`, а не переносит его.
- Экраны `apps/web` для дневника и стрика — вне объёма Phase 3 этой фичи (только API); визуальная
  часть либо отдельный follow-up, либо совместный шаг с фронтовой фичей роадмапа.

## Criterion coverage

**Таблица ФАКТИЧЕСКАЯ.** Пути файлов и заголовки — реальные, ворота `check-pipeline-gaps.sh
--completion` подтверждают контур `diary-and-streak` без единого GAP (открывают каждый файл и ищут
заголовок дословно).

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-diary-and-streak-1 | tests/integration/confirm-diary-entry.test.ts | подтверждение при данном согласии создаёт запись из снимка распознавания |
| AC-diary-and-streak-2 | tests/integration/confirm-diary-entry.test.ts | подтверждение без согласия отклоняется 403 и не создаёт запись |
| AC-diary-and-streak-3 | tests/integration/confirm-diary-entry.test.ts | подтверждение скана не в статусе done отклоняется 409 |
| AC-diary-and-streak-4 | tests/integration/confirm-diary-entry.test.ts | подтверждение чужого и несуществующего recognition_id дают одинаковый 404 |
| AC-diary-and-streak-5 | tests/concurrency/confirm-diary-entry-parallel.test.ts | двадцать параллельных подтверждений одного recognition_id создают ровно одну запись |
| AC-diary-and-streak-6 | tests/integration/set-diary-entry-portion.test.ts | правка порции пересчитывает четыре числа и не вызывает модель |
| AC-diary-and-streak-7 | tests/unit/portion-bounds.test.ts | порция вне диапазона 5-2000 отклоняется с сохранением прежнего значения |
| AC-diary-and-streak-8 | tests/unit/portion-bounds.test.ts | индекс позиции вне списка отклоняется без изменения записи |
| AC-diary-and-streak-9 | tests/integration/delete-diary-entry.test.ts | удаление и пересчёт итога дня видны атомарно в одной транзакции |
| AC-diary-and-streak-10 | tests/integration/delete-diary-entry.test.ts | повторное удаление уже удалённой записи отвечает 409 |
| AC-diary-and-streak-11 | tests/integration/set-diary-entry-portion.test.ts | правка чужой и несуществующей записи дают одинаковый 404, не 403 |
| AC-diary-and-streak-12 | tests/integration/get-diary-day.test.ts | чтение дня возвращает только записи вызывающего владельца |
| AC-diary-and-streak-13 | tests/integration/get-diary-day.test.ts | непригодная дата отклоняется без подстановки сегодняшнего дня |
| AC-diary-and-streak-14 | tests/integration/get-diary-day.test.ts | запись в 23:50 по Europe/Moscow попадает в московскую календарную дату |
| AC-diary-and-streak-15 | tests/unit/compute-soft-streak.test.ts | один пропущенный день не обнуляет стрик и помечается замороженным |
| AC-diary-and-streak-16 | tests/unit/compute-soft-streak.test.ts | два пропущенных дня подряд обнуляют стрик до единицы |
| AC-diary-and-streak-17 | tests/concurrency/portion-vs-delete-race.test.ts | конкурентные правка и удаление одной записи не теряют и не воскрешают данные при любом порядке фиксации |
| AC-diary-and-streak-18 | tests/integration/day-totals-guard.test.ts | страж отклоняет пересчёт итога через живую таблицу food_item |
