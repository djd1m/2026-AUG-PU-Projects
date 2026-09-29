#!/bin/bash
# Контрольные кадры до полного рендера (модуль 04 пп. 2, 5): установка зависимостей при их отсутствии, бандл, кадры
# 60 250 600 820 1000 1250 трёх форматов, сторож. 1.2 — сквозной прогон N3, замечания 3 и 8:
#  - команда `stills` README шаблона кладёт бандл в out/final/bundle-dev, то есть ВНУТРЬ /assets, а бандл несёт
#    public/rec -> /assets: следующий render.sh упал `ELOOP: too many symbolic links` (N3, 20:02 UTC). Здесь бандл —
#    ВНЕ каталога записей (/home/dz-projects-2026/.promo-assets/.stills-<proj>/) и удаляется в конце;
#  - песочница агента отвергает инлайн `docker run … bash -c '…'` с переменными — поэтому скрипт.
#  - под flock общей блокировки рендера (ограничение шаблона №9: пример README без блокировки).
#   bash .claude/skills/promo-video/scripts/stills.sh <proj>
# Листы: <assets>/out/final/stills/promo-{16x9,9x16,1x1}-sheet.png — смотреть все три.
# Коды: 0 — три листа сделаны, сторож не трогал · 1 — упал бандл/кадр (журнал назван) или сторож трогал ·
#       2 — НЕ выполнено (нет проекта, записей, образа, имя контейнера занято, журнал сторожа не читается).
set -uo pipefail
SKILL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SKILL/../../../.." && pwd)
REM=${PROMO_REMOTION:-$ROOT/promo/remotion}   # переопределение — только для испытания на копии
PROJ=${1:-}
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] && [ -f "$REM/$PROJ/project.config.ts" ] \
  || { echo "❌ нет $REM/$PROJ/project.config.ts — НЕ выполнено" >&2; exit 2; }
A=${PROMO_ASSETS:-/home/dz-projects-2026/.promo-assets/$PROJ}
compgen -G "$A/*.webm" >/dev/null || compgen -G "$A/*.mp4" >/dev/null || { echo "❌ нет записей в $A — НЕ выполнено" >&2; exit 2; }
IMG=promo-render:2026-09-29
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "❌ нет образа $IMG — НЕ выполнено" >&2; exit 2; }
for s in install stills; do
  docker container inspect "promo-$PROJ-$s" >/dev/null 2>&1 && { echo "❌ контейнер promo-$PROJ-$s уже есть — не трогаю, НЕ выполнено" >&2; exit 2; }
done
OUT=$A/out/final; mkdir -p "$OUT/stills" "$OUT/logs" || exit 2
B=$(dirname "$A")/.stills-$PROJ          # ВНЕ $A: бандл с public/rec -> /assets не попадает в /assets
rm -rf "$B" "$OUT/bundle-dev"; mkdir -p "$B" || exit 2
trap 'rm -rf "$B"' EXIT
LOCK=${PROMO_LOCK:-/home/dz-projects-2026/.promo-assets/render.lock}
LOG=$OUT/logs/stills.txt
T0=$(date '+%Y-%m-%d %H:%M:%S')
if [ ! -f "$REM/node_modules/.package-lock.json" ]; then
  echo "ℹ️ node_modules нет — установка (сеть bridge, вне замера)"
  timeout 900 docker run --rm --name "promo-$PROJ-install" --cpus=2.5 --memory=4g --network bridge -e PROMO_PROJECT="$PROJ" \
    -v "$REM:/work" -v "$A:/assets:ro" -w /work "$IMG" bash shared/scripts/in-container.sh install > "$OUT/logs/install-stills.txt" 2>&1 \
    || { echo "❌ установка упала — $OUT/logs/install-stills.txt" >&2; exit 1; }
fi
flock "$LOCK" timeout 1200 docker run --rm --name "promo-$PROJ-stills" --cpus=2.5 --memory=4g --network none -e PROMO_PROJECT="$PROJ" \
  -v "$REM:/work" -v "$A:/assets:ro" -v "$OUT:/out" -v "$B:/bundle" -w /work "$IMG" bash -c \
  'bash shared/scripts/in-container.sh bundle /bundle/b && for id in promo-16x9 promo-9x16 promo-1x1; do
     bash shared/scripts/in-container.sh stills /bundle/b $id /out/stills 60 250 600 820 1000 1250 || exit 1; done' > "$LOG" 2>&1
rc=$?
[ $rc = 0 ] || { echo "❌ stills: код $rc — журнал $LOG" >&2; tail -8 "$LOG" >&2; exit 1; }
for id in 16x9 9x16 1x1; do [ -s "$OUT/stills/promo-$id-sheet.png" ] || { echo "❌ нет листа promo-$id-sheet.png" >&2; exit 1; }; done
# Сторож пишет строку раз в 1–2 мин: короткая операция успевает закончиться до его обхода (код 2). Ждём обход до 3 мин.
for _ in 1 2 3 4 5 6 7 8 9; do bash "$SKILL/gate-watchdog.sh" "promo-$PROJ-stills" "$T0"; w=$?; [ $w = 2 ] || break; sleep 20; done
[ $w = 0 ] || exit $w
echo "✅ листы: $OUT/stills/promo-{16x9,9x16,1x1}-sheet.png — смотреть все три; бандл вне $A удалён"
