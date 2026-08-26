# `@dzhechkov/harness-cli` (`dz`) — установка и адаптация тулкита под платформу

Все факты ниже — из реальных команд `dz@0.7.8` (глобально стоит: `/opt/node22/bin/dz` →
symlink на `.../harness-cli/dist/bin.js`) и чтения исходников пакета. Все проверки на
запись выполнены только во временных каталогах (`mktemp -d`) — репозиторий не тронут.

## 1. Установка

```bash
npm i -g @dzhechkov/harness-cli
```

Из `npm view @dzhechkov/harness-cli`:
- `engines.node: >=20` (в среде — v22.22.2).
- 17 прямых зависимостей, но реальный `npm i -g` (проверено `--dry-run` переустановкой
  той же версии) разворачивает **74 пакета** (транзитивно: сборка `better-sqlite3` и
  нативных биндингов). ~5.7 с на тёплом кеше. На диске: `du -sh` → **46 MB** (43 MB —
  `node_modules`, 47 подкаталогов верхнего уровня).
- Среди 17 прямых зависимостей — не только ядро (`harness-core`, `harness-presets`,
  `scout`), но и **14 готовых skill-паков** (`skills-academic`, `skills-devops`,
  `skills-ecc`, `skills-idea2prd`, `skills-mcp`, `skills-meta`, `skills-news`,
  `skills-pm`, `skills-presentation-storyteller`, `skills-qe`,
  `skills-reverse-engineering`, `skills-taste`, `skills-web3`, `skills-website-cloner`) —
  часть пресетов (раздел 4) работает сразу после `npm i -g`, без доп. установки.

Постинсталл-скрипта, трогающего проект, нет — просто пакет в глобальный
`node_modules`, бинарь регистрируется через `package.json#bin`.

## 2. Проверка работоспособности

```bash
dz --version        # 0.7.8
dz --version --json # {"name":"dz","version":"0.7.8","node":"v22.22.2","schemas":{"loopPlan":"loop-plan/1"}}
dz --help           # 60+ команд
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
  signatures: 32 verified, 0 unsigned, 0 TAMPERED, 0 unverifiable, 0 source-tree; trust root: packaged (.../harness-cli/keys/dz.pub)
```

Что значат строки (все `[OK]` — норма, не ошибки):
- **monorepo checks / consumer project** — doctor узнал, что это проект-потребитель,
  а не сама монорепа `dz-harness-hub`, и корректно пропустил её внутренние проверки.
- **sqlite backend — "not installed"** — `better-sqlite3` резолвится из `node_modules`
  самого `harness-cli` (`require()` оттуда — успешно), но не из корня проекта
  (`Cannot find module`). `dz` тихо откатывается на JSON-хранилище — осознанная
  деградация, не поломка.
- **signatures: 32 verified, 0 TAMPERED** — у всех 42 SKILL.md проверена Ed25519-
  подпись пакета по встроенному ключу. Норма — `0 TAMPERED`, `0 unverifiable`.

## 3. Целевые платформы — главный вопрос задачи

`dz --help`:
```
Targets: claude-code, codex, opencode, hermes, openclaude, copilot, agents-md, cursor, gemini, windsurf
```
Ровно **10 платформ**. Куда пишется скилл (проверено установкой одного и того же
скилла `ab-test-analysis` в 8 временных проектах, `--no-hooks`):

| `--target` | Куда пишется |
|---|---|
| `claude-code` | `.claude/skills/<id>/SKILL.md` |
| `codex` | `.agents/skills/<id>/SKILL.md` |
| `opencode` | `.opencode/skills/<id>/SKILL.md` |
| `openclaude` | `.openclaude/skills/<id>/SKILL.md` |
| `hermes` | `.hermes/skills/<id>/SKILL.md` |
| `cursor` | `.cursor/rules/<id>.mdc` |
| `windsurf` | `.windsurf/rules/<id>.md` |
| `copilot` | `.github/instructions/<id>.instructions.md` |
| `agents-md` | один общий `AGENTS.md` (все скиллы слиты) |
| `gemini` | один общий `GEMINI.md` (все скиллы слиты) |

