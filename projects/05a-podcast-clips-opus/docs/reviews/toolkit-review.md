# Ревью тулкита Phase 3 — ClipMkr (05a)

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** toolkit-review · 2026-09-23
**Проверяющий:** Claude Opus 5.5 (семейство Anthropic), только чтение. Чужие файлы не правились.
**Проверено:** `CLAUDE.md`, `README.md`, `DEVELOPMENT_GUIDE.md`, `.claude/agents/*` (4), `.claude/rules/*` (4),
`.claude/skills/*/SKILL.md` (4), `.claude/feature-roadmap.json`, квитанция `docs/discovery/toolkit.md`.
**Эталоны:** `docs/canon.md` (sha256 `383133df…d2`, совпадает с `docs/dispatch-plan.md`), `docs/decisions-owner.md`,
`Specification.md`, `Pseudocode.md`, `ADR.md`, `Architecture-compose.md`, `Refinement.md`, `Completion.md`.
`projects/05-podcast-clips-opus/` не открывался. `CLAUDE.md` изменился на диске во время ревью; строки, на
которые ссылаются находки, перепроверены grep после изменения.

## Вердикт: НЕ ГОТОВО

Четыре находки уровня high заставят исполнителя (Codex) ошибиться уже на первой неделе: неверный лимит
регистраций, сервис рендера без доступа к БД, обязательные проверки через скрипты, которых нет, и roadmap,
в котором ни одна фича не владеет частью ядра (лендинг, удаление, события, CORS бакета). Каждая чинится
правкой текста минут за 10–30; архитектурных дефектов нет. После исправления TK-01…TK-04 вердикт — ГОТОВО С
ОГОВОРКАМИ (medium/low ниже).

**Что совпало с эталоном (проверено, не предполагается):** 9 потолков, имена и значения (7200/1800/45000/3/
5000/90000/30000/2/2400); `jobId` через точку во всех четырёх формах; сессия только в cookie, Bearer запрещён,
CSRF по `Origin`; `ExposeHeaders=ETag`, `PUT,GET`; кегль 40–52, 1–4 %, `pw ≤ 294`, три обрезки
(`1080:608:0:420`, `608:608:236:420`, `342:608:369:420`); квота новичка 30 мин / пул 750 мин (45000 с) / бета
`ops beta-add`; очереди (ядро = mvp, 2-я очередь = low+`queue-2`, ops-команды недели `partner-add`,
`spend-today`, `reset-link`, `beta-add`, `grant-operator`); OpenRouter, `anthropic/claude-sonnet-5`, проба STT
дня 1 (5 кандидатов, 7 критериев, ≤ 62 ₽/ч — сверено с ADR-001); выполнимость LLM до оплаты STT; ворота VA-01 в
шаге 1 «Транскрипции куска»; 13 конкурентных тестов и 15 мутационных стражей совпадают с Refinement §2.4/§2.5
пункт в пункт; браузерный E2E ETag и E2E по выданному адресу есть в `testing.md`. Фич 2-й очереди в `mvp` нет.
Зависимости денег верны: `stt-pipeline` зависит от `upload-and-admission` (допуск) и `stt-probe`. Frontmatter
всех 4 навыков валиден (`name`, `description`, плюс `version`, `maturity`); все файлы ≤ 500 строк (максимум —
roadmap, 416); вендорные файлы корня не изменены (`git status --porcelain .claude/ scripts/ CLAUDE.md` в корне
пуст).

## Находки

### TK-01 · high · лимит регистраций 5 вместо 20
- **Где:** `.claude/rules/security.md:18` — «≤5 регистраций/IP/ч».
- **Эталон:** `Specification.md` FR-clips-1 п. 4: «Лимит регистраций: ≤ 20 с одного IP в час (канон, В-25): за
  одним адресом мобильного CGNAT сидят многие добросовестные люди, поэтому IP — грубый ключ».
- **Чем опасно:** Codex возьмёт число из правила безопасности: это ближайший к коду документ. Итог —
  продукт блокирует добросовестных авторов за мобильным NAT, ровно тот отказ, против которого число
  выбрано (`shared-resource-verification.md` вопрос 4).
- **Как чинить:** «≤ 20 регистраций/IP/ч (FR-clips-1 п. 4, В-25)». Остальное в строке верно.

### TK-02 · high · обязательные проверки ссылаются на несуществующие скрипты, рабочий каталог перепутан
- **Где:** `CLAUDE.md:138-141`, `DEVELOPMENT_GUIDE.md:99-103,117,130`, `rules/testing.md:118-124`,
  roadmap `deploy-netherlands.description`.
