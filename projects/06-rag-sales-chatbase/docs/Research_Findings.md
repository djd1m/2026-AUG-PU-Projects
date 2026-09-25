# Research Findings — N6 «Суфлёр» (клон Chatbase)

**Дата:** 2026-09-25 · **Режим:** AUTO, владелец спит · **Канон:** [`canon.md`](canon.md) ·
**Основа:** [`product-discovery-brief.md`](product-discovery-brief.md) (Phase 0, модули M1–M5),
[`discovery/CJM_Variants.md`](discovery/CJM_Variants.md), [`reuse-inventory.md`](reuse-inventory.md).

Легенда уверенности (как в брифе): **[F]** — факт с первоисточника, снят в эту дату; **[S]** —
вторичный источник; **[H]** — гипотеза или инженерная оценка; **[?]** — противоречиво.

## Research Findings

### Executive Summary

Chatbase вырос до $10M ARR (03.2026) без внешних инвестиций и ушёл в enterprise CX: бейдж у него —
аддон $99/мес, white-label — только Enterprise, на первом экране нет поля «вставьте URL» [F][S].
В РФ ИИ-ответчики продаются модулем к чату за 12–13 тыс ₽/мес с триалом, и никто из проверенных не
обещает ссылку на источник в каждом ответе и бота до регистрации (PD-INSIGHT-003) [F]. Технически
неделя реализуема в рамке «Postgres + pgvector в нашем контейнере»: `text-embedding-3-small` даёт
1536 измерений (≤ 2000 — предел HNSW pgvector для `vector`), модель доступна через шлюз OpenRouter,
работающий у N5 на этой же машине; прямой API OpenAI Россию не обслуживает (PD-ARCH-001) [F].

### Research Objective

Ответить до Specification на четыре вопроса: (1) есть ли ниша для бесплатного входа с источником в
ответе на рынке РФ; (2) какая growth-петля растит метрику постановки «виджеты на внешних доменах»;
(3) выполнимы ли эмбеддинги 1536 и индекс HNSW в нашем Postgres из РФ-контура; (4) что из N1–N5
переносится готовым, а что пишется заново.

### Methodology

- **Pre-filled context.** Рыночный и продуктовый research выполнен в Phase 0 (discovery, режим QUICK,
  модули M1–M5, 2026-09-25): сайт и тарифы Chatbase сняты Playwright и WebFetch, конкуренты РФ — с
  их тарифных страниц, рынок — по Коммерсантъ, ComNews, реестру МСП. Здесь — синтез, без повторного
  сбора (sparc-prd-mini: pre-filled Research пропускает Phase 1 навыка).
- **Техническая проверка 2026-09-25 (эта фаза).** Документация OpenRouter embeddings (WebFetch),
  публичные каталоги `GET /api/v1/models` и `GET /api/v1/embeddings/models` (curl, цены и
  `supported_parameters`), руководство OpenAI по эмбеддингам, README pgvector, сетевая проба
  `POST /api/v1/embeddings` без ключа с этой VPS (HTTP 401 — сеть доступна), теги образа
  `pgvector/pgvector` на Docker Hub.
- **Опись доноров.** Только чтение `projects/01…05`, пути проверены (reuse-inventory; повторная
  проверка существования 35 путей — 2026-09-25, все на месте).
- GOAP-план: состояние «знаем рынок, не знаем технику» → цель «каждое техническое допущение
  Specification подтверждено документом поставщика» → действия в порядке стоимости: каталог
  (бесплатно) → документация → сетевая проба без ключа → проба с ключом (отложена, стоит денег).

### Market Analysis

- Рынок диалогового ИИ в РФ 2025 — ≈ 11 млрд ₽ (+30 %) [S]; прогноз роста рынка чат-ботов на 2026 —
  20–25 % [S]; генеративный ИИ в РФ 2025 — 58 млрд ₽, B2B 44 млрд [S].
- МСП в реестре ФНС — 6,835 млн (01.2026), 6,947 млн (10.04.2026) [F-вторично]; доля с сайтом не
  найдена [?]. Веб-студий в базе Рейтинга Рунета > 6500 — потолок канала студий, не число активных [S].
