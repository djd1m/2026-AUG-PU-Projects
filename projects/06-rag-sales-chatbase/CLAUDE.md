# N6 «Суфлёр» — контекст проекта

Прочитать корневой `CLAUDE.md`, применимые `../../.claude/rules/`, политику моделей и телеметрию
p-replicator, прежде чем реализовывать что-либо здесь. Общий toolkit (команды, хуки, навыки
планирования и ревью) живёт в корневой `.claude/`; новый оркестратор в этом проекте не создаётся.

## Что это

ИИ-помощник для сайта малого бизнеса, клон Chatbase. Владелец вставляет адрес сайта и PDF — продукт
читает страницы, режет текст на фрагменты, считает эмбеддинги в pgvector нашего Postgres и собирает
бота, который отвечает посетителям **только по этим материалам**, и в КАЖДОМ ответе показывает, из
какого фрагмента он взят. Нет подходящего фрагмента — «не знаю» и контакт компании. Бот ставится
одним `<script>` на ЧУЖОЙ сайт (виджет в Shadow DOM), на бесплатном плане несёт бейдж — это главная
петля роста. Контур — Россия/СНГ, интерфейс и ответы на русском. CJM — вариант **H** (ядро A «бейдж»
+ демо-страница из C + партнёрский минимум из B), принят **ВРЕМЕННО** (A-N6-008, ждёт владельца).

**Статус на 25.09.2026: фича `foundation` реализована** (монорепо, миграция 001 с pgvector, отказ
старта по 14 `QUOTA_*`, вход/выход, `/health`; образы собраны, тесты зелёные в образе на настоящих
Postgres+pgvector и Redis) — квитанция [`docs/features/foundation/05_completion.md`](docs/features/foundation/05_completion.md).
Затем `quota-and-spend` и `index-job-core` (очередь `packages/queue`, фенс попыток, сторож, `GET /api/index-jobs/{id}`; квитанция [`docs/features/index-job-core/05_completion.md`](docs/features/index-job-core/05_completion.md)). Затем `crawler` (`apps/worker/src/crawl/`: CheckAddress после DNS и на каждом перенаправлении, соединение по проверенному IP, robots.txt, обход внутри задачи; квитанция [`docs/features/crawler/05_completion.md`](docs/features/crawler/05_completion.md)). Затем `pdf-source` (`POST /api/bots/{bot_id}/sources` с multipart PDF: предел плана до тела и атомарно, `%PDF-`, 10 МБ по заявленному и принятому; том `uploads/<index_job_id>`; разбор `pdfjs-dist` в дочернем процессе с таймаутом 30 с и пределом памяти; `no_text_layer`; файл удаляется после done И failed; квитанция [`docs/features/pdf-source/05_completion.md`](docs/features/pdf-source/05_completion.md)). Стек целиком (`docker compose up`) ещё не поднимался; фрагментов/эмбеддингов, виджета и RAG ещё нет.

Что перенесено из отчёта валидации ([`docs/validation-report.md`](docs/validation-report.md), вердикт
🟡 CAVEATS) и в каком состоянии:

- **H1/M1/M2 закрыты правками 25.09** (§9 отчёта): квота предпросмотра разведена по `scope_key`
  (A-N6-020), сеть OpenRouter — `CONFIRMED` по пробе A-N6-019, потолков — 10 scope и **14
  переменных `QUOTA_*`**. Повторного независимого прохода валидатора по новой ревизии НЕ было.
- **L1 перенесён:** первая фича, трогающая виджет (ADR-013) или уведомления (ADR-015), называет номер
  ADR в квитанции — иначе трассировка решения обрывается на документах.
- **Число правится по ВСЕМ цитатам, а не в документе-владельце.** H1 и M2 — ровно этот класс: одна
  переменная держала два числа, «ровно 10» расходилось с 12 и 14. Меняя число, искать его сквозным
  `grep` по всем файлам N6.
- **Спецификация привязана к ревизии** `sha256:d2d054b4…ff667` (609 строк). Правка требует
  перепривязки ссылок `Specification.md:N` в `docs/test-scenarios.md` (скрипт сверки — в отчёте §9).
- **Две зависимости `UNCONFIRMED`:** Telegram-оповещения оператору (мониторинг читается вручную раз
  в сутки) и ЮKassa (оплата спящая, ADR-017). Ключ OpenRouter СВОЙ у N6 ещё не проверен —
  `EmbedProbe` при первом старте обязателен.
- **Порог «не знаю» 0.40 — гипотеза** (A-N6-013); калибровка 20 + 20 вопросов ДО выпуска.
- **152-ФЗ, трансграничная передача вопросов модели — открытый вопрос №1 владельца;** до решения —
  только пилотные клиенты и строка-предупреждение в виджете.

