# Карта инструментов N4 «Тарелка»

Применён раздел «What Gets Generated vs Pre-shipped» правила
[`replicate-pipeline.md`](../../../.claude/rules/replicate-pipeline.md): стабильный рабочий
инструментарий наследуется из корня репозитория, здесь живут только добавления, привязанные к
источнику. Карта ничего не устанавливает: ни команды, ни хуки, ни сервисы, ни зависимости.

## P0 — наследуется из корня, read-only

| Способность | Источник в корне | Что делаем здесь |
|---|---|---|
| Команды жизненного цикла | `../../.claude/commands/{replicate,start,plan,feature,go,run,next,myinsights,docs,deploy,harvest}.md` | пользуемся; не копируем и не переопределяем |
| Правила процесса | `../../.claude/rules/{feature-lifecycle,git-workflow,insights-capture,swarm-file-evidence,replicate-pipeline,skill-interface-protocol}.md` | пользуемся |
| Правила безопасности и честности | `../../.claude/rules/{security-operation-order,fail-closed-defaults,honest-configuration,silent-fallbacks,shared-resource-verification,guard-must-be-able-to-fail,model-call-cost,long-running-job,cost-of-detection-ladder}.md` | пользуемся; локальные правила их сужают, а не переписывают |
| Правила инфраструктуры | `../../.claude/rules/{docker-ports,compose-hygiene,deployment-seams,port-conflicts-local,complexity-router}.md` | пользуемся; скаффолды ниже им подчиняются |
| Хуки и настройки | `../../.claude/hooks/`, `../../.claude/settings.json` | пользуемся как установленными; локальных хуков и локального `settings.json` не заводим |
| Навыки планирования и ревью | `../../.claude/skills/{sparc-prd-mini,requirements-validator,brutal-honesty-review,explore,goap-research-ed25519,problem-solver-enhanced,cc-toolkit-generator-enhanced,knowledge-extractor,pipeline-forge,reverse-engineering-unicorn}/` | загружаем по требованию; не вендорим |
| Оркестрация | корневой `CLAUDE.md`, политика моделей и телеметрия p-replicator | второго оркестратора не создаём |

## P1 — сгенерировано здесь