- **Что не так:** `scripts/check-env-wiring.sh`, `scripts/check-compose-buildable.sh` и `scripts/check-cjm.sh`
  не существуют ни в корне репозитория, ни в `projects/05a-…/scripts/` (каталога нет). Нашлись только
  `projects/01-…/scripts/*` и `.claude/snippets/bash/check-env-wiring.sh`. Второе: пути даны от корня
  репозитория (`node .claude/hooks/check-ports.cjs projects/05a-…`), а `complexity-router` — от каталога
  проекта (`bash ../../scripts/complexity-router.sh`). В одном и том же блоке команд одна половина
  работает только из корня, другая только из проекта.
- **Эталон:** `deployment-seams.md` ставит стражей №1 и №3 на слой 1; `guard-must-be-able-to-fail.md` —
  страж, которого нельзя запустить, проверкой не является. Сквозной CJM на развёрнутом стенде — ЕДИНСТВЕННОЕ
  место, где ловятся `BASE_URL` и CORS-стык.
- **Чем опасно:** исполнитель получит `No such file`. Дальше он либо пропустит ворота, либо напишет свой скрипт
  без испытания мутацией — оба пути дают тихо-зелёный E2E.
- **Как чинить:** (а) в roadmap явно назначить создание `projects/05a-…/scripts/check-env-wiring.sh`
  (из `.claude/snippets/bash/`), `check-compose-buildable.sh` и `check-cjm.sh` конкретной фиче
  (`foundation-auth` / `deploy-netherlands`), в `expected_files`, с требованием прогона на внедрённом дефекте;
  (б) один раз объявить рабочий каталог («все команды — из корня репозитория») и привести к нему
  `complexity-router`, или наоборот.

### TK-03 · high · `worker-render` лишён доступа к БД, хотя по контракту читает `plan` из БД
- **Где:** `rules/secrets-management.md:22` — `POSTGRES_PASSWORD` для `worker-render`: «нет (нет прямого доступа
  к БД у рендера, читает через `web`/задачу)».
- **Эталон:** canon §6: `DATABASE_URL` — «web, migrate, worker-ai, worker-render»; `Architecture-compose.md`:
  `worker-render.environment: <<: [*db-env, …]`; Specification FR-clips-9 п. 3: «Решение о знаке принимает
  **воркер рендера** в момент рендера по `plan` из БД»; то же в `agents/code-reviewer.md:62`.
- **Чем опасно:** Codex, собирающий compose и Dockerfile на Phase 4, по «минимальной привилегии» уберёт
  `DATABASE_URL` у рендера (или передаст `plan` в полезной нагрузке задачи). В первом случае рендер не
  стартует. Во втором решение о знаке переезжает в параметр, который задаёт не БД. Это прямо запрещено
  FR-clips-9 п. 3 и убивает fail-closed знака.
- **Как чинить:** строку заменить на «`DATABASE_URL` (содержит пароль БД): web, migrate, worker-ai,
  worker-render — рендер читает `account.plan` и пишет `clip.render_status`». Заодно `S3_*` — 6 переменных, не 5
  (`S3_TENANT_ID`, canon §6), см. TK-10.

### TK-04 · high · roadmap не покрывает часть ядра Specification; большинство AC без ключа
- **Где:** `.claude/feature-roadmap.json` (`source_ids` всех 12 фич `mvp`).
- **Что не так (проверено скриптом по `source_ids`):**
  - FR-clips-12 (17 событий, 4 частичных уникальных индекса дедупликации), FR-clips-13 (удаление видео автором
    `DELETE /api/videos/{id}`, уборщик 72 ч / 30 дн / 1 день), FR-clips-9 (`watermark_required`, смена плана
    оператором с аудитом) — нет ни в одной фиче.
  - FR-clips-14 есть только у `fakedoor-screen` (2-я очередь), но пп. 1–2 — ядро: лендинг `/`,
    `landing_visited` с `source`, путь зрителя знака (AC-clips-18). Лендинг выпал из недели.
  - Все 8 принятых FR-LOOK (облик источника) не назначены никому; NFR-clips-4/6/7/8 (compose, ПДн, мобильная
    вёрстка/доступность, наблюдаемость) — тоже.
  - Из 30 AC ключами названы 6 (7, 8, 9, 12, 23, 30). Нет, например, AC-clips-17 (удаление), 18 (путь зрителя),
    19 (честные метрики), 21 (загрузка после подтверждения), 24 (интерфейс STT и проба — хотя это ровно
    `stt-probe`), 25 (лимит входа), 29 (сброс оператором — `ops reset-link` ядра).
  - Маршруты канона §7 ядра без владельца: `POST /api/auth/resend-verification`,
    `POST /api/videos/{id}/parts`, `POST /api/clips/{id}/events`, `GET /api/health`; экран загрузки (фронтенд)
    не назван нигде (у `job-lifecycle-and-viewer` — только экран задачи и клипов).
  - Настройка CORS и lifecycle бакета (у `migrate` по `CLAUDE.md:64`) и браузерный E2E ETag (`testing.md:84`)
    не принадлежат ни одной фиче. Без CORS `complete` не соберёт загрузку (canon §8, VT-05).
