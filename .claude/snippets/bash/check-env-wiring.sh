#!/usr/bin/env bash
# Полнота проброса переменных окружения в сервисы docker compose.
#
# Обобщённая версия. Источник: projects/01-testimonials-senja, 2026-08-27.
# Ловит класс дефектов «приложение стартует, тесты зелёные, наружу выдаётся неверное»:
# переменная читается кодом, имеет тихий дефолт, но не передана сервису в compose.
#
# Каталог исходников сервиса берётся как `context` + каталог его `dockerfile`.
# Это работает и в монорепо (context = корень, dockerfile = apps/web/Dockerfile → apps/web),
# и в простой раскладке (context = ./svc, dockerfile = Dockerfile → сам context).
# Брать один только `context` НЕЛЬЗЯ: в монорепо он одинаков у всех сервисов, и проверка
# посчитает переменные всего репозитория для каждого — сплошные ложные срабатывания
# (поймано при обобщении: 32 «потери» на проекте, где их не было).
#
# Запуск:  bash check-env-wiring.sh [-f compose.yml ...]
# Коды:    0 — всё проброшено, 1 — есть потери, 2 — конфиг compose нечитаем

set -uo pipefail
FAIL=0

# Переменные, приходящие не из compose (рантайм, сборка, тестовое окружение).
# Список ЯВНЫЙ: молчаливое исключение прячет настоящую потерю.
# Правь под проект — но каждой строке нужна причина.
ALLOWED="${ENV_WIRING_ALLOWED:-NODE_ENV|CI|PORT|NEXT_PUBLIC_[A-Z0-9_]*}"

COMPOSE_ARGS=()
if [ "$#" -gt 0 ]; then COMPOSE_ARGS=("$@"); else COMPOSE_ARGS=(-f docker-compose.yml); fi

CONFIG=$(docker compose "${COMPOSE_ARGS[@]}" config 2>/dev/null) || CONFIG=""
if [ -z "$CONFIG" ]; then
  # Падать громко: пустой конфиг молча даёт «потерь нет» — это ложное «всё хорошо».
  echo "❌ docker compose config нечитаем — проверка НЕ выполнена" >&2
  exit 2
fi

echo "== Переменные, читаемые кодом, доезжают до сервиса =="

# service -> build.context из развёрнутого конфига
while read -r svc ctx; do
  [ -z "$ctx" ] && continue
  [ -d "$ctx" ] || continue

  # [A-Z][A-Z0-9_]* — с ЦИФРАМИ. Без них S3_ENDPOINT обрезается до "S" и даёт
  # ложное срабатывание (поймано при написании этой проверки).
  used=$(grep -rhoE 'process\.env\.[A-Z][A-Z0-9_]*|os\.environ(\.get\(|\[)['"'"'"][A-Z][A-Z0-9_]*' \
         "$ctx" --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.py' \
         --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist 2>/dev/null \
         | grep -oE '[A-Z][A-Z0-9_]*$' | sort -u)
  [ -z "$used" ] && continue

  passed=$(printf '%s\n' "$CONFIG" \
           | sed -n "/^  ${svc}:/,/^  [a-z]/p" \
           | grep -oE '^[[:space:]]+[A-Z][A-Z0-9_]*:' | tr -d ' :' | sort -u)

  missing=$(comm -23 <(echo "$used") <(echo "$passed") | grep -vxE "$ALLOWED" || true)

  if [ -n "$missing" ]; then
    while read -r v; do
      [ -n "$v" ] && { printf '  ❌ %s: %s читается кодом, но не передаётся сервису\n' "$svc" "$v"; FAIL=1; }
    done <<<"$missing"
  else
    printf '  ✅ %s: все читаемые переменные проброшены\n' "$svc"
  fi
done < <(printf '%s\n' "$CONFIG" | awk '
  /^  [a-zA-Z0-9_-]+:$/ { svc=$1; sub(/:$/,"",svc); ctx=""; df="" }
  /^      context:/     { ctx=$2 }
  /^      dockerfile:/  {
      df=$2
      sub(/\/?[^\/]*$/, "", df)          # каталог, в котором лежит Dockerfile
      if (df == "") print svc, ctx        # Dockerfile в корне context — сам context
      else          print svc, ctx "/" df
  }
')

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "     Добавить в environment соответствующего сервиса."
  echo "     Приложение стартует и без них — ошибка видна только в поведении."
fi
exit $FAIL