| Артефакт | Связь с источником | Назначение |
|---|---|---|
| `.claude/agents/planner.md` | Pseudocode (17 алгоритмов), Specification, canon | разложение на единицы с названными идентификаторами и порядком операций |
| `.claude/agents/architect.md` | Architecture, ADR-001…010, C4, canon §6 | границы сервисов, владение данными, внешние зависимости |
| `.claude/agents/code-reviewer.md` | Refinement (edge cases, критические пути), ADR Confirmation | блокирующее ревью источника числа, квоты, аренды, владения |
| `.claude/rules/security.md` | NFR-SEC-001/002, FR-AUTH-001…003, Security Architecture | порядок операций, особая категория ПДн, граница входа, anti-fraud |
| `.claude/rules/coding-style.md` | Architecture (Stack, Data), Pseudocode, canon | монорепо, единицы, время, PostgreSQL без ORM-магии, грабли стека |
| `.claude/rules/testing.md` | Refinement (Testing Strategy, критические пути), ADR Confirmation | слой по природе признака, конкурентные прогоны, испытание стражей |
| `.claude/rules/secrets-management.md` | Architecture (Security), Completion, DEC-A-009 | какой секрет какому сервису, отказ вместо дефолта, ротация |
| `.claude/skills/project-context/SKILL.md` | PRD, Specification, canon, decisions-autonomous | границы недели, актёры, словарь, числа канона |
| `.claude/skills/coding-standards/SKILL.md` | Pseudocode, ADR | девять образцов реализации и порядок шагов маршрутов |
| `.claude/skills/security-patterns/SKILL.md` | Security Architecture, контракты стоимости и долгой задачи | образцы границ доверия с кодом проверок |
| `.claude/skills/feature-navigator/SKILL.md` | схема роадмапа корня, эксперимент EXP-N4-001 | выбор фичи, смена статуса, плечи эксперимента |
| `.claude/feature-roadmap.json` | PRD, Specification, Architecture, Pseudocode, ADR | восемь MVP-фич в порядке зависимостей с `source_ids` |
| `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, `.gitignore` | Architecture (6 сервисов), Completion (Deployment), правила инфраструктуры | скелет стека Phase 4 |
| `README.md`, `DEVELOPMENT_GUIDE.md`, дополненный `CLAUDE.md` | Completion, фактическое состояние | честная ориентация владельца и разработчика |

## P2/P3 — отсутствуют, и у каждого отсутствия есть причина

| Кандидат | Состояние | Причина |
|---|---|---|
| Локальные команды, `SessionStart`/`Stop` хуки, локальный `settings.json` | нет | корневой toolkit уже ими владеет; дублирование разветвило бы поведение молча |
| `.mcp.json` и плагины поставщиков | нет | у MVP нет авторизованной MCP/A2A-поверхности; Anthropic и Telegram — обычный HTTPS через адаптер |
| DDD-агенты, `/feature-ent`, `domain-model.md`, aggregate/event-навыки | нет | дерева DDD-документов нет; конвейер SPARC, `has_ddd = false` |
| `testing-patterns/` навык | нет | правило `.claude/rules/testing.md` уже несёт слои и обязательные конкурентные прогоны; второй документ о том же разошёлся бы с первым молча |
| `/test`, `/deploy` локальные копии | нет | `/deploy` пре-шипнут корнем; `test.md` не входит в набор p-replicator вовсе |
| `Caddyfile`, миграции, `package.json` монорепо | нет | это работа фичи `foundation`, а не карты; пустой скелет ради зелёного `up` — та же ложь, что «сценарий добавлен ≠ требование закрыто» |
| CI/CD-конвейер | нет | план стадий есть в `Completion.md`; выпускать его как файл до существования кода означало бы объявить конвейер настроенным |

## Что проверено на момент генерации

| Проверка | Команда | Код |
|---|---|---|
| Валидность compose | `docker compose config` (и с `COMPOSE_PROFILES=app,edge,test`) | `0` |
| Правило №0: хранилища наружу не смотрят | `node ../../.claude/hooks/check-ports.cjs .` | `0` |
| Занятость портов этой машины и обход прокси | `bash ../../scripts/check-port-conflicts.sh .` | `0` |
| Образы только с явным тегом | `grep -nE '^\s+image:\s+[^:@]+$' docker-compose.yml` | пусто |
| Роадмап разбирается | `python3 -c "import json;json.load(...)"` | `0`, 8 фич |

Проверка `check-ports.cjs` сообщает: «НЕ распознаны и не проверялись: api, recognizer, test, web».
Это правда и она не скрывается: инструмент распознаёт хранилища и reverse-proxy, а прикладные
сервисы в его область не входят. Публикацию у `web` отдельно проверил
`check-port-conflicts.sh` — и именно он вернул `1` на черновике, где `web` публиковал хостовый
порт рядом с `proxy`. Публикация снята, повторный прогон дал `0`.

Обе проверки на **декларацию**, а не на поведение: ни один сервис не развёрнут, ни один образ не
собран, `Dockerfile` не проверен сборкой. Предсказанный остаточный риск здесь тот же, что в
проекте 01: логика `Dockerfile` без прогона сборки уже один раз оказалась тремя реальными
дефектами, и первым делом фичи `foundation` должен быть `docker compose build`.

## Ворота трассировки документов

Пакетный чекер вызывается из кэша npx: в `node_modules` пакета нет, и `require.resolve` не
работает (DEC-A-010). Путь и версию писать в квитанции каждой фичи:

```bash
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh \
  . --traceability \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

Локальный `scripts/check-pipeline-gaps.sh` пакетный не подменяет. Отсутствие проверки не
объявляется пройденными воротами.