- **Эталон:** задание Phase 3 — «все FR/AC ядра покрыты фичами недели, у каждой — ключи»; canon §10 (16/5/8/8/30
  ключей); `p-replicator-known-gaps.md` PR-003/PR-007 («сценарий добавлен ≠ требование закрыто»).
- **Чем опасно:** `/run mvp` пройдёт все 12 фич до `done`, а у продукта не будет лендинга, удаления, событий
  метрики и рабочей загрузки из браузера. Метрика недели (`/admin/metrics`) читает события, которых никто
  не пишет.
- **Как чинить:** дописать ключи в `source_ids` существующих фич (дешевле, чем новые фичи): лендинг
  + FR-clips-14 пп. 1–2 + AC-clips-18 → `growth-loop-and-ops`; FR-clips-12 + AC-clips-19 + маршрут events →
  `job-lifecycle-and-viewer`/`growth-loop-and-ops`; FR-clips-13 + AC-clips-17 + уборщик → отдельная малая фича
  или `job-lifecycle-and-viewer`; CORS/lifecycle бакета + `/parts` + экран загрузки + браузерный E2E ETag →
  `upload-and-admission`; AC-clips-24 → `stt-probe`; AC-clips-1/21/25/26/28 → `foundation-auth`; AC-clips-29 →
  `growth-loop-and-ops`; FR-LOOK-* + NFR-clips-7 → фичи экранов; NFR-clips-4/8 → `deploy-netherlands`. Затем
  прогнать сверку «каждый ключ canon §10 встречается ≥ 1 раза в `mvp` или помечен 2-й очередью» — это
  однострочный слой-1 страж.

### TK-05 · medium · первая фича `stt-probe` не может собраться без монорепо, которое строит вторая
- **Где:** roadmap `stt-probe` (`depends_on: []`, `expected_files: apps/worker/src/cli/ops.ts,
  packages/models/src/transcriber.ts`); `CLAUDE.md:129`, `DEVELOPMENT_GUIDE.md:75` —
  `node apps/worker/dist/cli/ops.js stt-probe`.
- **Что не так:** `dist/` требует `package.json`, workspaces, tsconfig и сборку. По roadmap всё это — первая
  строка `foundation-auth` (`expected_files: package.json`), а общие манифесты «правит только integration
  owner» (`CLAUDE.md:268`). Исполнитель `stt-probe` либо нарушит владение манифестом, либо не сможет
  собрать `dist`.
- **Эталон:** Completion день 1 ставит пробу и monorepo-скелет в один день, но порядок внутри дня не задан.
- **Как чинить:** вынести минимальный скелет монорепо (корневой `package.json`, workspaces, tsconfig, пустые
  пакеты) в `stt-probe` как первый шаг с явным владельцем манифестов. Второй вариант: разрешить пробе
  запуск через `tsx apps/worker/src/cli/ops.ts` без `dist`.

### TK-06 · medium · проверка разрешения и длительности «до ffprobe» невыполнима и расходится с Pseudocode
- **Где:** `agents/code-reviewer.md:78-80` — «Разрешение больше 3840×2160 и расхождение фактической
  длительности с заявленной — `file_invalid` до `ffprobe`».
- **Эталон:** Pseudocode «Подготовка» (стр. 414–420): разрешение берётся `display_dims(probe)` из ffprobe с
  `-f fmt -protocol_whitelist file`; длительность — «по декодированному аудио… ffprobe по пакетам». До ffprobe
  проверяются только magic bytes. `security-patterns/SKILL.md:36` пишет правильно («в stt.prepare: ffprobe,
  разрешение…»).
