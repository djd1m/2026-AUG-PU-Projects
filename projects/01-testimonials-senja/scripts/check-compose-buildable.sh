#!/usr/bin/env bash
# Проверка сборочного контракта docker-compose (D-008, Phase 3 /start).
#
# Ловит класс дефектов, из-за которого в проекте 01 НЕ СОБИРАЛСЯ НИ ОДИН образ, а пайплайн
# при этом был зелёным. Все проверки детерминированные — слой 1 по лестнице стоимости
# обнаружения (CLAUDE.md), а не «ревьюер заметит».
#
# Запуск из корня проекта:  bash scripts/check-compose-buildable.sh
# Код возврата: 0 — чисто, 1 — есть блокеры.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

COMPOSE=docker-compose.yml
FAIL=0

fail() { printf '  ❌ %s\n' "$1"; FAIL=1; }
ok()   { printf '  ✅ %s\n' "$1"; }

[ -f "$COMPOSE" ] || { echo "нет $COMPOSE"; exit 2; }

# Список сервисов со сборкой и их dockerfile-путей.
mapfile -t DOCKERFILES < <(grep -oE 'dockerfile:[[:space:]]*[^[:space:]]+' "$COMPOSE" | awk '{print $2}')
# Плюс краткая форма `build: ./path` — она же и есть дефект контекста, но проверим содержимое.
mapfile -t SHORTBUILDS < <(grep -oE '^[[:space:]]+build:[[:space:]]*\./[^[:space:]]+' "$COMPOSE" | awk '{print $2}')

echo "== 1. У сервиса со сборкой есть исходники, а не только Dockerfile =="
for df in "${DOCKERFILES[@]}"; do
  dir="$(dirname "$df")"
  if [ ! -f "$df" ]; then fail "$df объявлен в compose, но файла нет"; continue; fi
  # Исходниками считаем package.json — без него npm workspaces пакет не видит вовсе.
  if [ ! -f "$dir/package.json" ]; then
    fail "$dir — только Dockerfile, нет package.json (сборка упадёт, сервис не поднимется)"
  else
    ok "$dir — исходники на месте"
  fi
done
for sb in "${SHORTBUILDS[@]:-}"; do
  [ -n "${sb:-}" ] && fail "build: $sb — краткая форма контекста; в монорепо package-lock.json только в корне, нужен context: . + dockerfile:"
done

echo "== 2. Dockerfile не запускает dist/, которого сам не собирает =="
for df in "${DOCKERFILES[@]}"; do
  [ -f "$df" ] || continue
  if grep -qE 'CMD.*dist/' "$df" && ! grep -qE 'RUN (npm run build|npx tsc|tsc )' "$df"; then
    fail "$df: CMD запускает dist/, но в образе нет шага сборки → MODULE_NOT_FOUND при старте"
  else
    ok "$(basename "$(dirname "$df")"): CMD и шаг сборки согласованы"
  fi
done

echo "== 3. Образы закреплены тегом (плавающий :latest = невоспроизводимый деплой) =="
while read -r img; do
  case "$img" in
    *:*) ok "$img — тег закреплён" ;;
    "")  ;;
    *)   fail "image: $img без тега = :latest" ;;
  esac
done < <(grep -oE '^[[:space:]]+image:[[:space:]]*[^[:space:]#]+' "$COMPOSE" | awk '{print $2}')

echo "== 4. Есть .dockerignore (иначе COPY . . тащит node_modules, tests и .env в образ) =="
if [ -f .dockerignore ]; then
  grep -q '^\.env$' .dockerignore \
    && ok ".dockerignore есть и исключает .env" \
    || fail ".dockerignore есть, но не исключает .env — секреты попадут в слой образа"
else
  fail "нет .dockerignore"
fi

echo "== 5. depends_on ждёт здоровья там, где healthcheck объявлен =="
if grep -q 'condition: service_started' "$COMPOSE"; then
  # Не блокер: у сервиса может не быть healthcheck. Предупреждаем адресно.
  printf '  ⚠️  есть condition: service_started — проверить, нет ли у этого сервиса healthcheck\n'
else
  ok "все зависимости ждут service_healthy"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "Блокирующих проблем нет."
else
  echo "Есть блокеры сборки — см. ❌ выше. Разбор класса дефектов: decisions/D-008-web-app-missing.md"
fi
exit "$FAIL"
