#!/usr/bin/env bash
# Сквозная проверка пути клиента (CJM) на РАЗВЁРНУТОМ экземпляре.
#
# Зачем отдельно от юнит-тестов. Тесты проверяют функции; здесь проверяется то, что
# функции по отдельности проверить не могут — СОГЛАСОВАННОСТЬ конфигурации с выданными
# наружу артефактами. Конкретный дефект, ради которого скрипт написан: BASE_URL не был
# объявлен в docker-compose.yml, приложение стартовало нормально, тесты были зелёными,
# и при этом КАЖДАЯ выданная владельцу ссылка вела на http://localhost:3000 — то есть
# на машину посетителя. Ни один юнит-тест этого поймать не мог.
#
# Проверка идёт ровно по шагам, которые проходит живой пользователь, и требует, чтобы
# выданные ссылки ОТКРЫВАЛИСЬ, а не просто имели правильный вид.
#
# Запуск:  bash scripts/check-cjm.sh https://proofwall.example.com
# Коды:    0 — путь проходит целиком, 1 — где-то рвётся

set -uo pipefail
BASE="${1:?укажите базовый адрес, напр. bash scripts/check-cjm.sh https://proofwall.example.com}"
BASE="${BASE%/}"
FAIL=0
SLUG="cjm-$(date +%s)"

ok()   { printf '  ✅ %s\n' "$1"; }
fail() { printf '  ❌ %s\n' "$1"; FAIL=1; }
code() { curl -s -o /dev/null -w '%{http_code}' -m 20 "$@"; }

echo "== Путь клиента на $BASE =="

# --- 1. Владелец регистрируется и получает адреса --------------------------
RESP=$(curl -s -i -m 20 -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$SLUG@example.com\",\"password\":\"password-long-enough\",\"desired_slug\":\"$SLUG\",\"project_name\":\"CJM\"}")
COOKIE=$(grep -i '^set-cookie' <<<"$RESP" | sed 's/.*pw_session=\([^;]*\).*/\1/' | tr -d '\r')
BODY=$(grep '^{' <<<"$RESP")
[ -n "$COOKIE" ] && ok "регистрация: сессия выдана" || { fail "регистрация не удалась"; exit 1; }

# --- 2. Выданные ссылки указывают НА ЭТОТ ЖЕ адрес -------------------------
# Это и есть проверка, которой не хватало: не «ссылка есть», а «ссылка ведёт сюда».
for field in submission_form wall_of_love dashboard; do
  url=$(python3 -c "import sys,json;print(json.loads(sys.argv[1])['urls']['$field'])" "$BODY" 2>/dev/null)
  case "$url" in
    "$BASE"/*) ok "$field указывает на $BASE" ;;
    *)         fail "$field ведёт НЕ СЮДА: $url  (проверьте BASE_URL в окружении web)" ;;
  esac
done
snippet=$(python3 -c "import sys,json;print(json.loads(sys.argv[1])['urls']['widget_snippet'])" "$BODY" 2>/dev/null)
case "$snippet" in
  *"$BASE"*) ok "сниппет виджета указывает на $BASE" ;;
  *)         fail "сниппет ведёт НЕ СЮДА: $snippet" ;;
esac

# --- 3. Выданные ссылки ОТКРЫВАЮТСЯ ----------------------------------------
for u in "/f/$SLUG" "/w/$SLUG"; do
  c=$(code "$BASE$u"); [ "$c" = "200" ] && ok "$u открывается" || fail "$u -> $c"
done
c=$(code -b "pw_session=$COOKIE" "$BASE/dashboard/$SLUG")
[ "$c" = "200" ] && ok "/dashboard/$SLUG открывается" || fail "/dashboard/$SLUG -> $c"

# --- 4. Клиент оставляет отзыв ---------------------------------------------
PID=$(curl -s -m 20 -X POST "$BASE/api/testimonials" -H 'content-type: application/json' \
  -d "{\"slug\":\"$SLUG\",\"type\":\"text\",\"name\":\"CJM клиент\",\"text\":\"Проверочный отзыв достаточной длины для валидации границ.\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("public_id",""))' 2>/dev/null)
[ -n "$PID" ] && ok "отзыв принят" || fail "отзыв не принят"

# Считаем СОВПАДЕНИЯ, а не строки: HTML приходит одной строкой, и `grep -c` вернул бы
# единицу и для одной карточки, и для пяти — проверка проходила бы вне зависимости от
# того, сколько отзывов на самом деле отрендерилось.
# -i обязателен: React отдаёт атрибут как itemType (camelCase). Для браузера регистр
# атрибута не важен, для grep — важен.
cards() { curl -s -m 20 "$BASE/w/$SLUG" | grep -oi 'itemtype="https://schema\.org/Review"' | wc -l | tr -d ' '; }

# --- 5. До модерации отзыва на стене НЕТ -----------------------------------
n=$(cards)
[ "$n" = "0" ] && ok "неодобренный отзыв на стене не показан" || fail "на стене $n карточек до модерации"

# --- 6. Владелец одобряет, отзыв появляется --------------------------------
c=$(code -X POST -b "pw_session=$COOKIE" -H 'content-type: application/json' \
     -d '{"status":"approved"}' "$BASE/api/testimonials/$PID/moderate")
[ "$c" = "200" ] && ok "модерация прошла" || fail "модерация -> $c"
n=$(cards)
[ "$n" = "1" ] && ok "одобренный отзыв виден на стене" || fail "на стене $n карточек после одобрения"

# --- 7. Петля роста: badge ведёт СЮДА и несёт метки ------------------------
cfg=$(curl -s -m 20 "$BASE/api/widget/config?slug=$SLUG" -H 'Origin: https://client-site.example')
burl=$(python3 -c 'import sys,json;print(json.load(sys.stdin).get("badge_url",""))' <<<"$cfg" 2>/dev/null)
case "$burl" in
  "$BASE"/*utm_source=widget_badge*) ok "badge ведёт на $BASE с метками источника" ;;
  "") fail "badge_url отсутствует в конфигурации виджета" ;;
  *)  fail "badge ведёт НЕ СЮДА или без меток: $burl" ;;
esac
case "$burl" in
  *utm_campaign=$SLUG*) ok "метка источника называет приведший проект" ;;
  *) fail "в badge_url нет utm_campaign=$SLUG" ;;
esac

echo
[ "$FAIL" -eq 0 ] && echo "Путь клиента проходит целиком." \
  || echo "Путь клиента РВЁТСЯ — см. ❌ выше. Чаще всего причина: BASE_URL не проброшен в web."
exit $FAIL
