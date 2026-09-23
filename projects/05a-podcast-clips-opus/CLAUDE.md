# ClipMkr (05a) — контекст проекта

Прочитать корневой `CLAUDE.md`, применимые `../../.claude/rules/`, политику моделей и телеметрию
p-replicator, прежде чем реализовывать что-либо здесь. Общий toolkit (10 навыков, 11 команд,
4 агента, 13 правил, хуки) живёт в корневой `.claude/`; новый оркестратор в этом проекте не
создаётся.

## Что это

ClipMkr превращает длинную русскоязычную запись (подкаст, интервью) в короткие вертикальные клипы
1080×1920 с вшитыми субтитрами-фразами (подпись говорящего), объяснимой оценкой потенциала (хук,
завершённость мысли, длина — и почему) и полупрозрачным знаком `clipmkr.ru` на бесплатном плане.
Рост — content-driven: автор публикует клип сам, зритель видит знак, приходит и делает свой клип
(CJM Variant A, OWN-05A-001). Оценка потенциала — предсказательный инструмент для автора, а не
механизм роста; эти две вещи не смешиваются ни в постановке, ни в интерфейсе.

**Статус на 2026-09-23: Phase 1 (SPARC) + Phase 2 (валидация, 2 итерации + точечная проверка)
завершены — [`docs/Final_Summary.md`](docs/Final_Summary.md),
[`docs/validation-report.md`](docs/validation-report.md). Реализация не начиналась**: кода,
миграций, `package.json` монорепо не существует. Ни одна фича `feature-roadmap.json` не `done`.

## Документация — читать в этом порядке

1. **PRD** ([`docs/PRD.md`](docs/PRD.md)) — продукт, метрика недели, очереди поставки.
2. **Specification** ([`docs/Specification.md`](docs/Specification.md)) — 16 FR-clips, 5
   FR-GROWTH, 8 принятых FR-LOOK, 8 NFR, 30 AC, 69 сценариев с машинными ключами.
3. **Architecture** ([`docs/Architecture.md`](docs/Architecture.md)) +
   [`docs/Architecture-compose.md`](docs/Architecture-compose.md) (разрез, см.
   [`docs/dispatch-plan.md`](docs/dispatch-plan.md)) — устройство системы: 8 сервисов compose,
   границы доверия, внешние зависимости.
4. **ADR** ([`docs/ADR.md`](docs/ADR.md)) — 17 архитектурных решений, у каждого раздел «Как
   проверить»; развилки и отвергнутые варианты — [`docs/ADR-forks.md`](docs/ADR-forks.md).
5. **Pseudocode** ([`docs/Pseudocode.md`](docs/Pseudocode.md)) — 45 алгоритмов, каждый несёт
   `REQUIREMENT:` с ключом Specification/канона.
6. **Refinement** ([`docs/Refinement.md`](docs/Refinement.md)) — 20 edge cases, 13 обязательных
   конкурентных/адверсариальных тестов, 15 мутационных стражей.
7. **Completion** ([`docs/Completion.md`](docs/Completion.md)) — DoD (ядро / 2-я очередь), честная
   оценка по дням (14–19 + 7 дней беты), чек-лист развёртывания, метрика недели по шагам.

Источник имён, чисел и единиц — [`docs/canon.md`](docs/canon.md): заморожен после ответов
владельца на СТОП 2, хеш зафиксирован в [`docs/dispatch-plan.md`](docs/dispatch-plan.md). Документ
и код ссылаются на канон, не изобретают свои имена. Где `Specification.md` расходится с каноном —
действует канон, расхождения перечислены в canon §12. Решения владельца по каждой развилке —
[`docs/decisions-owner.md`](docs/decisions-owner.md) (OWN-05A-000…016).

## Cross-family: кто пишет план, кто код (OWN-05A-00M)

Решение владельца: **планирование и проверка — семейство Anthropic** (Opus 5.5 / Sonnet 5 / Haiku
4.5; Fable исключён — квота), **код — семейство OpenAI через Codex** (`gpt-6-astra` / `gpt-6-sol` /
`gpt-6-luna`); синтез CJM и HTML — Codex `gpt-6-astra` medium; архитектура и ADR писала Opus 5.5.
Таблица ниже — **окончательное решение координатора** по `docs/decisions-owner.md` OWN-05A-00M
(TK-09, второй проход после review): привязывает три модели Codex и двух ревьюеров Anthropic к
классу задачи. Обязательна к исполнению.