`agents-md`/`gemini` — единственные "плоские" таргеты: агрегируют все скиллы в один
корневой файл за один проход (в коде отдельная ветка, чтобы поздний каталог не затёр
скиллы раннего); остальные пишут по файлу/папке на скилл.

### `dz parity` — честная матрица фич × платформ

Реальный вывод `dz parity` (`✓` full, `◐` manual, `—` недоступно; колонки —
cc/cdx/ocd/hrm/ocl/cop/amd/cur/gem/wsf = 10 таргетов по порядку из `--help`):
```
  dz CLI (all commands)                        ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓
  Skill packs (compiled per target)            ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓
  feature-adr pipeline                         ✓ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐
  Step-10 Delivery Gate                        ✓ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐
  Adversarial challenge-panel (plan gate)      ✓ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐
  Integrity claim-check                        ✓ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐
  Self-learning: collect + rank (teach/recall) ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓
  Self-learning: automatic apply-leg           ✓ ?  ◐ ◐ ◐ ◐ ◐ ◐ ◐ ◐
  Live 🚦 gates status line                    ✓ — — — — — — — — —
  Deterministic project guards (setup --guards)✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓
  Verified release + signing                   ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓
  MCP memory (AgentDB, agentic-qe)              ✓ ◐ — — — — — — — —
```

**Ключевой вывод для тезиса пользователя.** Полный паритет (✓ везде) есть только у
чистых shell-команд, которым не важен хост-агент: сама CLI, компиляция скиллов, и
`dz teach/recall`. Всё завязанное на возможностях самого агента (feature-adr как
*автоматический* пайплайн, Delivery Gate, challenge-panel, claim-check, авто-apply
самообучения) на всех платформах, кроме `claude-code`, — `◐ manual`: доступно, но
**агент сам пайплайн не запускает** — человек (или Codex/Cursor вручную) дёргает
`dz`-команды по шагам, а не полагается на авто-разворачивание через skill-инструкцию,
как это делает Claude Code своим Skill-раннером с хуками. Причина — в `capabilities`
(`dz parity --json`): `claude-code` = `[shell, skills, hooks-write, hooks-shell,
hooks-prompt, mcp, mcp-configured, workflows, statusline]`; `codex` = `[shell, skills,
mcp, hooks-shell, hooks-prompt]`; **все остальные 8 таргетов** = только `[shell,
skills]` — прочитать файл и выполнить команду, без хуков и MCP, на которых держится
автоматизация фаз.

`dz parity --json` также содержит `staleEvidence` — честное признание устаревшей
записи: `{"target":"codex","capability":"hooks-prompt","reason":"stale-runtime-version",
"recordedVersion":"codex-cli 0.147.0","probedVersion":"codex-cli 0.148.0"}` — матрица
может отставать от текущей версии Codex CLI, и авторы это фиксируют, а не скрывают.

### Установка под Codex / Cursor / OpenCode на практике

```bash
dz init --target cursor   --select <ids>   # → .cursor/rules/*.mdc
dz init --target opencode --select <ids>   # → .opencode/skills/<id>/SKILL.md
dz init --target codex    --select <ids>   # → .agents/skills/<id>/SKILL.md
```

`--target codex` — единственный таргет с доп. шагом (дословно из `dz --help`): "ALSO
installs the user-global dz veto+recall hooks and LIVE-verifies them (ADR-001 §8);
`--no-hooks` = skills only; `--no-verify` skips the live probe." Это ставит/проверяет
`$CODEX_HOME/hooks.json` — **глобально для пользователя**, не в репозитории
(`dz hooks-sync --target codex [--check|--verify|--remove]`). Проверено read-only:
```
$ dz hooks-sync --target codex --check
dz hooks-sync: no `codex` binary on PATH — nothing was written
dz hooks-sync: ARMED = NO — the managed entries are not present in the registry
exit 3
```
Codex CLI в среде не установлен — `dz` честно это обнаруживает и ничего не пишет
(exit 3 = inconclusive), подтверждая, что ADR-001 §8 — реальный тестируемый
механизм: `dz` живьём проверяет, что хук встал и Codex его подхватил.

