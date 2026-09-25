# Карта инструментов N6 «Суфлёр»

Применён раздел «What Gets Generated vs Pre-shipped» правила
[`replicate-pipeline.md`](../../../.claude/rules/replicate-pipeline.md): стабильный инструментарий
наследуется из корня репозитория, здесь живут только добавления, привязанные к источнику. Карта
ничего не устанавливает: ни команды, ни хуки, ни сервисы, ни зависимости.

Сгенерировано 2026-09-25 агентом Phase 3 (Claude Opus 5.5, автономно) по документам, прошедшим
валидацию с вердиктом 🟡 CAVEATS и правками H1/M1/M2 (отчёт §9). Навык
`cc-toolkit-generator-enhanced` прочитан целиком: SKILL.md и модули 01–09. Образец формы — N5.

## Как применены модули генератора

| Модуль | Результат для N6 |
|---|---|
| 01 detect-parse | `pipeline_type = SPARC` (есть `Architecture.md` и `Solution_Strategy.md`, нет `docs/ddd/`, нет `docs/adr/`); `has_adr = true` (18 разделов `## ADR-` в `docs/ADR.md`); `has_external_apis = true` (OpenRouter), `has_database = true` (Postgres + pgvector, `pg` без ORM), `has_ddd = false`, `has_gherkin = false` (Gherkin внутри Specification, не `docs/tests/*.feature`); пакеты `apps/{web,worker,widget}`, `packages/{db,rag,queue}`; сервисы — 6 канона §6 |
| 02 analyze-map | P0: `CLAUDE.md`, `security.md`, `coding-style.md`; P0 conditional: `secrets-management.md` + `security-patterns/` (внешний API); P1: 3 агента, `project-context/`, `coding-standards/`, `testing.md`, роадмап; P2/P3 — ниже, у каждого отсутствия причина |
| 03 generate-p0 | pre-shipped из корня проверены на присутствие, не перегенерированы (skip-list модуля) |
| 04 generate-p1 | агенты и навыки проекта; `/plan`, `/deploy`, `/next`, `/go`, `/run`, `/docs` — pre-shipped корнем |
| 05 generate-p2p3 | не сгенерировано ничего (см. P2/P3) |
| 06 package-deliver | проверки ниже; заполнителей `{{…}}` и путей `/mnt/` нет |
| 08 skill-composition | копирование навыков жизненного цикла не требуется: они в корне; `responsive-ui` адаптирован из N5 (не копия) |
| 09 cross-project | реестра `knowledge-extractor/registry/` нет; перенос из N1–N5 идёт через `docs/reuse-inventory.md` и ADR-012…016, а не через реестр |
| 07 harvest-feedback | пост-проектный, до завершения N6 неприменим |

## P0 — наследуется из корня, read-only

| Способность | Источник в корне | Что делаем здесь |
|---|---|---|
| Команды жизненного цикла | `../../.claude/commands/{replicate,start,plan,feature,go,run,next,myinsights,docs,deploy,harvest}.md` | пользуемся; не копируем |
| Правила процесса | `../../.claude/rules/{feature-lifecycle,git-workflow,insights-capture,swarm-file-evidence,replicate-pipeline,skill-interface-protocol,complexity-router}.md` | пользуемся |
| Правила безопасности и честности | `../../.claude/rules/{security-operation-order,fail-closed-defaults,honest-configuration,silent-fallbacks,shared-resource-verification,guard-must-be-able-to-fail,model-call-cost,long-running-job,incoming-webhooks,embeddable-widget,cost-of-detection-ladder}.md` | пользуемся; локальные правила их СУЖАЮТ |
| Правила инфраструктуры | `../../.claude/rules/{docker-ports,compose-hygiene,deployment-seams,port-conflicts-local}.md` | скаффолды им подчиняются |
| Хуки и настройки | `../../.claude/hooks/` (25 файлов), `../../.claude/settings.json` | локальных хуков и `settings.json` не заводим |
| Навыки планирования и ревью | `../../.claude/skills/{sparc-prd-mini,requirements-validator,brutal-honesty-review,explore,goap-research-ed25519,problem-solver-enhanced,…}/` | грузим по требованию; не вендорим |

