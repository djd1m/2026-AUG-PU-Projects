# `@dzhechkov/p-replicator` — установка и первичная настройка

Версия на момент проверки: **1.5.18** (npm dist-tag `latest`, опубликована 2026-08-25).
Все команды реально выполнены: read-only в рабочем репозитории `/home/user/2026-AUG-PU-Projects`,
write-операции — только во временных каталогах (`mktemp -d`, удалены после проверки).

## 1. Установка: два способа

| Способ | Команда | Особенность |
|---|---|---|
| Глобально | `npm i -g @dzhechkov/p-replicator` | Один раз в окружении, бинарь `p-replicator` в PATH |
| Разово через npx | `npx @dzhechkov/p-replicator init` | Скачивает/использует npx-кэш каждый запуск, глобального бинаря не оставляет |

Требования (`npm view @dzhechkov/p-replicator engines`): `node >= 16.0.0`. В окружении
курса стоит `node v22.22.2` — с запасом. Пакет уже стоит глобально:
`which p-replicator` → `/opt/node22/bin/p-replicator`, `--version` → `1.5.18`.
`npx @dzhechkov/p-replicator@1.5.18 --version` тоже отработал мгновенно (нашёл кэш).

**Что выбрать когда:**
- **Claude Code Web / Codespaces (эфемерный контейнер)** — `npx …@latest init` прямо в
  проекте. Глобальная установка бессмысленна: контейнер выбрасывается вместе с `/opt`,
  а важны файлы `.claude/` + `.p-replicator.json`, которые коммитятся в git и переживают
  пересоздание контейнера — не бинарь.
- **Локальный Mac/ПК или VPS (постоянное окружение)** — оправдан `npm i -g`: за 8 недель
  курса пакет понадобится в нескольких проектах, npx не будет резолвить его каждый раз.
- Минус npx-режима: лишняя сеть на резолв пакета без кэша. Минус глобальной установки:
  бинарь может отстать от версии, ожидаемой манифестом проекта, если давно не обновлялся.

## 2. Что ставит `init` — точная таблица

`init --dry-run` (реальный вывод):
```
[INFO] Installation plan:
  + Skills (10 skill packs)
  + Commands (orchestration + workflow)
  + Agents (4 orchestrators)
  + Rules (pipeline + workflow constraints)
  + Hooks config (settings.json)
  + Hook scripts (cross-platform Node)
[WARN] Dry run — no files were written.
```
Реальный `init` в чистом каталоге (проверено и с `git init`, и без git вообще — работает
одинаково) дал **134 файла**, что совпадает с `p-replicator list` в рабочем репозитории:

| Категория | Кол-во | Состав |
|---|---|---|
| Skills | 10 | `explore`, `sparc-prd-mini`, `goap-research-ed25519`, `problem-solver-enhanced`, `requirements-validator`, `brutal-honesty-review`, `cc-toolkit-generator-enhanced`, `reverse-engineering-unicorn`, `pipeline-forge`, `knowledge-extractor` |
| Commands | 11 | `/replicate`, `/harvest`, `/start`, `/plan`, `/feature`, `/go`, `/run`, `/next`, `/docs`, `/deploy`, `/myinsights` |
| Agents | 4 | `replicate-coordinator`, `product-discoverer`, `doc-validator`, `harvest-coordinator` |
| Rules | 5 | `replicate-pipeline`, `skill-interface-protocol`, `git-workflow`, `insights-capture`, `feature-lifecycle` |
| Hooks | settings.json + 6 скриптов | `session-insights.cjs`, `autocommit-roadmap.cjs`, `autocommit-insights.cjs`, `autocommit-plans.cjs`, `statusline.cjs`, `state-update.cjs` |
| **Итого файлов** | **134** | вкл. README/references/modules/scripts внутри скиллов |

**Важно про рабочий репозиторий**: там `p-replicator list` показывает 42 скилла, 15 команд,
7 правил — это НЕ p-replicator ставит больше, это два других пакета в том же `.claude/`
(см. раздел 8): `skills-feature-adr` добавил скилл `feature-adr`, команду `feature-adr.md`,
правила `feature-adr-conventions.md`/`feature-adr-ultracode.md`; `ruflo` добавил ~30 своих
скиллов и поддиректории команд (`agents/`, `swarm/`, `github/`, `sparc/` и т.д.).
`doctor`/`verify` считают «expected N» жёстко по своему pre-shipped списку и чужими
файлами не путаются.

## 3. Манифест `.p-replicator.json`

Прочитан в рабочем репозитории. Ключи: `version`, `installedAt`, `components`
(`skills/commands/agents/rules/settings/hooks`), `files` (135→134 путей — точный список
«своих» файлов, по которому `update`/`doctor`/`verify` решают, что проверять и что
перезаписывать; чужие файлы вроде `feature-adr.md` там не упомянуты и пайплайном не
трогаются), и `shippedDefaults.settings.json` — полный снэпшот `settings.json`, каким его
положил именно этот `init`.

