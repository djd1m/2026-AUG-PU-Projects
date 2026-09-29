#!/bin/bash
# Воспроизведение ролика N6 на HyperFrames одной командой (с хоста; всё исполняется в образе promo-render):
#   bash promo/hyperframes/n6/render.sh            # установка → сборка → lint → 3 формата + повтор 16:9 → ffprobe
#   SKIP_INSTALL=1 bash promo/hyperframes/n6/render.sh   # без npm ci (node_modules уже есть)
# Сеть: только у npm ci (bridge). Сборка, lint и рендер — --network none (телеметрия уйти не может).
# Замеряемые рендеры — под flock на общем замке, чтобы исполнители не мерили параллельно.
# Порты не публикуются. Результаты: /home/dz-projects-2026/.promo-assets/n6/out/hyperframes/{16x9,9x16,1x1}.mp4
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ASSETS=/home/dz-projects-2026/.promo-assets/n6
OUT=$ASSETS/out/hyperframes
LOCK=/home/dz-projects-2026/.promo-assets/render.lock
IMG=promo-render:2026-09-29
LOGS=$HERE/renders/logs
mkdir -p "$OUT" "$LOGS"
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "❌ нет образа $IMG (bash promo/render-image/build.sh)" >&2; exit 2; }

run() { docker run --rm --memory=4g --cpus=2.9 --shm-size=512m -v "$HERE:/work" -v "$ASSETS:/assets:ro" -w /work "$@"; }

if [ "${SKIP_INSTALL:-0}" != 1 ]; then
  run --network bridge "$IMG" bash scripts/install.sh 2>&1 | tee "$LOGS/install.log"
fi
run --network none "$IMG" node build.mjs
run --network none "$IMG" bash scripts/lint-all.sh 2>&1 | tee "$LOGS/lint.log"

# --cpus=2.9: на хосте работает сторож crypto-miner-watchdog, перезапускающий контейнер с CPU > 300 %
# (поправка протокола PILOT-N6 от 05:10 UTC). Контейнер именован, чтобы его перезапуски были видны в журнале сторожа.
WATCHLOG=/var/log/crypto-watchdog/watchdog.log
render() {  # $1 формат, $2 путь внутри контейнера, $3 лог
  local name="promo-hyperframes-n6-${3%.log}"
  flock "$LOCK" docker run --rm --name "$name" --memory=4g --cpus=2.9 --shm-size=512m --network none \
    -v "$HERE:/work" -v "$OUT:/out" -w /work "$IMG" \
    bash scripts/render-one.sh "$1" "$2" 2>&1 | tee "$LOGS/$3" | grep -E '^(TIME|METRICS)|rendered in|✗|Error' || true
  grep -q '^METRICS .* rc=0 ' "$LOGS/$3" || { echo "❌ рендер $1 не удался — см. $LOGS/$3" >&2; exit 1; }
  if [ -r "$WATCHLOG" ]; then
    local n; n=$(grep -c "Restarting container '$name'" "$WATCHLOG" || true)
    echo "WATCHDOG $name restarts=$n" | tee -a "$LOGS/$3"
    [ "$n" = 0 ] || { echo "❌ сторож перезапускал $name ($n раз) — замер недействителен" >&2; exit 1; }
  else
    echo "WATCHDOG $name restarts=НЕ ПРОВЕРЕНО (нет $WATCHLOG)" | tee -a "$LOGS/$3"
  fi
}
render 16x9 /out/16x9.mp4 render-16x9.log
render 16x9 /work/renders/16x9-run2.mp4 render-16x9-run2.log
render 1x1 /out/1x1.mp4 render-1x1.log
render 9x16 /out/9x16.mp4 render-9x16.log

docker run --rm --network none -v "$HERE:/work" -v "$OUT:/out:ro" -w /work "$IMG" \
  bash scripts/probe.sh /out/16x9.mp4 /work/renders/16x9-run2.mp4 /out/1x1.mp4 /out/9x16.mp4 | tee "$LOGS/probe.log"
