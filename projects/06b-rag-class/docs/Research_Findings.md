# Research Findings — N6b «RAG-бот для сайта» (клон Chatbase)

**Фаза:** 1 `/replicate` · `sparc-prd-mini` AUTO, внутренняя фаза 1 (Research) · **Дата:** 2026-09-30
**Режим навыка `goap-research-ed25519`:** `moderate` — подписи Ed25519 не ставились (ни один источник не отдаёт
подписанный контент, ключей издателей нет; по разделу навыка «What strict and paranoid actually require» режимы
`strict/paranoid` здесь недостижимы честно). Каждое утверждение несёт URL и **класс доказательства**:

- `FETCH` — страница скачана `curl` в этом прогоне (2026-09-30, HTTP 200, байты сохранены в scratchpad исполнителя,
  sha256-префикс указан), цитата найдена в скачанном тексте поиском. Это «байты получены», а не «источник прав».
- `BRIEF` — факт унаследован из [`product-discovery-brief.md`](product-discovery-brief.md) Фазы 0 со ссылкой `[src-N]`
  (прочитан тогда; здесь повторно не открывался — пометка «проверить при сомнении»).
- `[H]` — гипотеза без источника.

## Executive Summary

Техническая база MVP подтверждена первоисточниками: `text-embedding-3-small` по умолчанию даёт вектор длины 1536 и стоит
$0.02 за 1M токенов; pgvector хранит `vector` до 2000 измерений и строит HNSW-индекс по косинусному расстоянию; для
генерации ответа выбран `gpt-4.1-mini` (Chat Completions, $0.40/$1.60 за 1M входных/выходных токенов). Рыночная часть
(Фаза 0) говорит, что главная претензия к источнику — выдуманные ответы и ссылки, поэтому различие продукта — ответ только
со ссылкой на реальный фрагмент и честное «не знаю + контакт» (PD-INSIGHT-001, PD-INSIGHT-002).

## Research Objective

Закрыть вопросы, без которых нельзя писать Specification/Architecture: (1) размерность и цена эмбеддинга, названного в
постановке; (2) способность pgvector хранить и искать такие векторы индексом; (3) модель генерации и её цена — постановка её
НЕ называет; (4) правила вежливого обхода чужого сайта; (5) образ БД с pgvector под Docker Compose.

## Methodology (GOAP-план и фактический путь)

| Шаг | Действие | Предусловие | Результат |
|---|---|---|---|
| 1 | Взять рынок, сегменты, цены из Фазы 0 | brief существует | 14 источников `[src-1..14]`, без повторного обхода |
| 2 | Скачать страницу модели эмбеддингов и гайд | сеть есть | размерность и цена подтверждены (`FETCH`) |
| 3 | Скачать README pgvector | — | HNSW, cosine, предел измерений (`FETCH`) |
| 4 | Выбрать модель генерации: сравнить 2 страницы моделей | — | `gpt-4.1-mini` vs `gpt-5-mini` (`FETCH`) |
| 5 | Скачать RFC 9309 | — | поведение при недоступном robots.txt (`FETCH`) |
| 6 | Список тегов образа `pgvector/pgvector` (Docker Hub API) | — | закреплённый тег `0.8.6-pg16` (`FETCH`) |

Перепланирование: шаг 4 добавлен после шага 2 — постановка называет эмбеддинги, но молчит о модели ответа, а цена ответа
в brief помечена `НЕ НАЙДЕНО` (PD-INSIGHT-003). Без неё потолки расходов нельзя назвать числом.

## Market Analysis (унаследовано из Фазы 0, `BRIEF`)

- Категория доказана: Chatbase bootstrapped, $8M+ ARR, 10k+ платящих [src-1, src-2] — вторичные источники, уверенность 3/5.
- Free у источника: 50 кредитов/мес, агенты удаляются после 14 дней неактивности; снятие «Powered by» — отдельный add-on
  $99/мес [src-5] — это ориентир для FR-GROWTH-003 (бейдж обязателен на Free, снятие платно).
- Сегмент недели — С1 «владелец малого сайта» (PD-SEGMENT-001); С2 «веб-студия» — канал (FR-GROWTH-004).
- Тренд «Powered by» как дистрибуция, K≈0.1–0.2 у встраиваемых [src-13] — петля медленная; за неделю 15 внешних виджетов
  — скорее ручной посев, чем петля (PD-METRIC-001).