| Класс работы | Codex (модель, effort) | Ревью/QE (Anthropic) |
|---|---|---|
| Обычные фичи (маршруты, экраны, миграции, CLI `ops`) | `gpt-6-sol`, high | Sonnet 5 |
| Конвейер STT→LLM→рендер, денежный контур (допуск, потолки, резерв), знак | `gpt-6-astra`, high | Opus 5.5 |
| Перенос из донора, изолированные модули (Solution_Strategy «взять»/«доработать») | `gpt-6-sol`, medium | Sonnet 5 |
| Механика (конфиги, фикстуры, `.env.example`, разметка тестовых данных) | `gpt-6-luna`, low | Sonnet 5 |

Безопасность — Opus 5.5, вместе с денежным контуром (одна строка ревьюера, не отдельная).
`gpt-6-luna` назначена ровно механическим задачам — не оставлена без назначения, как в
предыдущей версии этой таблицы.

Правило `codex-invocation-local.md` (корень) и `feature-adr-ultracode.md` §«Cross-model QE
default» применяются буквально: **автор кода не рецензирует сам себя** — ревью и QE идут на
модели ДРУГОГО семейства, чем та, что написала правку. **Для 05a `usageAdaptive: false`**
(отклонение от дефолта `feature-adr-ultracode.md` §«Usage-adaptive routing»): при исчерпании
лимита Anthropic стадия ЖДЁТ или СПРАШИВАЕТ владельца, а НЕ переключается автоматически на
Codex-QE того же семейства, что писало код — автоматическое переключение нарушило бы «автор кода
не рецензирует сам себя» (то самое исключение FR-2.9, которого в этом проекте допускать нельзя).

## Стек и сервисы compose (ровно 8, канон §1)

| Сервис | Профиль | Роль |
|---|---|---|
| `caddy` | prod | единственная дверь, TLS для `clipmkr.ru`; лимит тела `/api/*` — 1 МБ |
| `web` | prod, test | Next.js 15.5.12: страницы, REST route handlers канона §7, `/admin/*` |
| `migrate` | prod, test | `prisma migrate deploy` + CORS/lifecycle бакета, одноразово |
| `worker-ai` | prod, test | очереди `stt`+`llm`; единственный владелец `OPENROUTER_API_KEY`/`OPENAI_API_KEY` |
| `worker-render` | prod, test | очередь `render`, ffmpeg; лимит `cpus`, без ключей моделей |
| `postgres` | prod, test | PostgreSQL 16, без публикации порта |
| `redis` | prod, test | Redis 7 с паролем, BullMQ + лимиты входа/регистрации |
| `minio` | test | S3 только для тестов (OWN-004); прод — Cloud.ru Evolution |

Модели — только через OpenRouter (ADR-003), сервер продукта в Нидерландах: STT с диаризацией
(модель выбирает **проба дня 1**, ADR-001) и `anthropic/claude-sonnet-5` для выбора фрагментов и
объяснимой оценки (ADR-005). Прямой OpenAI — запасной путь STT за тем же интерфейсом `Transcriber`,
не автоматика. Стек взят из донора `djd1m/2026-jan-pu-opus-clone@cc6ac59` (OWN-05A-000):
переиспользование по файлам — Architecture.md §«Donor Reuse Map».

## Ключевые инварианты (нарушение — регресс, не стиль)

- **Выполнимость LLM проверяется ДО оплаты STT (OWN-05A-012, ADR-006 п.3).** На допуске задачи код
  оценивает верхнюю границу резерва LLM по длительности видео и отказывает `quota_user`/
  `quota_global` **до первого платного вызова транскрипции**, если её не хватает. Иначе
  двухчасовой выпуск оплачивает STT целиком и падает `selection_failed` только на резерве LLM
  (риск VA-03, закрытый именно этой проверкой).
