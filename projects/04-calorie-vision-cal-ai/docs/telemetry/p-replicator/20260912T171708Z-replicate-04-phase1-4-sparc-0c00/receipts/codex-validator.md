# Отчёт независимой валидации Phase 2

Requested model: gpt-5.6-sol high  
Actual model/effort: unknown / unknown — метаданные исполнения хостом не предоставлены  
Spec revision: sha256:eb69591d375f

## Verdict

🔴 NEEDS WORK — blocking floor нарушен у 9 из 13 историй, а алгоритмический контракт противоречит ADR-001 и не обеспечивает несколько обязательных контуров.

## Scores

| US-nnn | Оценка | INVEST | SMART | Статус |
|---|---:|---:|---:|---|
| US-001 | 82/100 | 6/6 | 5/5 | REVIEW |
| US-002 | 72/100 | 6/6 | 4/5 | BLOCKED — Traceability=0 |
| US-003 | 70/100 | 6/6 | 3/5 | BLOCKED — Traceability=0 |
| US-004 | 87/100 | 6/6 | 4/5 | REVIEW |
| US-005 | 59/100 | 5/6 | 3/5 | BLOCKED — Traceability=0 |
| US-006 | 77/100 | 6/6 | 5/5 | BLOCKED — Traceability=0 |
| US-007 | 80/100 | 5/6 | 4/5 | BLOCKED — Traceability=0 |
| US-008 | 69/100 | 6/6 | 4/5 | BLOCKED — Traceability=0 |
| US-009 | 97/100 | 6/6 | 5/5 | READY |
| US-010 | 87/100 | 6/6 | 4/5 | BLOCKED — Traceability=0 |
| US-011 | 83/100 | 5/6 | 4/5 | BLOCKED — Traceability=0 |
| US-012 | 86/100 | 5/6 | 4/5 | BLOCKED — Traceability=0 |
| US-013 | 92/100 | 6/6 | 4/5 | READY |

Оценка включает story-specific security-бонус/штраф и ограничена диапазоном 0–100. Growth traceability получила проектный бонус +5: все семь seed-ID перенесены; бонус не дублировался в каждой строке US. Историй с оценкой ниже 50 нет, поэтому обязательная перепись формулировок по порогу `<50` не требуется.

## Findings

- **V2-R01 · blocker · stories/traceability · `docs/Refinement.md:68`, `docs/Pseudocode.md:405`.** Именованные BDD-сценарии существуют только для `SC-US-001-1`, `SC-US-004-1`, `SC-US-009-1`, `SC-US-013-2`. Утверждение «26 claimed» и поля `REALISES` связывают AC с алгоритмами, но не образуют требуемую таблицу AC → именованный сценарий. Поэтому Traceability=0 у девяти историй и действует blocking floor. Исправить: добавить `## Criterion scenarios` со всеми 26 ID, уникальными именами сценариев и ссылками на тестовый слой.

- **V2-R02 · high · acceptance/security · `docs/Specification.md:401`, `docs/Specification.md:412`, `docs/Specification.md:423`, `docs/Specification.md:444`, `docs/Specification.md:455`, `docs/Specification.md:477`.** Для фото-ввода, чтения дневника и мутаций результата нет story-linked сценариев невалидного ввода, обхода владения или межпользовательского доступа. Исправить: добавить применимые security AC — malformed image/injection, чужой scan/diary, mutation без владения — с одинаково неразглашающими ответами.

- **V2-R03 · blocker · pseudocode/coherence · `docs/ADR.md:21`, `docs/ADR.md:32`, `docs/Pseudocode.md:32`, `docs/Pseudocode.md:119`, `docs/Pseudocode.md:124`.** ADR-001 запрещает поля калорийности в ответе модели и `done` без ссылки на `food_item`; Pseudocode хранит и запрашивает `model_kcal_estimate`, а результат со всеми `unmatched` всё равно доходит до `done`. Исправить: убрать калории из model schema, определить сравниваемую оценку как отдельный расчёт из DB-backed кандидатов и завершать без единого сопоставленного `food_item` не статусом `done`.

