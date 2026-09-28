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
# КУДА ИДЁТ КОМАНДА — ТОЛЬКО ЯВНО (находка 28.09, RV-04/06): имя compose-проекта по умолчанию
# (`name: ${N4_COMPOSE_PROJECT:-n4-tarelka}`) совпадает с ЖИВЫМ стендом. `docker compose exec db`
# без имени при пустом окружении попал бы в `n4-tarelka-db-1` — туда, где данные владельца.
# Поэтому имя тестового проекта обязательно, а имя стенда запрещено. Отказ — код 2 («НЕ
# выполнено»), никакой `docker` до проверки не вызывается. Страж:
# tests/guard/create-test-database-project.test.ts.
#
#   bash scripts/create-test-database.sh -p n4-test
#   COMPOSE_PROJECT_NAME=n4-test bash scripts/create-test-database.sh
set -euo pipefail

# Имя стенда — в коде, не в окружении (fail-closed-defaults: список запретов не должен
# приезжать пустым из переменной).
readonly STAND_PROJECT='n4-tarelka'

refuse() {
  echo "❌ create-test-database: $1 — база НЕ создавалась, docker не вызывался" >&2
  exit 2
}

PROJECT="${COMPOSE_PROJECT_NAME:-}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    -p|--project-name)
      [ "$#" -ge 2 ] || refuse "ключ $1 без значения"
      PROJECT="$2"; shift 2 ;;
    --project-name=*) PROJECT="${1#--project-name=}"; shift ;;
    *) refuse "неизвестный аргумент «$1»; ожидается -p <имя-тестового-проекта>" ;;
  esac
done

[ -n "$PROJECT" ] \
  || refuse "имя compose-проекта не задано (нужен -p <имя> или COMPOSE_PROJECT_NAME); без него команда ушла бы в стенд ${STAND_PROJECT}"
[ "$PROJECT" != "$STAND_PROJECT" ] \
  || refuse "имя проекта «${PROJECT}» — это живой стенд; тестовую базу создавать только в отдельном тестовом проекте"
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] \
  || refuse "имя проекта «${PROJECT}» не годится для compose (строчные латинские буквы, цифры, «-», «_»)"

# Каждый вызов — с явным -p: окружение и .env не могут подменить ИМЯ ПРОЕКТА после проверки.
# Docker-контекст (DOCKER_HOST, docker context) и COMPOSE_FILE этим не закрепляются.
dc() { docker compose -p "$PROJECT" "$@"; }

cd "$(dirname "$0")/.."
echo "→ compose-проект: ${PROJECT}"

echo "→ создаю базу n4_test (если её нет)"
dc exec -T db psql -U n4_admin -d n4 -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'n4_test'" | grep -q 1 \
  || dc exec -T db psql -U n4_admin -d n4 -c "CREATE DATABASE n4_test OWNER n4_admin"

echo "→ расширения и права по образцу боевой базы"
dc exec -T db psql -U n4_admin -d n4_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- В боевой базе схемой public владеет n4_migrate; без этого `SET ROLE n4_migrate` не может
-- создать таблицу версий миграций, и тесты падают на «permission denied for schema public».
ALTER SCHEMA public OWNER TO n4_migrate;
GRANT USAGE ON SCHEMA public TO n4_app;
SQL

echo "→ проверка: владелец схемы и список баз"
dc exec -T db psql -U n4_admin -d n4_test -tAc \
  "SELECT nspname || ' → ' || pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public'"
echo "готово. Миграции применит сам прогон тестов (migratedPool)."
