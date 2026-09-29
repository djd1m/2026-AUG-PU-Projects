# Реальные аккаунты, ЮKassa и агенты — N3 F2

Рабочий кабинет доступен на `/account` каждого варианта A–D. Например: https://n3-a.194.85.249.105.sslip.io/account . Корневые страницы вариантов остаются явно синтетическими демонстрациями. Кабинет использует отдельные реальные организации без демоплатежей. Вход на каждом домене отдельный, аккаунт и членства общие. Cookie host-only, HttpOnly, Secure, SameSite=Lax; пароль Argon2id. Смена пароля завершает все сеансы и отзывает агентные credentials.

## Как проверить кабинет

1. Зарегистрируйте аккаунт с паролем от12 символов и названием организации.
2. Опубликуйте условия cash/credit программы. До этого создание оплаты запрещено.
3. Создайте приглашение partner/customer и передайте нужному человеку лично. Срок сутки, одно использование. Получатель регистрируется/входит и принимает приглашение.
4. Партнёр видит только свои вознаграждения и добровольно принимает условия. Клиент видит собственный credit; отсутствие реального счёта показывается как отсутствие счёта.
5. Подготовьте месячный реестр. После проверенного платежа/истечения удержания доступны строки; утверждение/CSV требуют актуальных id/revision/hash. Ручные выплаты — до5-го следующего месяца. CSV не выполняет перевод. Отметка sent/reconciliation пока доступны через общий API; рабочий кабинет предоставляет подготовку, утверждение и экспорт.
6. В блоке агентов выдайте ключ на час, сохраните в защищённых настройках своего клиента и проверьте MCP-соединение. Отзыв сразу блокирует следующие действия/чтение cached result. Выдача ключа не даёт approve/export/send.

Подтверждение почты и самостоятельное восстановление пароля в этот этап не входят и пока не подключены. Не используйте чужой адрес. N3 не заявляет проверенное владение email, SSO или полностью готовый коммерческий запуск лишь по факту доступности формы входа.

## Настройка ЮKassa

На текущем VPS интеграция **не настроена**: `.runtime/yookassa.json` содержит `{"enabled":false}`. Ошибка/отсутствие конфигурации никогда не переключает реальные операции на fixture. Ключи проектов01/02 не используются. Проведены контрактные HTTP/SQL тесты; настоящая merchant sandbox/live операция не проводилась.

Поддержан один явно выбранный магазин и одна реальная организация N3 на deployment. ID организации (`tenantId`) возвращается `/api/account/me` для выбранного членства. Владелец VPS помещает выделенные N3 credentials в ignored `.runtime/yookassa.json` с правами0600:

```json
{
  "enabled": true,
  "tenantId": "UUID_РЕАЛЬНОЙ_ОРГАНИЗАЦИИ_N3",
  "shopId": "ID_МАГАЗИНА",
  "secretKey": "СЕКРЕТ_ОТДЕЛЬНОГО_МАГАЗИНА_N3",
  "testMode": true,
  "returnUrl": "https://n3-a.194.85.249.105.sslip.io/account"
}
```

Это шаблон, не работающие credentials. Файл подаётся API через Docker secret и читается до сброса root. После проверки портов пересоздайте только API: `docker compose up -d --force-recreate --wait api`. API по-прежнему loopback, БД без host ports и только в internal-сети backend/database. Секреты не выводить через `docker inspect ... Env` и не коммитить.

В кабинете ЮKassa настройте `payment.succeeded` и `refund.succeeded` на https://n3-a.194.85.249.105.sslip.io/api/webhooks/yookassa . Native webhook не содержит HMAC-подписи: подлинность проверяется отдельным authenticated GET к фиксированному HTTPS API ЮKassa. Проверяются ID, shop, test/live, RUB, amount, paid/status и provider timestamp. Tenant/получатель/ставка берутся из сохранённой заявки N3. Metadata провайдера служит только ключом поиска.

Создание заказа принимает сумму от авторизованного владельца организации, не от анонимного покупателя. Ключ повтора N3 сохраняет UUID заказа; этот UUID неизменен в Idempotence-Key ЮKassa. Внешние вызовы не удерживают SQL-транзакцию. После23 часов неподтверждённый create блокируется до ручной сверки, поскольку провайдер хранит ключ24 часа. Повтор после смены shop/test-mode отклоняется до нового финансового вызова. Не создавайте новую заявку для обхода неопределённого результата старой.

Возвраты инициируются оператором в ЮKassa; N3 принимает и проверяет их события, сохраняет исходное начисление и коррекцию. При refund-before-payment перечитывается также исходная оплата, оба проверенных факта применяются в одной транзакции. Дедупликация: immutable_facts PK(tenant_id,kind,business_key), business_key=`yookassa/shop/object_id`; каждый refund имеет собственный provider id. Повтор/параллельная доставка не меняет итог второй раз.

Для подключения реального магазина отдельно проверьте настройки фискализации/чеков и договорные требования своего сценария; этот адаптер не реализует передачу составного чека. Автовыплаты/split и CloudPayments не включаются этой конфигурацией. Ручная схема выплат остаётся принятой владельцем.

