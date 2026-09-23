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
| `CLAUDE.md` | 299 | PRD, Specification, Architecture(+compose), ADR, canon, decisions-owner, Final_Summary, validation-report |
| `.claude/agents/planner.md` | 105 | Pseudocode (45 алгоритмов), canon, ADR |
| `.claude/agents/architect.md` | 116 | Architecture(+compose), ADR (17), canon |
| `.claude/agents/code-reviewer.md` | 108 | Refinement (§1 EC, §2.4/2.5), ADR «Как проверить» |
| `.claude/agents/cost-guard.md` | 69 | model-cost-contract.md, ADR-006, Refinement §2.4/2.5 — доп. агент, обоснование ниже |
| `.claude/rules/security.md` | 92 | Specification NFR-clips-2/3, Architecture §Security, ADR-004/006/007/011/014/015 |
| `.claude/rules/coding-style.md` | 128 | canon (§2/4/5/11), Architecture-compose, ADR-002/010/012 |
| `.claude/rules/secrets-management.md` | 87 | Architecture §Security, Architecture-compose environment:, canon §6, ADR-004/011/013 |
| `.claude/rules/testing.md` | 132 | Refinement (§1/2/2.4/2.5), Specification §8, ADR «Как проверить» |
| `.claude/skills/project-context/SKILL.md` | 104 | PRD, Specification, canon, decisions-owner |
| `.claude/skills/coding-standards/SKILL.md` | 90 | canon, Pseudocode (ключевые алгоритмы), ADR-005 |
| `.claude/skills/security-patterns/SKILL.md` | 113 | ADR-006/007/009/010/011/014, model-cost-contract |
| `.claude/skills/feature-navigator/SKILL.md` | 86 | PRD §«Очереди поставки», Completion §1.3 (дни), complexity-router |
| `.claude/feature-roadmap.json` | 495 | PRD §«Очереди поставки», Completion §1.3 (12 дней ядра), Solution_Strategy (донор-переиспользование) — 17 фич после TK-04, JSON валиден и все 67 ключей canon §10 покрыты (`node -e` скрипт → 0 непривязанных, см. ниже) |
| `DEVELOPMENT_GUIDE.md` | 118 | Completion (день 0, DoD, чек-лист развёртывания), ADR-001 (проба STT), rules/codex-invocation-local.md, model-routing-local.md |
| `README.md` | 44 | Final_Summary, PRD, Architecture |

Строки таблицы выше — после ПРАВОК по `docs/reviews/toolkit-review.md` (раздел «Исправления по
toolkit-review» ниже); все файлы остаются ≤ 500 строк.

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

## Исправления по toolkit-review

Независимая проверка `docs/reviews/toolkit-review.md` (Claude Opus 5.5, read-only) вернула
«НЕ ГОТОВО» — 4 high (TK-01…04), 6 medium (TK-05…09, TK-11), 4 low (TK-10, TK-12…14). Все
закрыты в этой правке (TK-14 — сразу, отдельным сообщением; остальные — этим проходом).

### High

- **TK-01** (лимит регистраций): `.claude/rules/security.md` — `≤5` → `≤20 регистраций/IP/ч`
  (FR-clips-1 п.4, В-25), с явным основанием (CGNAT).
- **TK-02** (несуществующие скрипты, вперемешку рабочие каталоги): решение координатора —
  `check-env-wiring.sh`/`check-compose-buildable.sh`/`check-cjm.sh` Phase 4 переносит Codex в
  `projects/05a-podcast-clips-opus/scripts/` (источники: `.claude/snippets/bash/check-env-wiring.sh`,
  `harness-forge/implementations/scripts/`, образец `projects/01-testimonials-senja/scripts/`).
  Во всех местах (`CLAUDE.md`, `DEVELOPMENT_GUIDE.md`, `testing.md`, roadmap
  `deploy-netherlands.expected_files`) путь дан от корня репозитория с пометкой «создаётся в
  Phase 4»; `complexity-router.sh` унифицирован на форму `bash scripts/complexity-router.sh` (из
  корня — скрипт сам cd'ится в `git rev-parse --show-toplevel`, путь безопасен из любого cwd; те
  же самоrelocating-скрипты `check-env-wiring.sh`/`check-compose-buildable.sh` cd'ятся в СВОЙ
  родитель через `dirname "$0"/..`, поэтому полный путь `projects/05a-.../scripts/...` безопасен
  откуда угодно). Одно объявление рабочего каталога на блок команд, не смешанные предположения.