- **Чем опасно:** ревьюер (Anthropic) выставит blocker на корректный код, а Codex, чтобы пройти ревью, начнёт
  разбирать заголовки контейнера вручную. Это новая поверхность разбора недоверенного файла.
- **Как чинить:** «…— `file_invalid` в `{job_id}.stt.prepare`: разрешение по ffprobe (только заголовки, ДО
  декодирования кадров), длительность — по пакетам аудио». Добавить пропущенную проверку `watermark_fits`
  (кадр слишком мал для знака → `file_invalid` до допуска STT, VA2-09).

### TK-07 · medium · сигнатура `llm_reserve_kop` в навыке не совпадает с Pseudocode (риск ×1000)
- **Где:** `skills/coding-standards/SKILL.md:60-61` — `est_kop ← llm_reserve_kop(video.duration_ms,
  LLM_EST_CHARS_PER_SEC)`.
- **Эталон:** Pseudocode стр. 461 и canon §11: `est_chars ← ceil(video.duration_ms / 1000) ×
  LLM_EST_CHARS_PER_SEC`; `est_kop ← llm_reserve_kop(est_chars)`; функция одна и та же для шага LLM (стр. 570,
  аргумент — число символов).
- **Чем опасно:** двухаргументная форма с `duration_ms` провоцирует умножить миллисекунды на символы в
  секунду. Оценка вырастет в 1000 раз, и каждая задача получит `quota_user` на допуске. Ещё хуже, если
  появятся две функции с разной семантикой для допуска и для шага LLM.
- **Как чинить:** переписать дословно по Pseudocode, одна функция `llm_reserve_kop(chars)`.

### TK-08 · medium · координаты знака и вторая самопроверка рендера отсутствуют в тулките
- **Где:** все файлы тулкита: `grep 1004|1084|WM_INSET` → пусто. Знак описан только словами «по центру у
  нижней кромки полосы, над субтитрами».
- **Эталон:** Specification FR-GROWTH-003 п. 4 и SC (стр. 649–691): центр x = 540 ±2, нижний край y = 1004
  (16:9 и 4:3, полоса 420…1028), y = 1084 для вертикального исходника, полоса субтитров от y = 1100,
  `WM_INSET = 24`. Pseudocode «Раскладка» шаг 2: вторая самопроверка при старте `worker-render` —
  отрендерить кадр со знаком и отказать в старте, если libass не нарисовал текст (VA2-10).
- **Чем опасно:** `CLAUDE.md:232-234` сам предупреждает, что ADR-010/C4/Completion несут устаревшее место
  OWN-05A-013. Исполнитель, отправленный «сверять формулу с FR-GROWTH-003 п. 4», не получает её в тулките,
  а три документа рядом с ним дают старую. Самопроверку libass тулкит не упоминает вовсе (кроме «один файл
  шрифта»). Процесс, который стартует и рендерит пустую плашку, пройдёт стартовую проверку `pw ≤ 294`.
- **Как чинить:** в `coding-style.md` §Единицы и в `architect.md` ADR-010 вписать числа x = 540,
  y = 1004/1084, субтитры ≥ 1100, `WM_INSET = 24` и обе стартовые самопроверки `worker-render`
  (геометрия + наличие пикселей текста).

### TK-09 · medium · cross-family записан по семействам, но не по моделям; путь при исчерпании лимита двусмыслен
- **Где:** `CLAUDE.md:46-56`, `DEVELOPMENT_GUIDE.md:88-93`, roadmap `notes.cross_family`, агенты.
- **Что однозначно (верно):** код — Codex (OpenAI), план/ревью/QE — Anthropic, автор не рецензирует себя.
  Это записано в 5 местах без противоречий.
- **Что не так:**
  1. Модель и effort Codex по классу задачи не назначены: «`gpt-6-astra` / `gpt-6-sol` / `gpt-6-luna`, класс
     задачи выбирает модель». Сопоставления вида «рабочий код — `gpt-6-sol`, деньги/допуск/рендер —
     `gpt-6-astra`, скаффолды Phase 4 — `gpt-6-sol` medium» в проекте нет нигде: ни в тулките, ни в
     `decisions-owner.md` (OWN-05A-00M перечисляет три модели, включая `luna`, без назначения). Если такое
     сопоставление задано координатором, в документы проекта оно не попало. Модель ревьюера Anthropic (Opus 5.5
     или Sonnet 5) тоже не закреплена.
  2. `CLAUDE.md:54-56` отсылает к `feature-adr-ultracode.md` §«Usage-adaptive routing», но не говорит, включать
     ли его. По тому правилу при ≥ 70 % все оставшиеся стадии, включая QE, переходят на Codex (исключение
     FR-2.9: coder = QE = Codex). Это прямо нарушает «автор не рецензирует сам себя». Исполнитель
     `feature-adr` получит поведение по умолчанию: `usageAdaptive=true` при включённой маршрутизации.
