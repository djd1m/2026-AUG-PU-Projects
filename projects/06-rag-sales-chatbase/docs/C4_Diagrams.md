# C4-диаграммы — N6 «Суфлёр»

Дата: 2026-09-25 · Канон: [`canon.md`](canon.md) · Архитектура: [`Architecture.md`](Architecture.md) ·
Решения: [`ADR.md`](ADR.md).

## Уровень 1 · Контекст

```mermaid
C4Context
  title Суфлёр — контекст системы
  Person(owner, "Владелец бота", "малый бизнес, S1")
  Person(studio, "Веб-студия", "S2, несколько ботов, перенос клиенту")
  Person(visitor, "Посетитель чужого сайта", "без входа")
  Person(operator, "Оператор", "назначает план, смотрит расход")
  System(sufler, "Суфлёр", "кабинет, предпросмотр, API виджета, индексация")
  System_Ext(host, "Сайт клиента", "чужой origin, CSP и CSS хозяина")
  System_Ext(openrouter, "OpenRouter", "эмбеддинги 3-small и ответы Haiku 4.5")
  System_Ext(sites, "Сайты для краулинга", "robots.txt, HTML")
  Rel(owner, sufler, "URL, PDF, настройки, код установки")
  Rel(studio, sufler, "боты клиентов, приглашения")
  Rel(visitor, host, "открывает страницу")
  Rel(host, sufler, "виджет: config, ask (CORS)")
  Rel(sufler, openrouter, "HTTPS, ключ сервера")
  Rel(sufler, sites, "GET, 1 запрос/с, SSRF-фильтр")
  Rel(operator, sufler, "ops-команды, журнал расхода")
```

## Уровень 2 · Контейнеры (сервисы compose)

```mermaid
C4Container
  title Суфлёр — контейнеры
  Person(owner, "Владелец")
  Person(visitor, "Посетитель")
  System_Ext(openrouter, "OpenRouter")
  Container_Boundary(vps, "VPS, docker compose") {
    Container(proxy, "proxy", "Caddy 2.8", "единственная дверь, лимит частоты, без CORS-заголовков")
    Container(web, "web", "Next.js 15, Node 22", "кабинет, /api, /w/v1, /b, бандл виджета, RAG-ответ")
    Container(worker, "worker-index", "Node 22, BullMQ", "краулер, PDF, чанкинг, эмбеддинги, сторож")
    ContainerDb(db, "db", "Postgres 16 + pgvector 0.8.6", "данные, vector(1536), HNSW")
    ContainerDb(redis, "redis", "Redis 7.4", "очередь, AOF, noeviction")
    Container(migrate, "migrate", "одноразовый", "миграции до старта")
  }
  Container(widget, "Виджет", "IIFE ≤ 45 КБ gzip, Shadow DOM", "на странице хозяина")
  Rel(owner, proxy, "HTTPS")
  Rel(visitor, widget, "вопрос")
  Rel(widget, proxy, "fetch без cookie")
  Rel(proxy, web, "HTTP")
  Rel(web, db, "SQL")
  Rel(web, redis, "постановка задач")
  Rel(worker, redis, "получение задач")
  Rel(worker, db, "фрагменты, fence")
  Rel(web, openrouter, "эмбеддинг вопроса, ответ")
  Rel(worker, openrouter, "эмбеддинги индексации")
```

## Уровень 3 · Компоненты `web` — путь ответа посетителю

```mermaid
flowchart TB
  A[POST /w/v1/ask] --> B[CheckOrigin<br/>allowed_origin бота]
  B -- не в списке --> R403[403 без ACAO, без квоты]
  B --> C[CheckAndConsumeQuota<br/>5 scope, одна транзакция]
  C -- отказ --> RL[429 + контакт]
  C --> D[RecordModelSpend attempt]
  D --> E[Эмбеддинг вопроса<br/>OpenRouter]
  E --> F[Поиск pgvector<br/>WHERE bot_id, top 4]
  F -- нет ≥ 0.40 --> U[«не знаю» + контакт<br/>модель не зовётся]
  F --> G[Промпт: правила отдельно,<br/>фрагменты как данные]
  G --> H[Haiku 4.5<br/>structured output]
  H --> V[ValidateModelAnswer<br/>цитаты ⊆ контекст]
  V -- нет --> U
  V --> OK[answered + плашка источника<br/>RecordWidgetInstall]
```

## Уровень 3 · Компоненты `worker-index`

```mermaid
flowchart LR
  Q[BullMQ job index_job_id] --> L[Аренда: fence+1]
  L --> S{kind}
  S -- site --> CR[CrawlSite<br/>robots, CheckAddress, 1 с]
  S -- pdf --> PDF[ExtractPdf<br/>≤100 с., удалить файл]
  CR --> CH[ChunkDocument<br/>500/600/80 + контекст]
  PDF --> CH
  CH --> EM[EmbedAndStore<br/>квота токенов → OpenRouter → vector 1536]
  EM --> DB[(chunk, index_job WHERE fence)]
  W[Сторож раз в минуту] --> DB
```

## Что диаграммы НЕ показывают (намеренно)
Общий TLS-прокси машины (вне проекта); спящую ЮKassa (ADR-017); тома `uploads`, `model-spend`,
`backups` — они в Architecture «Data Architecture».
