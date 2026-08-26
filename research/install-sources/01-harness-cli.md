# `@dzhechkov/harness-cli` (`dz`) — установка и адаптация тулкита под платформу

Все данные ниже получены запуском реальных команд `dz@0.7.8` (уже стоит глобально в этой
среде, бинарь `/opt/node22/bin/dz` → symlink на `.../harness-cli/dist/bin.js`) и чтением
исходников пакета. Проверки на запись выполнялись только во временных каталогах
(`mktemp -d`), репозиторий проекта не тронут ни одной изменяющей командой.

## 1. Установка

```bash
npm i -g @dzhechkov/harness-cli
```

Факты из `npm view @dzhechkov/harness-cli`:

- `engines.node`: `>=20` (в среде стоит Node v22.22.2 — с запасом).
- Прямых зависимостей пакета — **17**, но `npm i -g` (проверено `--dry-run`
  переустановкой той же версии) реально разворачивает **74 пакета** (транзитивные —
  сборка нативного `better-sqlite3`, sqlite-биндинги, `bindings`, `bl`, `chownr` и т.д.).
  Заняло **~5.7 с** на уже тёплом npm-кеше.
- Занимает на диске: `du -sh .../harness-cli` → **46 MB** (из них 43 MB — `node_modules`,
  47 директорий верхнего уровня внутри).
- Среди 17 прямых зависимостей — **не только ядро**, но и заранее навешанные skill-паки:
  `@dzhechkov/skills-academic`, `skills-devops`, `skills-ecc`, `skills-idea2prd`,
  `skills-mcp`, `skills-meta`, `skills-news`, `skills-pm`, `skills-presentation-storyteller`,
  `skills-qe`, `skills-reverse-engineering`, `skills-taste`, `skills-web3`,
  `skills-website-cloner`, плюс `@dzhechkov/harness-core`, `harness-presets`, `scout`.
  Это значит: **часть пресетов работает "из коробки" сразу после `npm i -g`**, без
  дополнительной установки (см. раздел 4) — потому что их skill-паки уже лежат внутри
  `harness-cli`'s собственного `node_modules`.

Что происходит: `npm i -g` просто ставит один пакет с зависимостями в глобальный
`node_modules`, бинарь `dz` регистрируется через `bin` в `package.json`. Никакого
постинсталл-скрипта, трогающего проект, не запускается.

## 2. Проверка работоспособности

```bash
dz --version        # 0.7.8
dz --version --json # {"name":"dz","version":"0.7.8","node":"v22.22.2","schemas":{"loopPlan":"loop-plan/1"}}
dz --help           # список 60+ команд (см. ниже)
dz doctor
```

Реальный вывод `dz doctor` в этом репозитории:

```
dz doctor (v22.22.2):
  [OK] node >= 20 - node v22.22.2
  [OK] .claude/skills present - .claude/skills
  [OK] monorepo checks - consumer project (no packages/@dzhechkov) — skills-meta/adapter checks are the MONOREPO's own duty and are skipped here by kind, not by silence
  [OK] aqe config valid - no .agentic-qe/config.yaml (optional)
  [OK] sqlite backend - better-sqlite3 not installed (JSON fallback)
  [OK] skills health - 42/42 skill dirs have SKILL.md
  signatures: 32 verified, 0 unsigned, 0 TAMPERED, 0 unverifiable, 0 source-tree (not an artifact); trust root: packaged (/opt/node22/lib/node_modules/@dzhechkov/harness-cli/keys/dz.pub)
```

Что значат пункты (все `[OK]` в норме, это не ошибки, а информационные строки):

- **monorepo checks — "consumer project"**: doctor понимает, что это не сам репозиторий
  `dz-harness-hub`, а проект-потребитель тулкита, поэтому проверки согласованности пакетов
  монорепы (skills-meta/adapter) он просто пропускает — это не сбой, а корректная ветка.
