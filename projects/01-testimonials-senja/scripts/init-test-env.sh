#!/usr/bin/env bash
# Разовая генерация .env.test — случайные пароли для тестового окружения.
#
# Зачем отдельный файл, а не переменные в шелле: команды docker compose вызываются
# многократно и из разных шеллов (up, ps, exec, down), а compose.test.yml намеренно
# требует переменные жёстко (${VAR:?}) — без файла каждая из них падала бы.
#
# .env.test в .gitignore. Пароли здесь одноразовые и относятся к контейнерам,
# доступным ТОЛЬКО с петли (127.0.0.1) — см. .claude/rules/docker-ports.md.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.test ] && [ "${1:-}" != "--force" ]; then
  echo ".env.test уже есть — перегенерировать: bash scripts/init-test-env.sh --force"
  exit 0
fi

gen() { openssl rand -hex 24; }

cat > .env.test <<INNER
# Сгенерировано scripts/init-test-env.sh — НЕ коммитить (см. .gitignore).
# Пароли одноразовые: тестовые контейнеры держат данные в tmpfs и стираются с ними.
TEST_PG_PASSWORD=$(gen)
TEST_MINIO_PASSWORD=$(gen)
TEST_PG_PORT=55432
TEST_MINIO_PORT=59000
INNER

chmod 600 .env.test
echo ".env.test создан (права 600). Дальше:"
echo "  docker compose --env-file .env.test -f compose.test.yml up -d"