- **TK-03** (`worker-render` без БД): `.claude/rules/secrets-management.md` — строка
  `POSTGRES_PASSWORD` заменена на `DATABASE_URL` (canon §6: web, migrate, worker-ai,
  worker-render — рендер ЧИТАЕТ `account.plan` и ПИШЕТ `clip.render_status` напрямую);
  `.claude/agents/architect.md`/`render-pipeline` в roadmap явно называют FR-clips-9.
- **TK-04** (roadmap без части ядра, большинство AC без ключа): `.claude/feature-roadmap.json`
  переписан — добавлена фича `video-deletion-and-cleanup` (FR-clips-13, NFR-clips-6,
  AC-clips-17); лендинг и путь зрителя знака (FR-clips-14 пп.1-2, AC-clips-18, FR-LOOK-001) →
  `growth-loop-and-ops`; события (FR-clips-12) → `job-lifecycle-and-viewer` +
  `growth-loop-and-ops`; CORS/lifecycle бакета, `POST …/parts`, экран загрузки, браузерный E2E
  ETag → `upload-and-admission`; `GET /api/clips/{id}/events` → `job-lifecycle-and-viewer`;
  `GET /api/health` → `deploy-netherlands`; AC-clips-24 → `stt-probe`; AC-clips-1/14/21/25/26/28 →
  `foundation-auth`; AC-clips-29 → `growth-loop-and-ops`; принятые FR-LOOK-* и NFR-clips-7 →
  `job-lifecycle-and-viewer` (дизайн-система, доступность) и `fakedoor-screen` (таблица планов);
  NFR-clips-4/8 → `deploy-netherlands`. Проверка скриптом (см. ниже): **0 непривязанных ключей**
  из 67 (16 FR-clips + 5 FR-GROWTH + 8 принятых FR-LOOK + 8 NFR-clips + 30 AC-clips).

### Medium/low

- **TK-05** (`stt-probe` не может собраться без монорепо `foundation-auth`): решение — `stt-probe`
  теперь ВЛАДЕЕТ созданием минимального корневого `package.json` (workspaces-заготовка) и
  заготовок `packages/models`/`packages/config`/`apps/worker/src/cli`+`lib`; запускается
  `npx tsx apps/worker/src/cli/ops.ts stt-probe <файл>`, без `dist`. `foundation-auth` и
  последующие фичи РАСШИРЯЮТ тот же `package.json` (добавляют `apps/web`, `packages/db` и т.д.),
  не пересоздают — конфликт владения манифестом снят, не спрятан.
- **TK-06** (проверка разрешения/длительности «до ffprobe» физически невозможна):
  `.claude/agents/code-reviewer.md` — переписано: проверка ЖИВЁТ в `{job_id}.stt.prepare`,
  разрешение — по заголовкам `ffprobe` ДО декодирования кадров, длительность — по пакетам аудио;
  добавлена пропущенная проверка `watermark_fits` (VA2-09).
- **TK-07** (сигнатура `llm_reserve_kop` завышала оценку ×1000): `.claude/skills/coding-standards/SKILL.md`
  — переписано дословно по Pseudocode: `est_chars ← ceil(duration_ms/1000) × LLM_EST_CHARS_PER_SEC`,
  затем `est_kop ← llm_reserve_kop(est_chars)` — функция принимает число символов.
