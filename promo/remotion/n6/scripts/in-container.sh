#!/bin/bash
# Выполняется ВНУТРИ promo-render:2026-09-29 (см. ../render.sh). Один вызов = один рендер,
# чтобы /sys/fs/cgroup/memory.peak относился ровно к нему.
#   in-container.sh render <composition-id> <out.mp4>
#   in-container.sh still  <composition-id> <out.png> <frame>
set -euo pipefail
cd /work

# Chromium из образа (Playwright 1.60, chromium_headless_shell-1223), а не скачанный Remotion.
# Remotion сам передаёт --no-sandbox и --disable-setuid-sandbox (open-browser.js) — root не мешает.
BROWSER=${BROWSER:-/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell}
if [ ! -x "$BROWSER" ]; then echo "❌ нет браузера $BROWSER — рендер НЕ выполнен" >&2; exit 2; fi
[ -d /assets ] && [ -f /assets/chat-desktop.webm ] || { echo "❌ /assets не смонтирован — рендер НЕ выполнен" >&2; exit 2; }

mode=$1; id=$2; out=$3
echo "START $(date -u +%FT%T) nproc=$(nproc)"
common=(--browser-executable="$BROWSER" --log=info)

TIMEFORMAT='TIME wall=%R user=%U sys=%S'
case "$mode" in
  render)
    time npx --no-install remotion render src/index.ts "$id" "$out" \
      --codec=h264 --pixel-format=yuv420p --color-space=bt709 --crf=20 ${EXTRA:-} --concurrency=${CONCURRENCY:-6} \
      --offthreadvideo-cache-size-in-bytes=${OTV_CACHE:-536870912} "${common[@]}"
    ;;
  still)
    time npx --no-install remotion still src/index.ts "$id" "$out" --frame="$4" "${common[@]}"
    ;;
  stills) # контрольные кадры для просмотра глазами: out = каталог, дальше — номера кадров
    shift 3
    for fr in "$@"; do
      npx --no-install remotion still src/index.ts "$id" "$out/$id-$fr.png" --frame="$fr" "${common[@]}" 2>&1 | grep -E "^\+|rror" || true
    done
    # одна раскадровка на формат — удобнее смотреть
    inputs=(); for fr in "$@"; do inputs+=(-i "$out/$id-$fr.png"); done
    ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex \
      "$(for i in $(seq 0 $(($#-1))); do printf '[%d]scale=640:-2[s%d];' $i $i; done)$(for i in $(seq 0 $(($#-1))); do printf '[s%d]' $i; done)hstack=inputs=$#" \
      "$out/$id-sheet.png"
    exit 0
    ;;
  *) echo "режим: render|still" >&2; exit 2 ;;
esac
if [ -r /sys/fs/cgroup/memory.peak ]; then
  echo "MEMPEAK bytes=$(cat /sys/fs/cgroup/memory.peak)"
else
  echo "MEMPEAK bytes=null (нет /sys/fs/cgroup/memory.peak)"
fi
echo "END $(date -u +%FT%T)"
ls -l "$out"
