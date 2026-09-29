#!/bin/bash
# Внутри образа promo-render: рендер ОДНОГО формата + замер.
#   bash scripts/render-one.sh <16x9|1x1|9x16> <выходной.mp4> [доп. флаги hyperframes render]
# /usr/bin/time в образе НЕТ (ставить apt в одноразовый контейнер запрещено постановкой), поэтому:
#   wall/user/sys — bash TIMEFORMAT; пик памяти — /sys/fs/cgroup/memory.peak контейнера (cgroup v2,
#   весь контейнер: node + Chrome + ffmpeg). Строка METRICS … — машинно-читаемая квитанция.
set -u
FMT=${1:?формат}; OUT=${2:?выход}; shift 2
case "$FMT" in 16x9|1x1|9x16) ;; *) echo "❌ формат $FMT не из 16x9|1x1|9x16" >&2; exit 2;; esac
HF=/work/node_modules/.bin/hyperframes
[ -x "$HF" ] || { echo "❌ нет $HF — выполните npm ci" >&2; exit 2; }
[ -f "/work/build/$FMT/index.html" ] || { echo "❌ нет build/$FMT — выполните node build.mjs" >&2; exit 2; }
[ -r /sys/fs/cgroup/memory.peak ] || { echo "❌ нет memory.peak — замер памяти НЕ выполним" >&2; exit 2; }

# Chrome из базы Playwright (chrome-headless-shell 1223): без него hyperframes скачивает свой из сети.
export HYPERFRAMES_BROWSER_PATH=/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
export HYPERFRAMES_NO_UPDATE_CHECK=1
[ "${HYPERFRAMES_NO_TELEMETRY:-}" = "1" ] || { echo "❌ HYPERFRAMES_NO_TELEMETRY≠1 — отказ" >&2; exit 2; }

mkdir -p "$(dirname "$OUT")"
TIMEFORMAT='TIME wall=%R user=%U sys=%S'
{ time "$HF" render "/work/build/$FMT" -o "$OUT" --fps 30 "$@" ; } 2>&1
rc=$?
peak=$(cat /sys/fs/cgroup/memory.peak)
echo "METRICS fmt=$FMT rc=$rc mem_peak_bytes=$peak mem_peak_mib=$((peak / 1048576))"
exit $rc
