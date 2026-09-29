#!/bin/bash
# Предполётные ворота конфига ДО stills и рендера (модуль 04 п. 4): титры ≤ 2 строк, сегменты по ffprobe,
# видимые окна записи и запретные зоны, стыки для раскадровки. Всё — в promo-render, без сети.
#   bash .claude/skills/promo-video/scripts/gate-config.sh <proj> [out.tsv] [zones.tsv]
# Запретные зоны: promo/remotion/<proj>/forbidden-zones.tsv (или 3-й аргумент), строки TAB:
#   файл  x0  y0  x1  y1  from  to  причина      — прямоугольник в пикселях ИСХОДНОЙ записи на интервале файла
# Коды: 0 — чисто · 1 — дефект назван · 2 — проверка НЕ выполнена. Вывод (CAPTION/VISIBLE/BOUNDARY) — в out.tsv,
# по умолчанию /home/dz-projects-2026/.promo-assets/<proj>/out/final/proof/config-inspect.tsv.
# До правки шаблона №3 (preflight в render.sh) — вручную этим скриптом; после — будет частью render.sh.
set -uo pipefail
SKILL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SKILL/../../../.." && pwd)
REM=${PROMO_REMOTION:-$ROOT/promo/remotion}   # переопределение — только для испытания стража на испорченной копии
PROJ=${1:-}
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] && [ -f "$REM/$PROJ/project.config.ts" ] \
  || { echo "❌ нет promo/remotion/$PROJ/project.config.ts — НЕ выполнено" >&2; exit 2; }
ASSETS=${PROMO_ASSETS:-/home/dz-projects-2026/.promo-assets/$PROJ}
[ -d "$ASSETS" ] || { echo "❌ нет каталога записей $ASSETS — НЕ выполнено" >&2; exit 2; }
OUTF=${2:-$ASSETS/out/final/proof/config-inspect.tsv}
ZMOUNT=()
if [ -n "${3:-}" ]; then [ -r "$3" ] || { echo "❌ зоны $3 не читаются — НЕ выполнено" >&2; exit 2; }; ZMOUNT=(-v "$(realpath "$3"):/zones.tsv:ro"); fi
mkdir -p "$(dirname "$OUTF")" || exit 2
docker image inspect promo-render:2026-09-29 >/dev/null 2>&1 || { echo "❌ нет образа promo-render:2026-09-29 — НЕ выполнено" >&2; exit 2; }
NAME=promo-$PROJ-gate
if docker container inspect "$NAME" >/dev/null 2>&1; then echo "❌ контейнер $NAME уже есть — не трогаю, НЕ выполнено" >&2; exit 2; fi
timeout 300 docker run --rm --name "$NAME" --cpus=1 --memory=1g --network none \
  -v "$REM:/work:ro" -v "$ASSETS:/assets:ro" -v "$SKILL:/s:ro" "${ZMOUNT[@]}" -w /work promo-render:2026-09-29 \
  node --no-warnings /s/inspect-config.mjs "$PROJ" > "$OUTF"
rc=$?
grep -E '^(❌|✅|ZONES|TOTAL)' "$OUTF"
case $rc in 0|1|2) ;; *) echo "❌ контейнер завершился с кодом $rc — НЕ выполнено" >&2; rc=2 ;; esac
echo "полный вывод: $OUTF"
exit $rc