- **Резерв — атомарной операцией «увеличить, если ≤ предела», ДО вызова.** `INSERT … ON CONFLICT
  DO UPDATE SET used = used + :n WHERE used + :n <= :limit RETURNING used`; пустой `RETURNING` =
  отказ. «Прочитать, потом записать» запрещено — обе конкурентные попытки видят свободный остаток.
- **Ворота допуска STT живут в шаге 1 «Транскрипции куска», не в «Повторе» (VA-01, VT2-14).**
  Повтор задачи после отказа по потолку не создаёт новых платных вызовов без факта допуска —
  мутационный страж обязателен (Refinement §2.5).
- **Квота новичка (OWN-05A-016).** Аккаунт младше 24 ч без `account.beta_at` — 30 мин записи в
  сутки; все новички вместе — не больше половины суточного потолка STT сервиса (пул
  `stt_sec_newbie`); бета-авторы отмечает `ops beta-add <email>` и получают полные 120 мин с первой
  минуты. Урезание временное (24 ч), не постоянное; принятый остаточный риск — атака отлежавшихся
  аккаунтов через сутки (V3-13, PRD §7) не отменяется, только откладывается.
- **Счёт по попыткам, не по успехам.** Таймаут, отказ провайдера и повтор куска списывают деньги;
  повторная попытка куска резервирует его секунды дополнительно (не возвращает резерв при
  таймауте — провайдер мог взять деньги).
- **Ненастроенный потолок валит старт процесса.** Девять потолков (canon §6) без дефолта; пустая
  переменная не означает «без ограничений» (`fail-closed-defaults.md`, `honest-configuration.md`).
- **Число только из кода.** Модель выбора фрагментов возвращает `start_unit`/`end_unit` —
  **индексы** единиц транскрипта, не миллисекунды; миллисекунды считает код (ADR-005 п.2). Длину
  клипа (0–20 баллов) считает код, не модель.
- **Знак переживает три способа кадрирования, не два (OWN-05A-015, VA-05, VA2-02, V3-12).** Знак —
  внутри картинки видео, по центру у нижней кромки полосы, над субтитрами; ширина плашки
  ГАРАНТИРОВАНА `≤ 294 px` стартовой самопроверкой `worker-render` — иначе процесс не стартует, а
  не рендерит знак шире окна.
- **Метрика недели считает авторов по каналу, минимум с аккаунтами (V3-18, VT2-02).**
  `authors_confirmed = min(accounts, channels)` — иначе один автор с несколькими аккаунтами
  ложно засчитывается как несколько разных авторов.
- **Порядок операций — это и есть защита.** Лимит частоты ДО валидации тела; валидация ДО заявки
  `Idempotency-Key`; квота ПОСЛЕ валидации и ДО платного вызова; подпись/сессия по сырым данным ДО
  разбора (`../../.claude/rules/security-operation-order.md`).
- **Недоступность внешнего источника истины — исключение, откатывающее транзакцию**, а не
  возвращаемое значение (ADR-004; урок ADR-007 донора: штатный возврат коммитит частичное
  состояние).

## Команды разработки

Монорепо не заведено: `package.json`, миграции и код не существуют. Команды ниже — целевые, из
`Architecture.md`/`canon.md`, подтверждаются исходником фичей `foundation-auth` (см. roadmap), не
раньше:

```bash
npm test           # unit + integration; конкурентные — Refinement §2.4 (13 тестов, обязательны)
npm run lint
npm run build       # по каждому workspace: web, worker, db, queue, s3, config, models, payments, types

# STT-проба дня 1 — самостоятельный скрипт, БЕЗ монорепо (ADR-001 п.4, Completion §5, TK-05):
node projects/05a-podcast-clips-opus/scripts/stt-probe.mjs <файл>
# позже, когда worker-ai существует — та же логика тонкой обёрткой:
docker compose exec worker-ai ops stt-probe <файл>

# интеграционные — на НАСТОЯЩЕМ Postgres/Redis/MinIO, тестовый профиль:
docker compose --profile test up
```

`docker compose up` — только после проверок. **Все команды ниже — из корня репозитория** (той же
директории, откуда запускается `claude`):

