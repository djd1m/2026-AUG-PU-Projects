#!/bin/bash
# Какие грязные файлы допустимы при рендере (модуль 05 п. 5). 1.2 — сквозной прогон N3, замечание 11: квитанция
# render.sh пишет только число `dirty_files` (`git status --porcelain -- promo/remotion`), и во время работы оно всегда
# > 0 (SCENARIO/README правятся); навык не говорил, какие файлы вправе быть грязными.
# Правило: рендер вправе видеть грязными ТОЛЬКО документы проекта — promo/remotion/<proj>/*.md и *.tsv (они в mp4 не
# попадают). Грязный project.config.ts, public/**, shared/**, package*.json, чужой проект — рендер не привязан к
# коммиту: сначала закоммитить. Запускать ДО render.sh; sha256 конфига всё равно пишется в MEASUREMENTS.md.
#   bash .claude/skills/promo-video/scripts/gate-dirty.sh <proj>
# Коды: 0 — грязного нет или только документы проекта (перечислены) · 1 — грязное, влияющее на mp4 (названо) ·
#       2 — НЕ выполнено (не git, нет promo/remotion/<proj>).
set -uo pipefail
SKILL=$(cd "$(dirname "$0")" && pwd)
REPO=${PROMO_REPO:-$(cd "$SKILL/../../../.." && pwd)}   # переопределение — только для испытания на копии
PROJ=${1:-}
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] || { echo "❌ proj «$PROJ» — НЕ выполнено" >&2; exit 2; }
[ -d "$REPO/promo/remotion/$PROJ" ] || { echo "❌ нет $REPO/promo/remotion/$PROJ — НЕ выполнено" >&2; exit 2; }
st=$(git -C "$REPO" status --porcelain --untracked-files=all -- promo/remotion 2>/dev/null) \
  || { echo "❌ $REPO не git — НЕ выполнено" >&2; exit 2; }
bad=0; docs=0
while IFS= read -r l; do
  [ -n "$l" ] || continue
  f=${l:3}; f=${f##* -> }
  if [[ "$f" =~ ^promo/remotion/$PROJ/[^/]+\.(md|tsv)$ ]]; then echo "ℹ️ документ (допустим): $l"; docs=$((docs+1))
  else echo "❌ влияет на рендер: $l"; bad=1; fi
done <<< "$st"
[ $bad = 0 ] || { echo "❌ закоммитить перед render.sh — иначе квитанция (rev) не описывает то, что отрендерено"; exit 1; }
echo "✅ $PROJ: грязных файлов, влияющих на mp4, нет (документов: $docs)"
