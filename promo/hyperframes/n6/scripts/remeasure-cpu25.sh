#!/bin/bash
# С хоста: поправка 2 протокола (06:15 UTC) — перемер двух рендеров 16:9 под --cpus=2.5.
# Результаты — в renders/ (не трогает поставленные out/*.mp4). Замок, сеть, память — как в render.sh.
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
LOCK=/home/dz-projects-2026/.promo-assets/render.lock
IMG=promo-render:2026-09-29
LOGS=$HERE/renders/logs
WATCHLOG=/var/log/crypto-watchdog/watchdog.log
mkdir -p "$LOGS"
[ -f "$HERE/build/16x9/index.html" ] || { echo "❌ нет build/16x9 — сначала render.sh" >&2; exit 2; }
for run in 1 2; do
  name="promo-hyperframes-n6-cpu25-16x9-run$run"
  log="$LOGS/cpu25-16x9-run$run.log"
  flock "$LOCK" docker run --rm --name "$name" --memory=4g --cpus=2.5 --shm-size=512m --network none \
    -v "$HERE:/work" -w /work "$IMG" \
    bash scripts/render-one.sh 16x9 "/work/renders/16x9-cpu25-run$run.mp4" > "$log" 2>&1 || true
  grep -E '^(TIME|METRICS)' "$log"
  grep -q '^METRICS .* rc=0 ' "$log" || { echo "❌ рендер run$run не удался — $log" >&2; exit 1; }
  n=$(grep -c "Restarting container '$name'" "$WATCHLOG" || true)
  echo "WATCHDOG $name restarts=$n" | tee -a "$log"
  [ "$n" = 0 ] || { echo "❌ сторож перезапускал $name — замер недействителен" >&2; exit 1; }
done
docker run --rm --network none -v "$HERE:/work" -w /work "$IMG" \
  bash scripts/probe.sh renders/16x9-cpu25-run1.mp4 renders/16x9-cpu25-run2.mp4 | tee "$LOGS/cpu25-probe.log"