```bash
node .claude/hooks/check-ports.cjs projects/05a-podcast-clips-opus              # Правило №0: хранилища/web без публикации
bash scripts/check-port-conflicts.sh projects/05a-podcast-clips-opus           # занятость портов этой машины (80/443 заняты)
bash projects/05a-podcast-clips-opus/scripts/check-env-wiring.sh                # создаётся в Phase 4 (Codex); process.env.X ↔ environment: сервиса
bash projects/05a-podcast-clips-opus/scripts/check-compose-buildable.sh        # создаётся в Phase 4 (Codex); собрать И стартовать каждый build-сервис
```

Первые два скрипта существуют (репозиторий, `TK-02`); третий и четвёртый — Phase 4 переносит их из
шаблона `.claude/snippets/bash/check-env-wiring.sh` и образца `projects/01-testimonials-senja/scripts/`
в `projects/05a-podcast-clips-opus/scripts/` (roadmap, фича `foundation-auth`/`deploy-netherlands`,
`expected_files`). Оба самостоятельны в выборе рабочего каталога (`cd "$(dirname "$0")/.."`
внутри скрипта) — путь можно давать откуда угодно, лишь бы он вёл к самому файлу.

## Правила репозитория, применимые к этому проекту

- [`docker-ports.md`](../../.claude/rules/docker-ports.md) — Правило №0: `postgres`/`redis`/`minio`
  без публикации; в prod у `web` нет `ports:` вовсе (единственная дверь — `caddy`).
- [`compose-hygiene.md`](../../.claude/rules/compose-hygiene.md) — теги образов (MinIO — явный
  `RELEASE.…`, не `latest`), `healthcheck`+`service_healthy`/`service_completed_successfully`,
  `restart: unless-stopped` у всех кроме `migrate`, монорепо в Docker (манифесты всех 9 workspace
  до `npm ci`).
- [`deployment-seams.md`](../../.claude/rules/deployment-seams.md),
  [`port-conflicts-local.md`](../../.claude/rules/port-conflicts-local.md) — стык модулей,
  `BASE_URL` без дефолта, сквозной прогон по адресу, который выдало развёртывание, не `localhost`.
- [`shared-resource-verification.md`](../../.claude/rules/shared-resource-verification.md) —
  конкурентные тесты обязательны на каждом разделяемом ресурсе (потолки, аренда рендера, счётчик
  входа); последовательный тест ничего не доказывает.
- [`security-operation-order.md`](../../.claude/rules/security-operation-order.md),
  [`fail-closed-defaults.md`](../../.claude/rules/fail-closed-defaults.md),
  [`honest-configuration.md`](../../.claude/rules/honest-configuration.md) — порядок проверок,
  трактовка отсутствующих/невалидных значений.
- [`model-call-cost.md`](../../.claude/rules/model-call-cost.md) — 9 потолков STT/LLM
  (`docs/model-cost-contract.md`); счёт по попыткам, отказ до вызова.
- [`long-running-job.md`](../../.claude/rules/long-running-job.md) — три состояния задачи
  (`docs/long-job-contract.md`), идентификатор `job_id`, выдаётся до начала работы.
- [`incoming-webhooks.md`](../../.claude/rules/incoming-webhooks.md) — на неделе законное «вебхуков
  нет» (`docs/webhook-contract.md`); интерфейс `PaymentProvider` — только v1, не подключён.
- [`embeddable-widget.md`](../../.claude/rules/embeddable-widget.md) — законное «не встраивается»
  (`docs/embed-contract.md`).
- [`guard-must-be-able-to-fail.md`](../../.claude/rules/guard-must-be-able-to-fail.md) — все 15
  мутационных стражей `Refinement.md` §2.5 обязаны показать красное до зачёта.
- [`codex-invocation-local.md`](../../.claude/rules/codex-invocation-local.md) — механика вызова
  Codex (закрытый stdin, доверенный каталог, барьер приземления) для стадий, которые пишет код.

## Проектный toolkit (Phase 3, сгенерирован 2026-09-23)

Общие команды, хуки и 10 вендорных навыков остаются в корневой `.claude/` и здесь не дублируются
(`replicate-pipeline.md` §«Что генерируется vs pre-shipped»).

