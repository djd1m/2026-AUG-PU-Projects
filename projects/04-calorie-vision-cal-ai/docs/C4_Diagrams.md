# C4 Diagrams — N4 «Тарелка», CJM E

Дата: 2026-09-12. Три уровня C4: Context (кто с кем), Container (из чего собрано), Component
(как устроен `recognizer` — единственный узел, где живёт вся суть продукта). Имена сервисов и
сущностей — из [`canon.md`](canon.md), не переименовывать.

Четвёртый уровень (Code) не рисуется намеренно: он устаревает быстрее, чем пишется, и его роль
здесь выполняет `Pseudocode.md`.

## Level 1 — System Context

```mermaid
C4Context
    title Контекст — «Тарелка»

    Person(user, "Пользователь", "Фотографирует еду, видит ккал и БЖУ с источником числа, ведёт дневник")
    Person(partner, "Партнёр-блогер", "Раздаёт персональный код, смотрит счётчики в кабинете")

    System(tarelka, "Тарелка", "PWA + Telegram Mini App: фото еды → числа из открытой базы с видимым источником")

    System_Ext(anthropic, "Anthropic Messages API", "Haiku 4.5 распознаёт, Sonnet 5 эскалация; Usage API отдаёт расход")
    System_Ext(telegram, "Telegram", "Mini App: вход по initData, открытие по прямой ссылке")
    System_Ext(usda, "USDA FoodData Central", "Источник чисел; вызывается ТОЛЬКО при импорте базы, не в пути пользователя")

    Rel(user, tarelka, "Фото, корректировка порции, дневник, карточка", "HTTPS")
    Rel(partner, tarelka, "Смотрит воронку по своему коду", "HTTPS")
    Rel(tarelka, anthropic, "Изображение → JSON по схеме; чтение расхода", "HTTPS")
    Rel(tarelka, telegram, "Проверка initData", "HTTPS")
    Rel(tarelka, usda, "Импорт Foundation + SR Legacy + FNDDS-порций", "HTTPS, вне запроса")
```

Два человека, а не один: у партнёра свой экран, свои данные и своя причина возвращаться. Третьего
действующего лица (тренер, врач) в контуре нет — это решение CJM E, а не упущение.

## Level 2 — Containers

```mermaid
C4Container
    title Контейнеры — 6 сервисов compose

    Person(user, "Пользователь")
    Person(partner, "Партнёр-блогер")

    Container_Boundary(c1, "Тарелка") {
        Container(proxy, "proxy", "Caddy", "Единственная публичная дверь: TLS, ограничение частоты, CSP")
        Container(web, "web", "Next.js 15, SSR", "PWA и Telegram Mini App на одном фронте; публичная карточка /c/{card_id}")
        Container(api, "api", "Node 22, Fastify", "10 маршрутов /api/v1; квоты, сессии, задания, presigned-URL")
        Container(recognizer, "recognizer", "Node worker", "Распознавание и RAG; единственный, кто зовёт модель")
        ContainerDb(db, "db", "PostgreSQL 16 + pg_trgm", "Данные, поиск по названию, очередь заданий, счётчики квот")
        ContainerDb(storage, "storage", "MinIO", "Приватный бакет фото, TTL 30 дней")
    }

    System_Ext(anthropic, "Anthropic Messages API", "Haiku 4.5 / Sonnet 5")
    System_Ext(telegram, "Telegram Mini Apps")
    System_Ext(usda, "USDA FoodData Central")

    Rel(user, proxy, "HTTPS")
    Rel(partner, proxy, "HTTPS")
    Rel(proxy, web, "Страницы", "HTTP, внутренняя сеть")
    Rel(proxy, api, "/api/v1/*", "HTTP, внутренняя сеть")
    Rel(web, api, "SSR-запросы", "HTTP")
    Rel(api, db, "SQL")
    Rel(api, storage, "Запись фото, presigned-URL", "S3 API")
    Rel(recognizer, db, "Забирает задание FOR UPDATE SKIP LOCKED, пишет результат", "SQL")
    Rel(recognizer, storage, "Читает фото", "S3 API")
    Rel(recognizer, anthropic, "Изображение → JSON по схеме", "HTTPS")
    Rel(api, telegram, "Проверка initData", "HTTPS")
    Rel(usda, db, "Разовый импорт в food_item", "скрипт, не сервис")
```

Что читается с диаграммы и стоит проговорить: **у `db` и `storage` нет ни одной стрелки снаружи
контура** — это и есть Правило №0 о непубликации хранилищ, нарисованное. И **`recognizer` не
принимает входящих стрелок вовсе**: работа приходит к нему только выборкой из очереди, поэтому его
нельзя дёрнуть снаружи ни при какой ошибке в конфигурации прокси.

## Level 3 — Components: `recognizer`

```mermaid
flowchart TB
    subgraph REC["recognizer (Node worker)"]
        POLL["Приёмник задания<br/>SELECT … FOR UPDATE SKIP LOCKED<br/>status = queued"]
        LOAD["Загрузка фото<br/>из MinIO по ключу"]
        CALL["Вызов модели<br/>Haiku 4.5, structured outputs"]
        PARSE["Разбор ответа<br/>ингредиенты, граммы, confidence"]
        LOOKUP["Поиск в базе<br/>food_synonym (RU) → food_item<br/>pg_trgm, нечёткое совпадение"]
        CALC["Расчёт по порции<br/>ккал и БЖУ на 100 г × граммы"]
        ESC{"Уверенность<br/>&lt; 0,6 ?"}
        ESCALATE["Эскалация<br/>Sonnet 5, тот же контракт схемы"]
        WRITE["Запись результата<br/>recognition.status = done<br/>+ ссылка на food_item и снимок чисел"]
        FAIL["recognition.status = failed<br/>причина, пригодная для показа"]
        REFUSE["recognition.status = refused<br/>на фото не еда"]
    end

    DB[("db")]
    S3[("storage")]
    ANT["Anthropic Messages API"]

    DB --> POLL --> LOAD --> CALL
    S3 --> LOAD
    CALL --> ANT
    ANT --> PARSE
    PARSE --> ESC
    ESC -- "нет" --> LOOKUP
    ESC -- "да" --> ESCALATE --> LOOKUP
    LOOKUP --> DB
    LOOKUP --> CALC --> WRITE --> DB
    PARSE -- "еды на фото нет" --> REFUSE --> DB
    CALL -- "отказ модели, таймаут" --> FAIL --> DB
    ESCALATE -- "уверенность всё ещё низкая" --> WRITE
```

Три вещи на этой диаграмме несут вес и потому нарисованы явно:

1. **Числа приходят из `LOOKUP` и `CALC`, а не из `CALL`.** Модель называет ингредиент и граммы;
   калорийность берётся из `food_item`. Стрелки от `ANT` к `WRITE` нет, и это не упрощение схемы —
   это ADR-001.
2. **`refused` — отдельный выход, а не разновидность `failed`.** «На фото не еда» и «модель не
   ответила» требуют разных экранов: первое исправляет пользователь, второе — повтор.
3. **Эскалация не гарантирует уверенности.** После Sonnet 5 результат записывается в любом случае;
   расхождение показывается на экране (FR-CORRECT-003), а не прячется за вторым вызовом.

Счётчик квот на этой диаграмме отсутствует намеренно: он проверяется и увеличивается в `api` **до**
создания задания. Если бы он жил здесь, деньги уже были бы потрачены к моменту проверки.
