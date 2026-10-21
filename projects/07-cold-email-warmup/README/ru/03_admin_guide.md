# 03. Оператор локального TEST

Оператор владеет процессом/runtime-файлами. Эти действия не доступны tenant через
HTTP. Сначала создайте synthetic ящик/кампанию, TEST-верификацию и отдельные согласия
в кабинете. Для due job нужен завершённый poll не старше 60 секунд.

```bash
# In the project directory with the same exported Compose variables:
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test
docker compose up -d --force-recreate web
# TENANT_ID and MAILBOX_ID are owned test-record UUIDs obtained from your cabinet/API.
printf '%s\n' '{"uidvalidity":"1","uidNext":1,"headers":[]}' > /tmp/n7-empty-inbox.json
docker compose cp /tmp/n7-empty-inbox.json web:/tmp/n7-empty-inbox.json
docker compose exec -T web npm run replies:operator -- seed "$TENANT_ID" "$MAILBOX_ID" /tmp/n7-empty-inbox.json
docker compose exec -T web npm run replies:operator -- poll "$TENANT_ID" "$MAILBOX_ID"
docker compose exec -T web npm run dispatch:tick
```

Один dispatch tick резервирует максимум одно задание и пишет результат в durable
local sink; его можно увидеть в `/api/dispatch/messages` собственного tenant.
Длительный локальный polling: `docker compose --profile local-poll up -d poll-worker`.
Fixture reply содержит UID и bounded заголовки по `src/replies/input.ts`; пример
полного рабочего потока находится в `scripts/ui/f06-fixture.mjs`. Нельзя ставить
scan freshness вручную SQL вместо worker. Retry: `npm run replies:operator -- retry TENANT_ID MAILBOX_ID` внутри web.

TEST-оплата: пользователь создаёт checkout в кабинете, затем оператор через
`POST /api/operator/billing/simulate` задаёт canonical provider state (`paymentId`,
`status: "succeeded"`), а через `/api/operator/billing/reconcile` передаёт `intentId`.
Оба HTTP-запроса требуют отдельный operator Bearer из runtime-файла, без cookie;
состав запроса ограничен валидатором `src/billing/provider.ts`. Не вставляйте ключ
в CLI-аргументы, browser или логи: используйте закрытый операторский процесс,
читающий файл в память. Тестовый harness показывает этот путь без передачи ключа браузеру.
Повтор reconcile не продлевает/удваивает entitlement. Тестовая цена — 100 minor RUB,
срок 30 дней; это fixture-контракт, не публичный коммерческий тариф.

Жалоба: операторский `POST /api/complaints`; token authority и отдельный limiter
не заменяются пользовательской сессией. Подробности восстановления/production:
[deployment checkpoint](../../docs/deployment-checkpoint.md).
