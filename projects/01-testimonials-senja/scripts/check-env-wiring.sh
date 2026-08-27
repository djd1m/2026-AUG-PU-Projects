#!/usr/bin/env bash
# Полнота проброса переменных окружения в сервисы compose.
#
# Ловит класс дефектов, при котором приложение стартует нормально и тесты зелёные, а
# наружу выдаётся неверное. Конкретный случай: BASE_URL читался кодом, но отсутствовал
# в environment у web — каждая выданная владельцу ссылка вела на http://localhost:3000.
# Не поймали ни старт контейнера (есть дефолт), ни юнит-тесты (сломана не функция, а то,
# что до неё не доехало значение), ни браузерная проверка (страницы открывались).
#
# Сверяются ДВА множества, и .env.example НЕ является опорой: на прогоне выяснилось, что
# он сам был неполон — BASE_URL отсутствовал и в нём. Опираться на неполный файл значит
# унаследовать его пробел.
#
# Запуск:  bash scripts/check-env-wiring.sh [compose-файлы...]
# Коды:    0 — всё проброшено, 1 — есть потери

set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0

# Переменные, которые читаются кодом, но приходят не из compose: их задаёт рантайм,
# сборка или тестовое окружение. Список ЯВНЫЙ — молчаливых исключений быть не должно.
# NEXT_PHASE ставит сам Next на время сборки (phase-production-build); в рантайме её
# нет и быть не должно — по ней urls.ts отличает сборку от прода, где BASE_URL обязателен.
ALLOWED='NODE_ENV|NEXT_PHASE|PGPOOL_MAX|TEST_DATABASE_URL|S3_REGION|YOOKASSA_API_URL|PAYMENT_PROVIDER|NEXT_PUBLIC_[A-Z0-9_]*'

COMPOSE_ARGS=()
if [ "$#" -gt 0 ]; then for f in "$@"; do COMPOSE_ARGS+=(-f "$f"); done
else COMPOSE_ARGS=(-f docker-compose.yml); fi

echo "== Переменные, читаемые кодом, доезжают до сервиса =="

for svc_dir in apps/web services/worker services/transcribe; do
  [ -d "$svc_dir/src" ] || continue
  svc=$(basename "$svc_dir")
  [ "$svc" = "web" ] && svc=web

  # [A-Z0-9_]+ — с ЦИФРАМИ: без них S3_ENDPOINT обрезается до "S" и даёт ложное
  # срабатывание (поймано при написании этой проверки).
  used=$(grep -rhoE 'process\.env\.[A-Z][A-Z0-9_]*' "$svc_dir/src" 2>/dev/null \
         | sed 's/.*env\.//' | sort -u)
  [ -z "$used" ] && continue

  passed=$(docker compose "${COMPOSE_ARGS[@]}" config 2>/dev/null \
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
done

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "     Добавить в environment соответствующего сервиса в docker-compose.yml."
  echo "     Приложение стартует и без них — ошибка видна только в поведении."
fi
exit $FAIL