Официальные контракты: [уведомления ЮKassa](https://yookassa.ru/developers/using-api/webhooks), [идемпотентность](https://yookassa.ru/developers/using-api/interaction-format#idempotence).

## Подключение MCP / A2A

MCP: `https://n3-d.194.85.249.105.sslip.io/mcp`, Streamable HTTP, protocol2025-11-25, stateless JSON responses. A2A Agent Card: `https://n3-d.194.85.249.105.sslip.io/.well-known/agent-card.json`; JSON-RPC endpoint `/a2a`, version0.3.0. Те же маршруты проксируются каждым frontend; Agent Card без Origin указывает канонический D.

Добавьте `Authorization: Bearer <выданный_агентный_ключ>` в настройки клиента. Это отдельный от cookie ключ, в БД только SHA256; срок максимумчас, разрешения определяются ролью и grant. Ручная выдача bearer поддержана; OAuth discovery/SSO не заявляются. MCP проверен официальным SDK Client1.30.0. A2A проверен JSON-RPC HTTP-клиентом и общим PostgreSQL-приложением; отдельный официальный A2A SDK не использовался.

MCP tools/list отдаёт доступные tools. Например registry_prepare принимает `{ "input": {"period":"2026-08"}, "idempotencyKey":"unique-stable-key" }`; dashboard — `{ "input":{} }`. Неподдерживаемые или лишние поля отвергаются. Используйте один ключ при повторе того же действия.

A2A message/send:

```json
{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"stable-message-id","parts":[{"kind":"data","data":{"kind":"registry","input":{"period":"2026-08"}}}]}}}
```

Повтор messageId в том же grant возвращает ту же логическую задачу; другие данные конфликтуют. `tasks/get` и `tasks/cancel` принимают `params:{"id":"TASK_ID"}`. Завершённую задачу отменить нельзя. История сохраняется в БД; UI показывает тот же task/artifact. Streaming, push notifications, фоновый nonblocking scheduler и conversational continuation не реализованы и не рекламируются. Это реальный протокольный сервер с детерминированными бизнес-операциями; внешняя LLM/агент вызывает его инструменты, встроенной LLM нет.

[MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [официальный SDK](https://ts.sdk.modelcontextprotocol.io/server), [A2A0.3.0](https://a2a-protocol.org/v0.3.0/specification/).

## Границы пилота и повторная проверка

Реальный кабинет общий для A–D; исходные четыре CJM-демонстрации на `/` остаются fixture. Полный перенос каждого специализированного UI на реальные бизнес-сценарии этим этапом не заявляется. В хранилище пилота сохраняются ограничения на организацию: 5000 checkout-заявок, 100 артефактов реестров, 200 задач и 5000 audit-записей. До достижения лимитов требуется отдельная миграция/архивация; удаление истории ради обхода ограничений недопустимо. Эти ограничения не превращаются в автоматические выплаты.

Проверки: `npm run build`; `docker compose -f docker-compose.test.yml run --rm --no-deps backend npm test`; `node scripts/run-public-e2e.mjs`; `node --test tests/e2e/account.mjs`; `node --test tests/e2e/public-agent.mjs`; `node scripts/check-deployment.mjs`. Browser-наборы используют локальный Firefox WebDriver и выполняются последовательно. Test PostgreSQL не публикует порты. Последние результаты и точные версии: [F2 completion](features/f2-commercial/05_completion.md).

## Выкладка на reward.aicoding.space (ADR-003, 29.09.2026)

Адреса: каталог и A — https://reward.aicoding.space/demos/index.html и https://reward.aicoding.space/ (алиас `a.reward.aicoding.space`), B/C/D — `https://{b,c,d}.reward.aicoding.space/`, запасной — `https://n3-{a,b,c,d}.194.85.249.105.sslip.io/`. Образы `n3-api:bridge-901f0a6` и `n3-{a,b,c,d}:bridge-901f0a6` собраны от коммита `901f0a6` ветки `n3/reward-domain` (релизная линия `acf124e`, без незавершённой F3); метки прописаны в `compose.bridge-release.yml`. Сборку из main не выполнять.

Перед выкладкой: `bash scripts/check-port-conflicts.sh projects/03-affiliate-rewardful` из корня репозитория (порты 13030–13034 заняты самим работающим стендом — это ожидаемо, `up` пересоздаёт те же контейнеры). Затем по одной команде из папки N3, API первым (список origin проверяет именно он):

```bash
docker compose -f docker-compose.yml -f compose.bridge-release.yml up -d --no-build --no-deps --wait api
docker compose -f variants/a-merchant/docker-compose.yml -f variants/a-merchant/compose.bridge-release.yml up -d --no-build --wait
docker compose -f variants/b-customer/docker-compose.yml -f variants/b-customer/compose.bridge-release.yml up -d --no-build --wait
docker compose -f variants/c-partner/docker-compose.yml -f variants/c-partner/compose.bridge-release.yml up -d --no-build --wait
docker compose -f variants/d-agent/docker-compose.yml -f variants/d-agent/compose.bridge-release.yml up -d --no-build --wait
```

Проверка после: `curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: https://reward.aicoding.space' https://reward.aicoding.space/api/command` → `204` (до выкладки `403`); тот же запрос с `Origin: https://evil.reward.aicoding.space` → `403`. Откат — вернуть в пяти `compose.bridge-release.yml` метку `bridge-acf124e` и повторить те же команды (схема БД не менялась).

### Лимит демосеансов `N3_MAX_DEMO_RUNS` (29.09.2026)

`N3_MAX_DEMO_RUNS` — сколько независимых fixture-демосеансов (строк `tenants` с `mode='fixture'`) может существовать одновременно; при достижении `POST /api/demo` отвечает `429 DEMO_LIMIT`. Сеанс живёт 24 ч, но строка организации остаётся — лимит считает накопленные демо, а не активные. Разбор (`apps/api/demo-limit.mjs`): переменная **не задана** → 200, как было; задана — только целое `1…10000` без знака, пробелов, ведущих нулей и экспоненты, иначе API **не стартует** и называет значение (пустая строка — отказ, а не «200 по умолчанию»). Действующее значение печатается в журнале: `N3 API ready (maxDemoRuns=N)`.

На стенде — `400` (решение владельца 29.09, ADR-003), задано явно в `environment` сервиса `api` в `compose.bridge-release.yml`. Образ `n3-api:bridge-38bed68` собран от коммита `38bed68` ветки `n3/reward-domain` (= `901f0a6` + эта переменная) через `git archive` и `DOCKER_BUILDKIT=0 docker build --cpu-quota 150000 --memory 1g -f apps/api/Dockerfile`; фронтенды остаются `bridge-901f0a6`. Выкладка — только первая команда из списка выше (`… up -d --no-build --no-deps --wait api`); проверка — `docker logs n3-shared-api-1 | grep maxDemoRuns` → `maxDemoRuns=400` и прежний `OPTIONS` → `204`. Откат — метка `bridge-901f0a6` и удалить `environment` из overlay API (старый образ переменную игнорирует, лимит снова 200). `server.mjs` в main этой правки не содержит — выпуск из main обязан её перенести вместе с `deployment.mjs`.

## F3 — подключение рабочей реферальной воронки

Подробный рецепт: [интеграция SaaS](integrations/referral-funnel.md). Владелец публикует cash-условия, задаёт HTTPS-страницы регистрации и возврата на одном origin, выдаёт отдельный серверный ключ. Ключ действует 90 дней, в БД хранится хеш; ротация, отзыв и смена пароля прекращают его действие. Это не агентный ключ MCP/A2A.

Партнёр принимает приглашение и условия. `/r/<actorId>` сохраняет переход и направляет на настроенный сайт. Трекер того сайта сохраняет первое касание в host-only cookie; промокод действует независимо от cookie и имеет явный приоритет. Merchant backend после проверки email привязывает стабильный customerId и создаёт заказ по собственной сумме счёта. Новый connector-заказ берёт получателя из сохранённой регистрации. Окно 30/60/90 дней относится к переходу до регистрации; последующие заказы сохраняют эту связь. Fulfillment требует authenticated order status, verified=true и учёта netAmountMinor/refundedAmountMinor; return URL оплату не доказывает.

Тестовые connector-платежи видны в истории и отдельной метрике; они не входят в боевую активацию и суммы к выплате. Исторические F2 платежи сохраняют прежнюю трактовку: перед боевыми выплатами оператор должен сверить старые записи тестового магазина. MRR пока отсутствует; текущий контракт не импортирует автоматически существующие подписки магазина.

Проверка отдельного merchant-сайта: `node scripts/run-referral-e2e.mjs`. Скрипт проверяет свободные loopback-порты13143/13144/4571, запускает отдельный backend с временной SQL-схемой, TLS-тестовым магазином и proxy, который направляет только перечисленные A–D/merchant-origin во временную схему. Он не обращается к боевому backend. Firefox использует отдельную WebDriver-сессию; для snap нужен доступный каталог `N3_FIREFOX_PROFILE_ROOT` (на этом VPS `/root/snap/firefox/common`). Публикуются только HTTP-прокси и служебный HTTP тестового backend; PostgreSQL не публикуется. По окончании удаляются контейнер/схема/сессия, доказательства остаются в ignored `.runtime/referral-e2e/`. Это имитатор API провайдера и почты, не банковская операция.

Новые лимиты:100000 переходов/10000 customer bindings/5000 заказов на tenant; public300/min и connector600/min по адресу socket, отдельные от account buckets. Общий адрес proxy/NAT разделяет квоту. Нет обещания SLA под произвольным flood; тесты проверяют ограничение приёма и прогресс обычного запроса на общем пуле.

**Откат:** после появления любого connector-заказа запрещено возвращать F2 backend/webhook-процессор, даже после сверки: поздние дубли и возвраты возможны неограниченно долго. Можно откатить frontend при сохранении совместимого F3 API. При проблеме backend остановите ingress и внесите исправление вперёд; новые таблицы/колонки не удаляйте.
