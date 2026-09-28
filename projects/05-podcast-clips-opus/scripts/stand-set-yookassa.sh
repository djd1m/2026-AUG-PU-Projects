#!/usr/bin/env bash
# из N6: projects/06-rag-sales-chatbase/scripts/stand-set-yookassa.sh — адаптировано (фича 30 payments, OWN-019 п.4):
# env стенда N5 (.env.n5-demo в каталоге проекта, вне git), переменная N5_PAYMENTS_MODE, контейнер web проекта
# n5-clipmaker, адрес уведомлений из N5_PUBLIC_ORIGIN. Включить живую оплату ЮKassa на стенде: спросить ключи магазина,
# вписать их в env стенда, перезапустить web и проверить, что он поднялся. Секрет вводится без эха и НИКУДА не печатается.
#
#   bash scripts/stand-set-yookassa.sh                               # env стенда по умолчанию, с перезапуском web
#   bash scripts/stand-set-yookassa.sh <путь-к-env> --no-restart     # только записать (для проверки скрипта)
#
# Проверки — те же, что делает web при старте (packages/shared/src/tariff.ts, loadPaymentsConfig): shopId — десятичный,
# секрет — без краевых пробелов, YOOKASSA_TEST_MODE — ровно true|false. Дополнительно: тестовый ключ ЮKassa начинается
# с test_, боевой — с live_; несовпадение с режимом — отказ. Если в env нет N5_LIMIT_PAID_USER_MINUTES (потолок минут
# тарифа paid, OWN-019), скрипт отказывается: без него стенд не поднимется вовсе (${…:?} в compose), и это решение
# владельца, а не скрипта.
# Коды: 0 — записано (и web здоров); 1 — ввод отклонён или web не поднялся, env возвращён из копии И откат подтверждён
# (новый контейнер web здоров, режим оплаты в нём не live); 2 — не выполнено ЛИБО откат НЕ подтверждён (смотреть руками).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

ENV_FILE="${1:-.env.n5-demo}"
RESTART=1
[[ "${2:-}" == "--no-restart" ]] && RESTART=0

[[ -f "$ENV_FILE" && -w "$ENV_FILE" ]] || { echo "НЕ ВЫПОЛНЕНО: env стенда не найден или не доступен на запись: $ENV_FILE" >&2; exit 2; }
grep -qE '^N5_LIMIT_PAID_USER_MINUTES=[1-9][0-9]*$' "$ENV_FILE" \
  || { echo "НЕ ВЫПОЛНЕНО: в $ENV_FILE нет N5_LIMIT_PAID_USER_MINUTES (OWN-019: 270). Добавьте строку и выкатите код фичи 30 до включения оплаты" >&2; exit 2; }
