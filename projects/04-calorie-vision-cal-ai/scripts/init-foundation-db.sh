#!/usr/bin/env bash
# Бутстрап КЛАСТЕРА: роли n4_migrate и n4_app (FR-foundation-3).
#
# Происхождение: форма взята из projects/03a-affiliate-rewardful/scripts/init-foundation-db.sh
# и переписана под роли N4. Выполняется docker-entrypoint-initdb.d ОДИН раз при первой
# инициализации тома данных, от имени POSTGRES_USER.
#
# Почему роли здесь, а не в 001_init.sql: роль — объект КЛАСТЕРА, а не схемы, и её пароль
# не имеет права лежать в файле, который коммитится. Миграция 001 выдаёт роли n4_app права
# на созданные ею объекты — это уже объекты схемы, и там им место.
#
# n4_migrate создаётся БЕЗ права входа и БЕЗ пароля: четвёртая учётная запись ради названия
# роли была бы лишним секретом. Раннер подключается как n4_admin и делает SET ROLE n4_migrate,
# что разрешено членством, выданным ниже.
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER обязателен}"
: "${POSTGRES_DB:?POSTGRES_DB обязателен}"
: "${N4_DB_APP_PASSWORD:?N4_DB_APP_PASSWORD обязателен: без него роль приложения не создаётся, и пустое значение не означает «без пароля»}"

if [[ "$POSTGRES_USER" != n4_admin || "$POSTGRES_DB" != n4 ]]; then
  echo 'бутстрап N4 требует своей базы n4 и администратора n4_admin' >&2
  exit 1
fi
if [[ "${N4_DB_ADMIN_PASSWORD:-}" == "$N4_DB_APP_PASSWORD" ]]; then
  echo 'пароль администратора и пароль роли приложения обязаны различаться' >&2
  exit 1
fi

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
     --set app_password="$N4_DB_APP_PASSWORD" <<'SQL'
BEGIN;

-- Владелец схемы. NOLOGIN: снаружи под ним не подключаются, в него ВХОДЯТ через SET ROLE.
CREATE ROLE n4_migrate NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Роль приложения: DML и только DML. Права на таблицы выдаёт миграция 001.
CREATE ROLE n4_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_password';

-- Членство: n4_admin имеет право стать n4_migrate. Без него SET ROLE в раннере откажет.
GRANT n4_migrate TO n4_admin;

REVOKE ALL ON DATABASE n4 FROM PUBLIC;
GRANT CONNECT ON DATABASE n4 TO n4_app, n4_migrate;
GRANT CREATE, TEMPORARY ON DATABASE n4 TO n4_migrate;

-- Схема public принадлежит владельцу схемы, а не всем подряд.
ALTER SCHEMA public OWNER TO n4_migrate;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO n4_app;

-- Запрос приложения не имеет права ждать блокировку вечно.
ALTER ROLE n4_app SET lock_timeout = '2s';
ALTER ROLE n4_app SET statement_timeout = '10s';

COMMIT;
SQL

echo 'роли n4_migrate и n4_app созданы'
