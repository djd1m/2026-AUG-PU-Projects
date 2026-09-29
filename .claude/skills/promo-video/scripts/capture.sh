#!/bin/bash
# Запись экранов одной командой (модуль 03 пп. 1–2): проверка памяти, контейнер Playwright, сторож хоста.
# 1.2 — сквозной прогон N3, замечания 4 и 8:
#  - память решает `MemAvailable` СРАЗУ (≥ 2 ГиБ), без 10 × 60 с ожидания колонки `free`: на этой машине `free`
#    всегда ≈ 0 из-за страничного кэша, и прежнее правило тратило 10 минут перед каждой записью впустую;
#  - песочница агента отвергает инлайн `docker run … bash -c '…'` и `$(…)` — поэтому скрипт.
#   bash .claude/skills/promo-video/scripts/capture.sh <proj> [аргументы record-<proj>.mjs…]
# Сам скрипт записи обязан вести один демосеанс на раскладку и останавливаться на первом 429 (модуль 03 п. 6а) —
# это проверяет gate-log.mjs по журналу, не этот скрипт.
# Коды: 0 — запись завершилась 0 и сторож контейнер не трогал · 1 — скрипт записи вернул ≠ 0 (журнал назван) или
#       сторож трогал (запись недействительна) · 2 — НЕ выполнено (нет проекта/lockfile, памяти < порога, имя занято,
#       нет образа, журнал сторожа не читается).
set -uo pipefail
SKILL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SKILL/../../../.." && pwd)
CAP=${PROMO_CAPTURE:-$ROOT/promo/capture}     # переопределение — только для испытания на подделке
PROJ=${1:-}; shift || true
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] && [ -f "$CAP/$PROJ/record-$PROJ.mjs" ] && [ -f "$CAP/$PROJ/package.json" ] \
  || { echo "❌ нет $CAP/$PROJ/{record-$PROJ.mjs,package.json} — НЕ выполнено" >&2; exit 2; }
A=${PROMO_ASSETS:-/home/dz-projects-2026/.promo-assets/$PROJ}
mkdir -p "$A" || exit 2
MIN=${MIN_AVAIL_GB:-2}
avail_kb=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
[ -n "$avail_kb" ] || { echo "❌ MemAvailable не прочитан — НЕ выполнено" >&2; exit 2; }
awk -v a="$avail_kb" -v m="$MIN" 'BEGIN { exit !(a >= m * 1048576) }' \
  || { echo "❌ доступно $((avail_kb / 1048576)) ГиБ < $MIN ГиБ — запись НЕ выполнена (не запускать наудачу; повторить позже)" >&2; exit 2; }
IMG=mcr.microsoft.com/playwright:v1.60.0-noble
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "❌ нет образа $IMG — запись НЕ выполнена" >&2; exit 2; }
NAME=promo-$PROJ-capture
docker container inspect "$NAME" >/dev/null 2>&1 && { echo "❌ контейнер $NAME уже есть — не трогаю, НЕ выполнено" >&2; exit 2; }
LOG=$A/capture-$(date -u +%Y%m%dT%H%M%SZ).txt
T0=$(date '+%Y-%m-%d %H:%M:%S')
echo "ℹ️ доступно $((avail_kb / 1048576)) ГиБ; запись $PROJ → $A; вывод $LOG"
timeout 1800 docker run --rm --name "$NAME" --memory=1500m --cpus=2 --shm-size=1g \
  -v "$CAP:/work" -v "$A:/assets" -w "/work/$PROJ" "$IMG" bash -c 'set -e
    [ -f package-lock.json ] || npm install --package-lock-only --no-audit --no-fund
    npm ci --no-audit --no-fund
    node "record-$0.mjs" "$@"' "$PROJ" "$@" > "$LOG" 2>&1
rc=$?
# Сторож пишет строку раз в 1–2 мин: короткая операция успевает закончиться до его обхода (код 2). Ждём обход до 3 мин.
for _ in 1 2 3 4 5 6 7 8 9; do bash "$SKILL/gate-watchdog.sh" "$NAME" "$T0"; w=$?; [ $w = 2 ] || break; sleep 20; done
if [ $rc != 0 ]; then echo "❌ запись: код $rc — $LOG" >&2; tail -8 "$LOG" >&2; exit 1; fi
[ $w = 0 ] || exit $w
echo "✅ запись $PROJ: код 0, сторож не трогал; дальше gate-log.mjs <журнал> $A"
