#!/bin/bash
# Ролик N6 на Remotion — воспроизведение одной командой (с хоста; всё выполняется в образе promo-render):
#   bash promo/remotion/n6/render.sh            # 16x9, 9x16, 1x1 (+ повтор 16x9 для sha256 при REPRO=1)
# Результат: /home/dz-projects-2026/.promo-assets/n6/out/remotion/{16x9,9x16,1x1}.mp4 и logs/.
# Каждый рендер — отдельный одноразовый контейнер без сети и без портов, под общей блокировкой
# замеров (второй исполнитель пилота не мерит одновременно).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ASSETS=/home/dz-projects-2026/.promo-assets/n6
OUT=$ASSETS/out/remotion
IMG=promo-render:2026-09-29
LOCK=/home/dz-projects-2026/.promo-assets/render.lock
# Отклонение от протокола (--cpus=6): хостовый crypto-miner-watchdog перезапускает любой контейнер
# с CPU > 300 % (docker restart раз в ~60 с). Поэтому 2,5 CPU (2,9 из поправки PILOT-N6.md тоже дало 301 % — мгновенный пик выше квоты) и 2 вкладки браузера — ниже порога.
CPUS=${CPUS:-2.5}
CONC=${CONC:-2}  # Remotion берёт квоту cgroup и округляет вниз: 2,9 CPU → максимум 2

docker image inspect "$IMG" >/dev/null 2>&1 || { echo "❌ нет образа $IMG (promo/render-image/build.sh) — рендер НЕ выполнен" >&2; exit 2; }
[ -f "$ASSETS/chat-desktop.webm" ] || { echo "❌ нет записей в $ASSETS — рендер НЕ выполнен" >&2; exit 2; }
mkdir -p "$OUT/logs"

if [ ! -d "$HERE/node_modules" ]; then
  # npm ci нужна сеть (bridge); рендер ниже — --network none
  docker run --rm --memory=4g --cpus=6 --network bridge -v "$HERE:/work" -w /work "$IMG" bash install.sh \
    | tee "$OUT/logs/install.txt"
fi

render() { # <composition> <file>
  echo "== $1 → $2 (flock $LOCK)"
  flock "$LOCK" docker run --rm --name "promo-remotion-n6-${2%.mp4}" --memory=4g --cpus="$CPUS" -e CONCURRENCY="$CONC" --network none \
    -v "$HERE:/work" -v "$ASSETS:/assets:ro" -v "$OUT:/out" -w /work "$IMG" \
    bash scripts/in-container.sh render "$1" "/out/$2" > "$OUT/logs/${2%.mp4}.txt" 2>&1 \
    || { echo "❌ рендер $1 упал, журнал: $OUT/logs/${2%.mp4}.txt" >&2; tail -20 "$OUT/logs/${2%.mp4}.txt" >&2; exit 1; }
  grep -E '^(TIME|MEMPEAK)' "$OUT/logs/${2%.mp4}.txt"
}

render n6-16x9 16x9.mp4
render n6-9x16 9x16.mp4
render n6-1x1 1x1.mp4
if [ "${REPRO:-0}" = 1 ]; then render n6-16x9 16x9-repeat.mp4; fi

# ffprobe + sha256 — тем же образом
docker run --rm --network none -v "$OUT:/out" -w /out "$IMG" bash -c '
  for f in 16x9.mp4 9x16.mp4 1x1.mp4 16x9-repeat.mp4; do
    [ -f "$f" ] || continue
    echo "== $f $(stat -c %s "$f") bytes"
    ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames:format=duration \
      -of default=noprint_wrappers=1 "$f"
    ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$f" | sed "s/^/audio=/"
  done
  sha256sum *.mp4' | tee "$OUT/logs/probe.txt"