## Документация — читать в этом порядке

1. [`docs/canon.md`](docs/canon.md) — **источник имён и чисел**: 19 сущностей, закрытые перечисления,
   маршруты, 6 сервисов, 10 scope / 14 переменных потолков, планы. Код и документы ссылаются на него.
2. [`docs/Specification.md`](docs/Specification.md) — ЧТО строить: 34 FR + 7 FR-GROWTH, 14 FR-LOOK
   (11 принято / 3 отклонено), 9 NFR, 16 историй, 43 критерия `SC-US-nnn-k`.
3. [`docs/Architecture.md`](docs/Architecture.md) — 6 сервисов, pgvector, инвентарь внешних
   зависимостей (9 CONFIRMED / 2 UNCONFIRMED), сверка с псевдокодом.
4. [`docs/ADR.md`](docs/ADR.md) — 18 решений; ADR-012…016 — строки переиспользования N5/N1/N4/N2.
5. [`docs/Pseudocode.md`](docs/Pseudocode.md) — 34 алгоритма, контракты маршрутов, переходы состояний.
6. [`docs/Refinement.md`](docs/Refinement.md) — edge cases, слои тестов, 16 стражей с внедряемым
   дефектом, калибровка порога. [`docs/Completion.md`](docs/Completion.md) — выпуск и контракты на стенде.
7. [`docs/reuse-inventory.md`](docs/reuse-inventory.md) — что взять готовым из N1–N5 и как отвечать
   по каждой строке.

Контракты: [`embed-contract`](docs/embed-contract.md), [`long-job-contract`](docs/long-job-contract.md),
[`model-cost-contract`](docs/model-cost-contract.md), [`webhook-contract`](docs/webhook-contract.md).
Решения без владельца и их откат — [`docs/decisions-autonomous.md`](docs/decisions-autonomous.md)
(A-N6-001…020). BDD — [`docs/test-scenarios.md`](docs/test-scenarios.md).

## Стек и сервисы compose (ровно 6, канон §6)

| Сервис | Технология | Роль |
|---|---|---|
| `proxy` | Caddy 2.8 + `caddy-ratelimit` (сборка `proxy/Dockerfile`, донор N4) | единственная дверь: `127.0.0.1:${N6_HTTP_PORT:-8086}` к общему TLS-прокси; лимит 30 мутаций / 120 чтений в минуту на IP ДО тела; XFF → `{client_ip}`; `immutable` для `/w/widget.*.js`; **CORS не ставит** |
| `web` | Next.js 15, Node 22, `pg` без ORM, zod | кабинет, API, предпросмотр, `/w/v1/*`, `/b/{slug}`, `/r/{code}`, бандл виджета; ответы RAG (эмбеддинг вопроса → поиск → модель → проверка цитат) |
| `worker-index` | Node 22, BullMQ | `CrawlSite`, `ExtractPdf`, `ChunkDocument`, `EmbedAndStore`; сторож раз в минуту |
| `db` | `pgvector/pgvector:0.8.6-pg16` | все данные, `vector(1536)` + HNSW cosine; без публикации порта |
| `redis` | `redis:7.4-alpine` | транспорт очереди, AOF, `noeviction`, пароль; без публикации порта |
| `migrate` | образ `migrate` | миграции SQL до старта `web`/`worker-index` (`service_completed_successfully`) |

Модели — через ОДИН шлюз **OpenRouter**: ответы `anthropic/claude-haiku-4.5` (`temperature 0`,
`max_tokens 400`, structured outputs), эмбеддинги `openai/text-embedding-3-small`, **1536 измерений**.
Монорепо: `apps/{web,worker,widget}`, `packages/{db,rag,queue}`.

## Ключевые инварианты (нарушение — регресс, не стиль)

- **Главный инвариант (@security, PD-CORE-001, ADR-003).** Модель ответа зовётся, только если найден
  фрагмент со сходством ≥ `min_similarity` (0.40); каждый показанный ответ ссылается на переданный
  модели фрагмент — `ValidateModelAnswer` отбрасывает цитату вне контекста. Иначе «не знаю» +
  контакт. Выдумка от имени чужого бизнеса — дефект уровня блокера.
- **Порядок операций — это и есть защита** (Specification §1): лимит частоты на двери ДО тела →
  `CheckOrigin` ДО любого платного шага → атомарная квота ДО эмбеддинга вопроса → порог ДО модели →
  robots.txt и `CheckAddress` ДО первой страницы → `index_job_id` в ответе `202` ДО работы.