- **sqlite backend — "not installed (JSON fallback)"**: `better-sqlite3` — нативный
  опциональный модуль. Он резолвится из `node_modules` самого `harness-cli`
  (`require('better-sqlite3')` из каталога пакета — успешно), но **не** из корня проекта
  (`require` из `/home/user/2026-AUG-PU-Projects` — `Cannot find module`). Раз в проекте
  своего `better-sqlite3` нет, `dz` в контексте проекта тихо откатывается на
  JSON-хранилище памяти/бэклога — это deliberate graceful degradation, не поломка.
- **signatures: 32 verified, 0 TAMPERED**: у всех 42 SKILL.md-каталогов проверена
  Ed25519-подпись пакета по встроенному публичному ключу — целостность подтверждена.

Норма — все строки `[OK]`, ноль `TAMPERED`, ноль `unverifiable`. Любое `TAMPERED` или
`unverifiable` в `signatures:` — повод не доверять пакету.

## 3. Целевые платформы — главный вопрос задачи

`dz --help` в самом конце:

```
Targets: claude-code, codex, opencode, hermes, openclaude, copilot, agents-md, cursor, gemini, windsurf
```

Ровно **10 платформ**. Формат вывода на диске для каждой (проверено установкой одного
и того же скилла `ab-test-analysis` в 8 временных проектах, `--no-hooks` чтобы не трогать
глобальный конфиг):

| `--target`    | Куда пишется скилл                              |
|---------------|--------------------------------------------------|
| `claude-code` | `.claude/skills/<id>/SKILL.md`                   |
| `codex`       | `.agents/skills/<id>/SKILL.md`                   |
| `opencode`    | `.opencode/skills/<id>/SKILL.md`                 |
| `openclaude`  | `.openclaude/skills/<id>/SKILL.md`               |
| `hermes`      | `.hermes/skills/<id>/SKILL.md`                   |
| `cursor`      | `.cursor/rules/<id>.mdc`                         |
| `windsurf`    | `.windsurf/rules/<id>.md`                        |
| `copilot`     | `.github/instructions/<id>.instructions.md`      |
| `agents-md`   | один общий файл `AGENTS.md` (все скиллы слиты)   |
| `gemini`      | один общий файл `GEMINI.md` (все скиллы слиты)   |

`agents-md` и `gemini` — единственные "плоские" таргеты: они не создают папку на скилл,
а агрегируют **все** выбранные скиллы в один корневой файл за один проход (в коде это
явно выделено: обычные таргеты компилируются по каждой найденной `skills-dir` в цикле,
а `agents-md`/`gemini` — одним слитным вызовом, чтобы поздний каталог не затёр скиллы
раннего).

### `dz parity` — честная матрица фич × платформ

```bash
dz parity           # текстовая таблица
dz parity --json    # структурированная версия
```

Реальный вывод (`✓` = full, `◐` = manual, `—` = недоступно):

```
  feature                                                cc cdx ocd hrm ocl cop amd cur gem wsf
  dz CLI (all commands)                                   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
  Skill packs (compiled per target)                       ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
  feature-adr pipeline                                    ✓   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐
  Step-10 Delivery Gate                                   ✓   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐
  Adversarial challenge-panel (plan gate)                 ✓   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐
  Integrity claim-check                                   ✓   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐
  Self-learning: collect + rank (dz teach/recall)         ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
  Self-learning: automatic apply-leg                      ✓   ?   ◐   ◐   ◐   ◐   ◐   ◐   ◐   ◐
  Live 🚦 gates status line                               ✓   —   —   —   —   —   —   —   —   —
  Deterministic project guards (setup --guards)           ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
  Verified release + signing (dz release/sign/sbom)       ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
  MCP memory (AgentDB, agentic-qe)                        ✓   ◐   —   —   —   —   —   —   —   —
```

**Ключевой вывод для тезиса пользователя.** "Полный паритет" (`✓` во всех столбцах) есть
только у трёх вещей: сама `dz`-CLI, компиляция скиллов под таргет, и `dz teach/recall`
(база самообучения) — это **чистые shell-команды**, которым не важен хост-агент.
Всё, что завязано на возможности самого агента (feature-adr как *автоматический*
пайплайн, Step-10 Delivery Gate, challenge-panel, claim-check, авто-применение
self-learning), на всех платформах кроме `claude-code` помечено `◐` — "**manual**":
доступно и работает, но **агент сам не запускает шаги пайплайна** — человек (или
Codex/Cursor вручную) должен вызывать `dz`-команды пошагово, а не полагаться на то,
что скилл-инструкция сама развернёт весь 11-шаговый пайплайн, как это делает Claude
Code через свой Skill-раннер с хуками.

