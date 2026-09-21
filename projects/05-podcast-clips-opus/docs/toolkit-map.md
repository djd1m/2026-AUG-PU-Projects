# Карта инструментов N5 «КлипМейкер»

Применён раздел «What Gets Generated vs Pre-shipped» правила
[`replicate-pipeline.md`](../../../.claude/rules/replicate-pipeline.md): стабильный рабочий
инструментарий наследуется из корня репозитория, здесь живут только добавления, привязанные к
источнику. Карта ничего не устанавливает: ни команды, ни хуки, ни сервисы, ни зависимости.

Сгенерировано 2026-09-21 единицей `toolkit-writer` Phase 3 по документам, прошедшим валидацию с
вердиктом 🟡 CAVEATS.

## P0 — наследуется из корня, read-only

| Способность | Источник в корне | Что делаем здесь |
|---|---|---|
| Команды жизненного цикла | `../../.claude/commands/{replicate,start,plan,feature,go,run,next,myinsights,docs,deploy,harvest}.md` | пользуемся; не копируем и не переопределяем |
| Правила процесса | `../../.claude/rules/{feature-lifecycle,git-workflow,insights-capture,swarm-file-evidence,replicate-pipeline,skill-interface-protocol,complexity-router}.md` | пользуемся |
| Правила безопасности и честности | `../../.claude/rules/{security-operation-order,fail-closed-defaults,honest-configuration,silent-fallbacks,shared-resource-verification,guard-must-be-able-to-fail,model-call-cost,long-running-job,incoming-webhooks,embeddable-widget,cost-of-detection-ladder}.md` | пользуемся; локальные правила их СУЖАЮТ, а не переписывают |
| Правила инфраструктуры | `../../.claude/rules/{docker-ports,compose-hygiene,deployment-seams,port-conflicts-local}.md` | пользуемся; скаффолды им подчиняются |
| Хуки и настройки | `../../.claude/hooks/` (25 файлов), `../../.claude/settings.json` | пользуемся как установленными; локальных хуков и локального `settings.json` не заводим |
| Навыки планирования и ревью | `../../.claude/skills/{sparc-prd-mini,requirements-validator,brutal-honesty-review,explore,goap-research-ed25519,problem-solver-enhanced,cc-toolkit-generator-enhanced,knowledge-extractor,pipeline-forge,reverse-engineering-unicorn}/` | загружаем по требованию; не вендорим |
| Оркестрация | корневой `CLAUDE.md`, политика моделей и телеметрия p-replicator | второго оркестратора не создаём |

## P1 — сгенерировано здесь

| Артефакт | Связь с источником | Назначение |
|---|---|---|
| `CLAUDE.md` (корень проекта) | `canon.md`, `validation-report.md` §7, `Architecture.md`, `Specification.md`, `decisions-*.md` | контекст, статус, порядок чтения, ключевые инварианты, оговорки фазы |
| `.claude/agents/planner.md` | `Pseudocode.md` (34 алгоритма), `Specification.md`, `canon.md` | разложение на единицы с названными идентификаторами и порядком операций |
| `.claude/agents/architect.md` | `Architecture.md`, `ADR.md` (8 решений с Confirmation), `C4_Diagrams.md`, `canon.md` §5–6 | границы сервисов, закрытые списки путей и процедур, что обеспечивает база, когда нужен новый ADR |
| `.claude/agents/code-reviewer.md` | `Refinement.md` (Edge Cases, 12 стражей, 13 тестов «сначала красное»), `ADR.md` Confirmation | блокирующее ревью: квота, фенс, метка, согласие, владение, секреты |
| `.claude/rules/security.md` | NFR-SEC-001/002, `Architecture.md` Security, ADR-002/004/007/008 | порядок операций таблицей, границы файла, fail-closed, `404` вместо `403`, anti-fraud |
| `.claude/rules/coding-style.md` | `Architecture.md` Technology Stack и Data, `Pseudocode.md`, `canon.md` §4, `compose-hygiene.md` | монорепо, TypeScript, Prisma и сырой SQL, единицы и время, закрытые перечисления |
| `.claude/rules/testing.md` | `Refinement.md` целиком, `Completion.md` Pre-Deployment, `test-scenarios.md` | слой по природе признака, 5 конкурентных прогонов, 12 стражей, что считается зелёным |
| `.claude/rules/secrets-management.md` | `canon.md` §6, `C4_Diagrams.md`, `Completion.md`, `.env.example` | какой секрет какому сервису, отказ вместо дефолта, ротация |
| `.claude/skills/project-context/SKILL.md` | `PRD.md`, `Specification.md` §5–8, `canon.md`, `decisions-*.md` | границы недели, актёры, словарь, числа канона, метрики и их оговорки |
| `.claude/skills/coding-standards/SKILL.md` | `Pseudocode.md` (квота, идемпотентность, фенс, рендер), `Architecture.md` | восемь образцов реализации с запрещёнными формами рядом |
| `.claude/skills/security-patterns/SKILL.md` | `Architecture.md` Security, четыре контракта, ADR-004/007/008 | шесть границ доверия, у каждой внедряемый дефект |
| `.claude/feature-roadmap.json` | `Specification.md` §7 Feature Matrix, §5 истории, `Architecture.md`, `ADR.md` | 12 фич MVP в линейном порядке зависимостей, все 35 `SC-US` распределены без пересечений |
| `DEVELOPMENT_GUIDE.md` | `Completion.md`, `Refinement.md`, `dispatch-plan.md`, роадмап | цикл разработки, какие стражи и когда, cross-family, проверка на стенде |
| `README.md` (дополнен) | фактическое состояние фаз | статус и вход в документацию, разделы курса сохранены |

