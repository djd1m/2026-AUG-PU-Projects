# Квитанция единицы `toolkit-writer`

**RUN_ID:** 20260912T171708Z-replicate-04-phase1-4-sparc-0c00
**WORK_UNIT_ID:** toolkit-writer
**Задача:** Phase 3 (project-specific toolkit, навык `cc-toolkit-generator-enhanced`) и Phase 4
(скаффолды) проекта `projects/04-calorie-vision-cal-ai`.
**Дата:** 2026-09-12
**requested:** `claude-opus-5` · **actual:** unknown to worker (метаданные исполнения этой единице
недоступны; строка не является подтверждением фактической модели)
**Коммитов не делал.**

## Прочитано до генерации

Навык целиком: `SKILL.md`, `modules/README.md` (skip-list пре-шипнутых), `modules/01-detect-parse.md`,
`02-analyze-map.md`, `03-generate-p0.md`, `04-generate-p1.md`, `06-package-deliver.md`.
Правила: `replicate-pipeline.md` («What Gets Generated vs Pre-shipped»), `docker-ports.md`,
`port-conflicts-local.md`, `compose-hygiene.md`, `deployment-seams.md`, `silent-fallbacks.md`,
`complexity-router.md`, `guard-must-be-able-to-fail.md`, `shared-resource-verification.md`,
`security-operation-order.md`, `fail-closed-defaults.md`, `honest-configuration.md`,
`model-call-cost.md`, `long-running-job.md`, `skill-interface-protocol.md`.
Прецедент: `../03a-affiliate-rewardful/.claude/**`, `docs/toolkit-map.md`, `compose.yaml`,
`Dockerfile`, `.env.example`, `.gitignore`, `.dockerignore`, `README.md`, `DEVELOPMENT_GUIDE.md`,
`CLAUDE.md`.
Вход проекта: `Specification.md` (734), `Architecture.md` (301), `Pseudocode.md` (443), `ADR.md` (263),
`Refinement.md` (187), `Completion.md` (122), `canon.md` (105), `model-cost-contract.md`,
`long-job-contract.md`, `decisions-autonomous.md`, `dispatch-plan.md`, `PRD.md` §1, `README.md`,
проектный `CLAUDE.md`; эксперимент `2026-09-12-n4-profile-ab.md` §3 и §8.

IPM: конвейер `SPARC`; `has_external_apis = true`, `has_database = true` (postgres, raw SQL),
`has_ddd = false` (дерева `docs/ddd/` нет), `has_adr = true` (10 решений в `docs/ADR.md`),
`has_authentication = true`. Пре-шипнутые команды, хуки, `settings.json` и базовые правила корня
**проверены на наличие и не переопределялись**.

## Созданные файлы (19)

| Файл | Строк |
|---|---|
| `.claude/agents/planner.md` | 88 |
| `.claude/agents/code-reviewer.md` | 103 |
| `.claude/agents/architect.md` | 94 |
| `.claude/rules/security.md` | 100 |
| `.claude/rules/coding-style.md` | 98 |
| `.claude/rules/testing.md` | 102 |
| `.claude/rules/secrets-management.md` | 74 |
| `.claude/skills/project-context/SKILL.md` | 94 |
| `.claude/skills/coding-standards/SKILL.md` | 82 |
| `.claude/skills/security-patterns/SKILL.md` | 111 |
| `.claude/skills/feature-navigator/SKILL.md` | 86 |
| `.claude/feature-roadmap.json` | 269 |
| `docs/toolkit-map.md` | 85 |
| `docker-compose.yml` | 220 |
| `Dockerfile` | 82 |
| `.dockerignore` | 18 |
| `.env.example` | 52 |
| `.gitignore` | 12 |
| `DEVELOPMENT_GUIDE.md` | 126 |

## Изменённые файлы (2)

| Файл | Строк | Что изменено |
|---|---|---|
| `README.md` | 97 | раздел «Статус» (Phase 1–4 ✅, реализация ⬜), новый раздел «Как запустить», дерево структуры |
| `CLAUDE.md` | 184 | новые разделы «Проектный toolkit», «Feature lifecycle и roadmap», «Скаффолды Phase 4»; строка состояния; закомментирован несуществующий `check-env-wiring.sh` |

