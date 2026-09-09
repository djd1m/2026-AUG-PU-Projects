# Specification — f2-commercial

Владелец 2026-09-09 разрешил реализацию реальной identity, ЮKassa payments/refunds и MCP/A2A; повторное согласование плана не требуется. Тир XL; профиль compact-quality-first-v2. F1 остаётся отдельной синтетической лабораторией. Архитектура — общий backend/PostgreSQL, четыре frontend-контейнера.

### FR-f2-commercial-1
Реальные аккаунты и роли, общие для A–D.

### AC-f2-commercial-11
Регистрация создаёт пустую организацию и владельца, пароль Argon2id, непрозрачная сессия в HttpOnly/Secure/SameSite cookie. Вход после выхода/перезапуска сохраняет данные. Пароли/токены отсутствуют в логах и ответах session API.

### AC-f2-commercial-12
Членство проверяется сервером на каждом действии; приглашение одноразовое, с ограниченным сроком, задаёт роль partner/customer. Чужие actor/tenant запрещены. Реальные и fixture tenants не смешиваются; fixture.event/advance невозможны в real tenant.

### AC-f2-commercial-13
Logout отзывает сессию; смена пароля отзывает все старые сессии и агентные credentials. Ошибочный пароль, истечение, CSRF, избыточное тело, параллельный login/register ограничены и проверены.

### FR-f2-commercial-2
Проверенные платежи/возвраты ЮKassa.

### AC-f2-commercial-21
Сервер создаёт устойчивую заявку с ценой/атрибуцией, затем вне транзакции обращается в ЮKassa с постоянным ключом идемпотентности. Tenant определяется сохранённой заявкой, не webhook metadata. Отсутствие N3 credentials явно означает unavailable, без synthetic fallback.

### AC-f2-commercial-22
Webhook payment.succeeded/refund.succeeded перечитывается через authenticated API ЮKassa до дедупликации. Проверяются shop, test/live, ID, RUB, сумма, status, payment binding. Подделка/неподтверждённое событие не начисляет денег; временный сбой допускает retry.

### AC-f2-commercial-23
Повтор, параллельная доставка и refund-before-payment приводят к одному неизменяемому начислению/коррекции. Сохраняются F1 инварианты устаревшего реестра, ручных выплат и отделения credit от cash.

### FR-f2-commercial-3
Реальное подключение внешних агентов.

### AC-f2-commercial-31
MCP Streamable HTTP и A2A v0.3.0 JSON-RPC доступны через HTTPS, имеют обнаружение возможностей и проверяются протокольными клиентами. Не заявляются неподдерживаемые streaming/push/OAuth/LLM возможности.

### AC-f2-commercial-32
Отдельный агентный bearer выдаётся один раз, в БД только hash, связан с actor/grant/TTL; scopes не включают approve/send/export/credential creation. Каждый запрос и cached result проверяют отзыв/expiry/membership, чужие tasks/resources запрещены.

### AC-f2-commercial-33
Агентная задача имеет устойчивый ID, повторный messageId не дублирует действие, доступны status/cancel; UI читает тот же результат. Protocol transport не выдаётся за встроенную LLM.

### FR-f2-commercial-4
Проверка и выкладка.

### AC-f2-commercial-41
Все core regressions и A–D browser E2E плюс реальные signup/login/invite/agent UI desktop/mobile проходят до запроса владельцу проверить UI. БД без host ports и только backend network, secrets случайные и ignored. Публикуются честные границы provider contract tests vs real merchant sandbox.
