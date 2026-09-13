# Фича `diary-and-streak` — архитектура

Размещение кода в `apps/api` (единственный сервис, который эта фича трогает — она не вызывает модель
и не пишет в бакет). Системная архитектура — [`docs/Architecture.md`](../../Architecture.md), здесь
не переписывается.

## Размещение по пакетам

| Требование фичи | Файлы (целевые) |
|---|---|
| `FR-diary-and-streak-1` подтверждение | `apps/api/src/diary/confirm-diary-entry.ts` |
| `FR-diary-and-streak-3` правка порции | `apps/api/src/diary/set-diary-entry-portion.ts` |
| `FR-diary-and-streak-4` удаление | `apps/api/src/diary/delete-diary-entry.ts` |
| `FR-diary-and-streak-5,6` чтение дня и итог | `apps/api/src/diary/get-diary-day.ts`, `apps/api/src/diary/day-totals.ts` |
| `FR-diary-and-streak-7` стрик | `apps/api/src/diary/compute-soft-streak.ts` |
| маршруты | `apps/api/src/routes/diary.ts` — `GET /api/v1/diary`, `PATCH /api/v1/diary/:entryId` |
| схема | `packages/db/migrations/NNN_diary_entry_recognition_unique.sql` (номер — при слиянии, см. `02_pseudocode.md`) |

Доменные модули (`diary/*`) не знают ни `FastifyRequest`, ни клиента `pg` напрямую поверх шаблонных
строк: параметризованные запросы через общий пул `packages/db` (`foundation`), перевод HTTP-входа в
типы выполняет `routes/diary.ts` на границе (`.claude/rules/coding-style.md`).

## Структура каталогов (дополнение к существующей)

```
apps/api/src/
├── routes/
│   └── diary.ts                       # GET /api/v1/diary, PATCH /api/v1/diary/:entryId
├── diary/
│   ├── confirm-diary-entry.ts         # ConfirmDiaryEntry
│   ├── set-diary-entry-portion.ts     # SetDiaryEntryPortion
│   ├── delete-diary-entry.ts          # DeleteDiaryEntry
│   ├── day-totals.ts                  # RecomputeDayTotals — цель стража AC-diary-and-streak-18
│   ├── get-diary-day.ts               # GetDiaryDay
│   └── compute-soft-streak.ts         # ComputeSoftStreak
└── consent/
    └── enforce-before-diary-write.ts  # УЖЕ существует (consent-and-telegram-auth) — ИМПОРТИРУЕТСЯ, не копируется

packages/db/migrations/
└── NNN_diary_entry_recognition_unique.sql   # UNIQUE (recognition_id) на diary_entry

tests/
├── unit/           day-totals (границы, пустой день), compute-soft-streak (окно 60 дней, заморозка)
├── integration/    confirm (согласие/статус/владение), set-portion (границы, 404/422), delete
│                   (транзакция, 409), get-diary-day (владение, дата)
└── concurrency/    confirm×confirm (двойной тап), set_portion×delete (гонка на одной записи) —
                    только на настоящем PostgreSQL
```

## Зависимости

Новых npm-зависимостей нет: маршрут, валидация тела и доступ к БД используют то, что уже установлено
`foundation` (`fastify`, `pg`, `zod`). Единственная кодовая зависимость — ИМПОРТ
`EnforceConsentBeforeDiaryWrite` из `consent-and-telegram-auth`; порядок реализации в роадмапе
(`consent-and-telegram-auth` → `diary-and-streak`) делает эту зависимость доступной к моменту
кодирования. Если по каким-то причинам `consent-and-telegram-auth` ещё не слита — фича блокируется на
интеграции, а не пишет временную копию проверки (единственность границы важнее скорости одной фичи).

## External Dependencies

Внешних вызовов нет: ни модели, ни S3, ни Telegram. Единственный внешний по отношению к ЭТОЙ фиче
компонент — таблицы `recognition`, `account`, `device_session`, созданные `foundation`, и функция
`EnforceConsentBeforeDiaryWrite`, созданная `consent-and-telegram-auth`; обе читаются, ни одна не
меняется этой фичей.

## Границы, которые фича обязана сохранить

- Маршруты 4 и 11 канона — единственные два, добавляемые этой фичей к уже существующим 14 (13
  продуктовых плюс `/health`); нового расширения счёта нет.
- `day-totals.ts` — ЕДИНСТВЕННОЕ место, читающее `diary_entry` для агрегирования; никакой другой файл
  не суммирует калории по дню самостоятельно (страж AC-diary-and-streak-18 закрывает именно это).
- `confirm-diary-entry.ts` — ЕДИНСТВЕННОЕ место, создающее строки `diary_entry`; `set-diary-entry-portion.ts`
  и `delete-diary-entry.ts` только читают и правят уже существующие.
- Ни один модуль этой фичи не вызывает адаптер поставщика модели и не открывает соединение к `storage`.
