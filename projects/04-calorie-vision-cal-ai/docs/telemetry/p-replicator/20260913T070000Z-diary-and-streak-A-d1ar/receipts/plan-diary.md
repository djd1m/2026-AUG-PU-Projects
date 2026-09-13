# Квитанция — Phase 1 PLAN, фича `diary-and-streak`

RUN_ID: 20260913T070000Z-diary-and-streak-A-d1ar · WORK_UNIT_ID: planner-diary

## Что сделано

Пять файлов Phase 1 в `docs/features/diary-and-streak/`:
`01_specification.md`, `02_pseudocode.md`, `03_architecture.md`, `04_refinement.md`,
`05_completion.md` (плановая, по шаблону `consent-and-telegram-auth/05_completion.md`).

18 критериев `AC-diary-and-streak-1…18`, 7 функциональных требований, 1 нефункциональное. Каждое
названо машинным ключом, каждый алгоритм несёт `REQUIREMENT:`/`REALISES:`.

## Ключевые решения плана

- **Осознанное разрешение неоднозначности маршрута 11.** Root `Pseudocode.md` называет путь
  `{entry_id}` для операций `confirm`/`set_portion`/`delete`, но `confirm` создаёт запись, которой до
  вызова не существует. План фиксирует явно: для `confirm` путь несёт `recognition_id`, для
  `set_portion`/`delete` — уже существующий `diary_entry.id`. Владение проверяется одинаково в обоих
  пространствах, чужая и несуществующая запись дают один `404` в обоих случаях; `403` на этом
  маршруте не возникает никогда.
- **Согласие — импорт, не копия.** `ConfirmDiaryEntry` вызывает `EnforceConsentBeforeDiaryWrite` из
  `consent-and-telegram-auth` (`apps/api/src/consent/enforce-before-diary-write.ts`) ПЕРВЫМ шагом,
  до чтения `recognition` (`security-operation-order`: согласие до записи). Зафиксировано и
  расхождение с `consent-and-telegram-auth/03_architecture.md`, которая писала «вызывается ИЗ
  scan-pipeline (владелец маршрута дневника)» — на момент того плана дневник ещё не был выделен
  отдельной фичей; фактический владелец маршрутов 4 и 11 — эта фича.
- **Атомарное идемпотентное подтверждение.** Новая уникальность `UNIQUE (recognition_id)` на
  `diary_entry` (миграция, номер — на слиянии) плюс `INSERT … ON CONFLICT (recognition_id) DO
  NOTHING RETURNING *`; при конфликте — чтение уже созданной строки. Конкурентный тест
  (AC-diary-and-streak-5) обязателен — последовательный не различает атомарный оператор и
  «прочитать, потом вставить» (`shared-resource-verification`).
- **Удаление и пересчёт итога — одна транзакция** (AC-diary-and-streak-9); гонка `set_portion`
  против `delete` разрешена в пользу удаления, без воскрешения записи (AC-diary-and-streak-17,
  конкурентный тест).
- **Один страж по исходнику с внедряемым дефектом:** `day-totals.ts` не читает `food_item`;
  дефект — подмена суммы персистированных колонок на пересчёт через `JOIN food_item` — обязан дать
  красный результат стража (AC-diary-and-streak-18).
- Границы значений порции (5–2000 г) и индекса дают `422` с сохранением прежнего значения; граница
  суток — `Europe/Moscow`, проверена явно на 23:50.

## Ворота

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

Контур `diary-and-streak`: `COUNT requirements=26 algorithms=26 missing-algorithm=0
orphan-algorithm=0` → `PASS contour=diary-and-streak bidirectional traceability complete`. Ни одного
`GAP`, ни одного `DUPLICATE` в этом контуре.

Общий вердикт прогона — `FAIL` (39 gaps, 2 inconclusive) ИЗ-ЗА ЧУЖИХ контуров
(`partner-codes-and-cabinet` — спецификация отсутствует/нечитаема, `pro-interest-and-limits-ui` —
18 требований без алгоритмов, `share-card-and-growth-events` — спецификация отсутствует/нечитаема).
Это состояние других контуров зафиксировано, не тронуто.

Status: completed