## 4. Пресеты и выборочная установка

```
Presets: academic, meta, qe-engineer, bto, reasoning, health, keysarium, p-replicator, feature-adr, devops, web3, mcp, news, pm
```
Ровно **14**. Состав вытащен из `@dzhechkov/harness-presets/dist/presets.js`:

| Пресет | # | Что внутри |
|---|---|---|
| `meta` | 20 | explore, feature-adr, knowledge-extractor, design-thinking, decision-mockups... |
| `qe-engineer` | 20 | генерация тестов, coverage, chaos, QCSD-swarm'ы, brutal-honesty-review |
| `bto` | 1 | Build-Benchmark-Test-Optimize (toolkit `skills-bto`) |
| `reasoning` | 4 | investigate, solid, karpathy-guidelines, agents-md-creator |
| `health` | 8 | медицинский ИИ (toolkit `health-advisor`) |
| `keysarium` | 9 | research-toolkit (toolkit `keysarium`) |
| `p-replicator` | 10 | explore, sparc-prd-mini, cc-toolkit-generator-enhanced... (toolkit `p-replicator`) |
| `feature-adr` | 9 | 11-шаговый feature-пайплайн (toolkit `skills-feature-adr`) |
| `devops` | 29 | ревью, security-audit, CI/CD, k8s, terraform, incident-response |
| `web3` | 12 | blockchain RPC, кошельки, свопы, identity |
| `mcp` | 16 | MCP-серверы (Gmail, Sheets, ClickUp, Notion, Context7...) |
| `academic` | 5 | защита диссертации/ГЭК |
| `news` | 3 | дайджесты + goap-research |
| `pm` | 18 | RICE/ICE, OKR, roadmap, GTM |

В этой среде уже "из коробки" доступны скиллы пресетов `academic`, `devops`, `meta`,
`news`, `pm`, `web3`, `mcp` и части `qe-engineer` (их skill-паки — прямые зависимости
`harness-cli`). Пресеты с полем `toolkit` (`bto`, `health`, `keysarium`,
`p-replicator`, `feature-adr`) — отдельные npm-пакеты, не паки внутри `harness-cli`;
без них `dz` явно отвечает: `⚠️ 10 skill(s) not found in any installed pack: ...
The 'p-replicator' preset is backed by a standalone toolkit. Install the full set
with: npx @dzhechkov/p-replicator init`. (В этом проекте `p-replicator init` и
`skills-feature-adr init` уже выполнялись отдельно — отсюда `feature-adr`/
`sparc-prd-mini` в `.claude/skills`.)

**`--preset` vs `--select id,id,...`**: пресет — именованный версионированный список
id, `--select` — произвольный ручной список через запятую; оба идут одним путём
установки. `--select` — для одного-двух скиллов без всего пресета.

### Грабля, найденная экспериментально

`--skills-dir` вместе с `--preset`/`--select` **отключает** автопоиск встроенных
паков (явный `--skills-dir` возвращает только этот каталог, игнорируя
`node_modules/@dzhechkov/skills-*` и папку самой `harness-cli` — не описано в
`--help`, только в комментарии исходника `discoverSkillsDirs`):
```bash
dz init --preset pm --target cursor --skills-dir .claude/skills   # ⚠️ 18 not found
dz init --preset pm --target cursor        # без --skills-dir → 18 written, "searched 15 skill directories"
```
Вывод: не указывать `--skills-dir` вместе с `--preset`, если нужен автопоиск.

## 5. Команды проверки после установки

