# 01. Локальный запуск

Нужны полный checkout монорепозитория, Docker Compose, Bash, Python3 и OpenSSL.
Порт 18709 — пример: на рабочем стенде он занят N7; выберите свободный порт и
измените также APP_ORIGIN. Проверка конфликтов обязательна до запуска.

```bash
# From the monorepo root, before starting containers:
bash scripts/check-port-conflicts.sh projects/07-cold-email-warmup
cd projects/07-cold-email-warmup
export COMPOSE_PROJECT_NAME=n7local
export N7_RUNTIME_DIR=/tmp/n7-local-runtime
export N7_WEB_PORT=18709
export N7_APP_ORIGIN=http://127.0.0.1:18709
export MAIL_PROVIDER_ALLOWLIST='{"smtp.example.com":10,"imap.example.com":10}'
export N7_DISPATCH_MODE=disabled N7_POLL_MODE=disabled N7_BILLING_MODE=disabled
bash scripts/local-runtime.sh
docker compose up --build -d
curl --fail http://127.0.0.1:18709/readyz
```

Allowlist — JSON hostname → наш суточный потолок 1–30. Примерные домены выше
не доказывают доступность почтового сервиса. Для TEST-верификации укажите разрешённые
публично разрешающиеся DNS-hostnames; реальный SMTP/IMAP коннектор здесь отсутствует.

Откройте `/signin`, зарегистрируйтесь и перейдите в `/app`. Web автоматически
применяет миграции до готовности. PostgreSQL доступен только в сети Compose.
Секреты генерируются в закрытой папке runtime, значения не печатаются. Не коммитьте
её, не заменяйте ключи существующей БД: credentials и сессии зависят от них.

Для локального TEST-потока отдельно выставьте три режима `local_test` и выполните
`docker compose up -d --force-recreate web`. Это включает только локальные адаптеры;
режима `live` в принятой реализации нет. Дальше — [операторский поток](03_admin_guide.md).

Остановка с сохранением БД: `docker compose down`. Не добавляйте `-v`, если нужны данные.