Причина видна в `capabilities` (`dz parity --json`):

```json
"claude-code": ["shell","skills","hooks-write","hooks-shell","hooks-prompt","mcp","mcp-configured","workflows","statusline"],
"codex":       ["shell","skills","mcp","hooks-shell","hooks-prompt"],
"opencode":    ["shell","skills"],
"cursor":      ["shell","skills"],
... (все остальные, кроме codex, только ["shell","skills"])
```

Только `claude-code` и (частично) `codex` умеют `hooks-write`/`hooks-prompt`/`mcp` —
то, на чём держится автоматизация фаз пайплайна. У Cursor, OpenCode, Gemini, Windsurf,
Copilot, Hermes, OpenClaude, agents-md-хостов из возможностей — только `shell` и `skills`:
они могут **прочитать** SKILL.md/.mdc-файл и **выполнить shell-команду**, но не имеют
хуков и MCP-конфигурации, которые Claude Code использует для автозапуска пайплайна.

Отдельно `dz parity --json` содержит блок `staleEvidence` — честное признание, что
одна из записей о codex устарела:

```json
{"target":"codex","capability":"hooks-prompt","reason":"stale-runtime-version",
 "evidence":"features/crossrt-2-codex-hooks/07_code_changes/probe-results/recall-canary.md",
 "recordedVersion":"codex-cli 0.147.0","probedVersion":"codex-cli 0.148.0"}
```
— т.е. авторы сами отмечают, когда матрица получена на более старой версии Codex CLI,
чем текущая, и это может разойтись.

### Установка под Codex / Cursor / OpenCode на практике

```bash
dz init --target cursor   --select <skill-ids>          # → .cursor/rules/*.mdc
dz init --target opencode --select <skill-ids>          # → .opencode/skills/<id>/SKILL.md
dz init --target codex    --select <skill-ids>          # → .agents/skills/<id>/SKILL.md
```

`--target codex` — единственный таргет, у которого `init`/`setup` делает **дополнительный
шаг** сверх записи скиллов (дословно из `dz --help`):

> `--target codex` ALSO installs the user-global dz veto+recall hooks and LIVE-verifies
> them (ADR-001 §8); `--no-hooks` = skills only; `--no-verify` skips the live probe and
> can never report ready.

Это подтверждено чтением `dz hooks-sync --help`-блока: `dz hooks-sync --target codex
[--check] [--verify] [--remove]` — ставит/проверяет hooks.json в `$CODEX_HOME/hooks.json`
(**глобально для пользователя**, не в репозитории). Проверено безопасной read-only
командой в этой среде:

```
$ dz hooks-sync --target codex --check
dz hooks-sync: no `codex` binary on PATH — nothing was written
dz hooks-sync: ARMED = NO — the managed entries are not present in the registry
exit 3
```

Т.е. в этой среде Codex CLI физически не установлен — `dz` это честно обнаруживает
(`no codex binary on PATH`) и ничего не пишет (exit-код 3 = "inconclusive", не 0 и не 1).
Это подтверждает, что "ADR-001 §8" — реальный, тестируемый механизм: `dz` **живьём**
проверяет, что хук встал и Codex его подхватил, а не просто копирует файл.

## 4. Пресеты и выборочная установка

`dz --help`:
```
Presets: academic, meta, qe-engineer, bto, reasoning, health, keysarium, p-replicator, feature-adr, devops, web3, mcp, news, pm
```
Ровно **14 пресетов**. Полный список и состав вытащен из исходника
`@dzhechkov/harness-presets/dist/presets.js` (нашёл через `dz init --preset <bad>`→
подсказку и прямой поиск пакета в `node_modules`):

