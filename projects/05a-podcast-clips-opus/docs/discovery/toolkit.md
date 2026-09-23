# Квитанция Phase 3 (TOOLKIT GENERATION) — ClipMkr (05a)

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** toolkit · 2026-09-23

## Предусловие

`docs/validation-report.md` первая строка: `**Verdict:** 🟡 CAVEATS — 0 blocker, 0 high открытых;
известные medium/low (13 + 4 из val3-verify) и принятые риски переходят в тулкит и реализацию
(раздел «Итоговый вердикт Phase 2»).` — 🟡 CAVEATS, генерация разрешена. Оговорки перенесены в
`CLAUDE.md` §«Известные оговорки Phase 2» и в примечания `.claude/feature-roadmap.json.notes`.

## Модули `cc-toolkit-generator-enhanced` — прочитаны ЦЕЛИКОМ, все 9

| Модуль | Прочитан | Использовано |
|---|---|---|
| SKILL.md (оркестратор) | ✅ | карта соответствий документ→артефакт, master-checklist |
| 01-detect-parse.md | ✅ (просмотрен целиком, входные документы уже известны из чтения самих docs/*) | тип пайплайна — SPARC, документы канона §по проекту |
| 02-analyze-map.md | ✅ | scoring-логика подтвердила выбор набора P0/P1 файлов |
| 03-generate-p0.md | ✅ | CLAUDE.md, правила, roadmap |
| 04-generate-p1.md | ✅ | агенты, скиллы, DEVELOPMENT_GUIDE.md |
| 05-generate-p2p3.md | ✅ | решение НЕ генерировать .mcp.json/feature-ent (P2, условные) |
| 06-package-deliver.md | ✅ | master validation checklist сверен вручную (см. ниже) |
| 07-harvest-feedback.md | ✅ (просмотрен) | не применяется — пост-проектный harvest, проект не реализован |
| 08-skill-composition.md | ✅ (просмотрен) | не применяется — P0-скиллы (sparc-prd-mini, explore и т.д.) уже живут в корневой `.claude/`, здесь не копируются (задание команды: генерировать ТОЛЬКО проектно-специфичное) |
| 09-cross-project-learning.md | ✅ (просмотрен) | не применяется — реестр cross-project не подключён в этом прогоне |

**Важное отклонение от буквального SKILL.md P0-списка, сознательное.** SKILL.md описывает
generic-проект (P0 включает копирование 6 lifecycle-скиллов, `/start`, `/myinsights`, settings.json
и т.д.). Это `projects/05a-podcast-clips-opus/` — подпроект монорепо, где p-replicator уже
инициализирован НА КОРНЕ репозитория: общие команды, хуки, settings.json и 10 вендорных навыков
живут в `../../.claude/` и не дублируются в подпроект (это подтверждено структурой сиблинг-проекта
`projects/04-calorie-vision-cal-ai/.claude/`, который несёт РОВНО тот же узкий набор: agents ×3,
rules ×4, skills ×4, `feature-roadmap.json` — без settings.json, без командных копий, без
lifecycle-скиллов). Задание координатора прямо говорит генерировать «ТОЛЬКО проектно-специфичное»
и явно перечисляет список файлов — этот список УЖЕ отражает P0(root)+P1(project)-разделение, и
generic P0-список SKILL.md к подпроекту неприменим буквально. Прочитан целиком именно ради
проверки: не потерялась ли какая-то категория (агенты/правила/скиллы/roadmap/guide/readme) —
ни одна не потеряна, все присутствуют.

## Созданные файлы (все в PROJECT_ROOT, IN-PLACE)

| Файл | Строк | Источник |
|---|---|---|
| `CLAUDE.md` | 271 | PRD, Specification, Architecture(+compose), ADR, canon, decisions-owner, Final_Summary, validation-report |
| `.claude/agents/planner.md` | 105 | Pseudocode (45 алгоритмов), canon, ADR |
| `.claude/agents/architect.md` | 110 | Architecture(+compose), ADR (17), canon |
| `.claude/agents/code-reviewer.md` | 103 | Refinement (§1 EC, §2.4/2.5), ADR «Как проверить» |
| `.claude/agents/cost-guard.md` | 69 | model-cost-contract.md, ADR-006, Refinement §2.4/2.5 — доп. агент, обоснование ниже |
| `.claude/rules/security.md` | 92 | Specification NFR-clips-2/3, Architecture §Security, ADR-004/006/007/011/014/015 |
| `.claude/rules/coding-style.md` | 122 | canon (§2/4/5/11), Architecture-compose, ADR-002/010/012 |
| `.claude/rules/secrets-management.md` | 87 | Architecture §Security, Architecture-compose environment:, canon §6, ADR-004/011/013 |
| `.claude/rules/testing.md` | 130 | Refinement (§1/2/2.4/2.5), Specification §8, ADR «Как проверить» |
| `.claude/skills/project-context/SKILL.md` | 104 | PRD, Specification, canon, decisions-owner |
| `.claude/skills/coding-standards/SKILL.md` | 87 | canon, Pseudocode (ключевые алгоритмы), ADR-005 |
| `.claude/skills/security-patterns/SKILL.md` | 113 | ADR-006/007/009/010/011/014, model-cost-contract |
| `.claude/skills/feature-navigator/SKILL.md` | 85 | PRD §«Очереди поставки», Completion §1.3 (дни), complexity-router |
| `.claude/feature-roadmap.json` | 416 | PRD §«Очереди поставки», Completion §1.3 (12 дней ядра), Solution_Strategy (донор-переиспользование) — 16 фич, JSON валиден (`node -e "JSON.parse(...)"` → OK) |
| `DEVELOPMENT_GUIDE.md` | 102 | Completion (день 0, DoD, чек-лист развёртывания), ADR-001 (проба STT), rules/codex-invocation-local.md, model-routing-local.md |
| `README.md` | 44 | Final_Summary, PRD, Architecture |

Все файлы ≤ 500 строк (лимит CLAUDE.md репозитория). Все читали ТОЛЬКО документы проекта
`projects/05a-podcast-clips-opus/docs/*`; `projects/05-podcast-clips-opus/` НЕ открывался ни
разу — проверено списком вызовов Read/Bash этого прогона. `projects/04-calorie-vision-cal-ai/.claude/`
открыт ТОЛЬКО ради формы (структура директорий, длина файлов агентов/правил/скиллов), не
содержания N4-специфики — содержание файлов 05a целиком собственное.

## Оговорки Phase 2, перенесённые в тулкит

Перенесены в `CLAUDE.md` §«Известные оговорки Phase 2» и в `.claude/rules/testing.md`
(`check-canon.cjs` = 2 — дефект стражей на разрезе, не проекта): дефект стражей check-canon×
check-file-ownership (sha256 сверяется вручную); число потолков в Completion/Final_Summary может
отставать от канона (9, не 7, V3-05) — канон назван авторитетным; UNCONFIRMED-модель STT (продукт
не останавливается); калибровочные константы LLM (V3-11); принятый риск отлежавшихся
мультиаккаунтов (V3-13); правовые вопросы РФ отложены (OWN-05A-004).

**Правка после ревью координатора (та же сессия):** V3-01/02/03 (место знака в ADR-010/Pseudocode/C4)
исходно были подняты в тулкит как ОТКРЫТЫЕ по тексту val3-verify — при повторной сверке с
ТЕКУЩИМИ (не архивными) `docs/ADR.md`, `docs/Pseudocode.md`, `docs/C4_Diagrams.md` все три
формулы уже согласованы с действующим OWN-05A-015 (центр у нижней кромки, y=1004/1084, без «в
углу»); упоминания OWN-05A-013 в этих файлах — легитимный след «заменяет», не противоречие.
Убраны из открытых оговорок в `CLAUDE.md`, `.claude/agents/architect.md` и здесь.

## Cross-family (OWN-05A-00M) в тулките

`CLAUDE.md`, `DEVELOPMENT_GUIDE.md` и оба «пишущих» агента (`planner`, `cost-guard`) явно называют
решение владельца: план/ревью/QE — Anthropic, код — Codex; `code-reviewer.md` и `cost-guard.md`
прямо пишут «автор кода не рецензирует сам себя». Ссылка на корневые
`feature-adr-ultracode.md`/`codex-invocation-local.md` дана, вендорные файлы не редактировались.

## Сознательно НЕ создано

| Артефакт | Почему нет |
|---|---|
| `.claude/commands/feature-ent.md` | DDD strategic/tactical документов НЕТ (`find docs -iname '*ddd*' -o -iname '*domain*'` → пусто). Условие «IF DDD docs» не выполнено. |
| `.mcp.json` | ADR-016: «MCP — для разработки, продукт зовёт модели HTTP»; сиблинг-проект 04 (та же архитектура: Postgres+S3, внешние модели через HTTP-адаптер) тоже не несёт `.mcp.json` в подпроекте — общий дев-MCP (если появится) живёт в корневой конфигурации, не дублируется на подпроект. |
| копии lifecycle-скиллов (`sparc-prd-mini`, `explore`, `problem-solver-enhanced`, `requirements-validator`, `brutal-honesty-review`, `goap-research-ed25519`) | Уже пре-упакованы В КОРНЕ репозитория (`replicate-pipeline.md` §«Pre-shipped by npx init») — подпроект их не дублирует, ровно как у сиблинга 04. |
| `docker-compose.yml`, `Dockerfile`, `.gitignore` | Явно назначены Phase 4 (Codex) заданием координатора; эскиз и правила уже зафиксированы в `docs/Architecture-compose.md`, повторное объявление здесь создало бы два места с одним правилом. |
| Копирование агента `settings.json`/hooks | Хуки и settings.json — общие, живут в корневой `.claude/`; подпроект их не переопределяет (нет причины: ни один хук не специфичен для 05a). |

## Дополнительный агент `cost-guard.md` — обоснование

Задание допускало «+ др. по характеристикам проекта — если оправдано». Денежный контур
(9 потолков, admission-gate STT/LLM, выполнимость LLM до оплаты STT) — единственный класс отказа
проекта, который НЕЛЬЗЯ откатить (потраченные деньги на OpenRouter не вернуть кодом), и он же дал
единственный blocker Phase 2 итерации 1 (VA-01) и три из шести совпавших находок независимых
проверяющих (VA-03=VT-03). `code-reviewer` проверяет ПОСЛЕ факта; `cost-guard` — явно вызывается
ДО код-ревью для любой правки admission/quota/spend, дублируя план проверки, а не находки
`code-reviewer`. Решение не создавать `media-pipeline`-агента отдельно: рендер/раскладка знака
покрыты `architect` (геометрия/границы) и `code-reviewer` (регресс-проверки), отдельного агента
эта область не требует — денежный контур требует, потому что он необратим.

## `npx @dzhechkov/p-replicator verify`

Выполнено ДВАЖДЫ:
1. `cd projects/05a-podcast-clips-opus && npx @dzhechkov/p-replicator verify` →
   `[ERROR] P-Replicator is not installed in this directory.` — p-replicator инициализирован НА
   КОРНЕ монорепо (`../../.p-replicator.json` существует), не в подпроекте; команда без аргумента
   пути и не читает произвольный подкаталог (`verify projects/05a-...` → `[ERROR] Unexpected
   argument`).
2. `cd <корень репозитория> && npx @dzhechkov/p-replicator verify` → пре-упакованный контракт
   почти цел (1 предсуществующий пробел `check-dangling-refs.cjs` — не относится к этому
   прогону, не трогал); «post-/replicate» секция сверяет пути ОТНОСИТЕЛЬНО КОРНЯ репозитория
   (`.claude/agents/planner.md` и т.п.) и поэтому рапортует «not found» для всех артефактов этого
   Phase 3, потому что они физически лежат в `projects/05a-podcast-clips-opus/.claude/...`, а не в
   корневой `.claude/...` — это тот же паттерн, что и у сиблинг-проекта 04 (подпроектная структура
   монорепо не совпадает с моделью `verify`, рассчитанной на проект = корень репозитория).
   **Вывод: `verify` НЕПРИМЕНИМА к подпроекту в этой раскладке монорепо** — записано, а не
   выдано за успех.

Status: completed
