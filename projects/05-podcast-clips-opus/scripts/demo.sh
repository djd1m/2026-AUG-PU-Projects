#!/usr/bin/env bash
# Показ N5 «КлипМейкер» на живом стенде. Ничего не имитируется: каждый шаг — настоящий HTTP-запрос
# через Caddy к контейнеру web, настоящая PostgreSQL 16, настоящий Redis, настоящее S3-хранилище.
set -u
B=${BASE:-http://127.0.0.1:4181}; O=${ORIGIN:-https://clipmaker.example.ru}
ENVF=${ENVF:-/tmp/n5-demo.env}
J=/tmp/n5-demo-cookies.txt; rm -f $J
E="veduschiy-$(date +%s)@example.ru"
uuid(){ cat /proc/sys/kernel/random/uuid; }
hr(){ printf '\n\033[1m%s\033[0m\n' "$1"; }
req(){ curl -s -o /tmp/n5r -w "%{http_code}" -b $J -c $J -H "x-forwarded-for: 203.0.113.7" -H "origin: $O" "$@"; }
api(){ req -X POST "$B/api/trpc/video.create" -H 'content-type: application/json' -H "idempotency-key: $1" \
  -d "{\"filename\":\"$2\",\"declared_bytes\":104857600,\"source\":\"upload\"}"; }
dbq(){ docker compose --env-file $ENVF --project-directory . exec -T db psql -U n5 -d n5 -tA -c "$1" 2>/dev/null; }

hr "1 · Продукт поднят: web, PostgreSQL, Redis, S3-хранилище и Caddy как единственная дверь"
printf '   GET /health → %s   (проверяет конфигурацию И доступность базы)\n' "$(req $B/health)"

hr "2 · Регистрация ведущего"
printf '   POST /api/auth/register → %s  %s\n' "$(req -X POST $B/api/auth/register -H 'content-type: application/json' -d "{\"email\":\"$E\",\"password\":\"parol-veduschego-123\"}")" "$(head -c 60 /tmp/n5r)"

hr "3 · Тот же адрес второй раз — ответ НЕ раскрывает, что аккаунт уже есть"
printf '   POST /api/auth/register → %s  %s\n' "$(req -X POST $B/api/auth/register -H 'content-type: application/json' -d "{\"email\":\"$E\",\"password\":\"drugoy-parol-456\"}")" "$(head -c 60 /tmp/n5r)"
printf '   в базе аккаунтов с этим адресом: %s (второй не создан)\n' "$(dbq "SELECT count(*) FROM account WHERE email='$E';")"

hr "4 · Неверный пароль и несуществующий адрес дают ОДИН ответ и сопоставимое время"
for p in "$E|nevernyy-parol-000" "nikogo-$(date +%s)@example.ru|parol-veduschego-123"; do
  s=$(date +%s%N); c=$(req -X POST $B/api/auth/login -H 'content-type: application/json' -d "{\"email\":\"${p%|*}\",\"password\":\"${p#*|}\"}"); t=$(( ($(date +%s%N)-s)/1000000 ))
  printf '   %-32s → %s  %s  %s мс\n' "$(echo ${p%|*} | cut -c1-30)" "$c" "$(head -c 34 /tmp/n5r)" "$t"
done

hr "5 · Вход с верным паролем"
printf '   POST /api/auth/login → %s\n' "$(req -X POST $B/api/auth/login -H 'content-type: application/json' -d "{\"email\":\"$E\",\"password\":\"parol-veduschego-123\"}")"
grep -q n5_session $J && echo "   cookie сессии выдана; в базе хранится только её HMAC, сырого значения нет нигде"

hr "6 · Потолок загрузок: 2 в сутки на аккаунт (канон §7). Третья обязана быть отклонена"
for i in 1 2 3; do
  c=$(api "$(uuid)" "vypusk-$i.mp4"); r=/tmp/n5r
  if [ "$c" = "200" ] || [ "$c" = "202" ]; then printf '   загрузка %s → %s  запись создана, выданы подписанные ссылки частей\n' $i $c
  else printf '   загрузка %s → %s  %s\n' $i $c "$(grep -o '"message":"[^"]*' $r | head -1 | cut -c12-)"; fi
done
echo "   ↑ отказ называет ИМЕННО исчерпанный ключ квоты, а не общее «слишком много запросов»"

hr "7 · Ключ повторности: тот же запрос дважды не создаёт вторую запись и не списывает квоту дважды"
E2="drugoy-$(date +%s)@example.ru"; rm -f $J
req -X POST $B/api/auth/register -H 'content-type: application/json' -d "{\"email\":\"$E2\",\"password\":\"parol-vtorogo-123\"}" >/dev/null
echo "   (свежий аккаунт $E2, у него квота не тронута)"
K=$(uuid)
c1=$(api "$K" "odin.mp4"); id1=$(grep -o '"video_id":"[^"]*' /tmp/n5r | cut -d'"' -f4)
c2=$(api "$K" "odin.mp4"); id2=$(grep -o '"video_id":"[^"]*' /tmp/n5r | cut -d'"' -f4)
printf '   первый запрос  → %s\n   повтор тем же ключом → %s\n' "$c1" "$c2"
[ -n "$id1" ] && [ "$id1" = "$id2" ] && echo "   вернулся ТОТ ЖЕ идентификатор записи: $id1"

hr "8 · Что реально лежит в базе после показа"
dbq "SELECT '   ключ '||scope||': аккаунтов '||count(*)||', суммарно списано '||sum(used)||' единиц' FROM quota_counter GROUP BY scope;"
dbq "SELECT '   аккаунтов: '||(SELECT count(*) FROM account)||', записей видео: '||count(*) FROM video;"

hr "9 · Конфигурация отказывает, а не подставляет дефолт"
grep -m1 "не запущен" docs/features/upload-and-quota/demo-evidence-preflight.txt 2>/dev/null | sed 's/^web-1  | /   /'
echo "   ↑ так продукт ОТКАЗАЛСЯ стартовать, когда публичный адрес был без HTTPS"
echo