## Скаффолды — написаны координатором, здесь НЕ трогаются

`docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, `.gitignore`,
`proxy/Caddyfile` существуют на 21.09.2026 и принадлежат координатору Phase 2/4. Проектный тулкит
на них ссылается и их не переписывает: два места с одним правилом расходятся молча.

| Файл | Что в нём закреплено |
|---|---|
| `docker-compose.yml` | 7 сервисов боевого профиля плюс `minio` и `test` в профиле `test`; `name:` объявлен; хранилища без `ports:`; единственный публикуемый порт — `127.0.0.1:${N5_EDGE_PORT:-4181}` у Caddy в профиле `edge`; все секреты и шесть `N5_LIMIT_*` объявлены `${VAR:?…}`; образы с явными тегами; `healthcheck` и `restart: unless-stopped` |
| `.env.example` | имена всех переменных и неопасные значения потолков; поля секретов пусты |
| `Dockerfile` | multi-stage, цели `web`, `worker`, `test`; контекст сборки — корень монорепо |

## P2/P3 — отсутствуют, и у каждого отсутствия есть причина

| Кандидат | Состояние | Причина |
|---|---|---|
| `.mcp.json` | **нет** | у продукта нет ни одной авторизованной MCP/A2A-поверхности. Обе модели (OpenAI Audio API, Anthropic Messages API) и объектное хранилище — обычный HTTPS через адаптер внутри воркера, а не MCP-сервер. Файл с пустым списком серверов объявил бы интеграцию настроенной |
| `.claude/commands/*` | **нет** | все нужные команды предотгружены корнем (11 штук). Локальная копия при ближайшем `update` разойдётся с вендорной молча |
| `.claude/settings.json`, локальные хуки | **нет** | корневой toolkit ими владеет; второй `settings.json` разветвил бы поведение |
| `.claude/commands/feature-ent.md`, DDD-агенты, `domain-model.md`, навыки aggregate/event | **нет** | дерева DDD-документов нет: `docs/ddd/` отсутствует, конвейер SPARC, `has_ddd = false`. `/feature-ent` без DDD-документов — команда, которой нечего читать |
| `testing-patterns/` навык | **нет** | правило `.claude/rules/testing.md` уже несёт слои, пять конкурентных прогонов и 12 стражей; второй документ о том же разошёлся бы с первым молча |
| `/test`, `/deploy` локальные копии | **нет** | `/deploy` предотгружен корнем; `test.md` не входит в набор p-replicator вовсе и в списках команд не рекламируется |
| `feature-navigator/` навык | **нет** | команда `/next` предотгружена и читает `.claude/feature-roadmap.json` напрямую; на 12 фичах в линейном порядке отдельный навигатор ничего не добавляет |
| `package.json` монорепо, миграции, `Caddyfile` сверх существующего | **нет** | это работа фичи `foundation`, а не карты. Пустой скелет ради зелёного `docker compose up` — та же ложь, что «сценарий добавлен ≠ требование закрыто» |
| CI/CD-конвейер как файл | **нет** | план стадий `test → build → deploy` есть в `Completion.md`; выпускать его файлом до существования кода означало бы объявить конвейер настроенным |
| `docs/source-versions.md` | **нет** | `check-source-version` отвечает `2` («проверка НЕ выполнена») и это записано в отчёте валидации §6, а не выдано за `0` |

## Оговорки §7 отчёта валидации и куда они перенесены

Вердикт 🟡 CAVEATS означает, что ограничения фазы переносятся в заметки тулкита, а не исчезают на
границе фазы. Каждая из шести получила адрес:

| Оговорка | Куда перенесена |
|---|---|
| 1. Механизм 38 расхождений не устранён: цитата числа отстаёт от владельца | `CLAUDE.md` § статус; `coding-standards` §8 (числа берутся из одного места, не переписываются) |
| 2. Спецификация заморожена на `3ac09f3d…` | `CLAUDE.md` § статус |
| 3. Утверждения о поведении SQL выведены чтением | `testing.md` § «Чего проверки доказать не могут»; `security-patterns` § заключение |
| 4. Совместимость Cloud.ru не доказана | `CLAUDE.md` § статус; `testing.md`; `project-context` § нерешённые вопросы |
| 5. Две `UNCONFIRMED` зависимости не входят в неделю | `feature-roadmap.json` → `notes.deferred`; `architect.md` § внешние зависимости; `project-context` |
| 6. Живой прогон ничего не проверял | `testing.md` § «Чего проверки доказать не могут»; `project-context` § нерешённые вопросы |

## Что проверено на момент генерации

| Проверка | Команда | Код |
|---|---|---|
| Роадмап разбирается, 12 фич, 35 `SC-US` без пересечений | `python3 -c "import json; …"` | `0` |
| Канон назван и привязан | `node ../../.claude/hooks/check-canon.cjs .` | см. квитанцию единицы |
| Правило №0: хранилища наружу не смотрят | `node ../../.claude/hooks/check-ports.cjs .` | `0` на момент Phase 2 |
| Занятость портов этой машины и обход прокси | `bash ../../scripts/check-port-conflicts.sh .` | `0` на момент Phase 2 |

Все проверки — на **декларацию**, а не на поведение: ни один сервис не развёрнут, ни один образ не
собран, `Dockerfile` сборкой не проверен. Предсказанный остаточный риск тот же, что в проекте 01:
логика `Dockerfile` без прогона сборки уже один раз оказалась тремя реальными дефектами. Первым
делом фичи `foundation` должен быть `docker compose build`.
