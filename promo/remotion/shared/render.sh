#!/bin/bash
# Рендер ролика серии одной командой (с хоста; всё исполняется в образе promo-render):
#   bash promo/remotion/shared/render.sh <proj> [16x9 9x16 1x1]     # по умолчанию все три
#   REPRO=1 bash promo/remotion/shared/render.sh <proj>             # + повтор 16:9 и сверка sha256
# Результат: /home/dz-projects-2026/.promo-assets/<proj>/out/final/{16x9,9x16,1x1}.mp4, журналы и квитанция — logs/.
# Коды: 0 — все форматы прошли страж и сторож не трогал контейнеры · 1 — дефект доказан (назван) ·
#       2 — проверка НЕ выполнена (нет образа/записей/журнала сторожа, имя контейнера занято).
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)          # promo/remotion
PROJ=${1:-}; shift || true
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] && [ -f "$HERE/$PROJ/project.config.ts" ] \
  || { echo "❌ нет проекта «$PROJ» ($HERE/<proj>/project.config.ts) — НЕ выполнено" >&2; exit 2; }
FMTS=("$@"); [ ${#FMTS[@]} -gt 0 ] || FMTS=(16x9 9x16 1x1)

ASSETS=/home/dz-projects-2026/.promo-assets/$PROJ
OUT=$ASSETS/out/final
LOGS=$OUT/logs
IMG=promo-render:2026-09-29
LOCK=/home/dz-projects-2026/.promo-assets/render.lock
WATCHDOG_LOG=/var/log/crypto-watchdog/watchdog.log

# ── ЕДИНСТВЕННОЕ место, где заданы среда и кодирование серии (promo/SERIES.md, поправки Codex 1–2) ──
# 2,5 CPU: хостовый сторож перезапускает контейнер с мгновенным CPU > 300 %; concurrency — floor(квоты) = 2.
LIMITS=(--cpus=2.5 --memory=4g --network none)
# Без --color-space Remotion 4.x отдаёт yuvj420p; без предела кэша <OffthreadVideo> — OOM в 4 ГБ (умолчание от памяти хоста).
RENDER_FLAGS=(--codec=h264 --crf=20 --pixel-format=yuv420p --color-space=bt709
              --offthreadvideo-cache-size-in-bytes=536870912 --concurrency=2)

declare -A SIZE=([16x9]="1920 1080" [9x16]="1080 1920" [1x1]="1080 1080")
for f in "${FMTS[@]}"; do [ -n "${SIZE[$f]:-}" ] || { echo "❌ формат «$f»: только 16x9 9x16 1x1" >&2; exit 2; }; done
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "❌ нет образа $IMG (promo/render-image/build.sh) — НЕ выполнено" >&2; exit 2; }
compgen -G "$ASSETS/*.webm" >/dev/null || compgen -G "$ASSETS/*.mp4" >/dev/null || { echo "❌ нет записей в $ASSETS — НЕ выполнено" >&2; exit 2; }
[ -r "$WATCHDOG_LOG" ] || { echo "❌ журнал сторожа $WATCHDOG_LOG не читается — перезапуски не проверить, НЕ выполнено" >&2; exit 2; }
mkdir -p "$LOGS"
IMG_ID=$(docker image inspect -f '{{.Id}}' "$IMG")
REV=$(git -C "$HERE" rev-parse HEAD 2>/dev/null || echo null)
DIRTY=$(git -C "$HERE" status --porcelain -- . 2>/dev/null | wc -l)
RECEIPT=$LOGS/receipt.txt
{ echo "proj=$PROJ rev=$REV dirty_files=$DIRTY image=$IMG_ID started=$(date -u +%FT%TZ)"
  echo "limits=${LIMITS[*]}"; echo "render_flags=${RENDER_FLAGS[*]}"; } > "$RECEIPT"
FAIL=0

# Одна операция = один одноразовый контейнер с именем promo-<proj>-<что>; чужие контейнеры не трогаем.
run() { # <имя-суффикс> <журнал> <в-блокировке 0|1> -- <аргументы in-container.sh…>
  local name="promo-$PROJ-$1" log=$2 locked=$3; shift 4
  if docker container inspect "$name" >/dev/null 2>&1; then
    echo "❌ контейнер $name уже существует — не трогаю, НЕ выполнено" >&2; exit 2
  fi
  local net=(--network none); [ "$1" = install ] && net=(--network bridge)
  local cmd=(docker run --rm --name "$name" --cpus=2.5 --memory=4g "${net[@]}" -e PROMO_PROJECT="$PROJ"
             -v "$HERE:/work" -v "$ASSETS:/assets:ro" -v "$OUT:/out" -w /work "$IMG" bash shared/scripts/in-container.sh "$@")
  local t0 rc=0; t0=$(date '+%Y-%m-%d %H:%M:%S')
  if [ "$locked" = 1 ]; then flock "$LOCK" timeout 1500 "${cmd[@]}" > "$log" 2>&1 || rc=$?
  else timeout 1500 "${cmd[@]}" > "$log" 2>&1 || rc=$?; fi
  [ $rc = 124 ] && docker stop "$name" >/dev/null 2>&1 || true
  # Сторож хоста: перезапуск СВОЕГО контейнера после старта операции = замер недействителен (только чтение журнала).
  local hits; hits=$(awk -v s="$t0" -v n="'$name'" 'substr($0,2,19) >= s && index($0, n)' "$WATCHDOG_LOG")
  if [ -n "$hits" ]; then echo "❌ сторож трогал $name:"$'\n'"$hits" >&2; echo "watchdog $name: HIT" >> "$RECEIPT"; FAIL=1; fi
  if [ $rc != 0 ]; then echo "❌ $name: код $rc, журнал $log" >&2; tail -15 "$log" >&2; FAIL=1; return 1; fi
  echo "$name $(grep -E '^(TIME|MEMPEAK)' "$log" | tr '\n' ' ') watchdog=clean" | tee -a "$RECEIPT"
}

# 1. Установка — один package.json/lockfile на серию; сеть только здесь, без блокировки.
if [ ! -f "$HERE/node_modules/.package-lock.json" ] || [ "$HERE/package-lock.json" -nt "$HERE/node_modules/.package-lock.json" ]; then
  run install "$LOGS/install.txt" 0 -- install || exit 1
fi
# 2. Сборка бандла (webpack) — ОТДЕЛЬНЫЙ замер, под блокировкой; рендер ниже бандл уже не собирает.
rm -rf "$OUT/bundle"
run bundle "$LOGS/bundle.txt" 1 -- bundle /out/bundle || exit 1
# 3. Рендер по формату — отдельный контейнер, под блокировкой; затем страж результата.
render() { # <формат> <файл>
  local f=$1 file=$2
  rm -f "$OUT/$file"
  run "${file%.mp4}" "$LOGS/${file%.mp4}.txt" 1 -- render /out/bundle "promo-$f" "/out/$file" "${RENDER_FLAGS[@]}" || return 0
  local rc
  set +e
  docker run --rm --name "promo-$PROJ-probe" --cpus=1 --network none -v "$OUT:/out:ro" -v "$HERE/shared/scripts:/s:ro" "$IMG" \
    bash /s/probe.sh "/out/$file" ${SIZE[$f]} 2>&1 | tee -a "$RECEIPT"
  rc=${PIPESTATUS[0]}
  set -e
  [ "$rc" = 0 ] || FAIL=1
}
for f in "${FMTS[@]}"; do render "$f" "$f.mp4"; done
if [ "${REPRO:-0}" = 1 ]; then
  render 16x9 16x9-repeat.mp4
  a=$(sha256sum "$OUT/16x9.mp4" 2>/dev/null | cut -c1-64); b=$(sha256sum "$OUT/16x9-repeat.mp4" 2>/dev/null | cut -c1-64)
  if [ -n "$a" ] && [ "$a" = "$b" ]; then echo "✅ повтор 16:9 побайтно совпал: $a" | tee -a "$RECEIPT"
  else echo "❌ повтор 16:9 не совпал: $a / $b" | tee -a "$RECEIPT" >&2; FAIL=1; fi
fi
echo "finished=$(date -u +%FT%TZ) result=$([ $FAIL = 0 ] && echo green || echo RED)" >> "$RECEIPT"
[ $FAIL = 0 ] && echo "✅ $PROJ: все форматы прошли страж; квитанция $RECEIPT" || echo "❌ $PROJ: КРАСНЫЙ; квитанция $RECEIPT" >&2
exit $FAIL
