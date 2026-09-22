# N5 «КлипМейкер» — контекст проекта

Прочитать корневой `CLAUDE.md`, применимые `../../.claude/rules/`, политику моделей и телеметрию
p-replicator, прежде чем реализовывать что-либо здесь. Общий toolkit живёт в корневой `.claude/`;
новый оркестратор в этом проекте не создаётся.

## Что это

Нарезка коротких вертикальных клипов из длинной записи: ведущий загружает подкаст или вебинар,
продукт расшифровывает речь с таймкодами слов, выделяет 3–8 самодостаточных фрагментов по 20–75 с,
режет их в 9:16 с вшитыми субтитрами и объясняет оценку каждого фрагмента тремя компонентами.
Клиент — веб-приложение Next.js на своём домене, мобильная вёрстка обязательна. Контур — Россия и
СНГ, интерфейс русский; публикует пользователь сам в VK Клипы, Telegram, Rutube, Дзен. Клон
референса Opus Clip; CJM — вариант **D** (путь A целиком плюс блок «клипы для гостя», OWN-001).

**Статус на 21.09.2026: код не существует.** Пройдены Phase 0.5 (профиль источника), Phase 1 (SPARC)
и Phase 2 (валидация, вердикт 🟡 CAVEATS). Написаны только скаффолды: `docker-compose.yml`,
`Dockerfile`, `.dockerignore`, `.env.example`, `.gitignore`, `proxy/Caddyfile`. Ни одного пакета
монорепо, ни одной миграции, ни одного теста, ни одного развёрнутого стенда. Из существования
документа не следует ни маршрута, ни зелёного теста.

Что перенесено сюда из §7 отчёта валидации и не должно потеряться:

- **Механизм, породивший 38 расхождений Phase 2, не устранён:** цитата числа отстаёт от
  документа-владельца, детерминированного стража на это нет. Меняя число, искать его сквозным
  поиском по ВСЕМ своим файлам, а не только в файле-владельце.
- **Спецификация заморожена** на `sha256:3ac09f3dcccc354f292ac0ed0452de0e7f14f8bafd68b6f8e54354e303407532`
  (898 строк). Правка требует перепривязки ревизии в `docs/test-scenarios.md` и пересчёта трассировки.
- **Утверждения о поведении SQL выведены чтением, а не прогоном.** «Этот `UNIQUE` столкнётся», «эта
  вставка пройдёт мимо потолка» — гипотезы. Первое дело реализации — тесты, которые СНАЧАЛА красные.
- **Совместимость Cloud.ru не доказана:** тесты идут на MinIO, ручная приёмка остаётся владельцу
  (DEC-A-005, чек-лист в `docs/Completion.md`).
- **Две зависимости `UNCONFIRMED` и в неделю не входят:** скачивание по ссылке VK/Rutube
  (`FR-INGEST-003`) и отправка файла ботом Telegram (`FR-RESULT-003`), обе `Should`.
- **Живой прогон не проверял ничего:** уложится ли час в 20 минут, читается ли метка на телефоне,
  найдёт ли модель три самодостаточных фрагмента в настоящем выпуске — отвечает только стенд.

## Документация — читать в этом порядке

1. **Specification** ([`docs/Specification.md`](docs/Specification.md)) — ЧТО строить: 29 FR, 5
   growth-требований, 15 look-требований, 6 NFR, 14 историй и 35 критериев `SC-US-nnn-k`.
2. **Architecture** ([`docs/Architecture.md`](docs/Architecture.md)) — устройство: 7 сервисов
   compose, отображение 15 сущностей на хранилища, 17 внешних зависимостей, безопасность.
3. **ADR** ([`docs/ADR.md`](docs/ADR.md)) — восемь решений (ADR-001…008), у каждого Confirmation —
   проверка, обязанная упасть при нарушении решения.
4. **Pseudocode** ([`docs/Pseudocode.md`](docs/Pseudocode.md)) — 34 алгоритма, контракты маршрутов,
   переходы состояний, стратегия ошибок.