- **Квота — два оператора в одной транзакции** (ADR-008): `INSERT … ON CONFLICT DO NOTHING`, затем
  `UPDATE … SET used = used + :n WHERE used + :n <= :limit RETURNING`; пустой результат И ЕСТЬ
  отказ, откат ВСЕХ scope. Однооператорная `ON CONFLICT DO UPDATE … WHERE` недействительна (V2-R01
  у N5). Счёт по ПОПЫТКАМ: отказ модели списанное не возвращает. Предел — окружение, не колонка.
- **10 scope, 14 переменных `QUOTA_*`** (канон §7): scope с двумя пределами разводится по
  `scope_key` (`preview_session` → `<сессия>:create|answers`, `global_previews` →
  `previews|preview_answers`), у каждого предела своя переменная. Создание предпросмотра НЕ тратит
  10 ответов (SC-US-002-3). Отсутствие ЛЮБОЙ из 14 валит старт `web` и `worker-index` — 14 отдельных
  прогонов, по одному на ИМЯ.
- **Изоляция ботов (NFR-SEC-001):** `WHERE bot_id = $1` в ТОМ ЖЕ SQL поиска, не пост-фильтр после
  `LIMIT 4`.
- **Бейдж fail-closed (ADR-004):** `badge_required = !(plan === 'nobadge' || plan === 'studio')`,
  строгое равенство; `'NOBADGE'`, `' nobadge'`, `null` → бейдж. Решает только сервер.
- **Виджет на чужой странице (ADR-005):** Shadow DOM, только `textContent`, ссылки — `http(s)` из
  источников бота; CORS — точный origin из списка бота, **ровно один** `Access-Control-Allow-Origin`
  (ставит только `web`), без cookie и без `*`; работает под CSP хозяина без `unsafe-inline`; бандл
  ≤ 45 КБ gzip (сборка падает выше). Проверка — только на ЧУЖОМ origin (порт 8099).
- **Краулер не сканер нашей сети (ADR-010):** проверка адреса ПОСЛЕ DNS и на КАЖДОМ перенаправлении,
  соединение по проверенному IP; robots.txt до первой страницы; 1 с пауза, 1 поток; без браузера.
- **Долгая задача — три состояния** (ADR-009): `index_job_id` до работы; Postgres — источник
  истины, BullMQ — транспорт; fence попыток; «Повторить» продолжает по `content_hash`, а не заново;
  молчание > 5 мин — `failed(stalled)`, не «выполняется».
- **Закрытые перечисления, неизвестное — самое строгое:** план → `free`, статус бота → `deleted`,
  задача → `failed`. `N6_PUBLIC_ORIGIN` и модели — без значений по умолчанию.
- **Чужой ресурс — `404`**, как несуществующий. Демо-страница с нашего origin установкой не считается.
- **152-ФЗ:** текст вопроса хранится только у `unknown`, 14 дней; IP — префикс; удаление аккаунта
  ≤ 72 ч; ключ OpenRouter только на сервере.

## Команды разработки

Команды исполнимы с фичи `foundation`; `npm run build` пока без виджета (он появится с `widget-runtime-and-badge`).

```bash
npm test                 # vitest: unit + стражи по исходнику
npm run lint
npm run build            # виджет (check-bundle-size ≤ 45 КБ gzip) → web → worker
docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test   # name: n6-test
node scripts/test-ceilings-mutations.mjs   # страж отказа старта испытан мутациями → 0
```

`--build` обязателен (урок N5: без него прогон молча проверяет старый образ). Перед `docker compose up`:

```bash
node ../../.claude/hooks/check-ports.cjs .                          # Правило №0 → 0
bash ../../scripts/check-port-conflicts.sh projects/06-rag-sales-chatbase   # → 0
bash ../../scripts/complexity-router.sh                             # тир перед /go и /feature
```

## Правила репозитория, применимые здесь

[`embeddable-widget`](../../.claude/rules/embeddable-widget.md) (три класса отказа на чужом origin) ·
[`model-call-cost`](../../.claude/rules/model-call-cost.md) · [`long-running-job`](../../.claude/rules/long-running-job.md) ·
[`docker-ports`](../../.claude/rules/docker-ports.md) · [`compose-hygiene`](../../.claude/rules/compose-hygiene.md) ·
[`deployment-seams`](../../.claude/rules/deployment-seams.md) · [`security-operation-order`](../../.claude/rules/security-operation-order.md) ·
[`fail-closed-defaults`](../../.claude/rules/fail-closed-defaults.md) · [`honest-configuration`](../../.claude/rules/honest-configuration.md) ·
[`silent-fallbacks`](../../.claude/rules/silent-fallbacks.md) · [`shared-resource-verification`](../../.claude/rules/shared-resource-verification.md) ·
[`guard-must-be-able-to-fail`](../../.claude/rules/guard-must-be-able-to-fail.md) · [`complexity-router`](../../.claude/rules/complexity-router.md).
Входящих вебхуков в неделю нет (ADR-017) — [`incoming-webhooks`](../../.claude/rules/incoming-webhooks.md)
включается вместе с оплатой.