## Competitive Landscape

| Competitor | Strengths | Weaknesses | Differentiation |
|---|---|---|---|
| Chatbase [src-5, src-4] | быстрый старт, мультиканал, 80+ языков | выдумки, в т.ч. несуществующие URL; биллинг; поддержка | у нас каждый ответ — ссылка на реальный фрагмент, иначе «не знаю + контакт» |
| Jivo ИИ-оператор [src-10] | лидер live-chat РФ, база клиентов | ИИ — надстройка над чатом, дорого (≈13 000 ₽/мес в кейсе) | самостоятельная установка за 10 минут без оператора |
| Salebot / Just AI [src-8] | конструкторы, реестр ПО | сценарный порог входа | ноль сценариев: знания из страниц и PDF |
| SiteGPT [src-7] | «URL → бот», демо без регистрации | — (цена не найдена) | демо только для сохранённого бота — без платного анонимного обхода (выбор CJM) |

## Technology Assessment

| # | Факт | Цитата (дословно из скачанного текста) | Источник | Класс |
|---|---|---|---|---|
| T1 | Длина вектора `text-embedding-3-small` по умолчанию — 1536 | «By default, the length of the embedding vector is 1536 for text-embedding-3-small» | https://developers.openai.com/api/docs/guides/embeddings (sha `aaceb6e2…`) | `FETCH` |
| T2 | Цена эмбеддинга — $0.02 за 1M токенов | «Embeddings Per 1M tokens ∙ Batch API price Cost $0.02» | https://developers.openai.com/api/docs/models/text-embedding-3-small (sha `abe37ace…`) | `FETCH` |
| T3 | Модель эмбеддингов обслуживается эндпоинтом `v1/embeddings` | «Embeddings v1/embeddings» | та же страница | `FETCH` |
| T4 | pgvector: тип `vector` до 2000 измерений в индексе; HNSW по косинусу | «CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops)» · «`vector` - up to 2,000 dimensions» | https://raw.githubusercontent.com/pgvector/pgvector/master/README.md (sha `54cb3a5f…`) | `FETCH` |
| T5 | HNSW не требует обучения, в отличие от IVFFlat, и лучше по скорость/полнота | «It has better query performance than IVFFlat (in terms of speed-recall tradeoff)» | тот же README | `FETCH` |
| T6 | `gpt-4.1-mini`: $0.40 вход / $1.60 выход за 1M; доступен через Chat Completions | «Input $0.40 Cached input $0.10 Output $1.60» · «Chat Completions v1/chat/completions» | https://developers.openai.com/api/docs/models/gpt-4.1-mini (sha `ca866f46…`) | `FETCH` |
| T7 | `gpt-5-mini`: $0.25 вход / $2.00 выход; модель с рассуждением | «Input $0.25 Cached input $0.025 Output $2.00» | https://developers.openai.com/api/docs/models/gpt-5-mini (sha `dc940147…`) | `FETCH` |
| T8 | robots.txt недоступен из-за ошибок сервера/сети → считать полным запретом | «If the robots.txt file is unreachable due to server or network errors, this means the robots.txt file is undefined and the crawler MUST assume complete disallow» | https://www.rfc-editor.org/rfc/rfc9309.txt (sha `f633915d…`) | `FETCH` |
| T9 | robots.txt «Unavailable» (4xx) → разрешено всё | «then the crawler MAY access any resources on the server» | тот же RFC | `FETCH` |
| T10 | Лимит разбора robots.txt ≥ 500 KiB | «The parsing limit MUST be at least 500 kibibytes» | тот же RFC | `FETCH` |
| T12 | Фильтр `WHERE` при HNSW применяется после сканирования индекса; для большего числа строк — итеративный скан | «SET hnsw.iterative_scan = strict_order;» | README pgvector (sha `54cb3a5f…`) | `FETCH` |
| T11 | Образ `pgvector/pgvector` публикует закреплённые теги вида `0.8.6-pg16` | список тегов API Docker Hub содержит `0.8.6-pg16` | https://hub.docker.com/v2/repositories/pgvector/pgvector/tags?page_size=30 (sha `3819bba9…`) | `FETCH` |