5. **Refinement** ([`docs/Refinement.md`](docs/Refinement.md)) — edge cases, слои проверок, пять
   обязательных конкурентных прогонов, 12 стражей ADR и 13 тестов «сначала красное».
6. **Completion** ([`docs/Completion.md`](docs/Completion.md)) — Pre-Deployment, последовательность
   выпуска, откат, мониторинг, передача.

Четыре контракта: [`docs/long-job-contract.md`](docs/long-job-contract.md),
[`docs/model-cost-contract.md`](docs/model-cost-contract.md),
[`docs/webhook-contract.md`](docs/webhook-contract.md),
[`docs/embed-contract.md`](docs/embed-contract.md). Вердикт фазы и оставшиеся оговорки —
[`docs/validation-report.md`](docs/validation-report.md). Решения без владельца и способ их отката —
[`docs/decisions-autonomous.md`](docs/decisions-autonomous.md) (DEC-A-001…016);
решения владельца — [`docs/decisions-owner.md`](docs/decisions-owner.md) (OWN-001…005).

Источник имён и чисел — [`docs/canon.md`](docs/canon.md), заморожен 2026-09-21 и размножен один раз
на Phase 2 (DEC-A-010): любой документ и любой код ссылаются на эти идентификаторы, не изобретают
свои.

## Стек и сервисы compose (ровно 7 в боевом профиле, канон §6)

| Сервис | Технология | Роль |
|---|---|---|
| `web` | Next.js 15 App Router, tRPC, SSR | 10 публичных путей и 15 процедур канона §5, сессии, квоты, подпись ссылок S3, постановка заданий, сторож раз в минуту |
| `worker-stt` | образ воркера, ffprobe | шаг `probe` (длительность, звук, резерв диска), списание минут, чанкинг аудио ≤ 25 МБ, `whisper-1` |
| `worker-llm` | образ воркера | один вызов Claude Sonnet 5 со structured outputs, проверка диапазонов НАШИМ кодом |
| `worker-video` | образ воркера, ffmpeg 7 + libass | `concurrency 1`, ASS-субтитры, кроп 9:16, метка, выгрузка в S3 |
| `db` | PostgreSQL 16 + Prisma | источник истины: `UNIQUE`, `CHECK`, атомарные счётчики; без публикации порта |
| `redis` | Redis 7, AOF, `noeviction`, пароль | транспорт BullMQ, не источник истины; без публикации порта |
| `proxy` | Caddy 2.8, профиль `edge` | единственная публичная дверь: TLS, лимит частоты ДО тела, `X-Forwarded-For` |

Профиль `test` добавляет `minio` (тот же S3-код офлайн) и `test`. Файлы в бою — **Cloud.ru Object
Storage** (S3, `ru-central-1`, OWN-004). Модели: **OpenAI `whisper-1`** (`verbose_json`, таймкоды
слов) и **Claude Sonnet 5** (Messages API, structured outputs).

## Ключевые инварианты (нарушение — регресс, не стиль)

- **Число только из транскрипта с таймкодами слов (ADR-003).** Границы фрагмента режутся по словам,
  а не по секундам «на глаз». Результат `Transcriber` без `words[].start/end` отвергается ДО
  постановки стадии `select`: без таймкодов слов нет ни границ, ни субтитров.
- **Квота списывается ДВУМЯ операторами в ОДНОЙ транзакции ДО платного вызова (ADR-006, V2-R01).**
  `INSERT … (used = 0) ON CONFLICT DO NOTHING`, затем
  `UPDATE … SET used = used + :n WHERE used + :n <= :limit RETURNING used`; пустой результат И ЕСТЬ
  отказ. Однооператорная форма `INSERT … ON CONFLICT DO UPDATE … WHERE …` НЕДЕЙСТВИТЕЛЬНА: её
  `WHERE` принадлежит ветке `DO UPDATE` и на вставку не действует, поэтому первый за сутки запрос
  проходил бы без проверки потолка. **Предел — параметр окружения `:limit`, не колонка** (V2-R03).
