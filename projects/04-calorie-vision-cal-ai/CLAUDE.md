# N4 «Тарелка» — контекст проекта

Прочитать корневой `CLAUDE.md`, применимые `../../.claude/rules/`, политику моделей и телеметрию
p-replicator, прежде чем реализовывать что-либо здесь. Общий toolkit живёт в корневой `.claude/`;
новый оркестратор в этом проекте не создаётся.

## Что это

Фото-трекер калорий: пользователь снимает тарелку, через секунды видит блюдо, калории и три
макронутриента — и видит, откуда взято каждое число (запись открытой базы USDA FoodData Central, её
идентификатор, порция в граммах). Клиент — один Next.js-фронт на PWA и Telegram Mini App. Контур
запуска — Россия и СНГ, Telegram-first. Статус: технический план плюс скелет контейнеров — Phase 1–4 завершены 2026-09-12.
Реализация не начиналась: `package.json` монорепо, исходники, миграции и тесты не созданы.
`docker-compose.yml` и `Dockerfile` существуют как скаффолды и сборкой не проверены.

## Документация — читать в этом порядке

1. **Specification** ([`docs/Specification.md`](docs/Specification.md)) — ЧТО строить: FR, NFR,
   growth- и look-требования, пользовательские истории и приёмочные сценарии.
2. **Architecture** ([`docs/Architecture.md`](docs/Architecture.md)) — устройство системы: 6 сервисов
   compose, 14 сущностей, внешние зависимости, безопасность, масштабирование.
3. **ADR** ([`docs/ADR.md`](docs/ADR.md)) — десять архитектурных решений (ADR-001…010), у каждого
   есть Confirmation — проверка, обязанная упасть при нарушении решения.
4. **Refinement** ([`docs/Refinement.md`](docs/Refinement.md)) — edge cases, стратегия тестирования,
   обязательные критические (конкурентные) проверки.
5. **Completion** ([`docs/Completion.md`](docs/Completion.md)) — план выпуска, мониторинг, передача.

Источник имён и чисел — [`docs/canon.md`](docs/canon.md), заморожен 2026-09-12: любой документ и
любой код ссылаются на эти идентификаторы, не изобретают свои.

## Стек и сервисы compose (ровно 6, канон §6)

| Сервис | Технология | Роль |
|---|---|---|
| `web` | Next.js 15, SSR, PWA-манифест, Telegram Mini Apps SDK | Один фронт на оба клиента |
| `api` | Node 22/TypeScript, Fastify | 13 маршрутов канона, приём и нормализация фото, квоты, `initData` |
| `recognizer` | Node worker | Забирает задание `FOR UPDATE SKIP LOCKED`, зовёт модель, считает числа из базы |
| `db` | PostgreSQL 16 + `pg_trgm` | Данные + очередь заданий + нечёткий поиск; без публикации порта |
| `storage` | MinIO | Приватный бакет фото, TTL 30 дней; только presigned-URL |
| `proxy` | Caddy | Единственная публичная дверь, TLS, rate limit |

Модель: Claude Haiku 4.5 основной вызов, Claude Sonnet 5 — эскалация при уверенности < 0,6. База:
USDA FoodData Central (CC0) + ручная RU-курация 100–300 блюд в `food_synonym`.

## Ключевые инварианты (нарушение — регресс, не стиль)

- **Число только из базы (ADR-001).** Модель отвечает за ингредиенты и порцию, НЕ за калорийность и
  БЖУ; JSON-схема вызова модели не содержит полей `calories`/`kcal`/`protein`/`fat`/`carbs`.
  `recognition` без ссылки на `food_item` не может получить статус `done`.
- **Квота проверяется до вызова модели, атомарно (ADR-007).** `INSERT … ON CONFLICT DO UPDATE SET
  used = used + 1 WHERE used < :limit RETURNING` — не «прочитать, потом записать». Потолков ТРИ, и у
  каждого своя строка `scan_quota_counter` со своим `scope`: 10/пользователь (`user`), 3000/сутки
  (`global`), 600/сутки на эскалацию к Sonnet 5 (`escalation` — ЧЕТВЁРТЫЙ ключ попытки-эскалации, а
  не тот же счётчик, что у распознаваний). Первичная попытка списывает три ключа, эскалация — четыре,
  все в одной транзакции. Ненастроенный потолок — любой из трёх — валит старт процесса. Отказ по
  счётчику `escalation` не выбрасывает уже оплаченный первичный результат: скан завершается `done` с
  признаком `low_confidence`, а не `failed`.