| Команда | Проверяет | Результат / exit-код (реально) |
|---|---|---|
| `dz verify` | Валидность каждого скилла в `.claude/skills` под `--target` | `42/42 skill(s) valid` → 0 |
| `dz list` | Перечисляет установленные скиллы с описанием | 42 скилла, алфавит |
| `dz skills-verify --static` | Layout-скан: лежит ли валидный `SKILL.md` (мгновенно, для CI) | `42 registrable`, "no layout problems", exit 0. Сама предупреждает: `(static is a PROXY — run without --static to read the real registration listing)` |
| `dz skills-verify` (без `--static`) | Реальный список зарегистрированных скиллов из живой сессии — отличает "лежит в папке" от "агент реально увидел" | Не запускал — нужна живая CC-сессия, см. "Не проверено" |

## 6. Обновление и синхронизация

- `dz sync` (алиас `dz update`) — для **монорепы** `dz-harness-hub`: сверяет копии
  скиллов проекта с каноническим источником. В обычном проекте канонической папки
  нет: `dz sync --dry-run` → `0/0 in sync, 0 missing, 0 drift` затем `0 canonical
  skill(s) found under .../skills-meta — nothing was compared, and nothing-compared
  is not a clean sync`, exit 3. Т.е. это обслуживание самой библиотеки скиллов, а
  не "подтянуть новую версию скилла в проект".
- `dz upgrade [--target] [--pubkey] [--require-signing]` — обновляет установленные
  паки; тамперенный пак прерывает апгрейд. Не выполнял (пишет в репозиторий).
- Саму CLI — обычным `npm i -g @dzhechkov/harness-cli@latest`.

## 7. `dz install <npm-pkg>` — сторонний skill-пакет

Проверено во временном каталоге: `dz install @dzhechkov/skills-pm --project <tmp>` →
`Installing @dzhechkov/skills-pm... dz install @dzhechkov/skills-pm: 18 skill(s), 18
file(s) written, 0 skipped` (построчно все 18 скиллов пакета). Результат —
`.claude/skills/<id>/SKILL.md` на каждый скилл (таргет по умолчанию `claude-code`).
`dz install` = скачать произвольный npm-пакет со скиллами и сразу скомпилировать все
его скиллы под нужный таргет одной командой — в отличие от `dz init`, который берёт
только уже присутствующие локально паки.

## Грабли — сводка (см. также разделы 3/4/6 выше, где каждая разобрана детально)

`--skills-dir`+`--preset` глушит автопоиск (§4) · toolkit-пресеты требуют отдельного
`npx <toolkit> init` (§4) · `dz sync` — не "обнови мой скилл", а обслуживание монорепы,
exit 3 в обычном проекте (§6) · `better-sqlite3 not installed` — деградация до JSON,
не ошибка (§2) · `--target codex` пишет в **глобальный** `$CODEX_HOME/hooks.json` (§3) ·
фичи `feature-adr` вне `claude-code` — `◐ manual`, автозапуска нет (§3) · никогда не
гонять `dz init` без флагов / `dz sync --force` / `dz upgrade` в рабочем репозитории —
только во временных каталогах.

## Не проверено

- `dz skills-verify` без `--static` — нужна живая сессия CC/Codex с system/init
  listing; голый терминал это не эмулирует.
- Реальная установка под живой Codex CLI (`--target codex` без `--no-hooks`) —
  глобальный побочный эффект + в среде нет `codex`-бинаря (`hooks-sync` подтвердил),
  LIVE-проверку ADR-001 §8 здесь не пронаблюдать.
- Подхватывает ли реальный Cursor/OpenCode как приложение свои файлы — вопрос к
  самим программам, не к `dz`; их нет в среде для проверки.
- `dz upgrade` живьём и `dz sync --force`/`dz init` в реальной монорепе
  `dz-harness-hub` — операции записи/перезаписи, не выполнял по условиям задания.
- Скорость `npm i -g` "с нуля" (холодный кеш) — измерил только `--dry-run` на тёплом
  кеше (5.7 с), холодную установку не гонял, чтобы не сломать среду.
