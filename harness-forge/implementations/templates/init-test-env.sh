#!/usr/bin/env bash
# ШАБЛОН: генерация .env.test со СЛУЧАЙНЫМИ паролями.
# Извлечено из projects/01-testimonials-senja, 2026-08-27. Maturity: 🔴 Alpha.
#
# Существует ровно затем, чтобы у разработчика не было повода написать пароль руками.
# Дефолтные учётные данные (postgres/postgres, minioadmin/minioadmin) — не «временно
# для тестов», а готовая точка входа: см. шапку compose.test.yml.
#
# Идемпотентен: существующий .env.test не перезаписывает, чтобы не сломать уже
# поднятый стек (пароли в контейнере остались бы старыми, а в файле — новыми).

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.test ]; then
  echo "✅ .env.test уже есть — оставляю как есть"
  echo "   Пересоздать: docker compose -f compose.test.yml down -v && rm .env.test && $0"
  exit 0
fi

cat > .env.test <<EOF
# Сгенерировано $0. НЕ КОММИТИТЬ — файл в .gitignore.
TEST_PG_PASSWORD=$(openssl rand -hex 24)
TEST_MINIO_PASSWORD=$(openssl rand -hex 24)
TEST_PG_PORT=55432
TEST_MINIO_PORT=59000
EOF
chmod 600 .env.test

grep -qxF '.env.test' .gitignore 2>/dev/null || echo '.env.test' >> .gitignore

echo "✅ .env.test создан со случайными паролями"
echo "   Запуск: set -a; . ./.env.test; set +a; docker compose -f compose.test.yml up -d"