- **TK-08** (координаты знака и вторая самопроверка отсутствовали): вписаны в
  `.claude/rules/coding-style.md` §Единицы и `.claude/agents/architect.md` ADR-010: x=540,
  y=1004/1084, полоса субтитров с y=1100, `WM_INSET=24`; ОБЕ стартовые самопроверки
  `worker-render` названы явно (геометрия `pw≤294` И наличие пикселей текста libass, VA2-10) —
  вторая раньше не упоминалась вовсе.
- **TK-09** (cross-family не привязан к моделям, `usageAdaptive` неоднозначен): в `CLAUDE.md`
  добавлена таблица «класс работы → модель Codex+effort → ревьюер Anthropic», помеченная как
  РЕКОМЕНДАЦИЯ координатора Phase 3 (не переопределяет OWN-05A-00M — назвать иначе может только
  владелец); явно записано `usageAdaptive: false` для 05a — при исчерпании лимита стадия ждёт или
  спрашивает владельца, автоматическое переключение QE на семейство автора кода не допускается.
- **TK-10** (`S3_*` пять vs шесть): `secrets-management.md` — «6 переменных, `S3_TENANT_ID`
  пустым только в test».
- **TK-11** (CORS без `AllowedHeaders=content-type`): дописано в `CLAUDE.md` и
  `DEVELOPMENT_GUIDE.md` день-0-чек-листах.
- **TK-12** (реальный вызов LLM дня 4 выпал из `llm-selection`): описание фичи в roadmap явно
  включает «ОДИН реальный вызов на настоящем транскрипте с записью `completion_tokens`»,
  отделено от статистического замера `measurement-and-calibration` (дни 10-11).
- **TK-13** (мелкие неточности): «18 решений» → «19 строк решений» (`project-context/SKILL.md`);
  «один образ, пять процессов» → «один образ, четыре процесса; `caddy` — пятый сервис, свой
  образ» (`architect.md`); повреждённая фраза про `/admin/*` переписана; `EnqueueScan`-аналог
  убран (`coding-standards/SKILL.md`); «исключение ровно одно» → «одна категория исключений»
  (`secrets-management.md`).
- **TK-14** (квитанция не оканчивалась терминальной строкой) — закрыт отдельным сообщением ДО
  этой правки: последняя строка этого файла — ровно `Status: completed`, без `## `.

### Трассировка ключей после TK-04 (проверка скриптом, 0 непривязанных)

```
node -e '... сверка множества source_ids всех 17 фич с 67 ключами canon §10 ...'
→ Total required keys: 67
→ Missing (unassigned): 0
```