## Проектный toolkit (Phase 3, сгенерирован 2026-09-25)

Полная карта с обоснованием каждого отсутствия — [`docs/toolkit-map.md`](docs/toolkit-map.md).

| Агент | Когда звать |
|---|---|
| [`planner`](.claude/agents/planner.md) | разложить фичу на единицы, назвать FR/SC/ADR, строки переиспользования и порядок операций |
| [`architect`](.claude/agents/architect.md) | схема, маршруты канона §5, границы сервисов, pgvector, новый ADR |
| [`code-reviewer`](.claude/agents/code-reviewer.md) | после каждой единицы: барьер «не знаю», квота, origin, SSRF, fence, бейдж, изоляция |

| Навык | Когда грузить |
|---|---|
| [`project-context`](.claude/skills/project-context/SKILL.md) | продукт, персоны, границы недели, числа канона, метрики, открытые вопросы |
| [`coding-standards`](.claude/skills/coding-standards/SKILL.md) | пока пишется код: квота, RAG, краулер, задача индексации, виджет |
| [`security-patterns`](.claude/skills/security-patterns/SKILL.md) | любая граница доверия: чужой origin, чужой контент, URL владельца, платный вызов |
| [`responsive-ui`](.claude/skills/responsive-ui/SKILL.md) | любая вёрстка: лендинг, кабинет, `/b/{slug}`, окно виджета на 360 px |

| Правило | О чём |
|---|---|
| [`security.md`](.claude/rules/security.md) | порядок операций, SSRF, CORS, XSS на чужих сайтах, prompt injection, 152-ФЗ |
| [`coding-style.md`](.claude/rules/coding-style.md) | монорепо, TypeScript, `pg` и SQL, pgvector, закрытые перечисления, грабли |
| [`testing.md`](.claude/rules/testing.md) | слои, конкурентные прогоны, 16 стражей, 14 прогонов старта, калибровка |
| [`secrets-management.md`](.claude/rules/secrets-management.md) | какой секрет какому сервису, `${VAR:?}`, ротация, ключ только на сервере |

## Feature lifecycle и roadmap

`/feature` (4+ файлов или новая архитектура) или `/plan` (≤ 3 файлов), маршрутизация `/go`;
PLAN → VALIDATE → IMPLEMENT → REVIEW (`../../.claude/rules/feature-lifecycle.md`), Phase 2 не
пропускается. Перед `/go` и `/feature` — `bash ../../scripts/complexity-router.sh`: код `1` — L/XL и
остановка на плане у владельца; код `2` — «проверка не выполнена», а не тир T.

[`.claude/feature-roadmap.json`](.claude/feature-roadmap.json) — 17 фич в порядке зависимостей (16 mvp + 1 should),
43 `SC-US` распределены без пересечений. У каждой фичи — поле `reuse` со строками ADR-012…016 и
путём источника («взять из N5/N1/N4»); квитанция фичи отвечает по каждой строке `перенесено |
адаптировано (что) | написано заново (почему)`. Молчание о строке — незакрытая строка.
Квитанция — `docs/features/<slug>/05_completion.md`: что проверено и ЧЕМ, что НЕ доказано, какие
стражи испытаны мутацией.

## Режим исполнения: только Anthropic (OWN-017 из N5 распространяется на N6)

С 25.09.2026 OpenAI/Codex не используется — квота исчерпана. **Код пишет Opus 5.5, план и код
проверяет другой агент Anthropic (Sonnet 5)**; модель, написавшая код, его не проверяет. Это не
полный cross-family review — в квитанции так и пишется. Решения без владельца записываются в
`docs/decisions-autonomous.md` как `A-N6-nnn` (следующий — A-N6-021) с причиной и условием отмены;
необратимое (деньги, внешние действия, удаление чужого) — только с владельцем. Телеметрия
p-replicator для `/feature`/`/go`/`/run` — с первой стадии, недоступные счётчики — `null` с причиной.

## Parallel execution strategy

Каждый пишущий агент — изолированный worktree и непересекающийся набор файлов; интеграция только по
именованным terminal-квитанциям (`../../.claude/rules/swarm-file-evidence.md`): `WORK_UNIT_ID`,
абсолютный `TRACE_PATH`, последняя строка `Status: completed|failed`. Молчание — не прогресс. Общие
манифесты (`package.json`, lockfile, `docker-compose.yml`, миграции) правит только integration owner.
Запись в разделяемые ресурсы (`quota_counter`, `index_job`, `widget_install`, `attribution`) — только
атомарными операторами БД.
