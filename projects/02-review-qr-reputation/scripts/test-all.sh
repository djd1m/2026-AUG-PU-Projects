#!/usr/bin/env bash
# Прогон ВСЕХ наборов на одноразовой базе, собранной из файлов миграций.
#
# ЗАЧЕМ ОН СУЩЕСТВУЕТ. `npm test` (голый `vitest run`) для этого проекта не работает НИКОГДА, и
# это не неудобство, а ловушка: он падает так, будто сломан проект. Каждый набор в первой строке
# подменяет СВОЮ переменную значением TEST_DATABASE_URL:
#
#   owner/http/payment → DATABASE_URL_OWNER    purity  → DATABASE_URL_RENDER
#   intake             → DATABASE_URL_INTAKE   binder/notifier/expire → DATABASE_URL_NOTIFY
#
# У ролей РАЗНЫЕ права по построению (это несущий инвариант проекта: у гостевых путей своя роль,
# у нотифаера своя, RLS проверяется настоящей ролью, а не суперпользователем). Значит одного
# значения TEST_DATABASE_URL на все наборы не существует, и наборы обязаны идти по одному, каждый
# под своей ролью.
#
# ЧЕМ ЗАСЛУЖЕН. 02.09.2026 прогон «всех наборов сразу» дал 37 падений с `permission denied`, и
# это было прочитано как «файлы миграций не воспроизводят рабочую базу». Владельцу так и было
# сказано, и он поручил чинить миграции. Чинить было нечего: под правильными ролями на чистой
# базе проходят все 103 теста. Ошибочный диагноз стоил бы дня работы над несуществующим дефектом.
#
# СООТВЕТСТВИЕ РОЛЕЙ ВЫВОДИТСЯ ИЗ ИСХОДНИКОВ, а не зашито списком. Зашитый список разошёлся бы с
# тестами при первом же новом наборе — молча и в ту же сторону: набор пошёл бы под чужой ролью и
# упал бы «правами». Здесь набор без распознанной переменной ОСТАНАВЛИВАЕТ прогон.
#
# Коды возврата — три, и третий главный:
#   0  все наборы пройдены
#   1  есть падения (названы)
#   2  ПРОВЕРКА НЕ ВЫПОЛНЕНА: нет docker, база не поднялась, миграции не легли, у набора не
#      определилась роль. Это никогда не значит «всё в порядке».

set -uo pipefail
cd "$(dirname "$0")/.."

PG_IMAGE="postgres:16-alpine"
NODE_IMAGE="node:22-alpine"
NET="rq-test-$$"
PG="rq-test-pg-$$"
KEEP="${KEEP_DB:-}"

cleanup() {
  [ -n "$KEEP" ] && { echo "   база оставлена: контейнер $PG в сети $NET (KEEP_DB)"; return; }
  docker rm -f "$PG" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
}
trap cleanup EXIT

command -v docker >/dev/null 2>&1 || { echo "❌ docker недоступен — проверка НЕ выполнена" >&2; exit 2; }

# ── роли по наборам: вывод из первой строки каждого файла
declare -A ROLE_OF_VAR=(
  [DATABASE_URL_OWNER]=app_owner
  [DATABASE_URL_RENDER]=app_render
  [DATABASE_URL_INTAKE]=app_intake
  [DATABASE_URL_NOTIFY]=app_notify
)

SUITES=()
while IFS= read -r f; do
  var=$(grep -oE 'process\.env\.DATABASE_URL_[A-Z]+ = process\.env\.TEST_DATABASE_URL' "$f" \
        | head -1 | sed 's/ = .*//; s/process\.env\.//')
  if [ -z "$var" ]; then
    echo "❌ $f не объявляет, какую роль подменяет — проверка НЕ выполнена" >&2
    echo "   добавьте строку вида: process.env.DATABASE_URL_<РОЛЬ> = process.env.TEST_DATABASE_URL" >&2
    exit 2
  fi
  role="${ROLE_OF_VAR[$var]:-}"
  if [ -z "$role" ]; then
    echo "❌ $f требует $var, а такой роли в соответствии нет — проверка НЕ выполнена" >&2
    exit 2
  fi
  SUITES+=("$f|$role")
