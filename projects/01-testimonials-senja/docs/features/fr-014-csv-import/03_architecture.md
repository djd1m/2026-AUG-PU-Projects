# FR-014 · Архитектура

## Что меняется

| Файл | Изменение | Требование |
|---|---|---|
| `packages/db/migrations/013_import.sql` | **новый** — `source`, `import_fingerprint`, уникальный индекс | FR-014.3, .4 |
| `apps/web/src/lib/csv-import.ts` | **новый** — разбор, отпечаток, запись | все |
| `apps/web/src/app/api/import/route.ts` | **новый** — предпросмотр и запись | FR-014.2, NFR-014.4, .6 |
| `apps/web/src/app/dashboard/[slug]/import-form.tsx` | **новый** — форма загрузки и сопоставления | FR-014.1, .2, .5 |
| `apps/web/src/app/dashboard/[slug]/page.tsx` | подключение формы | FR-014.1 |
| `apps/web/tests/csv-import.test.ts` | **новый** | AC-014.1 – .14 |
| `apps/web/tests/login.test.ts` | правка: маршрут в страж предела тела | AC-014.8 |
| `apps/web/tests/design-tokens.test.ts` | правка: форма в `PAGES` | — |

## Миграция

```sql
alter table testimonials
  add column if not exists source text not null default 'form'
    check (source in ('form', 'import')),
  add column if not exists import_fingerprint text;

create unique index if not exists testimonials_project_fingerprint_idx
  on testimonials (project_id, import_fingerprint);
```

`default 'form'` для существующих строк — они пришли из формы, и это факт, а не догадка.
`import_fingerprint` nullable: у отзывов из формы его нет, и уникальный индекс на них не
действует, потому что NULL в Postgres сам с собой не конфликтует. Это и есть механизм
AC-014.10 — импорт не считает дублями то, что прислали люди.

`check (source in ('form','import'))` вместо свободного текста: третий источник появится
только вместе с осознанной правкой схемы, а не опечаткой в коде.

## Граница ответственности

`lib/csv-import.ts` не знает про HTTP: принимает сырой текст и сопоставление колонок,
возвращает разобранные и отклонённые строки; отдельной функцией принимает `client` и пишет.
Маршрут читает тело, берёт проект из сессии и превращает результат в ответ.

```ts
export type ParseResult =
  | { ok: true; rows: ImportRow[]; rejected: RejectedRow[] }
  | { ok: false; error: string };
```

**Разбор и запись — РАЗНЫЕ функции, и это несущее.** Одна функция, делающая и то и другое,
не позволила бы предпросмотру не писать: «не писать» стало бы флагом, а флаг однажды
передадут неверно. Здесь предпросмотр физически не имеет доступа к `client`.

## Почему предел тела свой, а не `MAX_JSON_BODY`

`MAX_JSON_BODY` = 4096 байт — это форма входа. CSV на 500 отзывов в них не поместится.
Поэтому вводится `MAX_IMPORT_BODY`, и это **не** нарушение правила единственности: правило
требует одной РЕАЛИЗАЦИИ предела (`readBodyAtMost`), а не одного значения для всех маршрутов.
Значение здесь другое осознанно и названо числом.

Соотношение проверяется: `MAX_IMPORT_ROWS × разумная длина строки` должно помещаться в
`MAX_IMPORT_BODY`, иначе предел строк недостижим и существует только на бумаге.

## Роль БД

Путь дашбордный → `withAccount`, роль `app_authenticated`. На `testimonials` RLS **работает**
(`007_rls.sql`), в отличие от `accounts`/`sessions` из FR-010 и партнёрских таблиц из FR-011.
Это первая фича за три, где подстраховка есть.

Фильтр по `project_id` всё равно ставится явно: RLS — второй рубеж, а не замена первому, и
проект приходит из проверенной сессии, а не из тела.
