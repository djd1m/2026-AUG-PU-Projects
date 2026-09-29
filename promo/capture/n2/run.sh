#!/usr/bin/env bash
# Запуск записи N2 в контейнере Playwright (без портов, --memory=1500m --cpus=2), см. README.md.
# STEPS=... передаётся внутрь (по умолчанию setup,landing,owner,guest,inbox).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ASSETS=/home/dz-projects-2026/.promo-assets/n2
[ -r "$ASSETS/.fixture.env" ] || { echo "нет $ASSETS/.fixture.env — запись НЕ выполнена" >&2; exit 2; }
# Память: ждать, пока свободно >= 2 ГБ (до 10 раз по 60 с), как требует promo/CAPTURE-BRIEF.md.
# Колонка free на этой машине почти всегда < 2 (страничный кэш); после 10 попыток решает available.
for i in $(seq 1 "${MEM_TRIES:-10}"); do
  FREE=$(free -g | awk '/^Mem/{print $4}'); AVAIL=$(free -g | awk '/^Mem/{print $7}')
  echo "память: free=${FREE} ГБ available=${AVAIL} ГБ (попытка $i)"
  [ "$FREE" -ge 2 ] && break
  [ "$i" -lt "${MEM_TRIES:-10}" ] && sleep 60
done
[ "$AVAIL" -ge 2 ] || { echo "доступно < 2 ГБ — запись НЕ выполнена" >&2; exit 2; }
docker run --rm --name promo-n2-capture --memory=1500m --cpus=2 --shm-size=1g \
  --env-file "$ASSETS/.fixture.env" -e STEPS="${STEPS:-setup,landing,owner,guest,inbox}" -e GUEST_PARTS="${GUEST_PARTS:-choice,private}" -e GUEST_LAYOUTS="${GUEST_LAYOUTS:-mobile,desktop}" \
  -v "$HERE/..:/work" -v "$ASSETS:/assets" -w /work/n2 \
  mcr.microsoft.com/playwright:v1.60.0-noble \
  bash -c "npm ci --no-audit --no-fund >/dev/null && node record-n2.mjs"