- SOM на неделю не считается: n < 30, ложная точность (методология).
- **Ценовой ориентир рынка** [F, расчёт]: Jivo ≈ 6,5 ₽ за диалог (12 990 ₽ / 2000), Carrot quest —
  12 ₽ за вопрос (12 000 ₽ / 1000). Наша себестоимость ответа ≈ $0,0051 (Haiku 4.5 по каталогу
  OpenRouter, ≈ 3100 входных + ≤ 400 выходных токенов) [F-цена, H-объём] — зазор на порядок.
- **Сегменты:** основной — малый бизнес с сайтом (PD-SEG-001); канал — веб-студии, ставящие сайты
  клиентам (PD-SEG-002); вторичные — поддержка SaaS (нужен оператор, вне недели) и эксперт с каналом
  (носитель демо-страницы).

### Competitive Landscape

| Competitor | Strengths | Weaknesses | Differentiation |
|---|---|---|---|
| Chatbase | $10M ARR, 10 000+ брендов на сайте, «value in under 60 seconds», каналы (сайт, почта, мессенджеры), Experts-программа для агентств [F][S] | ушёл в enterprise: триал вместо мгновенного бота, бейдж снимается за $99/мес, white-label только Enterprise, нет русского [F] | бот из URL ДО регистрации, снятие бейджа дешевле и видимой строкой плана, русский язык и данные в РФ (PD-INSIGHT-002) |
| Jivo ИИ-оператор | ведёт диалог сам, база из описания + файлов + сайта, запуск «от 5 минут до 1 часа» [F] | 12 990 ₽/мес за 2000 диалогов, только триал 14 дней; источник ответа не обещан [F] | вход 0 ₽ и ссылка на фрагмент в каждом ответе |
| Carrot quest AI-бот | модуль к чату, передача оператору [F] | 12 000 ₽/мес за 1000 вопросов поверх тарифа от 10 990 ₽; «Без брендинга» 2 290 ₽/мес [F] | не надстройка к чату, а самостоятельный бот; снятие бейджа — ориентир 990–1 490 ₽ [H] |
| Talk-Me | есть Free 0 ₽, «AI-ассистент» в списке функций [F] | цена ИИ не раскрыта, про бейдж на Free не сказано [F] | прозрачная единица счёта «ответ» и «не знаю» вместо выдумки |
| Aimylogic (Just AI) | no-code конструктор, генеративный ответ по информации о компании [S] | конструктор сценариев сложнее «вставь URL»; цены у агрегаторов расходятся [?] | путь в одно поле |
| Tidio (Lyro) | зарубежный ИИ-бот, от ≈ 2 900 ₽/мес по обзору [S] | зарубежная юрисдикция, оплата из РФ затруднена [H] | данные в РФ, рубли |
| Интеграторы «под ключ» (Ailean, CognitiveAI, агентства) | проект под задачу [S] | цена по запросу, сроки недели и месяцы [S] | продукт за 10 минут; для студий — инструмент, а не конкурент (канал B) |

**Вывод (PD-INSIGHT-003):** у крупных игроков РФ ИИ — дорогой модуль с триалом; бесплатного входа
с источником в каждом ответе нет ни у кого из проверенных [F]. Ров — не фича (Jivo и Talk-Me могут
добавить её за квартал [H]), а канал студий и бейдж-петля.

### Technology Assessment

