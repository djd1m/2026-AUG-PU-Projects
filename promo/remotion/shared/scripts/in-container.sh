#!/bin/bash
# Выполняется ВНУТРИ promo-render:2026-09-29 (зовёт ../render.sh). /work = promo/remotion, /assets = записи проекта.
# Один вызов = одна операция, чтобы /sys/fs/cgroup/memory.peak относился ровно к ней.
#   in-container.sh install
#   in-container.sh bundle <out-dir>
#   in-container.sh render <bundle-dir> <composition-id> <out.mp4> <флаги рендера…>
#   in-container.sh stills <bundle-dir> <composition-id> <out-dir> <кадр…>
set -euo pipefail
cd /work
# Chromium из образа (Playwright 1.60), а не скачанный Remotion; --no-sandbox Remotion 4.0.529 ставит сам.
BROWSER=/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
TIMEFORMAT='TIME wall=%R user=%U sys=%S'
mempeak() { if [ -r /sys/fs/cgroup/memory.peak ]; then echo "MEMPEAK bytes=$(cat /sys/fs/cgroup/memory.peak)"; else echo "MEMPEAK bytes=null (нет memory.peak)"; fi; }
need() { [ -x "$BROWSER" ] || { echo "❌ нет браузера $BROWSER — НЕ выполнено" >&2; exit 2; }
         [ -n "${PROMO_PROJECT:-}" ] || { echo "❌ PROMO_PROJECT не задан — НЕ выполнено" >&2; exit 2; }
         [ -d /assets ] && [ -n "$(ls /assets/*.webm /assets/*.mp4 2>/dev/null)" ] || { echo "❌ /assets пуст или не смонтирован — НЕ выполнено" >&2; exit 2; }; }

mode=${1:-}; shift || true
echo "START $(date -u +%FT%T) mode=$mode proj=${PROMO_PROJECT:-} nproc=$(nproc)"
case "$mode" in
  install)
    export REMOTION_SKIP_BROWSER_DOWNLOAD=1
    time npm ci --no-audit --no-fund
    echo "node_modules bytes=$(du -sb node_modules | cut -f1)"
    ;;
  bundle)
    need
    time npx --no-install remotion bundle shared/src/index.ts --config=shared/remotion.config.ts --out-dir="$1" --log=info
    ;;
  render)
    need
    bundle=$1 id=$2 out=$3; shift 3
    time npx --no-install remotion render "$bundle" "$id" "$out" "$@" --browser-executable="$BROWSER" --log=info
    ls -l "$out"
    ;;
  stills)
    need
    bundle=$1 id=$2 dir=$3; shift 3
    mkdir -p "$dir"; inputs=()
    for fr in "$@"; do
      npx --no-install remotion still "$bundle" "$id" "$dir/$id-$fr.png" --frame="$fr" --browser-executable="$BROWSER" --log=error
      inputs+=(-i "$dir/$id-$fr.png")
    done
    n=$#
    ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex \
      "$(for i in $(seq 0 $((n-1))); do printf '[%d]scale=-2:540[s%d];' $i $i; done)$(for i in $(seq 0 $((n-1))); do printf '[s%d]' $i; done)hstack=inputs=$n" \
      "$dir/$id-sheet.png"
    ;;
  *) echo "режим: install|bundle|render|stills" >&2; exit 2 ;;
esac
mempeak
echo "END $(date -u +%FT%T)"