done < <(find apps services -path '*/tests/*.test.ts' | sort)

[ "${#SUITES[@]}" -gt 0 ] || { echo "❌ наборов не найдено — проверка НЕ выполнена" >&2; exit 2; }

echo "── одноразовая база (без единой публикации порта наружу)"
docker network create "$NET" >/dev/null 2>&1
docker run -d --name "$PG" --network "$NET" \
  -e POSTGRES_USER=reviewqr -e POSTGRES_DB=reviewqr -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$PG_IMAGE" >/dev/null 2>&1 || { echo "❌ база не поднялась — проверка НЕ выполнена" >&2; exit 2; }
[ "$(docker port "$PG" | wc -l)" = "0" ] || { echo "❌ у тестовой базы есть публикация порта" >&2; exit 2; }

for _ in $(seq 1 40); do docker exec "$PG" pg_isready -U reviewqr -q && break; sleep 1; done
docker exec "$PG" pg_isready -U reviewqr -q || { echo "❌ база не отвечает — проверка НЕ выполнена" >&2; exit 2; }

echo "── миграции из файлов, с нуля"
docker run --rm --network "$NET" -v "$PWD":/app -w /app \
  -e DATABASE_URL_MIGRATE="postgres://reviewqr@$PG:5432/reviewqr" \
  "$NODE_IMAGE" sh -c 'npx tsx packages/db/src/migrate.ts' 2>&1 | grep -E '^(apply|применено)' \
  || { echo "❌ миграции не легли — проверка НЕ выполнена" >&2; exit 2; }

FAILED=()
TOTAL=0; PASSED=0
echo "── наборы, каждый под своей ролью"
for entry in "${SUITES[@]}"; do
  file="${entry%|*}"; role="${entry#*|}"
  out=$(docker run --rm --network "$NET" -v "$PWD":/app -w /app \
    -e TEST_DATABASE_URL="postgres://$role@$PG:5432/reviewqr" \
    -e TEST_ADMIN_URL="postgres://reviewqr@$PG:5432/reviewqr" \
    -e BASE_URL='https://reviewqr.aicoding.space' \
    -e SESSION_SECRET='test-secret-test-secret-test-secret' \
    "$NODE_IMAGE" sh -c "npx vitest run $file 2>&1")
  line=$(printf '%s\n' "$out" | grep -E '^ +Tests ' | tail -1)
  n=$(printf '%s\n' "$line" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')
  f=$(printf '%s\n' "$line" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+')
  PASSED=$((PASSED + ${n:-0})); TOTAL=$((TOTAL + ${n:-0} + ${f:-0}))
  if [ -n "${f:-}" ] || [ -z "$line" ]; then
    FAILED+=("$file")
    printf '  ❌ %-44s (%s) %s\n' "$(basename "$file")" "$role" "${line:-набор не отчитался}"
    printf '%s\n' "$out" | grep -E '^ +(FAIL|AssertionError|error:)' | head -4 | sed 's/^/       /'
  else
    printf '  ✅ %-44s (%s) %s\n' "$(basename "$file")" "$role" "$line"
  fi
done

echo
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "❌ пройдено $PASSED из $TOTAL · падают наборы: ${FAILED[*]}"
  exit 1
fi
echo "✅ пройдено $PASSED из $TOTAL — на базе, собранной из файлов миграций с нуля"
echo "   Что это доказывает: схема воспроизводима, и права ролей достаточны для каждого пути."
echo "   Чего НЕ доказывает: что живая база совпадает с файлами — это отдельный вопрос,"
echo "   ответ на него даёт сравнение прав живой базы с чистой, а не этот прогон."
exit 0
