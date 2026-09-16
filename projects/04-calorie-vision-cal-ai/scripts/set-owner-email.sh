#!/usr/bin/env bash
# Вписывает почту владельца в закрытый список OWNER_EMAILS (apps/api/src/routes/admin.ts)
# и по желанию пересобирает и перезапускает api. Список живёт В КОДЕ, не в окружении —
# намеренно (honest-configuration CFG-I8): allowlist из переменной однажды приедет пустым.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=apps/api/src/routes/admin.ts

read -r -p "Почта владельца (для входа в кабинет владельца): " EMAIL
EMAIL=$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)
if ! printf '%s' "$EMAIL" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'; then
  echo "✗ «$EMAIL» не похоже на адрес почты — ничего не изменено" >&2; exit 1
fi

if grep -q "OWNER_EMAILS: readonly string\[\] = \[\];" "$FILE"; then
  sed -i "s|OWNER_EMAILS: readonly string\[\] = \[\];|OWNER_EMAILS: readonly string[] = ['$EMAIL'];|" "$FILE"
elif grep -q "'$EMAIL'" "$FILE"; then
  echo "• $EMAIL уже в списке — ничего не изменено"
else
  sed -i "s|OWNER_EMAILS: readonly string\[\] = \[|OWNER_EMAILS: readonly string[] = ['$EMAIL', |" "$FILE"
fi
echo "✓ список владельцев теперь:"; grep -n "OWNER_EMAILS: readonly" "$FILE"

read -r -p "Пересобрать и перезапустить api сейчас? [y/N] " GO
if [[ "${GO,,}" == "y" ]]; then
  docker compose build api && docker compose up -d --no-deps api
  sleep 8; docker compose ps --format '{{.Service}} | {{.Status}}' | grep '^api'
  echo "✓ готово: зарегистрируйтесь этой почтой в /settings — кабинет владельца откроется в /cabinet"
else
  echo "• без пересборки список в работающем стенде не изменится: docker compose build api && docker compose up -d --no-deps api"
fi