| Пресет | Скиллов | Что внутри (кратко) |
|---|---|---|
| `meta` | 20 | процесс разработки: explore, feature-adr, knowledge-extractor, design-thinking, adversarial-verifier, decision-mockups и т.д. |
| `qe-engineer` | 20 | QE: генерация тестов, coverage, chaos, QCSD-swarm'ы, brutal-honesty-review |
| `bto` | 1 | Build-Benchmark-Test-Optimize (toolkit `@dzhechkov/skills-bto`) |
| `reasoning` | 4 | investigate, solid, karpathy-guidelines, agents-md-creator |
| `health` | 8 | медицинский ИИ (toolkit `@dzhechkov/health-advisor`) |
| `keysarium` | 9 | полный research-toolkit (toolkit `@dzhechkov/keysarium`) |
| `p-replicator` | 10 | explore, cc-toolkit-generator-enhanced, sparc-prd-mini и т.д. (toolkit `@dzhechkov/p-replicator`) |
| `feature-adr` | 9 | 11-шаговый feature-пайплайн (toolkit `@dzhechkov/skills-feature-adr`) |
| `devops` | 29 | ревью кода, security-audit, CI/CD, k8s, terraform, incident-response |
| `web3` | 12 | блокчейн RPC, кошельки, свопы, identity |
| `mcp` | 16 | MCP-серверы (Gmail, Google Sheets, ClickUp, Notion, Context7...) |
| `academic` | 5 | защита диссертации/ГЭК |
| `news` | 3 | дайджесты новостей + goap-research |
| `pm` | 18 | продуктовый менеджмент (RICE/ICE, OKR, roadmap, GTM) |

**Уже установлено в этой среде (часть работает сразу):** `academic`, `devops`,
`meta`, `news`, `pm` частично, `web3` (только те скиллы, что реально идут в vendored
пакетах — `skills-academic`, `skills-devops`, `skills-meta`, `skills-news`,
`skills-pm`, `skills-web3`, `skills-mcp`, `skills-idea2prd`, `skills-ecc`,
`skills-presentation-storyteller`, `skills-qe`, `skills-reverse-engineering`,
`skills-taste`, `skills-website-cloner` — они являются прямыми зависимостями
`harness-cli`). Пресеты с полем `toolkit` (`bto`, `health`, `keysarium`,
`p-replicator`, `feature-adr`) — это **не** отдельные npm-пакеты со скиллами внутри
`harness-cli`; при попытке `dz init --preset p-replicator` без установленного
toolkit-пакета `dz` явно отвечает:

```
⚠️  10 skill(s) not found in any installed pack: explore, ...
   The 'p-replicator' preset is backed by a standalone toolkit. Install the full set with:
   npx @dzhechkov/p-replicator init
```

(В этом проекте `p-replicator init` и `skills-feature-adr init` уже были выполнены
раньше отдельными npm-пакетами — именно поэтому в `.claude/skills` уже лежат
`feature-adr`, `sparc-prd-mini`, `cc-toolkit-generator-enhanced` и т.д., а не через
`dz init --preset`.)

**`--preset` vs `--select id,id,...`**: пресет — это именованный, версионированный
список id (curated set), `--select` — ручной произвольный список id через запятую.
Разница чисто в источнике списка id, дальше оба идут по одному и тому же пути
установки (`installSkills`). `--select` полезен, когда нужен один-два скилла без
всего пресета; пресет — когда нужен целый согласованный набор одной командой.

### ВАЖНАЯ ГРАБЛЯ, найденная экспериментально

`dz init --preset X --skills-dir <dir>` **не находит** скиллы из встроенных
`skills-*`-пакетов, если передан явный `--skills-dir` — эта опция **отключает**
автообнаружение пакетов (`discoverSkillsDirs`: если `explicitSkillsDir` задан,
функция возвращает **только** этот один каталог, полностью игнорируя
`node_modules/@dzhechkov/skills-*` и собственную папку `harness-cli`).

```bash
# НЕ находит пакеты — --skills-dir отключает автопоиск:
dz init --preset pm --target cursor --skills-dir .claude/skills
# ⚠️ 18 skill(s) not found in any installed pack

# Находит — без --skills-dir дефолт сам сканирует .claude/skills
# + node_modules/@dzhechkov/skills-* + собственную папку CLI:
dz init --preset pm --target cursor
# dz init --target cursor: 18 skill(s), 18 file(s) written, 0 skipped
#   (searched 15 skill directories)
```