- **Явный код партнёра сильнее cookie (ADR-008).** Недействительный код — ошибка ввода, а НЕ откат к
  cookie. Решение принимается по полю `attribution.source`, а не по факту существования строки:
  слабая атрибуция (`cookie`/`deeplink`) + явный код → `200` с `UPDATE` и записью прежнего источника
  в `replaced_source`; `explicit` + любой код и слабая + слабая → `409`.
  `UNIQUE (attribution.device_session_id)` гарантирует ЕДИНСТВЕННОСТЬ строки, но НЕ её неизменность.
- **Согласие — до первой записи в дневник, не при установке (ADR-009).** Данные о питании — особая
  категория персональных данных; без согласия съёмка работает, дневник не ведётся.
- **Счёт вызовов модели — по попыткам, не по успехам.** Таймаут, отказ провайдера и эскалация
  списываются наравне с успехом (FR-LIMIT-001, `docs/model-cost-contract.md`).
- **Порядок операций — это и есть защита.** Лимит частоты до валидации тела; квота до вызова модели;
  подпись `initData` (сырые байты, сравнение постоянного времени) до разбора данных и до проверки
  свежести (`../../.claude/rules/security-operation-order.md`).

## Команды разработки

`package.json` монорепо ещё не заведён — появится на шаге `/start`. Команды ниже — целевые, а не
подтверждённые исходником:

```bash
npm test          # unit + integration (Refinement.md), включая конкурентный тест квоты
npm run lint
npm run build      # по каждому workspace: web, api, recognizer
npm run import:fdc # разовый импорт USDA FoodData Central, не сервис compose
```

`docker compose up` — только после проверок:

```bash
bash scripts/check-port-conflicts.sh projects/04-calorie-vision-cal-ai
node .claude/hooks/check-ports.cjs projects/04-calorie-vision-cal-ai
# bash scripts/check-env-wiring.sh — СКРИПТА НЕТ в репозитории; см. раздел «Скаффолды Phase 4»
```

## Правила репозитория, применимые к этому проекту

- [`docker-ports.md`](../../.claude/rules/docker-ports.md) — `db`/`storage` без публикации портов.
- [`compose-hygiene.md`](../../.claude/rules/compose-hygiene.md) — теги образов, `healthcheck`,
  `restart: unless-stopped`, монорепо в Docker.
- [`deployment-seams.md`](../../.claude/rules/deployment-seams.md) и
  [`port-conflicts-local.md`](../../.claude/rules/port-conflicts-local.md) — стык модулей и занятость
  портов машины.
- [`shared-resource-verification.md`](../../.claude/rules/shared-resource-verification.md) —
  конкурентный тест квоты обязателен, последовательный ничего не доказывает.
- [`security-operation-order.md`](../../.claude/rules/security-operation-order.md),
  [`fail-closed-defaults.md`](../../.claude/rules/fail-closed-defaults.md),
  [`honest-configuration.md`](../../.claude/rules/honest-configuration.md) — порядок проверок и
  трактовка отсутствующих/невалидных значений.
- [`model-call-cost.md`](../../.claude/rules/model-call-cost.md) — потолки вызовов модели
  (`docs/model-cost-contract.md`).
- [`long-running-job.md`](../../.claude/rules/long-running-job.md) — три состояния распознавания
  (`docs/long-job-contract.md`), идентификатор `scan_id`.
- [`guard-must-be-able-to-fail.md`](../../.claude/rules/guard-must-be-able-to-fail.md) — каждый
  страж (особенно ADR-001 и ADR-007) обязан быть испытан на внедрённом дефекте.

## Проектный toolkit (Phase 3, сгенерирован 2026-09-12)

Общие команды и хуки остаются в корневой `.claude/` и здесь не дублируются. Полная карта с
обоснованием каждого отсутствия — [`docs/toolkit-map.md`](docs/toolkit-map.md).

| Агент | Когда звать |
|---|---|
| [`planner`](.claude/agents/planner.md) | разложить фичу на единицы, назвать связывающие FR/SC/ADR и порядок операций |
| [`architect`](.claude/agents/architect.md) | схема, маршруты, границы сервисов, внешние зависимости, новый ADR |
| [`code-reviewer`](.claude/agents/code-reviewer.md) | после каждой единицы реализации: источник числа, квота, аренда, владение, согласие |

