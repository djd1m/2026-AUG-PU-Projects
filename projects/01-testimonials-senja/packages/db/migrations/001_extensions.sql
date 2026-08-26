-- packages/db/migrations/001_extensions.sql
--
-- Источник: docs/Architecture.md §3.1 — политики RLS кастуют контекст арендатора через
-- `current_setting('app.current_account_id')::uuid`, что подразумевает uuid-первичные ключи на
-- всех "владетельных" сущностях (кроме rate_limit_events — явно bigserial, см. §3.4/006).
--
-- pgcrypto даёт gen_random_uuid(); на postgres:16-alpine (docker-compose.yml) эта функция уже
-- встроена в ядро с PostgreSQL 13, но extension создаём явно и идемпотентно — не полагаемся на
-- версию сервера молча, поведение не должно зависеть от того, какой именно образ Postgres поднят.
create extension if not exists pgcrypto;
