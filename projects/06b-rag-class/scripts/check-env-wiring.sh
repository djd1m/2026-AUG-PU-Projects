#!/usr/bin/env bash
# Страж проброса окружения: каждое чтение окружения в исходниках web/worker/migrate есть в environment: сервиса compose.
# Перенос N5 scripts/check-env-wiring.sh (#10), адаптирован: compose N6b требует ${VAR:?} без значений по умолчанию,
# поэтому конфиг разворачивается с ПЛЕЙСХОЛДЕРАМИ для имён из .env.example — секреты машины не читаются и не печатаются.
# Коды: 0 — потерь нет · 1 — потеря названа · 2 — проверка НЕ выполнена.
set -u
cd "$(dirname "$0")/.." || exit 2
if ! command -v node >/dev/null 2>&1 || ! node -e "require.resolve('typescript')" >/dev/null 2>&1; then
  echo 'Проверка НЕ ВЫПОЛНЕНА: нужны Node.js и зависимости проекта (npm ci)' >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo 'Проверка НЕ ВЫПОЛНЕНА: docker compose недоступен' >&2
  exit 2
fi
env_file=$(mktemp) || exit 2
config_file=$(mktemp) || { rm -f "$env_file"; exit 2; }
trap 'rm -f "$env_file" "$config_file"' EXIT
names=$(grep -E '^[A-Z][A-Z0-9_]*=' .env.example | cut -d= -f1)
if [ -z "$names" ]; then
  echo 'Проверка НЕ ВЫПОЛНЕНА: в .env.example нет ни одного имени переменной' >&2
  exit 2
fi
# Хостовые порты объявлены как ${VAR:-default} (port-conflicts-local.md) — плейсхолдер сломал бы их синтаксис.
for name in $names; do
  case "$name" in *_PORT) ;; *) printf '%s=placeholder\n' "$name" ;; esac
done > "$env_file"
# compose читает переменные и из окружения процесса — очищаем его, чтобы плейсхолдеры не перекрылись секретами машины.
if ! env -i PATH="$PATH" HOME="${HOME:-/tmp}" ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} \
  docker compose --env-file "$env_file" -f docker-compose.yml config --format json >"$config_file" 2>/dev/null; then
  echo 'Проверка НЕ ВЫПОЛНЕНА: docker compose config не разворачивается (новая ${VAR:?} без имени в .env.example?)' >&2
  exit 2
fi
node scripts/check-env-wiring.mjs "$config_file"
result=$?
if [ "$result" -gt 2 ]; then exit 2; fi
exit "$result"