`shippedDefaults` нужен, чтобы `update` мог вычислить diff «эталон → текущее состояние»
и понять, где пользователь дописал что-то своё, а где это часть исходного шаблона — без
этого снэпшота merge настроек (раздел 5) был бы невозможен.

## 4. Проверки: `doctor` vs `verify`

Оба запущены в рабочем репозитории (read-only). **`doctor`** (exit `0`) проверяет только
pre-shipped контракт: 10 скиллов, 11 команд, 4 агента, 5 правил, `settings.json`, 6 скриптов,
`git` в PATH, опциональную интеграцию с `@dzhechkov/keysarium` (не стоит → warning, не
ошибка). Итог: `[OK] All checks passed with 1 warning(s).`

**`verify`** (exit `0`) — то же самое плюс проверка post-`/replicate` артефактов Phase 3:
`planner.md`, `code-reviewer.md`, `architect.md`, `security.md`, `coding-style.md`,
`testing.md`, `CLAUDE.md`, `feature-roadmap.json`, `DEVELOPMENT_GUIDE.md`,
`docker-compose.yml`. В рабочем репозитории реально найден только `CLAUDE.md`, остальные 9
помечены `! … (not found)` — но это не ошибка: `[OK] Pre-shipped contract OK (9
post-replicate hint(s)).` — отсутствие означает «`/replicate` ещё не запускали (или не
полностью)», не поломку.

Разница: `doctor` = «установка p-replicator цела»; `verify` = то же + «статус прохождения
пайплайна `/replicate`». Оба вернули `exit 0` даже с warning/hint — падение ненулевым
кодом при реально сломанной установке (пропавший файл, отсутствующий манифест) не
проверялось намеренно (нельзя ломать рабочий репозиторий).

## 5. Обновление: `update`, merge vs `--reset-settings`

Проверено во временном каталоге: `init`, ручная правка `settings.json` (добавлен кастомный
Stop-хук `echo custom-user-hook` + поле `customUserField`) и `explore/SKILL.md` (дописана
строка), затем `update`.

`update --dry-run` без правок (версии совпадают): `+0 new / ~0 modified / =134 unchanged` →
`[OK] Already up to date!`. С правками: `~2 modified` (`settings.json`,
`explore/SKILL.md`).

`update` **без флагов**:
```
[INFO] Merged settings.json with user customizations (use --reset-settings to overwrite)
[OK]   Updated 2 files to version 1.5.18
```
Результат: в `settings.json` кастомный хук и `customUserField` **полностью сохранены**
(diff с состоянием до update — только отсутствие финального `\n`). А `explore/SKILL.md` —
локальная правка **молча перезаписана** штатным содержимым: merge есть **только** для
`settings.json`, для остальных файлов манифеста его нет.

**⚠️ Ключевой вывод**: любой файл из манифеста при расхождении, кроме `settings.json`,
`update` перезапишет целиком без предупреждения о потере правок и без `--force`.
Кастомизировать безопасно можно фактически только `settings.json`.

`update --reset-settings` (добавлен второй кастомный хук перед прогоном):
```
Modified files:
  ~ .claude/settings.json
[OK]   Updated 1 files to version 1.5.18
```
`settings.json` **полностью заменён** на `shippedDefaults` из манифеста — оба кастомных
добавления пропали, `hooks.Stop` вернулся ровно к трём штатным командам.

**Почему это важно здесь**: `.claude/settings.json` в рабочем репозитории уже несёт
добавки `ruflo` (`env.CLAUDE_FLOW_*`, `permissions.allow` для claude-flow/MCP — раздел 8).
`p-replicator update --reset-settings` в этом проекте стёр бы их одним махом. Обычный
`update` без флага этого не делает — merge сохраняет посторонние top-level ключи.

## 6. Флаги

| Флаг | Проверенное действие | Когда нужен | Опасность |
|---|---|---|---|
| `--dry-run` | Только печатает план/diff, ничего не пишет | Всегда перед `init`/`update` в незнакомом проекте | Нет |
| `--force` | `init --force` переустанавливает все 134 файла поверх существующих (правка `explore/SKILL.md` стёрта) | Восстановить эталонное состояние pre-shipped файлов | Стирает ЛЮБЫЕ локальные правки, включая `settings.json`, без merge |
| `--reset-settings` | Действует на `update`; полностью заменяет `settings.json` на `shippedDefaults` | `settings.json` сломан/испорчен | Стирает интеграции других пакетов (ruflo env/permissions, кастомные хуки) |

`init` без флагов на уже установленном каталоге ничего не делает:
`[WARN] P-Replicator is already installed… Run update, or use --force`.

## 7. Установка в новый проект с нуля (проверенная последовательность)

Проверено в двух чистых временных каталогах — с `git init` и без него, оба варианта
отработали одинаково (git для самого `init` не обязателен; `doctor` лишь проверяет, что
бинарь `git` есть в PATH):