| Агент | Когда звать |
|---|---|
| [`planner`](.claude/agents/planner.md) | разложить фичу на единицы, назвать связывающие FR/AC/ADR и порядок операций |
| [`architect`](.claude/agents/architect.md) | границы сервисов, внешние зависимости, новый ADR, стык compose |
| [`code-reviewer`](.claude/agents/code-reviewer.md) | после каждой единицы реализации: атомарность резерва, порядок допуска, владение, знак |
| [`cost-guard`](.claude/agents/cost-guard.md) | ЛЮБОЕ изменение, трогающее STT/LLM-вызов, потолки, admission-gate — до код-ревью, а не вместо него |

| Навык | Когда грузить |
|---|---|
| [`project-context`](.claude/skills/project-context/SKILL.md) | вопросы о продукте, метрике недели, очередях поставки, словаре |
| [`coding-standards`](.claude/skills/coding-standards/SKILL.md) | пока пишется или правится код |
| [`security-patterns`](.claude/skills/security-patterns/SKILL.md) | граница доверия, платный вызов, знак, атрибуция |
| [`feature-navigator`](.claude/skills/feature-navigator/SKILL.md) | «что дальше», статус фичи, очередь 1 vs 2 |

| Правило | О чём |
|---|---|
| [`security.md`](.claude/rules/security.md) | порядок операций, транспорт сессии, владение, 404 vs 403 |
| [`coding-style.md`](.claude/rules/coding-style.md) | монорепо, единицы измерения, PostgreSQL без ORM-магии, известные грабли стека |
| [`testing.md`](.claude/rules/testing.md) | слой по природе признака, 13 обязательных конкурентных тестов, 15 мутационных стражей |
| [`secrets-management.md`](.claude/rules/secrets-management.md) | какой секрет какому сервису, ротация, отказ вместо дефолта |

Полная карта соответствий Phase-3 ↔ пре-упакованному тулкиту и то, что сознательно НЕ создано (с
причиной) — квитанция координатора в `docs/discovery/toolkit.md`.

## Feature lifecycle и roadmap

Реализация — через `/feature` (4+ файлов или новая архитектура) с маршрутизацией `/go`. Порядок
фаз PLAN → VALIDATE → IMPLEMENT → REVIEW не пропускается (`../../.claude/rules/feature-lifecycle.md`).
Перед `/go`/`/feature` — `bash scripts/complexity-router.sh` (из корня репозитория; скрипт сам
переходит в корень через `git rev-parse --show-toplevel`, поэтому путь безопасен из любого cwd):
код `1` — L/XL, остановка на
плане у владельца (это ожидаемо для фич, трогающих деньги — `stt-pipeline`, `llm-selection`); код
`2` — «проверка не выполнена», не тир T.

[`.claude/feature-roadmap.json`](.claude/feature-roadmap.json) — 17 фич; ядро недели
(`priority: mvp`, 13 фич) в линейном порядке зависимостей, первая — `stt-probe`
(`scripts/stt-probe.mjs`, самостоятельный Node 22 + ffmpeg скрипт без монорепо, блокирующая проба
дня 1 по ADR-001; не зависит ни от чего — TK-05, второй проход), затем
`foundation-auth` → `upload-and-admission` → `stt-pipeline` → `llm-selection` → `render-pipeline`
→ `job-lifecycle-and-viewer` → `video-deletion-and-cleanup` → `growth-loop-and-ops` →
`testing-hardening` → `watermark-ocr-verification` → `measurement-and-calibration` →
`deploy-netherlands`. Вторая очередь (`priority: low`, тег `queue-2`, 4 фичи — сброс пароля на
`/admin/users`, `/admin/partners`, `/admin/spend`, экран fake-door) не блокирует метрику недели
(PRD §«Очереди поставки», OWN-05A-014). Каждый FR-clips/FR-GROWTH/принятый FR-LOOK/NFR-clips/
AC-clips из canon §10 закреплён за ≥1 фичей (mvp или queue-2) — таблица «ключ → фича» и проверка
скриптом (0 непривязанных) — `docs/discovery/toolkit.md` §«Трассировка ключей после TK-04»
(toolkit-review, TK-04).