**Вывод по генерации (T6 vs T7).** Для ответа по найденным фрагментам рассуждение не нужно, а его токены оплачиваются как
выход и растягивают задержку. `gpt-4.1-mini` без рассуждения даёт предсказуемую длину и цену ответа. Оценка ответа `[H]`
по объёму: вход ≈ 2 500 токенов (5 фрагментов × ≈400 + инструкция) × $0.40/1M ≈ $0.0010; выход ≈ 300 × $1.60/1M ≈ $0.0005 →
**≈ $0.0015 за ответ**; плюс эмбеддинг вопроса ≈ 30 токенов — пренебрежимо. Это закрывает `НЕ НАЙДЕНО` цены ответа из
brief (PD-INSIGHT-003) и даёт основу для чисел в `docs/model-cost-contract.md`.

**Вывод по индексации.** 100 страниц × ≈1 500 токенов = 0,15M токенов × $0.02/1M ≈ $0.003 на сайт `[H]` по объёму. Индексация
дешева; деньги жгут ответы, которые запускает посторонний (PD-INSIGHT-003) — потолки нужны в первую очередь им.

**Вывод по обходу.** RFC 9309 даёт два разных исхода недоступного robots.txt: 4xx — можно всё, 5xx/сеть — нельзя ничего.
Обходчик обязан различать их, а не сводить к «не удалось прочитать — обходим» (это ровно тихий фолбэк).

## User Insights (из Фазы 0, `BRIEF`)

- «Бот выдумывает, в т.ч. несуществующие URL на собственном домене» [src-4] — PD-INSIGHT-002. Следствие: ссылка в ответе
  строится ТОЛЬКО из записи источника в нашей БД, никогда из текста модели.
- «Очень просто и быстро собрать бота» [src-3] — ожидание «до 10 минут до ценности» [src-7] задаёт NFR онбординга.
- 152-ФЗ: вопросы посетителей могут содержать ПД, отправка во внешнюю модель — трансграничная передача (PD-RISK-001).
  Юристом не проверялось — открытый вопрос владельцу, не заключение.
- Бейдж «Powered by» на чужом сайте и 38-ФЗ ст. 18.1 (маркировка рекламы) — PD-RISK-002, не проверялось.

## Confidence Assessment

| Область | Уверенность | Основание |
|---|---|---|
| Технология (T1–T11) | High | первоисточник производителя, скачан в этом прогоне |
| Цена ответа ≈ $0.0015 | Medium | цены — `FETCH`, объём токенов — `[H]` до замера на стенде |
| Рынок, сегменты | Medium/Low | QUICK Фазы 0, вторичные источники, дословных цитат клиентов нет |
| Правовые вопросы | Low | не проверялось юристом — вопросы, не выводы |

## Sources

1. https://developers.openai.com/api/docs/guides/embeddings — производитель, reliability 5/5, `FETCH` 2026-09-30.
2. https://developers.openai.com/api/docs/models/text-embedding-3-small — производитель, 5/5, `FETCH` 2026-09-30.
3. https://developers.openai.com/api/docs/models/gpt-4.1-mini — производитель, 5/5, `FETCH` 2026-09-30.
4. https://developers.openai.com/api/docs/models/gpt-5-mini — производитель, 5/5, `FETCH` 2026-09-30.
5. https://raw.githubusercontent.com/pgvector/pgvector/master/README.md — автор расширения, 5/5, `FETCH` 2026-09-30.
6. https://www.rfc-editor.org/rfc/rfc9309.txt — стандарт IETF, 5/5, `FETCH` 2026-09-30.
7. https://hub.docker.com/v2/repositories/pgvector/pgvector/tags — реестр образов, 4/5, `FETCH` 2026-09-30.
8. `[src-1]…[src-14]` — список «Источники» в [`product-discovery-brief.md`](product-discovery-brief.md), `BRIEF`.

## Research Path Log

- Решено НЕ повторять рыночный поиск: Фаза 0 его сделала, повтор дал бы вторую копию тех же чисел (skill: «не дублировать»).
- `WebFetch`-пересказ не использовался для цитат: пересказ инструментом не даёт дословности; цитаты взяты из байтов `curl`.
- Отрицательный вывод «прямого API у Jivo для RAG нет» НЕ делается: корпус не исчерпывающий, поиск не проводился.
- Код и документы `projects/06-rag-sales-chatbase` не читались (условие владельца №4); уроки корневого insights со ссылками на
  N6 исключены (см. [`discovery/reuse-inventory.md`](discovery/reuse-inventory.md), PD-REUSE-001).