- **V2-R04 · high · pseudocode · `docs/model-cost-contract.md:17`, `docs/model-cost-contract.md:34`, `docs/Pseudocode.md:77`, `docs/Pseudocode.md:81`.** Объявлен отдельный потолок Sonnet-эскалаций 600/сутки, но `CheckAndConsumeQuota` имеет только session, IP и общий global-ключ; отдельного измерения типа вызова нет. Исправить: добавить атомарный escalation scope/key с лимитом 600, fail-closed конфигурацию и отдельный отказ до второго вызова.

- **V2-R05 · high · pseudocode/race · `docs/Pseudocode.md:117`, `docs/Pseudocode.md:121`, `docs/Pseudocode.md:128`.** После истечения аренды второй воркер может вызвать модель, пока первый ещё работает; нет lease owner/fencing token, условной финализации или списания квоты за повторный вызов. Исправить: ввести уникальный lease token/version, heartbeat либо жёсткое прерывание до expiry, проверку квоты перед каждым реальным provider call и `UPDATE … WHERE lease_token=:mine AND status='queued'`.

- **V2-R06 · high · architecture/pseudocode · `docs/Pseudocode.md:175`, `docs/Pseudocode.md:291`, `docs/Pseudocode.md:344`.** В десяти API-контрактах нет команд для подтверждения/удаления diary entry, выдачи/отзыва согласия, удаления аккаунта и отзыва карточки, хотя алгоритмы и AC требуют эти действия. Исправить: закрепить операции в существующих маршрутах либо изменить канон и добавить явные маршруты, включая authz, идемпотентность и ответы.

- **V2-R07 · high · architecture/data · `docs/Pseudocode.md:24`, `docs/Pseudocode.md:267`, `docs/Pseudocode.md:315`.** Закрытая модель из 12 сущностей не содержит записей интереса Pro и событий перехода/шеринга. Автоматически созданная `share_card` не доказывает факт шеринга, поэтому воронка US-011 и результат `RecordProInterest` не имеют источника истины. Исправить: добавить каноническое event/interest-хранилище либо точно назначить существующие поля и семантику каждого счётчика.

- **V2-R08 · high · pseudocode/long-job · `docs/long-job-contract.md:14`, `docs/long-job-contract.md:32`, `docs/Pseudocode.md:346`.** Контракт заявляет `идемпотентный-ключ` и ответ `202`, но `POST /scans` не принимает ключ, не задаёт его уникальность и описан под общей колонкой `200`. Повтор после разрыва может создать второй платный scan. Исправить: принять `Idempotency-Key`, атомарно связать его с `scan_id`, возвращать тот же `202`-результат при повторе и задать срок хранения ключа.

- **V2-R09 · high · coherence · `docs/ADR.md:161`, `docs/ADR.md:172`, `docs/Refinement.md:20`, `docs/Pseudocode.md:237`, `docs/Pseudocode.md:352`.** Specification/Pseudocode разрешают явному коду заменить cookie/deeplink, тогда как ADR Confirmation и Refinement требуют отклонять любой второй код через UNIQUE. `Architecture.md:258` продолжает называть уже исправленный API-контракт неисправленным. Исправить: утвердить единую матрицу `explicit > deeplink > cookie`, обновить ADR/Refinement/Reconciliation и тестировать замену атомарным `UPDATE`, а не конфликтом вставки.

