#!/usr/bin/env bash
# Проверки, которых нет в p-replicator. См. /harness-forge/ и .claude/rules/p-replicator-known-gaps.md
# Использование: bash scripts/check-pipeline-gaps.sh projects/01-testimonials-senja
set -uo pipefail

DIR="${1:-.}/docs"
[ -d "$DIR" ] || { echo "нет каталога $DIR"; exit 2; }
FAIL=0
say() { printf '%-42s %s\n' "$1" "$2"; }

# PR-002: managed BaaS вместо Postgres в контейнере
# Ищем только в документах реализации. validation/, discovery/, DIFF-* — история и отчёты,
# там упоминания легитимны по смыслу.
hits=$(grep -rniE 'supabase|firebase|planetscale|neon\.tech|mongodb atlas|dynamodb' "$DIR" 2>/dev/null \
       | grep -vE "^$DIR/(validation|discovery)/|^$DIR/DIFF-|^$DIR/validation-report" \
       | grep -viE 'миграц|не использ|запрещ|раньше|было|конфликт|отклон|против|вместо|уход|заменён|заменен|переехал|§9|без supabase|а не |не supabase|не является' \
       | grep -viE '^[^:]*:[0-9]+:#{1,4} |^[^:]*:[0-9]+:> ' | wc -l)
[ "$hits" -eq 0 ] && say "PR-002 managed BaaS" "✅ чисто" || { say "PR-002 managed BaaS" "❌ $hits упоминаний"; FAIL=1; }

# PR-002: Postgres присутствует
grep -qi 'postgres' "$DIR/Architecture.md" 2>/dev/null \
  && say "PR-002 Postgres в архитектуре" "✅" || { say "PR-002 Postgres в архитектуре" "❌ нет"; FAIL=1; }

# PR-001: growth-требования дошли до Specification
n=$(grep -c 'FR-GROWTH' "$DIR/Specification.md" 2>/dev/null || echo 0)
[ "$n" -ge 4 ] && say "PR-001 growth-требования" "✅ $n упоминаний" || { say "PR-001 growth-требования" "❌ меньше 4"; FAIL=1; }

# PR-003: каждое требование из Specification есть в Pseudocode
if [ -f "$DIR/Specification.md" ] && [ -f "$DIR/Pseudocode.md" ]; then
  miss=$(comm -23 \
    <(grep -ohE 'FR-[A-Z-]*[0-9]{3}' "$DIR/Specification.md" | sort -u) \
    <(grep -ohE 'FR-[A-Z-]*[0-9]{3}' "$DIR/Pseudocode.md" | sort -u))
  [ -z "$miss" ] && say "PR-003 трассировка Spec→Pseudo" "✅" \
    || { say "PR-003 трассировка Spec→Pseudo" "⚠️ нет ссылки на ID: $(echo $miss | tr '\n' ' ')";
         echo "     (проверить: алгоритма нет вовсе, или он есть без ссылки на ID требования)"; }
fi

# PR-004: у метрики недели есть число
if grep -qi 'Метрика недели' "$DIR/PRD.md" 2>/dev/null; then
  grep -i -A2 'Метрика недели' "$DIR/PRD.md" | grep -qE '[0-9]+' \
    && say "PR-004 целевое число метрики" "✅" || { say "PR-004 целевое число метрики" "❌ нет числа"; FAIL=1; }
fi

# PR-007: обратная трассировка ADR
if [ -f "$DIR/ADR.md" ]; then
  orphan=""
  for a in $(grep -ohE 'ADR-[0-9]{3}' "$DIR/ADR.md" | sort -u); do
    grep -qr "$a" "$DIR/Specification.md" "$DIR/Architecture.md" "$DIR/Pseudocode.md" 2>/dev/null || orphan="$orphan $a"
  done
  [ -z "$orphan" ] && say "PR-007 ADR → требование" "✅" || say "PR-007 ADR → требование" "⚠️ без ссылки:$orphan"
fi

# PR-007: элементы CJM отражены или явно исключены
if [ -f "$DIR/discovery/CJM_Variants.md" ]; then
  say "PR-007 CJM → требования" "⚠️ проверить вручную: механизма нет"
fi

# Порты compose: хостовая часть не должна быть зашита числом, и не должна конфликтовать
# с уже занятым на машине (.claude/rules/docker-ports.md). Проект 01: сгенерированный
# compose просил 80/443, занятые чужим reverse-proxy.
PROJ_ROOT="$(dirname "$DIR")"
if [ -f "$PROJ_ROOT/docker-compose.yml" ]; then
  hardcoded=$(grep -oE '^[[:space:]]*ports:.*' "$PROJ_ROOT/docker-compose.yml" \
    | grep -vE '\$\{[A-Za-z_]' | grep -oE '"[0-9]+:[0-9]+"' | tr '\n' ' ')
  if [ -n "$hardcoded" ]; then
    say "Порты: хостовая часть числом" "❌ зашито: $hardcoded — вынести в \${VAR:-default}"
    FAIL=1
  else
    say "Порты: хостовая часть в переменных" "✅"
  fi
  # Правило №0: хранилище наружу — компрометация, а не неудобство (инцидент 2026-08-26).
  db_pub=$(grep -B6 -E '^[[:space:]]*ports:' "$PROJ_ROOT/docker-compose.yml" \
    | grep -oE 'image:[[:space:]]*[^[:space:]]*(postgres|mysql|mariadb|mongo|redis|elastic|minio|rabbitmq|pgvector)[^[:space:]]*' | head -3)
  if [ -n "$db_pub" ]; then
    say "БД публикует порт наружу" "❌ $(echo "$db_pub" | tr '\n' ' ') — заменить ports: на expose:"
    FAIL=1
  else
    say "Хранилища не смотрят в интернет" "✅"
  fi

  if [ -x "$(dirname "$0")/check-port-conflicts.sh" ]; then
    if bash "$(dirname "$0")/check-port-conflicts.sh" "$PROJ_ROOT" >/dev/null 2>&1; then
      say "Порты: конфликтов на машине нет" "✅"
    else
      say "Порты: КОНФЛИКТ" "❌ compose up упадёт — bash scripts/check-port-conflicts.sh $PROJ_ROOT"
      FAIL=1
    fi
  fi
fi

# Реестр незакрытых GAP
g=$(grep -rc '\[GAP' "$DIR" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
say "Открытых [GAP]" "$g — просмотреть перед Phase 3"

echo
[ "$FAIL" -eq 0 ] && echo "Блокирующих проблем нет." || echo "Есть блокирующие проблемы — см. ❌ выше."
exit $FAIL