Проверено дважды на реальных временных проектах. Это не описано явно в `--help`,
только в комментарии исходника (`discoverSkillsDirs` в `dist/cli.js`). Практический
вывод: **не указывайте `--skills-dir` вместе с `--preset`, если хотите, чтобы `dz`
сам нашёл встроенные паки** — используйте `--skills-dir` только когда скиллы лежат
в нестандартном месте и вы явно перечисляете их через `--select`.

## 5. Команды проверки после установки

| Команда | Что проверяет | Exit-коды (реально пронаблюдал) |
|---|---|---|
| `dz verify` | Что каждый скилл в `.claude/skills` валиден для указанного `--target` (по умолчанию `claude-code`) | В репо: `dz verify (claude-code): 42/42 skill(s) valid` → 0 |
| `dz list` | Просто перечисляет установленные скиллы с описанием | В репо: 42 скилла, alphabetically |
| `dz skills-verify --static` | **Layout-скан**: лежат ли валидные `SKILL.md` в папках (мгновенно, для CI) | В репо: 42 регистрируемых, "no layout problems found", exit 0. Явно предупреждает: `(static is a PROXY — run without --static to read the real registration listing)` |
| `dz skills-verify` (без `--static`) | Читает **реальный** список зарегистрированных скиллов из живой сессии (system/init listing) — отличает "лежит в папке" от "агент его реально увидел" | Не запускал (требует живую CC-сессию с system listing) — см. "Не проверено" |

Разница `--static` vs полный режим — то, о чём явно предупреждает сама команда: layout
на диске может быть валиден, но это не доказывает, что агент (Claude Code / Codex /
Cursor) скилл действительно подхватил и зарегистрировал в своём рантайме. Именно
поэтому `skills-verify` без `--static` — более сильная, но требует реальной сессии.

## 6. Обновление и синхронизация

- `dz sync` (алиас — `dz update`): предназначена для **монорепы** `dz-harness-hub` —
  сверяет копии скиллов в проектах-потребителях с "каноническим" источником
  (`packages/@dzhechkov/skills-meta`). В обычном проекте-потребителе (как этот)
  канонической папки нет, поэтому:
  ```
  $ dz sync --dry-run
  dz sync --dry-run: 0/0 in sync, 0 missing, 0 drift
  dz sync: 0 canonical skill(s) found under .../packages/@dzhechkov/skills-meta
    — nothing was compared, and nothing-compared is not a clean sync
  exit 3
  ```
  Т.е. для обычного проекта (не монорепа авторов) `dz sync` в этом виде не
  применим напрямую — он про обслуживание самой библиотеки скиллов, а не про
  "подтянуть новую версию скилла в мой проект".
- `dz upgrade [--target <name>] [--pubkey <path>] [--require-signing]` — обновляет
  установленные паки под таргет; **тамперенный (не прошедший подпись) пак прерывает
  апгрейд** — не выполнял (изменяет репозиторий), только прочитал описание в `--help`.
- Для обновления самой CLI — обычный `npm i -g @dzhechkov/harness-cli@latest`
  (npm сам решит diff зависимостей, как показал `--dry-run` тест выше — 74 пакета).

## 7. `dz install <npm-pkg>` — установка стороннего skill-пакета

Проверено на реальном примере во временном каталоге (не в репозитории):

```bash
dz install @dzhechkov/skills-pm --project <tmp>
```
Вывод:
```
Installing @dzhechkov/skills-pm...
dz install @dzhechkov/skills-pm: 18 skill(s), 18 file(s) written, 0 skipped
  ab-test-analysis: 1 written, 0 skipped
  ... (все 18 скиллов пакета)
```
Результат — `.claude/skills/<id>/SKILL.md` для каждого скилла пакета (таргет по
умолчанию — `claude-code`, `--target` не был передан). Значит `dz install <npm-pkg>`
= "скачать/зарезолвить произвольный npm-пакет со скиллами и сразу скомпилировать
все его скиллы под нужный таргет одной командой", в отличие от `dz init`, который
работает только с уже присутствующими локально пакетами.