- **V2-R10 · high · dependencies · `docs/Specification.md:40`, `docs/Architecture.md:95`.** Продукт принимает HEIC до 12 МБ, но Anthropic поддерживает JPEG, PNG, GIF и WebP, а прямой API ограничивает изображение 10 МБ; шага конвертации нет. Это подтверждает [официальная документация Vision](https://platform.claude.com/docs/en/build-with-claude/vision). Исправить: хранить исходник при необходимости, но перед моделью транскодировать HEIC в JPEG/WebP, повторно проверять MIME/размер и гарантировать provider payload ≤10 МБ.

- **V2-R11 · high · dependencies/pseudocode · `docs/Specification.md:48`, `docs/Specification.md:54`, `docs/Architecture.md:96`, `docs/Pseudocode.md:119`.** Structured outputs подтверждают типы, но не поддерживают `minimum`/`maximum` и `maxItems`; значит диапазон confidence 0..1 и максимум три кандидата нельзя гарантировать одной схемой. Ограничения перечислены в [официальной документации Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Исправить: добавить серверную semantic validation после декодирования и fail-closed ветки для выхода за диапазон.

- **V2-R12 · medium · acceptance · `docs/Specification.md:420`, `docs/Specification.md:425`, `docs/Specification.md:448`, `docs/Specification.md:527`.** «Одним жестом» проверяется тремя нажатиями, а «мгновенно» и «немедленно» не имеют порога; для карточек рядом существует конкретное `≤60 с`. Исправить: согласовать число действий и заменить термины измеримыми пределами, например UI-пересчёт ≤100 мс p95 и закрытие публичного URL ≤60 с.

- **V2-R13 · medium · coherence · `docs/PRD.md:49`, `docs/Pseudocode.md:240`, `docs/Specification.md:501`.** PRD определяет атрибуцию как «всегда pending», но канон предусматривает `pending → activated`, а SC-US-010-1 одновременно требует pending и засчитанную активацию. Исправить: определить pending как состояние до первого успешного распознавания и ожидать activated после него.

- **V2-R14 · medium · growth traceability · `docs/product-discovery-brief.md:182`, `docs/Specification.md:344`.** `FR-GROWTH-007` перенесён из строки `SPECULATIVE` в обязательное требование без отдельной записи человеческого решения. Механический trace проходит, но не доказывает разрешение на promotion. Исправить: записать явное принятие владельцем с причиной либо оставить требование гипотезой.

- **V2-R15 · medium · dependencies · `docs/Architecture.md:89`, `docs/Completion.md:78`.** Таблица External Dependencies объявлена исчерпывающей, однако Completion опирается на PagerDuty, Slack и email-оповещения, которых в ней нет. Исправить: добавить отдельные способности доставки alert с условиями доступа/fallback либо обозначить каналы как неподтверждённые предложения, не обязательный контур.

## Проверено без замечаний

| Линза | Статус |
|---|---|
| 1. stories | ❌ 13 историй имеют AC; ниже 50 нет, но 9 блокированы floor по V2-R01 |
| 2. acceptance | ⚠️ Все 26 `SC-US-nnn-k` существуют и имеют Given/When/Then; замечания V2-R02, V2-R12 |
| 3. architecture | ⚠️ Distributed Monolith, Compose/VPS, PostgreSQL-контейнер, закрытые `db`/`storage` и единственная дверь Caddy соблюдены; замечания V2-R06–R07 |
| 4. pseudocode | ❌ Все 17 алгоритмов и все 26 SC названы; блокирующие/высокие разрывы V2-R03–R08, V2-R11 |
| 5. coherence | ❌ Основные числа 10/3000, 0,6, 15%, 30 дней, 60 с и MVP-границы согласованы; противоречия V2-R03, V2-R09, V2-R13 |
| 6. dependencies | ⚠️ USDA search/details/licensing, Telegram initData/direct links и организационный Usage API подтверждены первичными страницами; пробелы V2-R10–R11, V2-R15 |

## Evidence

Проверки: `check-growth-trace=0`, `check-model-cost=0`, `check-job-contract=2 (not-deployed)`.  
Профиль прогона: `compact-quality-first-v2`; текущая requested-модель — `gpt-5.6-sol high`, actual неизвестна.  
Длительность и расход именно этой validation-попытки недоступны; числовая экономия не установлена.  
Телеметрия: `docs/telemetry/p-replicator/20260912T171708Z-replicate-04-phase1-4-sparc-0c00/run.json`; статус `partial`, запись не изменялась из-за режима только чтения.
Status: completed
