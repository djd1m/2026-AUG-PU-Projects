# C4 Diagrams — Proofwall

> Ключевой поток для детализации: **рендер виджета с серверной проверкой тарифа**
> (FR-006, FR-GROWTH-003). См. [`Architecture.md`](Architecture.md) §4 для прозы.

## Уровень 1 — System Context

```mermaid
C4Context
    title Proofwall — System Context

    Person(visitor, "Посетитель сайта клиента", "Видит виджет с отзывами на стороннем сайте")
    Person(owner, "Владелец проекта", "Инди-хакер / агентство, собирает и модерирует отзывы")
    Person(partner, "Партнёр с аудиторией", "Владелец рассылки/канала, приводит трафик по коду")

    System(proofwall, "Proofwall", "Сбор отзывов, модерация, Wall of Love, встраиваемый виджет")

    System_Ext(clientSite, "Сайт клиента-владельца", "Сторонний сайт, на который встроен <script>")
    System_Ext(supabase, "Supabase", "Managed Postgres + Auth + Storage")
    System_Ext(claude, "Claude API", "Транскрипция видео-отзывов (только речь → текст)")
    System_Ext(payments, "Платёжный провайдер", "Оплата тарифа, вебхуки о платеже")

    Rel(owner, proofwall, "Создаёт проект, модерирует, вставляет виджет", "HTTPS")
    Rel(visitor, clientSite, "Открывает страницу")
    Rel(clientSite, proofwall, "Загружает /widget.js, запрашивает конфигурацию", "HTTPS")
    Rel(visitor, proofwall, "Видит виджет и badge внутри страницы клиента")
    Rel(partner, proofwall, "Приводит трафик по персональному коду")
    Rel(proofwall, supabase, "Читает/пишет данные, авторизует, хранит видео", "HTTPS")
    Rel(proofwall, claude, "Транскрибирует видео через MCP-сервер", "HTTPS (MCP)")
    Rel(payments, proofwall, "Уведомляет о платеже", "Webhook")
```

## Уровень 2 — Container

```mermaid
C4Container
    title Proofwall — Containers (фокус: путь рендера виджета)

    Person(visitor, "Посетитель сайта клиента")
    System_Ext(clientSite, "Сайт клиента", "Хост-страница со встроенным <script>")

    Container_Boundary(monorepo, "Proofwall (monorepo)") {
        Container(widget, "Widget Bundle", "Vanilla TS, ≤30KB gzip", "Рендерит карточки отзывов и badge внутри Shadow DOM")
        Container(web, "Next.js App", "apps/web", "Дашборд, /f/<slug>, /w/<slug>, API-роуты (в т.ч. /api/widget/config)")
        Container(worker, "Video Worker", "services/worker", "Поллит очередь видео, вызывает MCP-сервер")
        Container(mcp, "MCP Claude Server", "services/mcp-claude", "Единственная точка доступа к Claude API; один tool: transcribe_video")
        Container(caddy, "Caddy", "reverse proxy", "TLS, раздача /widget.js с кэшем")
    }

    ContainerDb_Ext(db, "Supabase Postgres", "RLS-политики per-tenant")
    Container_Ext(storage, "Supabase Storage", "Видео-файлы, signed URLs")
    Container_Ext(auth, "Supabase Auth", "Аккаунты владельцев")
    System_Ext(claude, "Claude API")

    Rel(clientSite, caddy, "GET /widget.js", "HTTPS")
    Rel(visitor, widget, "Рендер внутри страницы (в браузере посетителя)")
    Rel(widget, caddy, "GET /api/widget/config?slug=&domain=", "HTTPS fetch")
    Rel(caddy, web, "proxy_pass")
    Rel(web, db, "SELECT approved testimonials, project.tier (service-role)", "SQL")
    Rel(web, db, "upsert widget_installs, insert analytics_events", "SQL")
    Rel(web, auth, "Проверка сессии владельца (дашборд)")
    Rel(web, storage, "Signed URL для видео")
    Rel(worker, db, "Поллинг pending_transcription", "SQL")
    Rel(worker, mcp, "transcribe_video(video_url)", "MCP protocol")
    Rel(mcp, claude, "Транскрипция аудио-дорожки", "HTTPS")
    Rel(mcp, storage, "Скачивание видео по signed URL", "HTTPS")
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

    ContainerDb_Ext(db, "Supabase Postgres (service-role client)")

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
- Уровень 3 намеренно ограничен одним потоком (виджет + тариф), как задано в требовании к документу;
  остальные потоки (модерация, партнёрская атрибуция) детализируются по необходимости отдельно.
