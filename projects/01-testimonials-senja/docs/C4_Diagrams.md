# C4 Diagrams — Proofwall

> Ключевой поток для детализации: **рендер виджета с серверной проверкой тарифа**
> (FR-006, FR-GROWTH-003). См. [`Architecture.md`](Architecture.md) §4 для прозы.
> Postgres и MinIO — контейнеры нашего docker-compose стека, не внешние системы (см.
> [Architecture.md §9](Architecture.md#9-миграция-со-стека-supabase)).

## Уровень 1 — System Context

```mermaid
C4Context
    title Proofwall — System Context

    Person(visitor, "Посетитель сайта клиента", "Видит виджет с отзывами на стороннем сайте")
    Person(owner, "Владелец проекта", "Инди-хакер / агентство, собирает и модерирует отзывы")
    Person(partner, "Партнёр с аудиторией", "Владелец рассылки/канала, приводит трафик по коду")

    System(proofwall, "Proofwall", "Сбор отзывов, модерация, Wall of Love, встраиваемый виджет; включает свою БД и хранилище")

    System_Ext(clientSite, "Сайт клиента-владельца", "Сторонний сайт, на который встроен <script>")
    System_Ext(claude, "Claude API", "Транскрипция видео-отзывов (только речь → текст)")
    System_Ext(payments, "Платёжный провайдер", "Оплата тарифа, вебхуки о платеже")

    Rel(owner, proofwall, "Создаёт проект, модерирует, вставляет виджет, логинится", "HTTPS")
    Rel(visitor, clientSite, "Открывает страницу")
    Rel(clientSite, proofwall, "Загружает /widget.js, запрашивает конфигурацию", "HTTPS")
    Rel(visitor, proofwall, "Видит виджет и badge внутри страницы клиента")
    Rel(partner, proofwall, "Приводит трафик по персональному коду")
    Rel(proofwall, claude, "Транскрибирует видео через MCP-сервер", "HTTPS (MCP)")
    Rel(payments, proofwall, "Уведомляет о платеже", "Webhook")
```

## Уровень 2 — Container

```mermaid
C4Container
    title Proofwall — Containers (фокус: путь рендера виджета)

    Person(visitor, "Посетитель сайта клиента")
    System_Ext(clientSite, "Сайт клиента", "Хост-страница со встроенным <script>")
    System_Ext(claude, "Claude API")

    Container_Boundary(monorepo, "Proofwall (сервисы одного docker-compose стека на VPS)") {
        Container(widget, "Widget Bundle", "Vanilla TS, ≤30KB gzip", "Рендерит карточки отзывов и badge внутри Shadow DOM")
        Container(web, "Next.js App", "apps/web", "Дашборд, аутентификация владельцев, /f/<slug>, /w/<slug>, API-роуты (в т.ч. /api/widget/config)")
        Container(worker, "Video Worker", "services/worker", "Поллит очередь видео, вызывает MCP-сервер")
        Container(mcp, "MCP Claude Server", "services/mcp-claude", "Единственная точка доступа к Claude API; один tool: transcribe_video")
        Container(caddy, "Caddy", "reverse proxy", "TLS, раздача /widget.js с кэшем")
        ContainerDb(db, "PostgreSQL", "контейнер postgres, RLS-политики per-tenant", "Роли: app_authenticated (RLS), app_service (BYPASSRLS, анонимные пути)")
        ContainerDb(storage, "MinIO", "контейнер minio, S3 API", "Видео-файлы, presigned upload/download URL")
    }

    Rel(clientSite, caddy, "GET /widget.js", "HTTPS")
    Rel(visitor, widget, "Рендер внутри страницы (в браузере посетителя)")
    Rel(widget, caddy, "GET /api/widget/config?slug=&domain=", "HTTPS fetch")
    Rel(caddy, web, "proxy_pass")
    Rel(web, db, "SELECT approved testimonials, project.tier (роль app_service)", "SQL")
    Rel(web, db, "SET LOCAL app.current_account_id; RLS-scoped запросы дашборда (роль app_authenticated)", "SQL")
    Rel(web, db, "upsert widget_installs, insert analytics_events", "SQL")
    Rel(web, storage, "Presigned URL для загрузки/показа видео", "S3 API")
    Rel(worker, db, "Поллинг transcript_status='pending' (SELECT ... FOR UPDATE SKIP LOCKED)", "SQL")
    Rel(worker, storage, "Presigned GET URL для видео", "S3 API")
    Rel(worker, mcp, "transcribe_video(presigned GET URL из video_object_key)", "MCP protocol")
    Rel(mcp, claude, "Транскрипция аудио-дорожки", "HTTPS")
    Rel(mcp, storage, "Скачивание видео по presigned URL", "HTTPS (S3 API)")
```

## Уровень 3 — Component (внутри `apps/web`: рендер виджета + проверка тарифа)

```mermaid
C4Component
    title Proofwall — Components: /api/widget/config

    Container(widget, "Widget Bundle", "браузер посетителя")

    Container_Boundary(web, "apps/web") {
        Component(route, "GET /api/widget/config", "Next.js Route Handler", "Единственная точка входа для виджета")
        Component(resolver, "SlugResolver", "module", "slug → project_id (сервер, клиент slug не подделывает project_id)")
        Component(tierCheck, "TierPolicy", "module", "project.tier → badge_required (bool). Единственное место, где вычисляется этот флаг")
        Component(installTracker, "InstallTracker", "module", "upsert widget_installs; если новая пара (project,domain) → событие widget_installed")
        Component(eventWriter, "AnalyticsEventWriter", "module", "Единая точка записи в analytics_events (badge_impression и др.)")
    }

    ContainerDb(db, "PostgreSQL", "роль app_service, BYPASSRLS — анонимный путь виджета")

    Rel(widget, route, "fetch(slug, domain)", "HTTPS/JSON")
    Rel(route, resolver, "resolve(slug)")
    Rel(resolver, db, "SELECT id, tier FROM projects WHERE slug = $1")
    Rel(route, tierCheck, "evaluate(project.tier)")
    Rel(route, installTracker, "record(project_id, domain)")
    Rel(installTracker, db, "upsert widget_installs")
    Rel(installTracker, eventWriter, "emit widget_installed (если первая запись)")
    Rel(route, eventWriter, "emit badge_impression (если badge_required)")
    Rel(eventWriter, db, "INSERT analytics_events")
    Rel(route, widget, "{ testimonials, branding, badge_required }", "JSON, tier недоступен клиенту напрямую")
```

## Примечания к диаграммам

- Виджет **никогда** не получает поле `tier` — только вычисленное `badge_required`. Это архитектурно
  исключает подмену тарифа на клиенте (см. [ADR-002](ADR.md#adr-002)).
- `TierPolicy` — единственное место в кодовой базе, принимающее решение о badge. Дублирования этой
  логики в других роутах быть не должно (проверяется код-ревью / линт-правилом на импорт модуля).
- `PostgreSQL` и `MinIO` показаны как обычные контейнеры системы (`ContainerDb`/`Container`), а не
  `_Ext` — это наши сервисы в том же docker-compose стеке, не внешняя managed-зависимость
  (см. [Architecture.md §9](Architecture.md#9-миграция-со-стека-supabase)).
- Уровень 3 намеренно ограничен одним потоком (виджет + тариф), как задано в требовании к документу;
  остальные потоки (модерация, партнёрская атрибуция, аутентификация) детализируются по
  необходимости отдельно.