| Ключ | Фича(и) |
|---|---|
| FR-clips-1 | foundation-auth, password-reset-page |
| FR-clips-2 | upload-and-admission |
| FR-clips-3 | upload-and-admission, job-lifecycle-and-viewer |
| FR-clips-4 | stt-probe, stt-pipeline |
| FR-clips-5 | llm-selection |
| FR-clips-6 | llm-selection |
| FR-clips-7 | render-pipeline |
| FR-clips-8 | job-lifecycle-and-viewer |
| FR-clips-9 | render-pipeline, growth-loop-and-ops |
| FR-clips-10 | upload-and-admission |
| FR-clips-11 | growth-loop-and-ops, admin-spend-page |
| FR-clips-12 | job-lifecycle-and-viewer, growth-loop-and-ops |
| FR-clips-13 | video-deletion-and-cleanup |
| FR-clips-14 | growth-loop-and-ops, fakedoor-screen |
| FR-clips-15 | growth-loop-and-ops |
| FR-clips-16 | foundation-auth, upload-and-admission |
| FR-GROWTH-001 | growth-loop-and-ops |
| FR-GROWTH-002 | growth-loop-and-ops, fakedoor-screen |
| FR-GROWTH-003 | render-pipeline, watermark-ocr-verification, fakedoor-screen |
| FR-GROWTH-004 | growth-loop-and-ops, admin-partners-page |
| FR-GROWTH-005 | growth-loop-and-ops |
| FR-LOOK-001 | growth-loop-and-ops |
| FR-LOOK-002 | fakedoor-screen |
| FR-LOOK-007 | job-lifecycle-and-viewer |
| FR-LOOK-008 | job-lifecycle-and-viewer |
| FR-LOOK-009 | job-lifecycle-and-viewer |
| FR-LOOK-010 | job-lifecycle-and-viewer |
| FR-LOOK-011 | job-lifecycle-and-viewer |
| FR-LOOK-013 | fakedoor-screen |
| NFR-clips-1 | measurement-and-calibration |
| NFR-clips-2 | testing-hardening, deploy-netherlands |
| NFR-clips-3 | foundation-auth |
| NFR-clips-4 | deploy-netherlands |
| NFR-clips-5 | testing-hardening |
| NFR-clips-6 | video-deletion-and-cleanup |
| NFR-clips-7 | job-lifecycle-and-viewer |
| NFR-clips-8 | deploy-netherlands |
| AC-clips-1 | foundation-auth |
| AC-clips-2 | upload-and-admission |
| AC-clips-3 | job-lifecycle-and-viewer |
| AC-clips-4 | job-lifecycle-and-viewer |
| AC-clips-5 | job-lifecycle-and-viewer |
| AC-clips-6 | stt-pipeline |
| AC-clips-7 | llm-selection |
| AC-clips-8 | llm-selection |
| AC-clips-9 | llm-selection |
| AC-clips-10 | llm-selection |
| AC-clips-11 | render-pipeline |
| AC-clips-12 | testing-hardening |
| AC-clips-13 | upload-and-admission |
| AC-clips-14 | foundation-auth |
| AC-clips-15 | deploy-netherlands |
| AC-clips-16 | growth-loop-and-ops |
| AC-clips-17 | video-deletion-and-cleanup |
| AC-clips-18 | growth-loop-and-ops |
| AC-clips-19 | growth-loop-and-ops |
| AC-clips-20 | job-lifecycle-and-viewer |
| AC-clips-21 | foundation-auth |
| AC-clips-22 | growth-loop-and-ops |
| AC-clips-23 | upload-and-admission, testing-hardening |
| AC-clips-24 | stt-probe |
| AC-clips-25 | foundation-auth |
| AC-clips-26 | foundation-auth |
| AC-clips-27 | stt-pipeline |
| AC-clips-28 | foundation-auth |
| AC-clips-29 | growth-loop-and-ops |
| AC-clips-30 | testing-hardening |

## Дополнительные решения координатора (второй проход после toolkit-review)

### TK-05, пересмотрено

Первый проход дал `stt-probe` владение минимальным `package.json`/`workspaces`-скелетом.
Координатор решил проще и надёжнее: проба дня 1 — **самостоятельный скрипт**
`projects/05a-podcast-clips-opus/scripts/stt-probe.mjs` (Node 22, только `fetch` и `ffmpeg` с
хоста), без единого файла монорепо — конфликта владения манифестом нет вовсе, а не только снят
частично. `foundation-auth` создаёт `package.json` СВЕЖИМ (не расширяет ничего) и несёт
`apps/worker/src/cli/ops.ts` с подкомандой `ops stt-probe`, которая позже станет ТОНКОЙ ОБЁРТКОЙ
вокруг `packages/models/Transcriber` — переиспользует ту же логику, не повторяет её. `stt-probe`
как фича остаётся первой в roadmap и ни от чего не зависит; `foundation-auth.depends_on`
возвращён к `[]` (было `["stt-probe"]` в первом проходе, больше не нужно). Правки:
`.claude/feature-roadmap.json` (оба feature-объекта), `CLAUDE.md` §«Команды разработки» и
§«Feature lifecycle и roadmap», `DEVELOPMENT_GUIDE.md` §2.