- **Шесть scope квоты, и каждый нужен:** `user_minutes` (90), `user_uploads` (2),
  `user_upload_refunds` (2), `user_llm` (2), `global_minutes` (600), `global_llm` (20). Ключей
  шесть, пользовательских текстов пять — у `user_upload_refunds` своего текста нет намеренно.
  Отсутствие ЛЮБОЙ из шести переменных `N5_LIMIT_*` валит старт; проверяется ШЕСТЬЮ отдельными
  прогонами, не одним (V3-R02).
- **Слот `user_uploads` возвращается при отказе по СВОЙСТВАМ файла** (`too_large`, `not_media`,
  `no_audio`, `too_short`, `too_long`, `probe_timeout`) в той же транзакции, что пишет `failed`, и
  НЕ возвращается при отказе по потолкам (`refused_*`) — DEC-A-014. Возвратов не больше 2 в сутки
  (DEC-A-015): без потолка заведомо негодные файлы бесплатно занимают `worker-stt` скачиванием.
- **Фенс попыток и `render_fence` у клипа (ADR-001).** `fence` монотонен НА ВИДЕО и общий для трёх
  стадий и всех серий; уникальна ровно пара `(video_id, fence)` — не `(video_id, stage, attempt_no)`,
  иначе вторая попытка рендера второго клипа не вставится (V2-R02). Результат принимается только
  оператором с условием актуальности; ноль затронутых строк — `stale_attempt_result` в аудит.
- **Метка fail-closed по тарифу (ADR-004).** `WatermarkRequired = plan !== 'paid'` — сравнение НА
  РАВЕНСТВО: `null`, `''`, `PAID`, ` paid`, `premium`, число, булево получают метку. Проверка вида
  `!== 'free'` открыла бы снятие метки опечаткой. Значение берётся ТОЛЬКО из базы; поле «без метки»
  в теле запроса не читается вовсе.
- **`N5_PUBLIC_ORIGIN` без значения по умолчанию** (V2-R06, DEC-A-010). Он вшивается в ПИКСЕЛИ метки
  и определяет каждую выдаваемую наружу ссылку; отсутствие или непригодное значение валит запуск
  `web` и `worker-video`. Цена выше, чем у обычного секрета: адрес `localhost`, подставленный
  «разумным» дефолтом, уезжает в чужую ленту навсегда и правится только повторным рендером.
- **Согласие гостя фиксируется ведущим ДО создания гостевой страницы (ADR-008).** `guest.create` без
  подтверждённого согласия — `422`, `guest_pack` не создан. Это правовая граница, а не форма.
- **Порядок операций — это и есть защита.** Лимит частоты в Caddy ДО тела; Zod ДО заявки
  `Idempotency-Key`; квота `user_uploads` ДО выдачи подписанных ссылок; минуты ДО первого вызова
  Whisper; резерв диска ДО скачивания; согласие ДО `guest_pack`. bcrypt считается ВНЕ транзакции БД.
- **Три состояния долгой задачи, не два.** `выполняется` · `успех` · `отказ`, и каждое выглядит
  по-своему. Молчание — это НЕ «выполняется»: `updated_at` старше 5 мин даёт «нет ответа от
  обработки», сторож через 30 мин переводит в `failed(stalled)`. Идентификатор `video_id` выдаётся
  ДО первого отправленного байта видео.
- **Счёт вызовов модели — по ПОПЫТКАМ, не по успехам.** Таймаут, отказ поставщика и повтор чанка
  списываются наравне с успехом: поставщик берёт деньги за попытку.
- **Чужой и несуществующий ресурс дают ОДИН ответ `404`.** `403` подтвердил бы существование записи,
  а перебор идентификаторов и есть способ это проверить.

## Команды разработки

Монорепо ещё не заведено: ни `package.json`, ни `node_modules`, ни одного workspace. Команды ниже —
**план**, который фиксирует исходником фича `foundation`; до неё не объявлять их работающими.

