# foundation — квитанция

**Фича:** 1 `foundation` · **Дата:** 2026-09-25 · **FR:** `FR-AUTH-001`, `FR-LIMIT-004`,
`NFR-OPS-001` (часть «ненастроенный потолок валит старт») · **ADR:** ADR-001, ADR-012, ADR-014 ·
**SC:** нет (по роадмапу: FR-AUTH-001 и FR-LIMIT-004 принимаются Gherkin внутри требования и прогонами
старта) · **Исполнитель:** Opus 5.5 · **Ревью:** не проводилось в этом прогоне (см. «Чего фича не
доказывает» п.1) · Код — [`07_code_report.md`](07_code_report.md), переиспользование —
[`reuse-map.md`](reuse-map.md).

## Проверено — и ЧЕМ

| Утверждение | Чем доказано | Слой |
|---|---|---|
| Отсутствие ЛЮБОЙ из 14 `QUOTA_*` валит старт `web` И `worker-index` с кодом 1 и именем переменной | 28 подпроцессов в `tests/config.test.ts` (14 × настоящий `preflight.js` web, 14 × `apps/worker/dist/index.js`) + положительный контроль каждого; плюс настоящие образы `n6-sufler-web/worker:foundation` без `QUOTA_GLOBAL_PREVIEW_ANSWERS` → код 1 | 1 |
| Перечень 14 имён не перепечатан, а сверен | тест читает строку «Перечень переменных (14)» канона §7 и сравнивает с `QUOTA_NAMES`, `x-quota-env` compose и `.env.example` (имена И значения) | 1 |
| Пустое, мусор, `0`, дробь, экспонента, пробел, > int4 — отказ с точным сообщением | 14 × 9 форм в `tests/config.test.ts` | 1 |
| «Персональный ≤ общего» и «одно имя — одно число» | 8 пар + таблица из 14 ключей (scope, вид предела) | 1 |
| Модели, ключ, origin без дефолтов; origin не подчищается; https и не петля вне dev/test | `tests/config.test.ts` «Модели, origin, секреты» | 1 |
| Схема: 19 сущностей, CHECK = перечисления кода, неизвестное → самое строгое | `tests/enums.test.ts` (разбор миграции) + `tests/database.integration.test.ts` на настоящем Postgres | 1 |
| ADR-001 Confirmation: HNSW строится на `vector(1536)` и ПАДАЕТ на `vector(3072)`; 1535 измерений отвергнуты; поиск с `bot_id` в том же SQL работает | `database.integration.test.ts` на `pgvector/pgvector:0.8.6-pg16` | 1 |
| CHECK-инварианты держит БД: черновик без владельца, текст вопроса только у `unknown`, причина только у `failed`, IP только префиксом, `'NOBADGE'` отвергнут, вид предела в `scope_key` | `database.integration.test.ts` по имени ограничения (`constraint`) | 1 |
| Вход: равный ответ «нет адреса / неверный пароль / erasing», bcrypt до записи и вне пула, лимит ДО чтения тела, отказ Redis закрывает вход, чужой Origin → 403, пароль > 72 байт → 422, logout отзывает в БД | `tests/auth.test.ts` + `database.integration.test.ts` (12 конкурентных регистраций → 1 аккаунт; 12 bcrypt при занятом пуле → 0 занятых соединений) | 1 |
| Лимит частоты атомарен | `tests/redis.integration.test.ts`: 40 одновременных мутаций одной /24 на настоящем Redis → ровно 30 | 1 |
| Дверь: 30/120 на `{client_ip}`, XFF заменяется, CORS не ставится, модуль проверяется на сборке | `tests/proxy-rate.test.ts` (чтение Caddyfile/Dockerfile) + сборка образа + `caddy validate` | 1 |
| Хранилища без публикации, единственная дверь, порты `${VAR:-default}` на петле, `name:` у обоих compose | `tests/compose.test.ts` + `check-ports.cjs` (0 с `.env`, 2 без) + `check-port-conflicts.sh` (0 с `.env`) | 1 |
| Каждая переменная, которую читает код, проброшена сервису | `check-env-wiring.sh` → 0; испытан порчей конфига → 1 с именами; пустой compose → 2 | 1 |
| Монорепо собирается в Docker | `docker compose build` — 4 образа; `compose.test.yml run --build test` — прогон в образе | 1 |

## Стражи, испытанные мутацией

`node scripts/test-ceilings-mutations.mjs` (копия проекта во временном каталоге; `@n6/*` указывают на
копию; прогон `tests/config.test.ts`; журналы — `tests/artifacts/foundation/mutations/`):

