#!/bin/sh
# Предполётная проверка: все ли обязательные переменные compose объявлены в env-файле.
# Заслужено 22.09.2026: дважды подряд интеграционный прогон падал на старте из-за
# необъявленной переменной, и каждый раз это была впустую потраченная пересборка образа.
# N5_LIMIT_USER_RERENDERS также проверяется по обязательному x-quota-env без отдельного списка.
# Три кода возврата: 0 — полно, 1 — чего-то нет, 2 — проверка НЕ ВЫПОЛНЕНА.
ENV_FILE="${1:?укажите env-файл}"
[ -r "$ENV_FILE" ] || { echo "❌ $ENV_FILE нечитаем — проверка НЕ ВЫПОЛНЕНА" >&2; exit 2; }
[ -r docker-compose.yml ] || { echo "❌ docker-compose.yml нечитаем — проверка НЕ ВЫПОЛНЕНА" >&2; exit 2; }
REQUIRED=$(grep -vE '^[[:space:]]*#' docker-compose.yml | grep -oE '\$\{[A-Z][A-Z0-9_]*:\?' | sed 's/\${//;s/:?//' | sort -u)
[ -z "$REQUIRED" ] && { echo "❌ в compose не найдено ни одной обязательной переменной — проверка НЕ ВЫПОЛНЕНА" >&2; exit 2; }
MISSING=""
for v in $REQUIRED; do grep -qE "^$v=." "$ENV_FILE" || MISSING="$MISSING $v"; done
if [ -n "$MISSING" ]; then
  echo "❌ не объявлены или пусты в $ENV_FILE:$MISSING" >&2; exit 1
fi
echo "✅ все $(echo "$REQUIRED" | wc -w) обязательных переменных объявлены"