ORIGIN="$(grep -m1 '^N5_PUBLIC_ORIGIN=' "$ENV_FILE" | cut -d= -f2-)"
[[ "$ORIGIN" =~ ^https://[^/]+$ ]] || { echo "НЕ ВЫПОЛНЕНО: N5_PUBLIC_ORIGIN в $ENV_FILE не https-origin — адрес уведомлений не определить" >&2; exit 2; }

echo "Включение оплаты ЮKassa на стенде N5. Env: $ENV_FILE"
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
# Файл перезаписывается на месте (права и владелец сохраняются).
TMP="$(mktemp)"; chmod 600 "$TMP"
V_MODE=live V_SHOP="$SHOP_ID" V_SECRET="$SECRET" V_TEST="$TEST_MODE" awk '
  BEGIN { want["N5_PAYMENTS_MODE"]=ENVIRON["V_MODE"]; want["YOOKASSA_SHOP_ID"]=ENVIRON["V_SHOP"];
          want["YOOKASSA_SECRET_KEY"]=ENVIRON["V_SECRET"]; want["YOOKASSA_TEST_MODE"]=ENVIRON["V_TEST"] }
  { split($0, kv, "="); k=kv[1]; if (k in want) { print k "=" want[k]; seen[k]=1; next } print }
  END { for (k in want) if (!(k in seen)) print k "=" want[k] }
' "$ENV_FILE" > "$TMP" && cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"; unset SECRET

for k in N5_PAYMENTS_MODE YOOKASSA_SHOP_ID YOOKASSA_SECRET_KEY YOOKASSA_TEST_MODE; do
  [[ $(grep -c "^$k=" "$ENV_FILE") -eq 1 ]] || { cat "$BACKUP" > "$ENV_FILE"; echo "НЕ ВЫПОЛНЕНО: $k записан не ровно один раз — env возвращён из копии" >&2; exit 2; }
done
echo "Записано: N5_PAYMENTS_MODE=live, YOOKASSA_SHOP_ID=$SHOP_ID, YOOKASSA_TEST_MODE=$TEST_MODE, YOOKASSA_SECRET_KEY=<скрыт>. Копия: $BACKUP"
[[ $RESTART -eq 1 ]] || { echo "Перезапуск пропущен (--no-restart)."; exit 0; }

COMPOSE=(docker compose --project-directory . --env-file "$ENV_FILE")
# Контейнер web берётся у ТОГО ЖЕ compose-проекта (не по имени): здоровье старого контейнера — не доказательство.
OLD_ID="$("${COMPOSE[@]}" ps -q web 2>/dev/null)"
# Откат подтверждается так же строго, как включение (ревью фичи 30, круг 2, находка 2): env совпал с копией, compose up
# выполнился, контейнер пересоздан, здоров и режим в нём не live. Иначе — «откат НЕ подтверждён», код 2, без заверений.
unconfirmed() { echo "ОТКАТ НЕ ПОДТВЕРЖДЁН: $1. Проверьте руками: docker compose --project-directory . --env-file $ENV_FILE ps web; копия env — $BACKUP" >&2; exit 2; }
rollback() {
  echo "$1" >&2
  [[ -n "${2:-}" ]] && docker logs --tail 15 "$2" 2>&1 | grep -v -i 'secret' >&2
  local failed_id back_id back_state=""
  failed_id="$("${COMPOSE[@]}" ps -q web 2>/dev/null)"
  cat "$BACKUP" > "$ENV_FILE" && cmp -s "$BACKUP" "$ENV_FILE" || unconfirmed "env не восстановлен из копии"
  "${COMPOSE[@]}" up -d --no-deps --force-recreate web >/dev/null 2>&1 || unconfirmed "docker compose up при откате вернул ошибку"
  back_id="$("${COMPOSE[@]}" ps -q web 2>/dev/null)"
  [[ -n "$back_id" && "$back_id" != "$failed_id" ]] || unconfirmed "web при откате не пересоздан"
  for _ in $(seq 1 24); do
    back_state="$(docker inspect -f '{{.State.Health.Status}}' "$back_id" 2>/dev/null)"
    [[ "$back_state" == healthy ]] && break
    sleep 5
  done
  [[ "$back_state" == healthy ]] || unconfirmed "web после отката не здоров (состояние: ${back_state:-нет})"
  # Чтение окружения — отдельным шагом с проверкой кода: пустой вывод упавшего inspect не должен читаться как «не live»
  # (ревью фичи 30, круг 3, находка 1).
  local back_env
  back_env="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$back_id" 2>/dev/null)" && [[ -n "$back_env" ]] \
    || unconfirmed "окружение web после отката не прочитано — режим оплаты неизвестен"
  if grep -qx 'N5_PAYMENTS_MODE=live' <<<"$back_env"; then unconfirmed "в web после отката всё ещё N5_PAYMENTS_MODE=live"; fi
  echo "Env возвращён из копии; web пересоздан, здоров, оплата в нём не live — откат подтверждён." >&2
  exit 1
}
echo "Перезапуск web…"
"${COMPOSE[@]}" up -d --no-deps --force-recreate web >/dev/null 2>&1 || rollback "docker compose up не выполнился (код $?) — web не пересоздан"
NEW_ID="$("${COMPOSE[@]}" ps -q web 2>/dev/null)"
[[ -n "$NEW_ID" && "$NEW_ID" != "$OLD_ID" ]] || rollback "web не пересоздан: контейнер тот же или отсутствует"
state=""
for _ in $(seq 1 24); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$NEW_ID" 2>/dev/null)"
  [[ "$state" == healthy ]] && break
  sleep 5
done
[[ "$state" == healthy ]] || rollback "web не поднялся (состояние: ${state:-нет}). Последние строки журнала:" "$NEW_ID"
# Новая конфигурация действительно применена: режим внутри НОВОГО контейнера — live (окружение прочитано успешно).
NEW_ENV="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$NEW_ID" 2>/dev/null)" && [[ -n "$NEW_ENV" ]] \
  || rollback "окружение нового web не прочитано — применение конфигурации не подтверждено" "$NEW_ID"
grep -qx 'N5_PAYMENTS_MODE=live' <<<"$NEW_ENV" || rollback "в новом контейнере web N5_PAYMENTS_MODE не live — конфигурация не применена" "$NEW_ID"
echo "Готово: web здоров, оплата включена."
echo "В кабинете ЮKassa укажите адрес уведомлений: ${ORIGIN}/api/webhooks/yookassa"
echo "События: payment.succeeded и refund.succeeded."
