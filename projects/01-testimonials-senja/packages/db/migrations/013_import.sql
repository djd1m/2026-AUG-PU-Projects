-- packages/db/migrations/013_import.sql
--
-- FR-014: импорт отзывов из CSV.
--
-- `source` с дефолтом 'form': существующие строки пришли из формы, и это факт, а не
-- догадка. CHECK вместо свободного текста — третий источник появится только вместе с
-- осознанной правкой схемы, а не опечаткой в коде.
--
-- `import_fingerprint` NULLABLE намеренно. Уникальный индекс по (project_id,
-- import_fingerprint) обеспечивает идемпотентность повторного импорта ОГРАНИЧЕНИЕМ, а не
-- проверкой «нет ли уже такой строки» перед вставкой: проверка оставляет окно между
-- чтением и записью. В проекте это решено так уже дважды — `on conflict (code) do nothing`
-- у партнёрских кодов и `unique(payment_event_id)` у начислений (ADR-006).
--
-- NULL в уникальном индексе Postgres сам с собой не конфликтует, поэтому отзывы из формы
-- (у них отпечатка нет) индексом не ограничены и дублями не считаются.

alter table testimonials
  add column if not exists source text not null default 'form'
    check (source in ('form', 'import')),
  add column if not exists import_fingerprint text;

create unique index if not exists testimonials_project_fingerprint_idx
  on testimonials (project_id, import_fingerprint);

-- Право на вставку роли владельца. До FR-014 ни один аутентифицированный путь в
-- testimonials не писал — публичная форма идёт под app_service, потому что отправитель
-- анонимен, — и грант был не нужен.
--
-- Политика RLS на этой таблице уже объявлена `for all` с `with check (project_id in
-- (select id from projects where account_id = <текущий>))` (007_rls.sql:105-114). То есть
-- вставка под ролью владельца ОГРАНИЧЕНА его собственными проектами самой политикой, без
-- единой строки кода. Это второй, независимый рубеж поверх явного поиска проекта в
-- маршруте — и он сильнее, чем писать под app_service, где подстраховки нет вовсе.
--
-- Комментарий 007_rls.sql:102-103 («insert/delete для этой роли и так запрещены на уровне
-- GRANT») описывал состояние на тот момент и с этой миграцией перестаёт быть верным для
-- insert. Delete по-прежнему не выдан.
grant insert on testimonials to app_authenticated;