## Грабли — сводка

1. **`--skills-dir` + `--preset`/`--select` = скиллы "не найдены"**, если это
   встроенные (vendored) паки — см. раздел 4. Решение: не задавать `--skills-dir`
   вручную, дать `dz` сканировать самому.
2. **Пресеты с `toolkit`-полем** (`bto`, `health`, `keysarium`, `p-replicator`,
   `feature-adr`) не разворачиваются через `dz init --preset`, если соответствующий
   npm-пакет-toolkit не установлен отдельно (`npx <toolkit> init`) — `dz` сам это
   говорит текстом подсказки, не падает молча.
3. **`dz sync`/`dz update`** — не "подтяни новую версию моего скилла", а
   "сверь копию с каноническим источником монорепы"; в обычном проекте вернёт
   exit 3 ("nothing-compared is not a clean sync"), а не 0.
4. **`dz doctor`: "better-sqlite3 not installed"** — не ошибка, а деградация до
   JSON-хранилища; проверить наличие быстрее всего `node -e "require('better-sqlite3')"`
   из корня проекта.
5. **`--target codex` трогает глобальный `$CODEX_HOME/hooks.json`**, а не только
   файлы проекта — если Codex CLI не установлен/не на PATH, `dz` честно откажется
   писать (`no codex binary on PATH`, exit 3), но на реальной машине с Codex это
   **user-global** побочный эффект, не project-local — стоит предупреждать студентов
   заранее.
6. **`dz parity`** — большинство "продвинутых" фич (feature-adr пайплайн, Step-10
   Delivery Gate, challenge-panel, claim-check) на всех платформах кроме
   `claude-code` помечены `◐ manual` — это не "не работает", а "не работает
   автоматически": нужен человек, который вручную дергает `dz`-команды по шагам,
   т.к. только `claude-code`/`codex` имеют hooks/MCP-возможности для автозапуска.
7. Запрещено (по заданию и по здравому смыслу) гонять `dz init` без флагов,
   `dz sync --force`, `dz upgrade` в рабочем репозитории — все они пишут/
   перезаписывают файлы; тестировать такие команды только во временных каталогах.

## Не проверено

- **`dz skills-verify` без `--static`** — требует чтения "authoritative
  system/init listing из реальной сессии" (живого Claude Code / Codex рантайма с
  system-промптом), что не эмулируется голым запуском `dz` в терминале среды.
  Не запускал, чтобы не спекулировать выводом.
- **Реальная установка под живой Codex CLI** (`--target codex` без `--no-hooks`) —
  не выполнял намеренно: это глобальная (user-global) операция, трогающая
  `$CODEX_HOME/hooks.json` за пределами проекта/песочницы; к тому же в этой среде
  сам бинарь `codex` отсутствует (`dz hooks-sync` это подтвердил: "no codex binary
  on PATH"), так что LIVE-проверку из ADR-001 §8 здесь физически нельзя пронаблюдать.
- **Установка под реальный Cursor/OpenCode как приложение** (открывает ли Cursor
  `.cursor/rules/*.mdc` автоматически, подхватывает ли OpenCode `.opencode/skills/`)
  — это уже вопрос к самим этим программам, не к `dz`; `dz parity` заявляет
  `skills: full` для них, но живого Cursor/OpenCode в этой среде нет, чтобы
  проверить фактическое подхватывание файла приложением.
- **`dz upgrade`** живьём — не выполнял, так как это операция записи/потенциальной
  перезаписи установленных паков (запрещено заданием трогать репозиторий).
- **`dz sync --force` / полный `dz init` в реальном монорепо** `dz-harness-hub`
  (он есть на диске: `/home/user/dz-harness-hub`) — не трогал, задание просило
  работать с целевым проектом `2026-AUG-PU-Projects`, а не с исходной монорепой.
- **Скорость/трафик `npm i -g` "с нуля"** — измерил только `--dry-run`
  переустановку той же версии на тёплом кеше (5.7 с, 74 пакета изменено); реальная
  установка "с нуля" на чистой машине (холодный кеш, сеть) может быть заметно
  медленнее — не тестировал, так как это разрушило бы существующую установку в
  среде.
