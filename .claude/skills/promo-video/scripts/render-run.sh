#!/bin/bash
# Рендер с ДОКАЗАННЫМ исходом (модуль 04 п. 6, модуль 06 §2): ждёт render.sh шаблона до конца и принимает только
# квитанцию ЭТОГО запуска. 1.2 — сквозной прогон N3, замечание 2 и уточнение Codex:
#   `REPRO=1 setsid bash render.sh …; echo rc=$?` отдал rc=0 ДО начала рендера (setsid форкнулся и вернулся) — ложный
#   зелёный; а зелёная квитанция в каталоге может остаться от ПРОШЛОГО запуска.
#   REPRO=1 bash .claude/skills/promo-video/scripts/render-run.sh <proj> [формат…]
# Фоном — только так, чтобы вызывающий ждал ЭТОТ процесс: фоновая задача агента (run_in_background) или
# `setsid -w bash …/render-run.sh <proj>` (-w ждёт и отдаёт код). Итог пишется ещё и в logs/run-<since>.rc.
# Перед запуском удаляет свой остаток out/final/bundle-dev (ELOOP: public/rec -> /assets, а bundle-dev внутри /assets —
# ограничение шаблона №10, модуль 04).
# Коды: 0 — render.sh 0 И gate-receipt.sh 0 по квитанции с started ≥ since · 1 — рендер или квитанция красные (журналы
#       названы; `1` render.sh может значить и «probe.sh не выполнен» — модуль 04 п. 7) · 2 — НЕ выполнено (нет проекта,
#       render.sh отдал 2, квитанции этого запуска нет).
set -uo pipefail
SKILL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SKILL/../../../.." && pwd)
RENDER=${PROMO_RENDER:-$ROOT/promo/remotion/shared/render.sh}   # переопределение — только для испытания на подделке
PROJ=${1:-}; shift || true
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] || { echo "❌ proj «$PROJ» не вида ^[a-z0-9-]+$ — НЕ выполнено" >&2; exit 2; }
[ -f "$RENDER" ] || { echo "❌ нет $RENDER — НЕ выполнено" >&2; exit 2; }
A=${PROMO_ASSETS:-/home/dz-projects-2026/.promo-assets/$PROJ}
[ -d "$A" ] || { echo "❌ нет каталога записей $A — НЕ выполнено" >&2; exit 2; }
if [ $# -gt 0 ]; then OPS="bundle $*"; elif [ "${REPRO:-0}" = 1 ]; then OPS="bundle 16x9 9x16 1x1 16x9-repeat"; else OPS="bundle 16x9 9x16 1x1"; fi
if [ -e "$A/out/final/bundle-dev" ]; then rm -rf "$A/out/final/bundle-dev" && echo "ℹ️ удалён свой остаток $A/out/final/bundle-dev (ELOOP)"; fi
SINCE=$(date -u +%FT%TZ)
echo "ℹ️ since=$SINCE ops=[$OPS]; ждём render.sh до конца"
bash "$RENDER" "$PROJ" "$@"; RRC=$?
R=$A/out/final/logs/receipt.txt
bash "$SKILL/gate-receipt.sh" "$PROJ" "$R" "$OPS" "$SINCE"; GRC=$?
mkdir -p "$A/out/final/logs" && echo "since=$SINCE render_rc=$RRC receipt_rc=$GRC ops=[$OPS] finished=$(date -u +%FT%TZ)" > "$A/out/final/logs/run-$SINCE.rc"
if [ $RRC = 2 ] || [ $GRC = 2 ]; then echo "❌ рендер НЕ выполнен (render.sh $RRC, квитанция $GRC)" >&2; exit 2; fi
if [ $RRC != 0 ] || [ $GRC != 0 ]; then echo "❌ рендер красный: render.sh $RRC, квитанция $GRC — читать $A/out/final/logs/" >&2; exit 1; fi
echo "✅ рендер $PROJ: render.sh 0, квитанция этого запуска (started ≥ $SINCE) зелёная"