| Навык | Когда грузить |
|---|---|
| [`project-context`](.claude/skills/project-context/SKILL.md) | вопросы о продукте, границах недели, словаре, числах канона |
| [`coding-standards`](.claude/skills/coding-standards/SKILL.md) | пока пишется или правится код |
| [`security-patterns`](.claude/skills/security-patterns/SKILL.md) | любая граница доверия и любой платный вызов |
| [`feature-navigator`](.claude/skills/feature-navigator/SKILL.md) | «что дальше», статус фичи, плечи эксперимента EXP-N4-001 |

| Правило | О чём |
|---|---|
| [`security.md`](.claude/rules/security.md) | порядок операций, особая категория ПДн, граница входа, `404` вместо `403`, anti-fraud |
| [`coding-style.md`](.claude/rules/coding-style.md) | структура монорепо, единицы и время, PostgreSQL без ORM-магии, грабли стека |
| [`testing.md`](.claude/rules/testing.md) | слой по природе признака, обязательные конкурентные прогоны, испытание стражей |
| [`secrets-management.md`](.claude/rules/secrets-management.md) | какой секрет какому сервису, отказ вместо дефолта, ротация |

## Feature lifecycle и roadmap

Реализация ведётся через `/feature` (4+ файлов или новая архитектура) или `/plan` (≤3 файлов), с
маршрутизацией `/go`. Порядок фаз — PLAN → VALIDATE → IMPLEMENT → REVIEW
(`../../.claude/rules/feature-lifecycle.md`); Phase 2 (валидация) не пропускается. Перед `/go` и
`/feature` прогонять `bash ../../scripts/complexity-router.sh`: код `1` означает L/XL и остановку на
плане у владельца, код `2` — «проверка не выполнена», а не тир T.

[`.claude/feature-roadmap.json`](.claude/feature-roadmap.json) — восемь MVP-фич в линейном порядке
зависимостей: `foundation` → `scan-pipeline` → `source-and-correct` → `consent-and-telegram-auth` →
`diary-and-streak` → `share-card-and-growth-events` → `partner-codes-and-cabinet` →
`pro-interest-and-limits-ui`. Статус `next` только у первой, остальные `planned`; ни одна не `done`.
Поле `complexity` — пакетная схема `simple|medium|complex` (S/M/L); тира XL в ней нет вовсе, поэтому
`scan-pipeline` записан `complex`, хотя по локальной таблице он XL — трогает деньги.

`diary-and-streak` и `share-card-and-growth-events` помечены `medium` и назначены кандидатами
контролируемых пар эксперимента EXP-N4-001 (плечи Opus 5 / Sonnet 5, судья Codex Astra medium);
подробности и §8 предрегистрации — в [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md).

## Скаффолды Phase 4

`docker-compose.yml` (6 сервисов канона плюс служебный `test`), `Dockerfile` (multi-stage, цели
`api`/`recognizer`/`web`), `.dockerignore`, `.env.example`, `.gitignore`. Проверено: `docker compose
config` → 0, `check-ports.cjs` → 0, `check-port-conflicts.sh` → 0, образов без тега нет. **Сборкой
не проверено** — исходников не существует, и первым делом фичи `foundation` должен быть
`docker compose build`.

Единственный публикуемый порт — `127.0.0.1:${N4_EDGE_PORT:-4180}` у Caddy в профиле `edge`. У `web`
хостового порта НЕТ: черновик его публиковал, и `check-port-conflicts.sh` вернул `1` — публикация
рядом с прокси позволяет обойти прокси вместе с ограничением частоты, которое тот держит.

`scripts/check-env-wiring.sh`, на который ссылаются `docs/Completion.md` и раздел «Команды
разработки» выше, в репозитории ОТСУТСТВУЕТ. Пока его нет, полнота проброса переменных остаётся
суждением и так помечается; написать его — работа фичи `foundation`.

## Development insights

_Пусто на момент записи — реализация не начиналась. Заполняется через `/myinsights` по мере
разработки (`../../.claude/rules/insights-capture.md`)._

## Parallel execution strategy

Каждый пишущий агент получает изолированный worktree и непересекающийся набор файлов; координатор
интегрирует только по именованным terminal-квитанциям (`../../.claude/rules/swarm-file-evidence.md`).
Общие манифесты (`package.json`, lockfile, `docker-compose.yml`) правит только integration owner.
Читающее исследование может идти параллельно без ограничения; запись в разделяемые ресурсы (счётчик
квоты, таблица `attribution`) — только через атомарные операторы БД, а не через координацию в памяти
процесса.