## P1 — сгенерировано здесь

| Артефакт | Связь с источником | Назначение |
|---|---|---|
| `CLAUDE.md` | `canon.md`, `validation-report.md` §5/§9, `Architecture.md`, `Specification.md` §1, `decisions-autonomous.md` | статус, оговорки фазы, порядок чтения, инварианты, режим «только Anthropic» |
| `.claude/agents/planner.md` | `Pseudocode.md` (34 алгоритма), `Specification.md`, `reuse-inventory.md` | единицы с идентификаторами, строками reuse и порядком операций |
| `.claude/agents/architect.md` | `Architecture.md`, `ADR.md` (18), `C4_Diagrams.md`, канон §4–§7 | закрытые списки, физика pgvector, внешние зависимости, когда нужен ADR |
| `.claude/agents/code-reviewer.md` | `Refinement.md` (Edge Cases, 16 стражей), `ADR.md` Confirmation | блокирующий чек-лист из 7 разделов, L1 в §7 |
| `.claude/rules/security.md` | Specification §1, NFR-SEC-001…004, ADR-003/004/005/008/010/018 | три чужих стороны, порядок операций, 152-ФЗ |
| `.claude/rules/coding-style.md` | Architecture «Technology Stack»/«Data», Pseudocode, канон | монорепо, TypeScript, SQL и pgvector, закрытые перечисления, грабли |
| `.claude/rules/testing.md` | `Refinement.md`, `Completion.md`, `test-scenarios.md` | слои, 6 конкурентных прогонов, 14 прогонов старта, 16 стражей, калибровка |
| `.claude/rules/secrets-management.md` | канон §6, `.env.example`, `docker-compose.yml` | секрет → сервис, отказ вместо дефолта, ротация |
| `.claude/skills/project-context/` | `PRD.md`, Specification §5/§7/§8, канон | персоны, путь H, словарь, числа, метрики, открытые вопросы |
| `.claude/skills/coding-standards/` | `Pseudocode.md`, `ADR.md` | 9 образцов с запрещённой формой рядом |
| `.claude/skills/security-patterns/` | Architecture Security, контракты, Refinement | 7 границ доверия, у каждой внедряемый дефект |
| `.claude/skills/responsive-ui/` | N5 `responsive-ui` (ADR-012), FR-LOOK-008…014 | адаптация: лендинг, кабинет, `/b/`, окно виджета на чужой странице |
| `.claude/feature-roadmap.json` | Specification §5/§7, ADR-012…016, `reuse-inventory.md` | 17 фич (16 mvp + 1 should), 43 SC без пересечений, 41 FR + 9 NFR покрыты, поле `reuse` с путями источников |
| `DEVELOPMENT_GUIDE.md` | `Completion.md`, `Refinement.md`, роадмап | цикл фичи, проверки и когда, выпуск, симптомы |
| `README.md` (дополнен) | фактическое состояние фаз | статус, вход в документацию |

## Скаффолды Phase 4 (написаны здесь, сборкой НЕ проверены)

| Файл | Что закреплено |
|---|---|
| `docker-compose.yml` | `name: ${N6_COMPOSE_PROJECT:-n6-sufler}`; ровно 6 сервисов канона; `db` (`pgvector/pgvector:0.8.6-pg16`) и `redis` (`redis:7.4-alpine`) без `ports:`; единственная публикация `127.0.0.1:${N6_HTTP_PORT:-8086}:80` у `proxy`; секреты, модели, `N6_PUBLIC_ORIGIN` и 14 `QUOTA_*` — `${VAR:?причина}`; `DATABASE_URL`/`REDIS_URL` собраны из паролей; healthcheck у всех долгоживущих, `service_healthy` и `service_completed_successfully` (migrate); `restart: unless-stopped` |
| `Dockerfile` | multi-stage из корня монорепо; цели `web`, `worker`, `migrate`, `test`; манифесты всех 6 workspace до `npm ci`; `node:22.22-alpine`; без браузера в воркере |
| `proxy/Dockerfile`, `proxy/Caddyfile` | xcaddy + `caddy-ratelimit@v0.1.0` с проверкой модуля на сборке (донор N4); 30/120 в минуту на `{client_ip}`; XFF заменяется; `immutable` для бандла; CORS и CSP не ставит |
| `.env.example`, `.gitignore`, `.dockerignore` | имена всех переменных, 14 потолков канона, пустые секреты; `.env` вне git и образов |