```bash
mkdir my-new-project && cd my-new-project
git init                                   # нужен для /replicate (autocommit-хуки)

npx @dzhechkov/p-replicator@latest init    # или p-replicator init при глобальной установке
                                            # → .claude/{skills,commands,agents,rules,hooks}
                                            #   + .claude/settings.json + .p-replicator.json

p-replicator doctor                        # [OK] All checks passed
p-replicator verify                        # [OK] + статус /replicate ("ещё не запускали")

# открыть Claude Code Web / Codespaces / локально в папке → выполнить /replicate "идея"
```

Реальный вывод `init`: `[1/6]…[6/6] Installing …` → `[OK] P-Replicator installed! Total
files: 134`.

## 8. Совместимость с `skills-feature-adr` и `ruflo`

По `git log -p -- .claude/settings.json` в рабочем репозитории видна история установки:
```
02459d8 Install ruflo (claude-flow) plugin for Claude Code (v3.38.20)
f8e4816 Install @dzhechkov/p-replicator toolkit (v1.5.18)
```
Порядок: **сначала p-replicator, потом ruflo**. Коммит ruflo сам сообщает:
`settings.json merged (p-replicator hooks preserved)` — diff подтверждает: ruflo только
**добавил** ключи `env` (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, `CLAUDE_FLOW_V3_ENABLED`,
`CLAUDE_FLOW_HOOKS_ENABLED`) и `permissions.allow` (`Bash(npx @claude-flow*)`,
`mcp__claude-flow__*`), не тронув `hooks.SessionStart`/`hooks.Stop`/`statusLine` от
p-replicator. Итоговый `settings.json` — валидный union.

`skills-feature-adr` `settings.json` вообще не трогает — только добавляет файлы: скилл
`feature-adr/`, команду `feature-adr.md`, правила `feature-adr-conventions.md` и
`feature-adr-ultracode.md`. Пересечений имён с p-replicator (`/feature` ≠ `/feature-adr`)
не найдено.

**Никто никого не затёр** — на момент проверки все три пакета сосуществуют корректно
благодаря (а) правильному порядку установки (p-replicator первым, чтобы его
`settings.json` стал базой для merge) и (б) отсутствию совпадающих имён файлов в
`.claude/{skills,commands,agents,rules}`.

**Предупреждение для инструкции**: обратный порядок (сначала ruflo/feature-adr, потом
`p-replicator init`) не тестировался напрямую. Логика `update`-merge опирается на
`shippedDefaults`, который создаётся именно в момент `init` — то есть **первый** `init` не
может смержить уже существующий чужой `settings.json`, он либо создаёт файл с нуля, либо
(поведение при существующем чужом файле не проверялось — см. «Не проверено»). Практическая
рекомендация, подтверждённая фактическим состоянием репозитория: **ставить `p-replicator
init` первым**, до `ruflo`/`skills-feature-adr`.

## 9. Грабли — сводка

- `update` без `--reset-settings` мержит **только** `settings.json`; любой другой файл из
  манифеста при расхождении перезаписывается молча — не редактируйте руками файлы внутри
  pre-shipped `.claude/skills/…` и т.п., правки не переживут `update`.
- `--reset-settings` и `--force` оба стирают сторонние правки `settings.json` (в т.ч.
  интеграции ruflo) — не запускать их здесь без предварительного `--dry-run`.
- `doctor`/`verify` считают «expected N» только по своим pre-shipped спискам — соседство
  30+ скиллов ruflo не мешает и не флагуется, но и не подтверждает целостность ruflo (за
  неё отвечает `ruflo doctor`, вне периметра этой задачи).
- Манифест `.p-replicator.json` — единственный источник истины о «своих» файлах; его
  повреждение/удаление, видимо, ломает `doctor`/`update`/`verify`, но сценарий не
  проверялся намеренно.

## Не проверено

- Поведение `doctor`/`verify` на реально повреждённой установке (удалён файл, испорчен
  манифест) — не тестировалось, чтобы не трогать рабочий репозиторий.
- `p-replicator remove` — есть в `--help`, не запускалась (риск необратимо снести
  `.claude/`).
- Поведение `init` на каталоге, где чужой `settings.json` уже существует, а
  `.p-replicator.json` ещё нет (порядок «ruflo первым») — не воспроизводилось; вывод в
  разделе 8 — по аналогии с механикой `update`, не по прямому тесту.
- Интеграция с `@dzhechkov/keysarium` (упомянута в `doctor` как опциональная) — пакет не
  установлен, что он добавляет — не изучалось.
- Поведение под Windows/PowerShell — все проверки в Linux; хуки названы
  «cross-platform Node», Windows-ветка не тестировалась.
- Точный exit code при ошибках (`node` < 16, отсутствующий `git`) — не воспроизводился,
  обе зависимости в этом окружении удовлетворены.