| Вопрос | Находка | Уверенность | Следствие |
|---|---|---|---|
| Индекс векторов в нашем Postgres | pgvector: «Supported types are: `vector` - up to 2,000 dimensions», `halfvec` — до 4000; синтаксис `USING hnsw (embedding vector_cosine_ops)`; версия 0.8.6, образ `pgvector/pgvector:0.8.6-pg16` есть на Docker Hub | [F] | `vector(1536)` индексируется; `halfvec(1536)` — запас на рост (ADR-001) |
| Размерность эмбеддингов | OpenAI: «By default, the length of the embedding vector is `1536` for `text-embedding-3-small` or `3072` for `text-embedding-3-large`» | [F] | 3-small укладывается; 3-large в 3072 — ловушка постановки, запрещена кодом |
| Доступ из РФ | API OpenAI не обслуживает Russia/Belarus (список supported countries, бриф) [F]; OpenRouter отдаёт эмбеддинги `POST /api/v1/embeddings`, каталог содержит `openai/text-embedding-3-small`, цена `"prompt":"0.00000002"` ($0,02 / 1 млн) [F]; проба без ключа с этой VPS → HTTP 401 [F] | [F] документы; ответ на ключ — [F] по пробе A-N6-019 (HTTP 200, 1536, ключ стенда N5; дописано после Phase 2) | PD-ARCH-001 → шлюз OpenRouter (ADR-002); проба СВОИМ ключом N6 — при первом старте |
| Параметр `dimensions` через шлюз | `supported_parameters` у 3-small в каталоге OpenRouter пуст | [F] | обход «3-large с dimensions=1536» через шлюз не подтверждён — не опираемся |
| Модель ответа | `anthropic/claude-haiku-4.5`: цена `"prompt":"0.000001","completion":"0.000005"` ($1/$5 за 1 млн), в `supported_parameters` есть `response_format` и `structured_outputs`; контекст 200 000 | [F] | структурированный ответ с цитатами + серверная проверка (ADR-003, ADR-011) |
| Краулер | браузер в воркере — ≈ сотни МБ и CPU на одной VPS; HTTP-клиент + извлечение основного текста покрывает сайты с серверным рендером | [H] | без браузера; JS-сайты честно дают `no_text` (ADR-010) |
| PDF | `pdfjs-dist` извлекает текстовый слой постранично; сканы без слоя требуют OCR | [H] | OCR вне недели, отказ `no_text_layer` |
| Изоляция виджета | донор N1: открытый Shadow DOM, свои стили, бейдж с MutationObserver, тесты isolation/xss [F по коду донора] | [F] | Shadow DOM вместо iframe (ADR-005) |
| CORS | N1 делал только GET; двойной `Access-Control-Allow-Origin` (приложение + Caddy) молча ломал CORS (deployment-seams) | [F по журналу N1] | заголовок ставит только приложение, точный origin из списка бота |
| Потолки для анонимов | донор N4 `quota/keys.ts`: сессия + префикс IP + глобально, конкурентные тесты | [F по коду донора] | пять scope на ответ посетителю (ADR-008) |

### User Insights

- **Источник — инструмент владельца, а не посетителя (PD-INSIGHT-001).** Посетители кликают на
  источник в AI-ответе редко (≈ 1 % визитов в пассивном трекинге 900 взрослых США), а цитаты
  повышают доверие даже к нерелевантным ссылкам (Frontiers 2026; Lenz et al. 2025) [S]. Следствие:
  посетителю — компактная плашка, владельцу в предпросмотре — развёрнутая цитата; там и aha.
- **Бейдж — часть тарифной архитектуры (PD-INSIGHT-002).** У источника «Remove 'Powered By
  Chatbase'» — $99/мес, дороже плана Hobby; у Carrot quest «Без брендинга» — 2 290 ₽/мес [F].
- **Микро-тренды T1–T7** (CJM_Variants): T1 time-to-first-value — главная метрика онбординга
  (Userpilot 2026; Chatbase «value in under 60 seconds») [S]; T2 ИИ настраивает продукт сам по
  одной фразе/URL [S]; T3 try before signup [S]; T4 прозрачность источника при редких кликах [S];
  T5 агентства как канал AI-агентов (Chatbase Experts terms, 16.12.2025) [F]; T6 тёмная тема и
  mobile-first, Android ≈ 71 % мобильных ОС в РФ [S, низкая уверенность]; T7 бейдж как платный
  продукт [F].
- **Эффект второго порядка:** бейдж на выдумывающем боте — антиреклама у всех посетителей клиента;
  инвариант «нет фрагмента — нет ответа» защищает и клиента, и петлю [H].

### Confidence Assessment

| Утверждение | Источников | Уверенность |
|---|---|---|
| Бейдж у Chatbase — платный аддон $99/мес | 2 (pricing, aria-слепок) | High |
| ARR Chatbase $10M (03.2026) | 3 (ProductLed, Stripe case, пресс-релиз) | High |
| Нет бесплатного входа с источником у РФ-конкурентов | 4 тарифные страницы | Medium (проверены не все игроки) |
| 1536 ≤ 2000, HNSW индексируется | 2 (OpenAI, pgvector) | High |
| Эмбеддинги 3-small доступны через OpenRouter | 2 (документация, каталог) | High по документам; ответ на наш ключ не проверен |
| Ставка партнёров Chatbase 20 или 30 % | 3 противоречащих | Low [?] — цифры не копируем |
| Сила бейджа для виджетов-ботов | 0 прямых (аналог — Superhuman) | Low — проверяет неделя |

### Sources

