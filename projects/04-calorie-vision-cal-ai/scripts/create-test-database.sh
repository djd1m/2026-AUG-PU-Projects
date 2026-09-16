#!/usr/bin/env bash
# Создаёт базу `n4_test` для интеграционных тестов и выравнивает её права по образцу боевой.
#
# ЗАЧЕМ ОТДЕЛЬНАЯ БАЗА (DEC-A-056): каждый файл интеграционных тестов начинается с TRUNCATE.
# Пока профиль `test` смотрел в боевую базу стенда, один прогон стёр базу продуктов вместе с
# импортом USDA. Экземпляр Postgres общий — отдельная база стоит схемы, а не контейнера.
#
# ЗАЧЕМ СКРИПТ, А НЕ ПАМЯТЬ: база, созданная руками в psql, не воспроизводится на второй
# машине и не переживает пересоздание тома. Права здесь — не мелочь: без владения схемой
# `public` роль миграций не может создать даже таблицу учёта версий.
#
#   bash scripts/create-test-database.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ создаю базу n4_test (если её нет)"
docker compose exec -T db psql -U n4_admin -d n4 -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'n4_test'" | grep -q 1 \
  || docker compose exec -T db psql -U n4_admin -d n4 -c "CREATE DATABASE n4_test OWNER n4_admin"

echo "→ расширения и права по образцу боевой базы"
docker compose exec -T db psql -U n4_admin -d n4_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- В боевой базе схемой public владеет n4_migrate; без этого `SET ROLE n4_migrate` не может
-- создать таблицу версий миграций, и тесты падают на «permission denied for schema public».
ALTER SCHEMA public OWNER TO n4_migrate;
GRANT USAGE ON SCHEMA public TO n4_app;
SQL

echo "→ проверка: владелец схемы и список баз"
docker compose exec -T db psql -U n4_admin -d n4_test -tAc \
  "SELECT nspname || ' → ' || pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public'"
echo "готово. Миграции применит сам прогон тестов (migratedPool)."
