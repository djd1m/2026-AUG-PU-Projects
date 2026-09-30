# Project: N6b «RAG-бот для сайта»

## Overview

Владелец малого сайта за 10 минут получает чат-бота, который отвечает посетителям по его страницам и PDF, в каждом
ответе показывает источник, а при отсутствии ответа честно говорит «не знаю» и даёт контакт владельца. Повтор проекта N6
для занятия 30.09: **код `projects/06-rag-sales-chatbase` не читать и не использовать**; модули N1–N5 переиспользуются по
[`docs/discovery/reuse-inventory.md`](docs/discovery/reuse-inventory.md) (поле `reuse` в дорожной карте).

Главная метрика недели: **15 внешних виджетов** (бот × внешний хост, определение — Specification FR-n6b-15) с ≥ 1 вопросом.
Стенд: `https://n6b.194.85.249.105.sslip.io`. Подъём стенда — остановка у владельца.

## Problem & Solution

Боты категории выдумывают, включая несуществующие ссылки, а каждый ответ публичного виджета оплачиваем мы и запускает
посторонний. Решение — «ответ, которому можно не верить на слово»: ответ собирается только из найденных фрагментов, ссылка
строится из НАШЕЙ записи источника, ниже порога сходства — «не знаю» без вызова модели; каждый платный вызов закрыт
потолком-числом, ненастроенный потолок роняет старт. Рост: бейдж на Free + демо-страница сохранённого бота + подаккаунты
студий (выбор владельца OWN-06B-001).

## Architecture

Distributed Monolith в монорепо (npm workspaces), Docker Compose на VPS за существующим TLS-прокси машины.

```
apps/web          Next.js 15: кабинет, API, песочница, /api/widget/*, /b/{slug}, /r/b/*, лендинг, /admin/metrics, отдача w.js
apps/widget       w.js: Shadow DOM, чат, бейдж, beacon; esbuild, ≤ 30 KB gzip, без инлайновых script/style
services/worker   аренда задач, обход сайта, PDF, нарезка, эмбеддинги, уборщики
packages/db       миграции, роли, RLS, квоты
packages/rag      нарезка, поиск, промпт, проверка цитат, «не знаю», порт провайдера модели
scripts/          стражи стыков: env-wiring, compose-buildable, check-cjm
```

Процессы compose: `db` (pgvector, **без `ports:`**), `migrate` (one-shot), `web`, `worker`. Внешняя сеть прокси —
`${PROXY_NETWORK}` = `talk-ai-public` (OWN-06B-006). Хостовые порты только `${VAR:-default}`, и только на `127.0.0.1`.

## Tech Stack

| Слой | Выбор |
|---|---|
| Язык | TypeScript, Node 22 во всём монорепо |
| Web | Next.js 15 App Router, собственный CSS на токенах (палитра — фолбэк, облик источника не снят) |
| БД | Postgres 16 + pgvector 0.8.6 (`pgvector/pgvector:0.8.6-pg16`), HNSW `vector_cosine_ops`, `vector(1536)` |
| Очередь | таблица `index_job` + `FOR UPDATE SKIP LOCKED` + аренда с fence (без Redis, ADR-001/005) |
| Модели | OpenRouter: `openai/gpt-4.1-mini` (ответ), `openai/text-embedding-3-small` (1536); исполнитель закреплён `provider: { order: ["openai"], allow_fallbacks: false }` |
| Извлечение | `undici` + `cheerio` (HTML), `pdfjs-dist` (PDF), `js-tiktoken` (токены) |

## Key Algorithms (`docs/Pseudocode.md`)

- `Answer question` — валидация → пределы ДО платного вызова → эмбеддинг → top-5 → порог → генерация → `cited_ids ⊆ выдачи`.
- `Widget ask gate` / `Widget config and badge decision` — origin из списка бота, CORS только приложением, бейдж решает сервер.
- `Worker lease loop` / `Crawl site` / `Chunk and embed` — ручка задачи до работы, повтор продолжает, SSRF-фильтр.
- `Boot config check` — 13 обязательных переменных, отсутствие или `''` → EXIT 1 с именем и последствием.
- `Weekly metric` — `metric_host()` одна функция нормализации, `excluded()` закрытым списком в коде.

## Security Rules

- Ключ модели серверный (`OPENROUTER_API_KEY`), в браузер не уходит; шаблон «ключи в браузере» не применяется (ADR-011).
- RLS по `account_id` в транзакции (`SET LOCAL`); чужой `bot_id`/`job_id` → 404.
- Публичные ручки: origin из явного списка бота (пусто = закрыто), без `credentials`, без `*`; демо-ручка — только
  `application/json` и `Origin` = наш origin.
- Текст модели и имена источников выводятся текстом, ссылки только из БД; фрагменты — данные, не инструкции.
- IP не хранится — только HMAC префикса (/24, IPv6 /64) с `VISITOR_SECRET`. Уведомление о внешней модели до первого вопроса.
- Полные правила: [`.claude/rules/security.md`](.claude/rules/security.md), [`.claude/rules/secrets-management.md`](.claude/rules/secrets-management.md).

## Оговорки валидации (🟡 CAVEATS, Фаза 2 итерация 3, 88/100)

- N3-1…N3-3 внесены ПОСЛЕ валидации; `docs/validation-report.md` привязан к прежней ревизии Specification.
- Открыто у владельца: подтвердить OpenRouter (OWN-06B-007); числа песочницы 100/2000 и входа 10/час — решение исполнителя
  Фазы 1; OWN-06B-005 (превью-домены) — допущение координатора.