1. chatbase.co, docs «your first agent», /pricing, /experts/terms — первоисточник, 2026-09-25 — надёжность 5/5.
2. ProductLed «How Chatbase hit $8M ARR with 18 people» — https://productled.com/blog/how-chatbase-hit-8m-arr-with-18-people — 3/5.
3. Stripe customer story Chatbase — https://stripe.com/customers/chatbase — 4/5.
4. Пресс-релиз $10M ARR — https://www.blockislandtimes.com/online_features/press_releases/chatbase-reaches-10m-arr-as-a-profitable-challenger-to-sierra-decagon-and-fin/article_93a9193c-9b07-5c29-9eec-70fcf299c358.html — 3/5.
5. Jivo ИИ-агент — https://www.jivo.ru/ai-agent/ — 5/5 (первоисточник цены).
6. Carrot quest тарифы — https://www.carrotquest.io/price/ — 5/5.
7. Talk-Me тарифы — https://talk-me.ru/tariffs — 5/5.
8. Обзор Aimylogic — https://ya.zerocoder.ru/obzor-aimylogic-konstruktora-botov-s-iskusstvennym-intellektom/ — 2/5.
9. Обзор онлайн-консультантов 2026 — https://venyoo.ru/blog/luchshie-onlayn-konsultanty-dlya-sayta-2026/ — 2/5.
10. Коммерсантъ, рынок диалогового ИИ — https://www.kommersant.ru/doc/8119268 — 4/5; генеративный ИИ — https://www.kommersant.ru/doc/8270177 — 4/5.
11. ComNews, рынок чат-ботов 2026 — https://www.comnews.ru/content/243141/2026-01-14/2026-w03/1008/rossiyskiy-rynok-chat-botov-vyrastet-20-25-2026-g — 4/5.
12. Реестр МСП — https://rmsp.nalog.ru/ — 5/5; BeBoss — https://www.beboss.ru/journal/3625-record-po-chislu-msp-v-rossii — 3/5.
13. Рейтинг Рунета — https://ratingruneta.ru/web/russia/ — 3/5.
14. OpenAI supported countries — https://developers.openai.com/api/docs/supported-countries — 5/5.
15. OpenAI embeddings guide — https://developers.openai.com/api/docs/guides/embeddings — 5/5.
16. OpenRouter embeddings — https://openrouter.ai/docs/api/reference/embeddings — 5/5; каталоги https://openrouter.ai/api/v1/models и https://openrouter.ai/api/v1/embeddings/models — 5/5 (машинные данные поставщика).
17. OpenRouter Haiku 4.5 — https://openrouter.ai/anthropic/claude-haiku-4.5 — 5/5.
18. pgvector README — https://github.com/pgvector/pgvector — 5/5.
19. Frontiers in Psychology 2026 — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1935527/full — 4/5; Lenz et al. 2025 — https://journals.sagepub.com/doi/10.1177/10711813251357884 — 4/5.
20. Userpilot onboarding 2026 — https://userpilot.com/blog/saas-user-onboarding-funnel/, https://userpilot.com/blog/best-user-onboarding-experience/ — 3/5.
21. Внутренние: `research/GROWTH-MECHANICS-REQUIREMENTS.md`, `research/openai-footprint/02-vision-rag.md` (данные на 26.08.2026) — 3/5.

Средняя надёжность: ≈ 4,0 / 5.

### Research Path Log

| Шаг | Действие | Итог | Перепланирование |
|---|---|---|---|
| 1 | Принять бриф Phase 0 как pre-filled context | рынок и конкуренты закрыты | фаза research навыка не повторяется |
| 2 | Проверить размерность и предел HNSW | 1536 ≤ 2000 подтверждено | — |
| 3 | Проверить маршрут эмбеддингов из РФ | прямой OpenAI закрыт; OpenRouter отдаёт 3-small | A-N6-009 подтверждён документами |
| 4 | Проверить `dimensions` через шлюз | в каталоге не заявлен | обход «3-large + dimensions» снят с плана |
| 5 | Сетевая проба без ключа | HTTP 401 — сеть есть | проба с ключом перенесена на первый старт (не тратить деньги без владельца, A-N6-012) |
| 6 | Цена и параметры Haiku 4.5 | $1/$5, structured outputs | потолки и оценка $20,9/сутки в каноне §7 |
| 7 | Теги образа pgvector | `0.8.6-pg16` существует | явный тег в compose |
| 8 | Проверка путей доноров N1–N5 | 35 из 35 на месте | переиспользование — ADR-012…016 |