## Известные оговорки Phase 2 (перенесены в реализацию, а не забыты)

Итоговый вердикт Phase 2 — 🟡 CAVEATS, 0 blocker, 0 high открытых
([`docs/validation-report.md`](docs/validation-report.md)). Известные medium/low (13 из итерации 2
+ 4 из точечной проверки val3-verify) и принятые риски — не «дефекты, которые кто-то забыл», а
явно перенесённый в реализацию хвост:

- **`check-canon.cjs` = 2** на этом проекте — дефект несовместимости двух вендорных стражей при
  разрезе `Architecture.md`/`Architecture-compose.md` (`unitRows()` читает каждую таблицу
  документа), не дефект проекта. Целостность канона проверена вручную сравнением sha256 с
  `docs/dispatch-plan.md` — делать так же при следующей проверке, пока апстрим не примет заявку
  (кандидат: `unitRows()` должна читать только таблицу под `## Единицы`).
- Число потолков в `Completion.md`/`Final_Summary.md` может отставать от канона (9, не 7) — V3-05;
  при сомнении канон (`canon.md` §6) авторитетен.
- Конкретная модель OpenRouter с метками спикеров на русском — UNCONFIRMED до пробы дня 1
  (Architecture.md §External Dependencies); продукт не останавливается этой строкой (VA-08).
- `LLM_EST_CHARS_PER_SEC = 22` и `LLM_MAX_OUTPUT_TOKENS`-калибровка через `LLM_FIELD_MAX_CHARS` —
  оценки, калибруются по первым 3 выпускам (Completion день 4 и день 11).
- Мультиаккаунты: квота новичка откладывает атаку на сутки, не отменяет (V3-13) — принятый
  остаточный риск, PRD §7.
- Правовые вопросы РФ (152-ФЗ, 38-ФЗ, маркировка) — [ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ] (OWN-05A-004), не снято.

## День 0 владельца (не входит в 14–19 дней агента)

Без этого агенту НЕКУДА развернуть код и НЕЧЕМ отправить письмо (Completion §1.3): домен + DNS +
TLS для `clipmkr.ru` (на 2026-09-23 HTTPS не отвечает, ADR-017); аккаунт и домен Resend с SPF/DKIM
(OWN-05A-011); аккаунт и бакет Cloud.ru с CORS (`AllowedOrigins=BASE_URL`,
`AllowedMethods=PUT,GET`, `AllowedHeaders=content-type`, `ExposeHeaders=ETag` — без
`AllowedHeaders=content-type` браузер не пройдёт preflight на `PUT` с заголовком `Content-Type`,
`curl` этого не покажет); доступ к серверу в Нидерландах; ключ
`OPENROUTER_API_KEY`. **Параллельно, не после** — ручной набор 8–12 авторов беты; каждого до старта
беты отмечает оператор `ops beta-add <email>`, иначе он получит квоту новичка (30 мин), а не 120.

## Скаффолды Phase 4

`docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, `.gitignore` пишет Codex на
Phase 4 (не Phase 3) — эскиз и правила уже зафиксированы в
[`docs/Architecture-compose.md`](docs/Architecture-compose.md) и не должны расходиться при
реализации. Единственный публикуемый порт в prod — `${CADDY_HTTP_PORT:-80}`/`${CADDY_HTTPS_PORT:-443}`
у `caddy`; `web` в prod без хостового порта (только `docker-compose.dev.yml`,
`127.0.0.1:${WEB_PORT:-3105}`, канон §6).

## Parallel execution strategy

Каждый пишущий агент получает изолированный worktree и непересекающийся набор файлов; координатор
интегрирует только по именованным terminal-квитанциям
(`../../.claude/rules/swarm-file-evidence.md`). Общие манифесты (`package.json`, lockfile,
`docker-compose.yml`, `packages/db/migrations/*`) правит только integration owner. Читающее
исследование может идти параллельно без ограничения; запись в разделяемые ресурсы (счётчики
`quota_counter`, `spend_ledger`, аренда рендера) — только через атомарные операторы БД, а не через
координацию в памяти процесса.