### TK-09, пересмотрено — окончательная таблица от координатора

Первый проход был явно помечен как рекомендация координатора «до ответа владельца». Координатор
теперь даёт таблицу по `docs/decisions-owner.md` OWN-05A-00M как окончательную:

| Класс работы | Codex (модель, effort) | Ревью/QE (Anthropic) |
|---|---|---|
| Обычные фичи | `gpt-6-sol`, high | Sonnet 5 |
| Конвейер STT→LLM→рендер, деньги/допуск, знак | `gpt-6-astra`, high | Opus 5.5 |
| Перенос из донора, изолированные модули | `gpt-6-sol`, medium | Sonnet 5 |
| Механика (конфиги, фикстуры) | `gpt-6-luna`, low | Sonnet 5 |

Безопасность ревьюит Opus 5.5 вместе с денежным контуром — одна строка, не отдельная (координатор
явно назвал безопасность рядом с деньгами, а не как свой класс). `usageAdaptive: false`
подтверждён без изменений: переключение по расходу лимита ВЫКЛЮЧЕНО — иначе QE уходит на Codex и
нарушает cross-family; при исчерпании лимита Anthropic — стоп и вопрос владельцу, не подмена
семейства. Правка: `CLAUDE.md` §«Cross-family», таблица заменена целиком (была помечена как
рекомендация — теперь как решение координатора), формулировка `usageAdaptive` не менялась, так
как совпадает с исходным решением буквально.

### TK-11, TK-06/07/08 и low — подтверждены без новых правок

Координатор подтвердил: CORS-чеклист дня 0 уже несёт `AllowedHeaders=content-type` (закрыто
первым проходом); TK-06 (ffprobe-порядок), TK-07 (сигнатура `llm_reserve_kop`), TK-08 (координаты
знака + вторая самопроверка) и оставшиеся low — «по отчёту», то есть ровно так, как исполнено
первым проходом; повторной правки не требуется.

## Третий проход — координатор уточнил TK-05 и TK-09

- **TK-05:** координатор вернул мой ПЕРВЫЙ вариант («твой вариант принят») — `stt-probe` владеет
  минимальным корневым скелетом (`package.json` + заготовки `packages/models`/`packages/config`/
  `apps/worker/src/cli`+`lib`), запускается `npx tsx apps/worker/src/cli/ops.ts stt-probe <файл>`
  без `dist`; `foundation-auth` РАСШИРЯЕТ тот же `package.json`, не пересоздаёт. Второй вариант
  (самостоятельный `stt-probe.mjs` без монорепо, принятый на предыдущем проходе) отменён и убран
  из всех файлов (`.claude/feature-roadmap.json`: `stt-probe`/`foundation-auth` — оба объекта
  вернулись к первой версии, `foundation-auth.depends_on` снова `["stt-probe"]`; `CLAUDE.md`
  §«Команды разработки» и §«Feature lifecycle и roadmap»; `DEVELOPMENT_GUIDE.md` §2).
- **TK-09:** таблица моделей в `CLAUDE.md` приведена ДОСЛОВНО к финальному варианту координатора
  — денежный контур и безопасность/auth теперь ОТДЕЛЬНОЙ строкой от конвейера STT→LLM→рендер
  (обе `gpt-6-astra`/high/Opus 5.5, но названы раздельно, как в решении), «донор+скаффолды Phase 4»
  объединены в одну строку `gpt-6-sol`/medium, `gpt-6-luna` без явного effort. Пометка «рекомендация
  координатора Phase 3, не переопределение OWN-05A-00M» восстановлена — снята была ошибочно на
  предыдущем проходе. Проверено: `gpt-6-sol`/`gpt-6-astra`/`gpt-6-luna`/«Класс работы» не
  повторяются ни в одном файле `.claude/agents/*.md` — таблица существует только в `CLAUDE.md`,
  агенты на неё не дублируют.

Status: completed
