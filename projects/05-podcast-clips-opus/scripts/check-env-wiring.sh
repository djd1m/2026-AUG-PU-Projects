#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.." || exit 2
if ! command -v node >/dev/null 2>&1 || ! node -e "require.resolve('typescript')" >/dev/null 2>&1; then
  echo 'Проверка НЕ ВЫПОЛНЕНА: установите Node.js и зависимости проекта' >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo 'Проверка НЕ ВЫПОЛНЕНА: docker compose недоступен' >&2
  exit 2
fi
config_file=$(mktemp) || exit 2
error_file=$(mktemp) || { rm -f "$config_file"; exit 2; }
trap 'rm -f "$config_file" "$error_file"' EXIT
# Не выводим разрешённый compose: он содержит секреты. Ошибки также могут содержать значения.
if ! docker compose --project-directory . --profile test config --format json >"$config_file" 2>"$error_file"; then
  echo 'Проверка НЕ ВЫПОЛНЕНА: compose config недоступен (окружение, права или конфигурация)' >&2
  exit 2
fi
node scripts/check-env-wiring.mjs "$config_file"
result=$?
if [ "$result" -gt 2 ]; then exit 2; fi
exit "$result"