| Мутация | Дефект возвращён | Код восстановлен |
|---|---|---|
| `default-ceiling` | 33 failed | 159 passed (192) (код 1) | 192 passed (192) (код 0) |
| `zero-accepted` | 14 failed | 178 passed (192) (код 1) | 192 passed (192) (код 0) |
| `one-name-two-numbers` | 1 failed | 191 passed (192) (код 1) | 192 passed (192) (код 0) |
| `pairs-skipped` | 8 failed | 184 passed (192) (код 1) | 192 passed (192) (код 0) |
| `web-preflight-swallows` | 18 failed | 174 passed (192) (код 1) | 192 passed (192) (код 0) |

Итог скрипта: код **0** (каждый дефект пойман, каждое восстановление зелёное). Первый прогон той же мутации `zero-accepted` дал лишь 6 красных из 14 — тест ужесточён до точного текста сообщения (07_code_report «Что нашла мутация»).

Страж проброса переменных (`check-env-wiring`): удалены `worker-index.QUOTA_GLOBAL_EMBED` и
`web.SESSION_SECRET` → код **1** с обоими именами; восстановлено → **0**; пустой compose → **2**.

## Прогон в образе

`docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test`
(`N6_ACCEPTANCE=1` — любой пропуск валит прогон), затем `down -v`:

```
 Test Files  8 passed (8)
      Tests  260 passed (260)
```
Код возврата `run` — **0**; пропусков 0 (включая 10 интеграционных тестов Postgres+pgvector и 1 Redis). Полный вывод — `tests/artifacts/foundation/compose-test-run.txt`. Прогон выполнен ПОСЛЕ последней правки исходника (текст сообщения потолка) и после финального прогона мутаций.

## Чего фича НЕ доказывает

1. **Независимого ревью не было.** Код писал Opus 5.5; ревьюер другой модели (Sonnet 5 по CLAUDE.md
   проекта) в этом прогоне не запускался. Cross-family review невозможен (OpenAI/Codex не зовётся с
   25.09) — даже после ревью это будет только «другая модель Anthropic».
2. **Стек целиком не поднимался.** `docker compose up` не выполнялся: порядок `migrate →
   web/worker-index → proxy`, healthcheck'и (`/health` через `node -e fetch`, отметка жизни воркера),
   `service_completed_successfully` у `migrate` и путь запроса через дверь проверены только чтением и
   по отдельным образам. Что web внутри стека получает от Caddy РОВНО один адрес в XFF (A-N6-021),
   не проверено ни одним прогоном — без этого вход отвечает 503. Это первое, что проверяет выпуск на стенд.
3. **Лимит двери на живом трафике** (30/120 в минуту, `trusted_proxies`) не измерялся — только
   `caddy validate` и чтение чисел.
4. **Регистрация без кода партнёра и без claim предпросмотра** — Pseudocode AuthRegisterAndLogin
   шаги 3 и 5 (ветки `ApplyPartnerCode`, `ClaimPreview`) приходят с фичами `partner-and-studio` и
   `preview-flow`. Сброса пароля нет (FR-AUTH-001, в неделю не входит).
5. **`NFR-OPS-001` закрыт частично:** журнал расхода `model-spend.jsonl` и суточные счётчики по
   10 scope — фича `quota-and-spend`. Пределы здесь только ЗАГРУЖЕНЫ; ни один не применяется к
   вызову — вызовов модели ещё нет.
6. **`worker-index` ничего не индексирует** и не делает `EmbedProbe`; ключ OpenRouter N6 не проверен.
7. **Страж по ADR-001 «размерность ≠ 1536 валит старт» (EmbedProbe)** — не в этой фиче.
8. **CHECK-стражи БД мутацией не испытаны:** они проверены по имени ограничения и коду `23514`, но
   прогона «удалить CHECK → тест красный» не было. Мутациями испытан только страж отказа старта.
9. **Нагрузочная проверка входа** (N5 `bcrypt-load.test.ts`, 12 входов ≤ 3 с при libuv=8) не перенесена.
10. `npm audit --omit=dev` не запускался (условие Pre-Deployment, не фичи).

## Привязка к исходнику

Коммита нет (по постановке). Снимок грязного дерева N6 (без `node_modules`, `dist`, `.next`,
`tests/artifacts`): `sha256:9c0621844d4bf47ba21fef7b74116c2d43d63d95cb79e5e6e1f195ddbae26704` — sha256 от отсортированного списка `sha256sum` 131 файлов (без этой квитанции); посчитан после финального прогона в образе.

## Итог

Все обязательные проверки постановки зелёные: `npm ci`, typecheck, lint, build — 0; прогон в образе — 260/260; страж старта — 5/5 мутаций пойманы; `check-ports.cjs` — 0 (с `.env`; без него честно 2); `check-port-conflicts.sh` — 0 (с `.env`; без него 1 — конфиг не читается). Статус фичи в роадмапе — `done`. Открытое: ревью другой моделью и подъём стека целиком (пункты 1–2 выше).

Status: completed