## Документ → артефакт

| Источник | Артефакт |
|---|---|
| `Pseudocode.md` (17 алгоритмов, порядок шагов) | `agents/planner.md`, `skills/coding-standards` |
| `Refinement.md` (edge cases, критические пути, трассировка 26 SC) | `agents/code-reviewer.md`, `rules/testing.md` |
| `Architecture.md` + `ADR.md` + `C4_Diagrams.md` | `agents/architect.md`, `rules/coding-style.md`, `docker-compose.yml`, `Dockerfile` |
| `Specification.md` NFR-SEC + FR-AUTH + критерии безопасности | `rules/security.md`, `skills/security-patterns` |
| `Architecture.md` Security + `Completion.md` + DEC-A-009 | `rules/secrets-management.md`, `.env.example` |
| `PRD.md` + `Specification.md` + `canon.md` | `skills/project-context` |
| `PRD.md` MVP + `Specification.md` + `ADR.md` + зависимости `Architecture.md` | `.claude/feature-roadmap.json` |
| схема роадмапа корня + эксперимент EXP-N4-001 | `skills/feature-navigator` |
| `Completion.md` Deployment + правила инфраструктуры | скаффолды Phase 4, `DEVELOPMENT_GUIDE.md` |
| `replicate-pipeline.md` «Pre-shipped vs Generated» | `docs/toolkit-map.md` |

Роадмап: 8 фич MVP, линейный порядок зависимостей, у каждой `source_ids` из FR/NFR/ADR/SC.
Тир M (`complexity: medium`) у `diary-and-streak` и `share-card-and-growth-events` — кандидаты
контролируемых пар EXP-N4-001, причина выбора названа в `skills/feature-navigator` и
`DEVELOPMENT_GUIDE.md`.

## Коды проверок

| Проверка | Команда | Код |
|---|---|---|
| Валидность compose (профили по умолчанию) | `docker compose config` | **0** |
| Валидность compose (все профили) | `COMPOSE_PROFILES=app,edge,test docker compose config` | **0** |
| Правило №0 (хранилища наружу) | `node ../../.claude/hooks/check-ports.cjs .` | **0** |
| То же со всеми профилями | `COMPOSE_PROFILES=app,edge,test node ../../.claude/hooks/check-ports.cjs .` | **0** |
| Порты машины и обход прокси | `bash ../../scripts/check-port-conflicts.sh .` | **0** |
| То же со всеми профилями | `COMPOSE_PROFILES=app,edge,test bash ../../scripts/check-port-conflicts.sh .` | **0** (после исправления, см. ниже) |
| Образы без тега | `grep -nE '^\s+image:\s+[^:@]+$' docker-compose.yml` и тот же grep по `docker compose config` | пусто |
| JSON роадмапа | `python3 -c "import json;json.load(...)"` | **0**, 8 фич |
| Плейсхолдеры `{{…}}`/TODO/TBD | `grep -rnE` по всем созданным файлам | не найдено |
| Объём файлов | `wc -l` | максимум 269, предел 500 |
| Разрешаемость ссылок | обход всех markdown-ссылок созданных файлов | 0 битых (2 исправлены) |

Временный `.env` с фиктивными значениями создавался только для `docker compose config` и проверок
портов и **удалён**; `.env` покрыт `.gitignore` и `.dockerignore`.

## Найденный и исправленный дефект

Черновик `docker-compose.yml` публиковал `web` на `127.0.0.1:${N4_WEB_PORT:-4184}:3000` — как и
просила постановка («в профиле `dev`»). `check-port-conflicts.sh` со всеми профилями вернул **1**:

```
== За reverse-proxy приложение не публикуется ==
  ❌ есть reverse-proxy, но наружу публикуют также: web
```

Дефект настоящий, а не педантизм проверки: Caddy держит ограничение частоты, которое по
`security-operation-order` работает ДО валидации тела, и опубликованный рядом `web` снимает его
вместе со всем, что прокси гарантирует. Публикация у `web` снята (`expose: ["3000"]`), причина
записана комментарием в самом файле, `N4_WEB_PORT` убран из `.env.example` с объяснением, почему его
не надо возвращать. Повторный прогон — **0**.

