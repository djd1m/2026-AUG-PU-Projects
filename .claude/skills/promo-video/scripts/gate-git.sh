#!/bin/bash
# Ворота «в git нет видео, секретов и состояния» (модуль 03, Quality Gate). Пустой `git status` этого НЕ доказывает:
# уже закоммиченный и неизменённый файл в нём не виден. Проверяются ИНДЕКС (git ls-files), новые файлы
# (git status --untracked-files=all) и СОДЕРЖИМОЕ отслеживаемых файлов на значение пароля фикстуры.
#   bash .claude/skills/promo-video/scripts/gate-git.sh <proj>
# Коды: 0 — чисто · 1 — нарушение названо · 2 — проверка НЕ выполнена (не git-репозиторий, нет каталогов проекта).
set -uo pipefail
PROJ=${1:-}
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] || { echo "❌ proj «$PROJ» — НЕ выполнено" >&2; exit 2; }
ROOT=$(git -C "${GATE_GIT_ROOT:-$(dirname "$0")}" rev-parse --show-toplevel 2>/dev/null) || { echo "❌ не git-репозиторий — НЕ выполнено" >&2; exit 2; }
PATHS=()
for d in "promo/capture/$PROJ" "promo/remotion/$PROJ" "promo/dist/$PROJ"; do [ -e "$ROOT/$d" ] && PATHS+=("$d"); done
[ ${#PATHS[@]} -gt 0 ] || { echo "❌ нет ни одного каталога проекта $PROJ в promo/ — НЕ выполнено" >&2; exit 2; }
BAD_RE='\.(webm|mov|mkv|png|jpe?g)$|(^|/)\.env|\.fixture|\.state-|(^|/)node_modules/|(^|/)out/|record-log-.*\.json$'
bad=0
idx=$(git -C "$ROOT" ls-files -- "${PATHS[@]}") || { echo "❌ git ls-files упал — НЕ выполнено" >&2; exit 2; }
hit=$(printf '%s\n' "$idx" | command grep -E "$BAD_RE"); [ -z "$hit" ] || { echo "❌ в ИНДЕКСЕ:"; echo "$hit"; bad=1; }
mp4=$(git -C "$ROOT" ls-files -- 'promo/*.mp4' 'promo/**/*.mp4' | command grep -v '^promo/dist/'); [ -z "$mp4" ] || { echo "❌ mp4 вне promo/dist в индексе:"; echo "$mp4"; bad=1; }
st=$(git -C "$ROOT" status --porcelain --untracked-files=all -- "${PATHS[@]}") || { echo "❌ git status упал — НЕ выполнено" >&2; exit 2; }
hit=$(printf '%s\n' "$st" | cut -c4- | command grep -E "$BAD_RE"); [ -z "$hit" ] || { echo "❌ новые/изменённые файлы, которые попадут в коммит:"; echo "$hit"; bad=1; }
FX=${FIXTURE_ENV:-/home/dz-projects-2026/.promo-assets/$PROJ/.fixture.env}
if [ -r "$FX" ]; then
  pw=$(sed -n 's/^FIXTURE_PASSWORD=//p' "$FX")
  if [ -n "$pw" ] && git -C "$ROOT" grep -qF -e "$pw" -- promo; then echo "❌ значение FIXTURE_PASSWORD найдено в отслеживаемых файлах promo/ (файлы: $(git -C "$ROOT" grep -lF -e "$pw" -- promo | tr '\n' ' '))"; bad=1; fi
  perm=$(stat -c %a "$FX"); [ "$perm" = 600 ] || { echo "❌ $FX: права $perm, нужны 600"; bad=1; }
fi
[ $bad = 0 ] && echo "✅ $PROJ: в индексе и новых файлах ${PATHS[*]} нет видео/.env/состояния/журналов; пароль фикстуры в git не найден"
exit $bad