```bash
npm test                 # vitest: unit + стражи по исходнику
npm run lint
npm run build            # по каждому workspace

# интеграционные — на НАСТОЯЩЕМ PostgreSQL 16 и Redis 7, MinIO вместо Cloud.ru:
docker compose --project-directory . --profile test run --rm --build test
```

`--build` ОБЯЗАТЕЛЕН. Без него `run` берёт РАНЕЕ СОБРАННЫЙ образ, и прогон молча проверяет старый код. Наблюдено 22.09.2026: после правок раунда 3 фичи 2 результат совпал с предыдущим побайтово, включая длительность упавшего теста — зелёное и красное одинаково не значили ничего.

`docker compose up` — только после проверок, и `--project-directory .` обязателен (из корня
монорепо compose не находит конфигурацию):

```bash
node ../../.claude/hooks/check-ports.cjs .              # Правило №0: db, redis, minio наружу не смотрят
bash ../../scripts/check-port-conflicts.sh projects/05-podcast-clips-opus
bash scripts/check-env-wiring.sh                        # страж №1 deployment-seams; пишется фичей foundation
```

## Правила репозитория, применимые к этому проекту

- [`docker-ports.md`](../../.claude/rules/docker-ports.md) — `db`, `redis`, `minio` без публикации
  портов; единственный публикуемый порт — `127.0.0.1:${N5_EDGE_PORT:-4181}` у Caddy в профиле `edge`.
- [`compose-hygiene.md`](../../.claude/rules/compose-hygiene.md) — `name:` у compose, явные теги
  образов, `condition: service_healthy`, `restart: unless-stopped`, монорепо в Docker.
- [`deployment-seams.md`](../../.claude/rules/deployment-seams.md) и
  [`port-conflicts-local.md`](../../.claude/rules/port-conflicts-local.md) — дефект живёт в стыке;
  занятость портов этой машины.
- [`shared-resource-verification.md`](../../.claude/rules/shared-resource-verification.md) —
  конкурентный прогон квоты обязателен, последовательный зеленеет при обеих реализациях.
- [`security-operation-order.md`](../../.claude/rules/security-operation-order.md),
  [`fail-closed-defaults.md`](../../.claude/rules/fail-closed-defaults.md),
  [`honest-configuration.md`](../../.claude/rules/honest-configuration.md),
  [`silent-fallbacks.md`](../../.claude/rules/silent-fallbacks.md) — порядок проверок, трактовка
  отсутствующих значений, запрет на дефолт у `N5_PUBLIC_ORIGIN`.
- [`model-call-cost.md`](../../.claude/rules/model-call-cost.md) — потолки платных вызовов
  ([`docs/model-cost-contract.md`](docs/model-cost-contract.md)).
- [`long-running-job.md`](../../.claude/rules/long-running-job.md) — три состояния и идентификатор
  `video_id` ([`docs/long-job-contract.md`](docs/long-job-contract.md)).
- [`guard-must-be-able-to-fail.md`](../../.claude/rules/guard-must-be-able-to-fail.md) — каждый из
  12 стражей ADR обязан быть испытан на внедрённом дефекте, обе строки в квитанции фичи.
- [`complexity-router.md`](../../.claude/rules/complexity-router.md) — тир перед `/go` и `/feature`.

## Проектный toolkit (Phase 3, сгенерирован 2026-09-21)

Общие команды и хуки остаются в корневой `.claude/` и здесь не дублируются. Полная карта с
обоснованием каждого отсутствия — [`docs/toolkit-map.md`](docs/toolkit-map.md).

| Агент | Когда звать |
|---|---|
| [`planner`](.claude/agents/planner.md) | разложить фичу на единицы, назвать связывающие FR/SC/ADR и порядок операций |
| [`architect`](.claude/agents/architect.md) | схема, 10 путей и 15 процедур, границы сервисов, новый ADR |
| [`code-reviewer`](.claude/agents/code-reviewer.md) | после каждой единицы: атомарность квоты, фенс, fail-closed метки, согласие, владение, `404` |