Профилем `dev` требуемое поведение выразить нельзя: в compose профиль управляет запуском сервиса, а
не публикацией его портов, а отдельный седьмой сервис нарушил бы канон §6 («ровно 6 сервисов»).
Прямой доступ к `web` для отладки — разовый `docker compose run --service-ports`, в файл не
коммитится.

## Отклонения от постановки (все в сторону более строгой проверки)

1. **`web` без хостового порта** вместо публикации в профиле `dev` — причина выше, доказана
   проверкой.
2. **Digest закреплены у всех четырёх образов**, включая minio и caddy, хотя постановка разрешала
   для них тег без digest. Значения не выдуманы: прочитаны из локального хранилища образов этой
   машины (`docker images --digests`) — `minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29…`,
   `caddy:2.10-alpine@sha256:4c6e91…`; postgres и node взяты из `../03a-affiliate-rewardful/compose.yaml`.
3. **`ANTHROPIC_API_KEY` только у `recognizer`, `TELEGRAM_BOT_TOKEN` только у `api`.**
   `Architecture.md` пишет «только в окружении `api` и `recognizer`», но `api` модель не вызывает
   (Component Breakdown), и ключ у него был бы привилегией без назначения. Сужение сохраняет
   объявленный инвариант «у `web` нет чем позвать модель» и делает его проверяемым построчно.
4. **`ANTHROPIC_API_KEY` объявлен как `${ANTHROPIC_API_KEY:-}`, а не `:?required`.** Ключа на машине
   нет (DEC-A-009), по умолчанию работает адаптер `fake`. Условие «ключ обязателен» зависит от режима
   и потому проверяется кодом при старте, а не подстановкой compose; это записано комментарием.
5. **`test.md`, `testing-patterns/`, `.mcp.json`, DDD-артефакты и локальный `settings.json` не
   созданы** — по skip-листу `modules/README.md` и разделу «Pre-shipped» правила конвейера. Причина
   каждого отсутствия названа в `docs/toolkit-map.md`.
6. **Caddyfile не создан и не примонтирован.** Bind-mount несуществующего файла создал бы каталог и
   сломал бы `up` молча; профиль `edge` до фичи `foundation` поднимать нечего.

## Что НЕ проверено и почему

- **Сборка образов.** `Dockerfile` не проверен `docker build`: исходников, `package.json` монорепо и
  workspace-манифестов не существует. Это предсказанный остаточный риск того же класса, что в
  проекте 01, где все три предсказанных дефекта `Dockerfile` оказались реальными. Первым шагом фичи
  `foundation` должен быть `docker compose build`, а не `up`.
- **Проверка HEIF у `sharp`.** В stage `build` стоит утверждение, роняющее сборку при `sharp` без
  HEIF. Оно не исполнялось ни разу: исполнить его нечем до появления `package.json`.
- **Healthcheck'и.** Команды `pg_isready`, `mc ready local`, `net.connect` и `wget` по admin-порту
  Caddy разобраны компоновщиком (`docker compose config` → 0), но ни один контейнер не запускался.
- **`scripts/check-env-wiring.sh` ОТСУТСТВУЕТ в репозитории**, хотя на него ссылаются
  `docs/Completion.md`, проектный `CLAUDE.md` и корневое правило `deployment-seams.md` (страж №1).
  Проверено `ls scripts/`: есть `check-pipeline-gaps.sh`, `check-port-conflicts.sh`,
  `check-superseded.sh`, `complexity-router.sh`. Пробел записан в трёх местах
  (`rules/testing.md`, `CLAUDE.md`, `DEVELOPMENT_GUIDE.md`) и отнесён к работе фичи `foundation`.
  Проброс переменных до его появления остаётся суждением, а не воротами.
- **`check-ports.cjs` не разбирает прикладные сервисы.** Его собственный вывод: «НЕ распознаны и не
  проверялись: api, recognizer, test, web». Публикацию у них проверил второй скрипт — и именно он
  нашёл дефект. Область обеих проверок — ДЕКЛАРАЦИЯ, не поведение.
- **Ворота трассировки `check-pipeline-gaps.sh` не прогонялись** этой единицей: они относятся к
  фазовым воротам конвейера и вызываются координатором, с записью пути кэша npx и версии (DEC-A-010).

Status: completed
