#!/usr/bin/env bash
# Слепой судья Phase 4 (Codex gpt-6-astra, effort medium) для фичи проекта «Тарелка».
#   bash scripts/run-judge.sh <slug> <base_sha> <RUN_ID> [model] [effort]
# Пишет docs/features/<slug>/review-report.md (только отчёт, всё до строки «Reviewer family:» отбрасывается),
# журнал — docs/telemetry/p-replicator/<RUN_ID>/evidence/judge-<slug>.log. stdin закрыт: без этого codex exec
# в фоне зависает на «Reading additional input from stdin». Судья НЕ получает имя модели-исполнителя.
set -uo pipefail
SLUG="${1:?slug}"; BASE="${2:?base sha}"; RUN="${3:?run id}"; MODEL="${4:-gpt-6-astra}"; EFFORT="${5:-medium}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"; cd "$HERE"
T="docs/telemetry/p-replicator/$RUN"; mkdir -p "$T/evidence"
BRIEF="$T/evidence/judge-brief-$SLUG.md"; OUT="docs/features/$SLUG/review-report.md"; LOG="$T/evidence/judge-$SLUG.log"
sed -e "s|<slug>|$SLUG|g" -e "s|<RUN_ID>|$RUN|g" -e "s|<base_sha>|$BASE|g" docs/review-judge-brief.template.md > "$BRIEF"
{ echo "=== $(date -u +%FT%TZ) model=$MODEL effort=$EFFORT base=$BASE"; 
  timeout 1500 codex exec -m "$MODEL" -c "model_reasoning_effort=\"$EFFORT\"" -s read-only -C "$HERE" --skip-git-repo-check --color never \
    -o "$OUT.raw" "Выполни задание из файла $BRIEF (путь относительно текущего каталога). Итоговый ответ — только отчёт, начиная со строки 'Reviewer family: codex'." < /dev/null; echo "exit=$?"; } > "$LOG" 2>&1
if [ -s "$OUT.raw" ]; then awk 'f||/^Reviewer family:/{f=1;print}' "$OUT.raw" > "$OUT"; rm -f "$OUT.raw"; else printf 'Reviewer family: codex\nSpec revision: sha256:%s\n\n# Review — %s\n\n## Verdict\nJUDGE FAILED: no output, see %s\n' "$(sha256sum "docs/features/$SLUG/01_specification.md" | cut -c1-64)" "$SLUG" "$LOG" > "$OUT"; fi
echo "report: $OUT ($(wc -l < "$OUT") lines); log tail:"; tail -2 "$LOG"