**Сверка с каноном, названная явно:** канон §6 перечисляет `DATABASE_URL` среди переменных без
значения по умолчанию. Приложение читает именно его, но в `.env` задаётся `N6_DB_PASSWORD`, а URL
собирается в compose — иначе пароль БД и URL приложения могли бы разойтись. Имя образа прокси
начинается с `caddy` намеренно (так стражи узнают reverse-proxy), `pull_policy: build`.
`compose.test.yml` (`name: n6-test`) — работа фичи `foundation`, здесь не создаётся.

## P2/P3 — отсутствуют, и у каждого отсутствия есть причина

| Кандидат | Причина |
|---|---|
| `.mcp.json` | у продукта нет MCP-поверхности: OpenRouter — обычный HTTPS из адаптера `packages/rag`. Пустой файл объявил бы интеграцию настроенной |
| `.claude/commands/*`, `settings.json`, локальные хуки | предотгружены корнем; локальная копия разойдётся с вендорной молча |
| `feature-ent.md`, DDD-агенты, `domain-model.md`, aggregate/event-навыки | `has_ddd = false`: `docs/ddd/` нет |
| `testing-patterns/`, `tdd-guide.md`, `/test`, `/review` | `rules/testing.md` несёт слои, прогоны и стражи; второй документ о том же разошёлся бы молча; `test.md` не входит в набор p-replicator |
| `feature-navigator/`, `feature-context.py` | `/next` предотгружен и читает роадмап напрямую |
| `skills.json` (модуль 08) | навыки не копировались — манифест копирования описывал бы пустоту |
| `package.json`, миграции, `compose.test.yml`, CI-файл | работа `foundation`; пустой скелет ради зелёного `up` — ложь (compose-hygiene п.7) |
| `docs/source-versions.md`, `dispatch-plan.md` | `check-source-version` и `check-canon` честно отвечают `2`; фан-аута записи в этой фазе не было |

## Оговорки отчёта валидации и куда перенесены

| Оговорка | Куда |
|---|---|
| H1/M1/M2 закрыты правками, повторного независимого прохода нет | `CLAUDE.md` статус; `DEVELOPMENT_GUIDE.md` §3; роадмап `notes.caveats_phase2` |
| L1: ADR-013/015 в квитанции первой фичи | роадмап (`widget-runtime-and-badge`, `visitor-ask-and-limits`, `public-page-and-summary`); `code-reviewer.md` §7 |
| Число правится по всем цитатам | `CLAUDE.md`; `coding-style.md` «Числа»; `coding-standards` §9 |
| 14 прогонов старта, не 10 | `testing.md`; `code-reviewer.md` §2; роадмап `foundation` |
| 2 `UNCONFIRMED` (Telegram, ЮKassa) | `architect.md`; роадмап `notes.deferred`; `project-context` |
| Порог 0.40 — гипотеза | `testing.md` калибровка; роадмап `rag-answer` |
| 152-ФЗ — открытый вопрос №1 | `security.md`; `project-context` |

## Что проверено на момент генерации

| Проверка | Команда | Код |
|---|---|---|
| Роадмап разбирается; 43/43 SC без пересечений; все FR/NFR покрыты; `depends_on` только на ранние фичи | `python3` (сверка с `Specification.md`) | `0` |
| Compose без `.env` | `docker compose --project-directory . config -q` | `1` — отказ, называет переменную (так и должно быть) |
| Compose с заполненными значениями | то же с `--env-file` (значения-заглушки в scratchpad, не в проекте) | `0`, 6 сервисов |
| Правило №0 | `node ../../.claude/hooks/check-ports.cjs .` (с заглушками в окружении) | `0`: 2 хранилища, 1 reverse-proxy; без окружения — `2` |
| Занятость портов и обход прокси | `bash ../../scripts/check-port-conflicts.sh projects/06-rag-sales-chatbase` | `0`, порт 8086 свободен |

Все проверки — на **декларацию**: ни один образ не собран, ни один контейнер не запущен.