| Навык | Когда грузить |
|---|---|
| [`project-context`](.claude/skills/project-context/SKILL.md) | вопросы о продукте, границах недели, актёрах, словаре, числах канона |
| [`coding-standards`](.claude/skills/coding-standards/SKILL.md) | пока пишется или правится код |
| [`security-patterns`](.claude/skills/security-patterns/SKILL.md) | любая граница доверия и любой платный вызов |

| Правило | О чём |
|---|---|
| [`security.md`](.claude/rules/security.md) | порядок операций, границы файла, секреты по контейнерам, anti-fraud, `404` вместо `403` |
| [`coding-style.md`](.claude/rules/coding-style.md) | монорепо, TypeScript, Prisma и SQL, единицы и время, закрытые перечисления, грабли клона |
| [`testing.md`](.claude/rules/testing.md) | слой по природе признака, пять конкурентных прогонов, 12 стражей с внедряемым дефектом |
| [`secrets-management.md`](.claude/rules/secrets-management.md) | какой секрет какому сервису, отказ вместо дефолта, ротация |

## Feature lifecycle и roadmap

Реализация ведётся через `/feature` (4+ файлов или новая архитектура) или `/plan` (≤ 3 файлов), с
маршрутизацией `/go`. Порядок фаз — PLAN → VALIDATE → IMPLEMENT → REVIEW
(`../../.claude/rules/feature-lifecycle.md`); Phase 2 не пропускается. Перед `/go` и `/feature`
прогонять `bash ../../scripts/complexity-router.sh`: код `1` — L/XL и остановка на плане у
владельца, код `2` — «проверка не выполнена», а не тир T.

[`.claude/feature-roadmap.json`](.claude/feature-roadmap.json) — двенадцать фич MVP в линейном
порядке зависимостей: `foundation` → `upload-and-quota` → `queue-and-probe` → `transcription` →
`selection-and-score` → `render-and-watermark` → `progress-and-clips-screen` → `short-link` →
`guest-pack` → `partner-codes-and-dashboard` → `limits-ui-and-pro-interest` →
`retention-and-erasure`. **Все двенадцать `planned` на 21.09.2026.**

Поле `complexity` — пакетная схема `simple|medium|complex` (S/M/L); тира XL в ней нет вовсе, поэтому
`upload-and-quota` и `render-and-watermark` записаны `complex`, хотя по
[`complexity-router.md`](../../.claude/rules/complexity-router.md) они XL — трогают деньги и
несущие инварианты. Фактический тир изменения решает роутер по реальному диффу.

У каждой фичи должна появиться квитанция `docs/features/<slug>/05_completion.md`: что проверено и
ЧЕМ, что фича НЕ доказывает, какие стражи испытаны мутацией, что осталось хвостом.

## Режим исполнения: cross-family review (OWN-002)

Планирование и проверка — семейство Anthropic; кодирование — семейство OpenAI (Codex); ревью кода
возвращается на Anthropic. Модель, написавшая код, не проверяет его сама. Телеметрия p-replicator
ведётся с первой стадии: `docs/telemetry/p-replicator/<RUN_ID>/` — `run.json`, `events.jsonl`,
квитанции. Недоступные счётчики помечаются `null` с причиной, а не опускаются.

## Parallel execution strategy

Каждый пишущий агент получает изолированный worktree и непересекающийся набор файлов; координатор
интегрирует только по именованным terminal-квитанциям
(`../../.claude/rules/swarm-file-evidence.md`): у единицы есть `WORK_UNIT_ID`, абсолютный
`TRACE_PATH` и последняя строка `Status: completed` либо `Status: failed`. Молчание — не прогресс.
Общие манифесты (`package.json`, lockfile, `docker-compose.yml`, миграции) правит только integration
owner. Читающее исследование может идти параллельно без ограничения; запись в разделяемые ресурсы
(`quota_counter`, `attribution`, `growth_event`) — только атомарными операторами БД, а не
координацией в памяти процесса.