- Ворота выпуска: калибровка «не знаю» на 30 вопросах (SC-US-006-4) до открытия стенда посетителям.

## Parallel Execution Strategy

- Use `Task` tool for independent subtasks; tests, lint, typecheck — параллельно.
- **Every parallel unit delivers a FILE, not a reply.** Каждой единице — уникальный `WORK_UNIT_ID` и абсолютный
  `TRACE_PATH`; она пишет содержательное тело с последней строкой `Status: completed` или `Status: failed` до однострочного
  указателя. Мёртвый и работающий исполнитель одинаково молчат. Перед слиянием:
  `node .claude/hooks/check-swarm-receipts.cjs <manifest>` (0 — всё сдано, 1 — единица не сдана или failed, 2 — проверка
  не выполнена). Контракт: [`.claude/rules/swarm-file-evidence.md`](.claude/rules/swarm-file-evidence.md).
- Один писатель на файл; `package.json`, lockfile, `docker-compose.yml`, миграции правит только integration owner.

## Swarm Agents

| Сценарий | Агенты | Параллельно |
|---|---|---|
| Крупная фича (L/XL) | planner + architect + 2–3 исполнителя | да, по пакетам монорепо |
| Рефакторинг | code-reviewer + исполнители | да |
| Баг | 1 исполнитель | нет |

## Git Workflow

- Коммит после каждой логической правки; формат `type(scope): описание` (feat, fix, refactor, test, docs, chore).
- Коммиты по-русски, без `Co-Authored-By`; `.env` не коммитится. Правило: [`.claude/rules/git-workflow.md`](.claude/rules/git-workflow.md).

## Available Agents

| Агент | Когда |
|---|---|
| `planner` | разложить фичу на единицы по алгоритмам Pseudocode, тир роутера, порядок проверок |
| `architect` | решения по границам пакетов, ADR, новые таблицы и потоки данных |
| `code-reviewer` | ревью по Edge Cases Matrix Refinement, мутационная проверка стражей |

## Available Skills

Проектные: `project-context` (домен, персоны, решения владельца), `coding-standards` (стек и паттерны), `testing-patterns`
(уровни тестов, BDD, калибровка), `security-patterns` (серверный ключ, SSRF, origin, квоты), `feature-navigator` (дорожная карта).
Жизненный цикл (pre-shipped): `sparc-prd-mini`, `explore`, `goap-research-ed25519`, `problem-solver-enhanced`,
`requirements-validator`, `brutal-honesty-review`, `cc-toolkit-generator-enhanced`, `knowledge-extractor`, `pipeline-forge`,
`reverse-engineering-unicorn`.

## Quick Commands

`/start` — бутстрап монорепо по документам · `/next` · `/go <feature>` · `/feature <name>` · `/plan <name>` · `/run mvp` ·
`/deploy` · `/docs` · `/myinsights` · `/harvest`.

Стражи (0 — проверено, 1 — дефект, 2 — проверка НЕ выполнена):
`node .claude/hooks/check-ports.cjs .` · `bash ../../scripts/check-port-conflicts.sh projects/06b-rag-class` (из корня) ·
`node .claude/hooks/check-{model-cost,job-contract,embed-contract,external-deps}.cjs .`

## 🔍 Development Insights

Корень репозитория: `../../.claude/insights/index.md` (записи по N6 исключены — правило владельца №4). Перед отладкой — grep ошибки в индексе.
Новое: `/myinsights "<проблема и решение>"`.

## 🔄 Feature Development Lifecycle

`/feature <name>`: PLAN (sparc-prd-mini) → VALIDATE (requirements-validator, ≥ 70) → IMPLEMENT (параллельно, файловые
квитанции) → REVIEW (brutal-honesty-review). Перед `/go` и `/feature` — роутер сложности корня
`bash ../../scripts/complexity-router.sh <файлы>`: код 1 (L/XL) — полный цикл, XL — остановка на плане у владельца.
Политика моделей и телеметрия прогона — `../../docs/development/model-routing.md` (обязательны для `projects/*`).

## 📋 Feature Roadmap

[`.claude/feature-roadmap.json`](.claude/feature-roadmap.json) — 16 фич в порядке зависимостей, поля `tier` и `reuse`.
Первая — `foundation`. `/next` · `/next <id>` · `/next update`.

## 📝 Implementation Plans

[`docs/plans/`](docs/plans/) — `/plan <name>`; полный цикл фичи — `docs/features/<name>/`.

## 🚀 Automation Commands

`/go [feature]` — выбор пайплайна и реализация · `/run` или `/run mvp` — все MVP-фичи циклом · `/run all` · `/docs`.

## Resources

[`docs/PRD.md`](docs/PRD.md) · [`docs/Specification.md`](docs/Specification.md) · [`docs/Pseudocode.md`](docs/Pseudocode.md) ·
[`docs/Architecture.md`](docs/Architecture.md) · [`docs/ADR.md`](docs/ADR.md) · [`docs/Refinement.md`](docs/Refinement.md) ·
[`docs/Completion.md`](docs/Completion.md) · [`docs/test-scenarios.md`](docs/test-scenarios.md) ·
[`docs/decisions-owner.md`](docs/decisions-owner.md) · [`docs/validation-report.md`](docs/validation-report.md) ·
контракты `docs/{model-cost,long-job,embed,webhook}-contract.md` · [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md).