- **Как чинить:** одна таблица в `CLAUDE.md` «класс работы → модель Codex + effort; ревью → модель Anthropic»
  (записать решением координатора со ссылкой на OWN-05A-00M или спросить владельца). Добавить строку: «для
  05a `usageAdaptive: false`; при исчерпании лимита стадия ждёт или спрашивает владельца. QE на семействе
  автора кода не допускается».

### TK-10 · low · `S3_*` — шесть переменных, не пять
- **Где:** `rules/secrets-management.md:20`. **Эталон:** canon §6: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY` + `S3_TENANT_ID` (пусто разрешено только в test). **Как чинить:** «`S3_*`
  (6, `S3_TENANT_ID` пустым только в test)».

### TK-11 · medium · CORS бакета в чек-листе дня 0 без `AllowedHeaders=content-type`
- **Где:** `CLAUDE.md:249-250`, `DEVELOPMENT_GUIDE.md:66` — `AllowedOrigins=BASE_URL`, `AllowedMethods=PUT,GET`,
  `ExposeHeaders=ETag`.
- **Эталон:** canon §8: «`AllowedHeaders` = `content-type`». Если браузер шлёт `PUT` части с
  `Content-Type`, предварительный запрос без разрешённого заголовка отвергается. `curl` этого не увидит.
- **Как чинить:** дописать `AllowedHeaders=content-type` в обе строки (владелец настраивает бакет по этому
  чек-листу).

### TK-12 · low · реальный вызов LLM дня 4 выпал из `llm-selection`
- **Где:** roadmap `llm-selection` — калибровка токенов только в `measurement-and-calibration` (дни 10–11).
- **Эталон:** Completion день 4: «один реальный вызов LLM на настоящем транскрипте с записью
  `completion_tokens`» (V3-11б). Он подтверждает, что `LLM_MAX_OUTPUT_TOKENS` и `est_kop` ≈ 1170 коп. вообще
  укладываются в 2400.
- **Как чинить:** добавить этот вызов в описание и DoD `llm-selection`.

### TK-13 · low · мелкие неточности текста
- `skills/project-context/SKILL.md:85` — «18 решений владельца», в `decisions-owner.md` 19 строк (000, 00M,
  001–016, 014a).
- `agents/architect.md:26` — «один образ, пять процессов»: из образа приложения запускаются четыре (`web`,
  `migrate`, `worker-ai`, `worker-render`).
- `agents/architect.md:73-74` — фраза «единственное исключение — маршрут `/admin/*` в кабинете партнёра нет,
  роль оператора возвращает `403`» повреждена. Нужно: «исключение — `/admin/*`: без роли `operator` → `403`».
- `skills/coding-standards/SKILL.md:48` — «`EnqueueScan`-аналог» — термин не из 05a, похож на перенос из
  проекта 04. Убрать.
- `rules/secrets-management.md:60` — «Исключение ровно одно», а дальше перечислено шесть переменных. Нужно
  «одна категория исключений».

### TK-14 · low · квитанция Phase 3 не оканчивается терминальной строкой
- **Где:** `docs/discovery/toolkit.md:126` — `## Status: completed` (заголовок Markdown).
- **Эталон:** `swarm-file-evidence.md` п. 2: последняя строка ровно `Status: completed`. Строгая проверка
  координатора сочтёт квитанцию незавершённой.
- **Как чинить:** последняя строка — `Status: completed` без `## `.

## Сводка

| Severity | Находки |
|---|---|
| high | TK-01, TK-02, TK-03, TK-04 |
| medium | TK-05, TK-06, TK-07, TK-08, TK-09, TK-11 |
| low | TK-10, TK-12, TK-13, TK-14 |

Непроверенное: скрипты стражей не запускались (их нет, TK-02); `check-canon.cjs` не запускался, целостность
канона сверена по sha256 (совпадает). Сопоставление моделей Codex по классам задач взято из задания
координатора и в документах проекта не найдено: в TK-09 это записано как отсутствие, а не как расхождение.

Status: completed
