#!/usr/bin/env bash
# Включить живую оплату ЮKassa на стенде N6 (фича 14, A-N6-040): спросить ключи магазина, вписать их в env стенда
# (вне git), перезапустить web и проверить, что он поднялся. Секрет вводится без эха и НИКУДА не печатается.
#
#   bash scripts/stand-set-yookassa.sh                      # env стенда по умолчанию, с перезапуском web
#   bash scripts/stand-set-yookassa.sh <путь-к-env> --no-restart   # только записать (для проверки скрипта)
#
# Проверки — те же, что делает web при старте (apps/web/src/server/payments/config.ts): shopId — десятичный,
# секрет — без краевых пробелов, YOOKASSA_TEST_MODE — ровно true|false. Дополнительно: тестовый ключ ЮKassa
# начинается с test_, боевой — с live_; несовпадение с режимом — отказ.
# Коды: 0 — записано (и web здоров); 1 — ввод отклонён или web не поднялся (env возвращён из копии); 2 — не выполнено.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

ENV_FILE="${1:-/home/dz-projects-2026/.n6-stand/stand.env}"
RESTART=1
[[ "${2:-}" == "--no-restart" ]] && RESTART=0

[[ -f "$ENV_FILE" && -w "$ENV_FILE" ]] || { echo "НЕ ВЫПОЛНЕНО: env стенда не найден или не доступен на запись: $ENV_FILE" >&2; exit 2; }

echo "Включение оплаты ЮKassa на стенде N6. Env: $ENV_FILE"
IFS= read -rp "shopId магазина (цифры): " SHOP_ID
[[ "$SHOP_ID" =~ ^[0-9]{1,64}$ ]] || { echo "Отказ: shopId должен состоять только из цифр" >&2; exit 1; }

# IFS= — ввод читается как есть: иначе read сам срежет краевые пробелы, и проверка ниже их не увидит.
IFS= read -rsp "Секретный ключ (ввод не отображается): " SECRET; echo
if [[ -z "$SECRET" || ${#SECRET} -gt 512 || "$SECRET" =~ ^[[:space:]] || "$SECRET" =~ [[:space:]]$ ]]; then
  echo "Отказ: секретный ключ пустой, длиннее 512 символов или с пробелами по краям" >&2; exit 1
fi

read -rp "Тестовый магазин? [Y/n]: " TEST_ANSWER
case "${TEST_ANSWER:-y}" in
  [yYдД]*) TEST_MODE=true;  PREFIX=test_ ;;
  [nNнН]*) TEST_MODE=false; PREFIX=live_ ;;
  *) echo "Отказ: ответ должен быть y или n" >&2; exit 1 ;;
esac
[[ "$SECRET" == "$PREFIX"* ]] || { echo "Отказ: для YOOKASSA_TEST_MODE=$TEST_MODE ключ ЮKassa должен начинаться с $PREFIX" >&2; exit 1; }

BACKUP="$ENV_FILE.bak-yookassa-$(date +%Y%m%d-%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP" && chmod 600 "$BACKUP" || { echo "НЕ ВЫПОЛНЕНО: не удалось сделать резервную копию env" >&2; exit 2; }

# Значения передаются через окружение awk, а не в текст программы: секрет с любыми символами не ломает запись.
# Файл перезаписывается на месте (права 600 и владелец сохраняются).
TMP="$(mktemp)"; chmod 600 "$TMP"
V_MODE=live V_SHOP="$SHOP_ID" V_SECRET="$SECRET" V_TEST="$TEST_MODE" awk '
  BEGIN { want["N6_PAYMENTS_MODE"]=ENVIRON["V_MODE"]; want["YOOKASSA_SHOP_ID"]=ENVIRON["V_SHOP"];
          want["YOOKASSA_SECRET_KEY"]=ENVIRON["V_SECRET"]; want["YOOKASSA_TEST_MODE"]=ENVIRON["V_TEST"] }
  { split($0, kv, "="); k=kv[1]; if (k in want) { print k "=" want[k]; seen[k]=1; next } print }
  END { for (k in want) if (!(k in seen)) print k "=" want[k] }
' "$ENV_FILE" > "$TMP" && cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"; unset SECRET

for k in N6_PAYMENTS_MODE YOOKASSA_SHOP_ID YOOKASSA_SECRET_KEY YOOKASSA_TEST_MODE; do
  [[ $(grep -c "^$k=" "$ENV_FILE") -eq 1 ]] || { cat "$BACKUP" > "$ENV_FILE"; echo "НЕ ВЫПОЛНЕНО: $k записан не ровно один раз — env возвращён из копии" >&2; exit 2; }
done
echo "Записано: N6_PAYMENTS_MODE=live, YOOKASSA_SHOP_ID=$SHOP_ID, YOOKASSA_TEST_MODE=$TEST_MODE, YOOKASSA_SECRET_KEY=<скрыт>. Копия: $BACKUP"

ORIGIN="$(grep -m1 '^N6_PUBLIC_ORIGIN=' "$ENV_FILE" | cut -d= -f2-)"
[[ $RESTART -eq 1 ]] || { echo "Перезапуск пропущен (--no-restart)."; exit 0; }

COMPOSE=(docker compose -f docker-compose.yml -f compose.stand.yml --env-file "$ENV_FILE")
echo "Перезапуск web…"
"${COMPOSE[@]}" up -d --no-deps --force-recreate web >/dev/null 2>&1
for _ in $(seq 1 24); do
  state="$(docker inspect -f '{{.State.Health.Status}}' n6-sufler-web-1 2>/dev/null)"
  [[ "$state" == healthy ]] && break
  sleep 5
done
if [[ "${state:-}" != healthy ]]; then
  echo "web не поднялся (состояние: ${state:-нет}). Последние строки журнала:" >&2
  docker logs --tail 15 n6-sufler-web-1 2>&1 | grep -v -i 'secret' >&2
  cat "$BACKUP" > "$ENV_FILE"
  "${COMPOSE[@]}" up -d --no-deps --force-recreate web >/dev/null 2>&1
  echo "Env возвращён из копии, web перезапущен с прежними настройками (оплата выключена)." >&2
  exit 1
fi
echo "Готово: web здоров, оплата включена."
echo "В кабинете ЮKassa укажите адрес уведомлений: ${ORIGIN}/api/webhooks/yookassa"
echo "События: payment.succeeded и refund.succeeded."
