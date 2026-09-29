#!/usr/bin/env bash
# Добавляет публичный ключ этого VPS в репозиторий GitHub как deploy key с правом записи,
# проверяет SSH-доступ и (по подтверждению) пушит текущую ветку. Токен не сохраняется.
#
# Запуск на VPS:  bash scripts/github-add-deploy-key.sh
# Нужен personal access token GitHub:
#   classic — scope `repo`;  fine-grained — доступ к репозиторию, Repository permissions → Administration: Read and write.
# Токен можно передать через переменную GITHUB_TOKEN (тогда скрипт его не спрашивает).
set -euo pipefail

OWNER="${GH_OWNER:-djd1m}"
REPO="${GH_REPO:-2026-AUG-PU-Projects}"
KEY_FILE="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519_promo}"
PUB="$KEY_FILE.pub"
API="https://api.github.com/repos/$OWNER/$REPO/keys"
DRY="${1:-}"

[ -r "$PUB" ] || { echo "❌ нет публичного ключа $PUB — проверка НЕ выполнена" >&2; exit 2; }
KEY_TEXT="$(cut -d' ' -f1,2 "$PUB")"
TITLE="$(cut -d' ' -f3 "$PUB" 2>/dev/null || true)"; TITLE="${TITLE:-deploy-$(hostname)}"

if [ "$DRY" = "--dry-run" ]; then
  echo "dry-run: POST $API"; echo "  title=$TITLE  read_only=false"; echo "  key=$(echo "$KEY_TEXT" | cut -c1-40)…"; exit 0
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  if [ -t 0 ]; then read -r -s -p "GitHub token (ввод скрыт): " GITHUB_TOKEN; echo
  else echo "❌ нет TTY и не задан GITHUB_TOKEN — проверка НЕ выполнена" >&2; exit 2; fi
fi
[ -n "$GITHUB_TOKEN" ] || { echo "❌ пустой токен" >&2; exit 2; }

BODY=$(printf '{"title":"%s","key":"%s","read_only":false}' "$TITLE" "$KEY_TEXT")
RESP_FILE=$(mktemp); trap 'rm -f "$RESP_FILE"' EXIT
CODE=$(curl -sS -o "$RESP_FILE" -w '%{http_code}' -X POST "$API" \
  -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" -d "$BODY")
unset GITHUB_TOKEN

case "$CODE" in
  201) echo "✅ ключ добавлен в $OWNER/$REPO (id $(grep -o '"id": *[0-9]*' "$RESP_FILE" | head -1 | tr -dc 0-9))" ;;
  422) if grep -q "already in use" "$RESP_FILE"; then echo "ℹ️  ключ уже есть в репозитории (или в другом репозитории GitHub — тогда там его надо удалить)";
       else echo "❌ GitHub отверг запрос (422): $(tr -d '\n' < "$RESP_FILE" | cut -c1-300)" >&2; exit 1; fi ;;
  401) echo "❌ токен не принят (401)" >&2; exit 1 ;;
  403|404) echo "❌ нет прав на $OWNER/$REPO ($CODE): нужен scope repo или Administration: write" >&2; exit 1 ;;
  *) echo "❌ неожиданный ответ $CODE: $(tr -d '\n' < "$RESP_FILE" | cut -c1-300)" >&2; exit 1 ;;
esac

echo "— проверка SSH…"
if ssh -o BatchMode=yes -o ConnectTimeout=15 -i "$KEY_FILE" -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo "✅ SSH-доступ к GitHub работает"
else
  echo "❌ SSH не прошёл (ключ добавлен, но GitHub не пустил) — проверьте ~/.ssh/config" >&2; exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
AHEAD="$(git -C "$REPO_DIR" rev-list --count "origin/$BRANCH..$BRANCH" 2>/dev/null || echo '?')"
echo "— ветка $BRANCH, коммитов к отправке: $AHEAD"
if [ -t 0 ]; then read -r -p "Отправить ветку в origin? [y/N] " yn; else yn="${PUSH:-n}"; fi
if [[ "$yn" =~ ^[Yy]$ ]]; then
  git -C "$REPO_DIR" push origin "HEAD:$BRANCH"
  echo "✅ отправлено. Ролики: https://github.com/$OWNER/$REPO/raw/$BRANCH/promo/dist/<proj>/<16x9|9x16|1x1>.mp4"
else
  echo "пуш пропущен; вручную: git push origin $BRANCH"
fi
