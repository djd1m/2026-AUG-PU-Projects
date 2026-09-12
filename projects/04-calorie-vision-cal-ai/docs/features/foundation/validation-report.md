**Verdict:** 🟢 READY

# Requirements Testability Analysis
Spec revision: sha256:3be77fbcc5d393f5b8eabaf396ec7c09b00b132223c3b8ff277ab6eb05cb3234

Проект: N4 «Тарелка». Фича: `foundation`. Валидатор: Phase 2 (Sonnet 5, константа ранбука).
Единица анализа — `FR-foundation-n` / `NFR-foundation-n` (документ не использует форму «As a user»;
это установленный формат `sparc-prd-mini` на уровне фичи — FR/NFR + `AC-<slug>-n`, а не отдельные
user-story). INVEST применён к каждому требованию как к негоциируемой единице работы, SMART — к его
критериям приёмки.

## Summary

- Требований проанализировано: 12 (10 FR + 2 NFR); `AC-foundation-17…21` расширяют существующий
  `FR-foundation-6` (контракт DEC-A-015/DEC-A-018), новой FR/NFR-строки не заводили.
- Критериев приёмки: 21 (`AC-foundation-1` … `AC-foundation-21`), все имеют строку в `## Criterion
  scenarios` (17–21 добавлены в Попытке 2, см. `## Дополнение: AC-foundation-17…21`).
- Средний балл: **95/100** (пересчёт по 12 требованиям не меняется: пять новых критериев уточняют
  контракт `FR-foundation-6`, который уже был оценён 100/100 — см. «Дополнение» ниже).
- Заблокировано (score < 50 или floor): 0.
- Blocking floor (`Testable`/`Completeness`/`Traceability` = 0): не сработал ни для одного
  требования — квоты ниже.
- Находок: 3 (`VF-01`, `VF-02` — `medium`; `VF-03` — `low`, добавлена в Попытке 2), ни одна не
  блокирующая.
- Security acceptance criteria: применимо и присутствует специфично (бонус +5, не понижает счёт).
- Growth traceability: не применимо (фича не касается ни одного `FR-GROWTH-nnn`; growth-события,
  карточки и коды партнёра явно вне объёма — раздел «Объём», «Вне объёма»).

## Results

| Требование | Заголовок | Score | INVEST | SMART | Status |
|---|---|---|---|---|---|
| FR-foundation-1 | Монорепо собирается одной командой | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-foundation-2 | Конфигурация fail-closed | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-foundation-3 | Схема базы, 14 сущностей, три роли | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-foundation-4 | Анонимная сессия устройства | 100/100 | 50/50 ✓ | 30/30 ✓ | READY |
| FR-foundation-5 | Атомарный модуль потолков | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-foundation-6 | Каркас воркера: аренда, fencing, адаптер | 100/100 | 50/50 ✓ | 30/30 ✓ | READY |
| FR-foundation-7 | Каркас фронта: камера первым экраном | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-foundation-8 | Ограничение частоты до разбора тела | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-foundation-9 | Стек собирается, поднимается, здоров | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-foundation-10 | Страж полноты проброса переменных | 95/100 | 50/50 ✓ | 25/30 | READY |
| NFR-foundation-1 | Разделяемые ресурсы корректны под конкуренцией | 95/100 | 50/50 ✓ | 25/30 | READY |
| NFR-foundation-2 | Журнал наблюдаем и безопасен | 95/100 | 50/50 ✓ | 25/30 | READY |

**Средний балл: (92+92+95+100+95+100+92+92+95+95+95+95)/12 = 1138/12 = 95/100.**

INVEST = 50/50 у всех двенадцати: каждое требование независимо от прочих фич роадмапа (Independent),
не диктует реализацию (Negotiable), имеет явную ценность для фичи-каркаса (Valuable — раздел «Цель»:
«семь оставшихся фич роадмапа опираются на эти три вещи»), оценимо и ограничено по объёму (Estimable,
Small — каждое закрывает один узкий механизм) и имеет проверяемые `AC-foundation-n` (Testable).
SMART < 30 в семи случаях исключительно из-за `Time-bound = 0`: у большинства критериев нет числовой
временнóй границы ответа (это НЕ дефект — фича не показывает пользователю ни одного числа и не делает
вызовов модели, поэтому NFR-PERF-001/002 сознательно «не измерено», см. `05_completion.md` §«Что эта
фича НЕ доказывает»). Там, где временная граница есть по существу — 7 суток аренды анонимного дневника
(FR-foundation-4), 60 с аренды задания и 1 с опроса (FR-foundation-6) — `Time-bound = 5` начислен.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-foundation-1 | Чистый клон собирается и перечисляет ровно пять workspace (`tests/integration/workspace.test.ts`) |
| AC-foundation-2 | Отсутствие `N4_SCAN_LIMIT_USER` / `N4_SCAN_LIMIT_DAY` / `N4_ESCALATION_LIMIT_DAY` валит старт с названной переменной — три независимых прогона (`tests/unit/config.test.ts`) |
| AC-foundation-3 | Отсутствие `APP_ORIGIN` валит старт и не подставляет localhost; отсутствие `DATABASE_URL` валит старт с названной переменной (`tests/unit/config.test.ts`) |
| AC-foundation-4 | Миграции создают четырнадцать таблиц канона и расширение `pg_trgm`; повторный прогон применяет ноль файлов (`tests/integration/migrations.test.ts`) |
| AC-foundation-5 | Роль приложения не может менять схему, но выполняет DML (`tests/integration/db-roles.test.ts`) |
| AC-foundation-6 | Первый запрос создаёт сессию с флагами HttpOnly/Secure/SameSite и хранит только хэш (`tests/integration/device-session.test.ts`) |
| AC-foundation-7 | Повторный запрос с действующей cookie не создаёт вторую сессию; неизвестная cookie создаёт новую и не изменяет прежнюю (`tests/integration/device-session.test.ts`) |
| AC-foundation-8 | Одиннадцатая попытка получает `refused` со `scope = user` (`tests/integration/quota-sequential.test.ts`) |
| AC-foundation-9 | Двадцать одновременных попыток при пределе десять дают ровно десять успехов; соседняя сессия не блокируется чужой квотой и пул не переполняется (`tests/concurrency/quota-parallel.test.ts`) |
| AC-foundation-10 | Два воркера на одно задание дают ровно один захват; результат с устаревшим `fence` затрагивает ноль строк и пишет `stale_lease_result` (`tests/concurrency/lease.test.ts`) |
| AC-foundation-11 | Фейковый адаптер детерминирован и не ходит в сеть; режим `live` без ключа валит старт воркера (`tests/integration/provider-adapter.test.ts`) |
| AC-foundation-12 | Корневой маршрут отдаёт видоискатель и две подписи режимов; манифест PWA валиден и не содержит секретов (`tests/integration/web-shell.test.ts`) |
| AC-foundation-13 | Превышение частоты отвечает 429 до разбора тела (`tests/integration/rate-limit.test.ts`) |
| AC-foundation-14 | `health` отвечает 200 при живой базе и 503 при недоступной (`tests/integration/health.test.ts`) |
| AC-foundation-15 | Страж проброса переменных возвращает 0, 1 и 2 на трёх входах (`tests/integration/check-env-wiring.test.ts`) |
| AC-foundation-16 | Секреты и полный адрес заменяются меткой `redacted` с сохранением поля; в вызовы журналирования не передаются секреты и полный адрес (`tests/unit/log-redaction.test.ts`, `tests/unit/source-guards.test.ts`) |
| AC-foundation-17 | Слой конкурентный. Задание без опубликованного кадра невидимо воркеру (`tests/concurrency/lease.test.ts`). Мутация: убран `photo_id IS NOT NULL` из предиката выборки — 1 failed из 9; код восстановлен — 10 passed |
| AC-foundation-18 | Слой конкурентный. Четвёртого захвата не бывает: при трёх исчерпанных задание больше не предлагается (`tests/concurrency/lease.test.ts`). Мутация: убран `lease_fence < 3` — 2 failed из 8; код восстановлен — 10 passed |
| AC-foundation-19 | Слой конкурентный, четыре сценария в одном файле — задание, не взятое никем за пять минут, закрывается `failed(timeout)`; задание с исчерпанными захватами и истёкшей арендой закрывается `failed(timeout)`; уборщик НЕ трогает задание с действующей арендой; воркер не затирает статус, уже закрытый уборщиком (все в `tests/concurrency/lease.test.ts`). Мутация: убрано условие `AND status = 'queued'` из условной записи результата — 1 failed из 9 (`swept_as_timeout` не появлялся); правило Б уборщика вырезано — 2 failed из 8; код восстановлен в обоих случаях — 10 passed |
| AC-foundation-20 | Слой интеграционный. Модель выбирает вызывающий, и ответ сам называет, чей он (`tests/integration/provider-adapter.test.ts`). Мутация: фейк зашивает свою модель вместо `opts.model` — 1 failed из 5; код восстановлен — 6 passed |
| AC-foundation-21 | Слой интеграционный. Фейковый адаптер уважает дедлайн и отказывает, а не отвечает поздно (`tests/integration/provider-adapter.test.ts`). Мутация: фейк игнорирует `deadlineMs` — 1 failed из 5; код восстановлен — 6 passed |

Источник имён сценариев — дословные заголовки тестов из `04_refinement.md` §«Тесты, которые Phase 3
обязан создать» (строки 64–126) и таблицы `## Criterion coverage` в `05_completion.md`; AC-foundation-14
взят из `05_completion.md` (`tests/integration/health.test.ts`), а не придуман, потому что литеральный
заголовок для сборки/подъёма стека в `04_refinement.md` отсутствует, но health-тест есть.
Строки `AC-foundation-17…21` (Попытка 2) взяты дословно из `05_completion.md` (строки 259–263,
таблица `## Criterion coverage`, обновлённая коммитом `3e6e52b`) и перепроверены чтением исходников
тестов: `grep -n "^\s*it("` в `tests/concurrency/lease.test.ts` и
`tests/integration/provider-adapter.test.ts` подтвердил точное текстовое совпадение заголовков.
Данные об испытании стражей мутацией — из `docs/telemetry/p-replicator/20260912T193004Z-foundation-A-7a62/receipts/impl-foundation.md`
§«Шесть новых испытаний стражей мутацией».

## Detailed Analysis: FR-foundation-2 (fail-closed конфигурация) — 92/100

### INVEST Analysis

| Criterion | Pass | Issue |
|-----------|------|-------|
| Independent | ✓ | Валидация конфигурации не зависит от реализации других FR фичи |
| Negotiable | ✓ | Способ валидации (класс, функция) не продиктован |
| Valuable | ✓ | Явно связано с ADR-007 и ценой ошибки (счёт выставляют чужие действия) |
| Estimable | ✓ | Список переменных закрыт и перечислен |
| Small | ✓ | Один модуль (`ValidateRuntimeConfig`) |
| Testable | ✓ | `AC-foundation-2`, `AC-foundation-3` дают точные пары вход/код возврата |

### SMART Analysis (AC-foundation-2, AC-foundation-3)

Цитата (`01_specification.md:211–224`):
> «AC-foundation-2 … Given окружение `api`, в котором задано всё, кроме ОДНОГО из
> `N4_SCAN_LIMIT_USER`, `N4_SCAN_LIMIT_DAY`, `N4_ESCALATION_LIMIT_DAY` … Тот же результат даёт
> значение `''`, `0`, `-1` и `abc`.»
> «AC-foundation-3 … Given окружение `api` без `APP_ORIGIN` (прогон 1) и без `DATABASE_URL`
> (прогон 2) … подстановки `http://localhost:3000` не происходит ни в одном прогоне.»

| Criterion | Pass | Issue |
|-----------|------|-------|
| Specific | ✓ | Имена переменных, коды выхода, конкретные мусорные значения названы |
| Measurable | ✓ | Три отдельных прогона, точные коды возврата |
| Achievable | ✓ | Валидация окружения при старте — стандартный паттерн |
| Relevant | ✓ | Прямая защита от `silent-fallbacks`/`fail-closed-defaults` |
| Time-bound | ✗ | Нет временной границы ответа (не применимо к проверке при старте) |

### Findings

**VF-01 (medium).** `01_specification.md:80–89` (FR-foundation-2) объявляет ОБЯЗАТЕЛЬНЫМИ шесть
переменных: `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
`APP_ORIGIN` (плюс три потолка). Но `AC-foundation-3` (`01_specification.md:220–224`) проверяет
отсутствие ТОЛЬКО `APP_ORIGIN` и `DATABASE_URL` — ни `S3_ENDPOINT`, ни `S3_BUCKET`, ни
`S3_ACCESS_KEY`, ни `S3_SECRET_KEY` не названы ни в одном AC. Тот же пробел в тестовом плане:
`04_refinement.md:67–74` (`tests/unit/config.test.ts`) перечисляет тесты для трёх потолков,
`APP_ORIGIN`, `DATABASE_URL` и `N4_MODEL_PROVIDER` — ни одного теста на отсутствие S3-переменных.
Псевдокод `ValidateRuntimeConfig` (`02_pseudocode.md:66–67`) обрабатывает все шесть переменных ОДНИМ
общим циклом, поэтому механизм скорее всего сработает и на S3, но это ничем не ЗАКРЕПЛЕНО: ни
критерий приёмки, ни поименованный тест не свяжут отсутствие `S3_ACCESS_KEY` с отказом старта —
приёмка `foundation` формально пройдёт, даже если по ошибке реализации это ветвление окажется
пропущено. Секретный характер `S3_ACCESS_KEY`/`S3_SECRET_KEY` (`secrets-management.md`, «отсутствующий
секрет — отказ, а не дефолт») делает это скорее security-пробелом, чем стилистическим.
**Исправление:** добавить к `AC-foundation-3` два прогона (или новый AC) на отсутствие
`S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` и одноимённые тесты в
`tests/unit/config.test.ts`.

**VF-02 (medium).** `01_specification.md:156–162` (FR-foundation-8) и `AC-foundation-13`
(`01_specification.md:300–305`) описывают ограничитель частоты формулой «порог N запросов в окно»,
но нигде — ни в FR, ни в AC, ни в таблице переменных окружения `03_architecture.md`
(«Переменные окружения», строки после «Границы, которые фича обязана сохранить»), ни в списке
обязательных переменных `FR-foundation-2` — не назван КОНКРЕТНЫЙ источник N и длительности окна:
ни литерал канона (как порог эскалации 0,6, ADR-004), ни именованная переменная окружения (как три
потолка модели, ADR-007). В отличие от квоты (`FR-foundation-5`), где предел — проверяемое число из
конфигурации, здесь предел не назван вовсе, и тест (`tests/integration/rate-limit.test.ts`) обязан
будет либо изобрести число сам, либо читать его из ниоткуда не объявленного источника.
**Исправление:** назвать `N` либо литералом канона, либо переменной окружения (например,
`N4_RATE_LIMIT_WINDOW`/`N4_RATE_LIMIT_MAX`) в `FR-foundation-2` и таблице переменных
`03_architecture.md`, с тем же fail-closed поведением, что и у прочих потолков.

Оба пункта — completeness-пробелы конкретных критериев, а не блокеры: механизм в обоих случаях
специфицирован и порядок операций верен (частота ДО разбора тела — `security-operation-order`
соблюдён), недостаёт только источника числа. Ни один AC не теряет `Testable`/`Completeness`/
`Traceability` до нуля — отсюда floor не срабатывает.

**VF-03 (low, добавлена в Попытке 2).** `01_specification.md:136–147` (проза `FR-foundation-6`) не
обновлена вслед за расширением контракта DEC-A-015/DEC-A-018: текст всё ещё описывает предикат
выборки как `WHERE status = 'queued' AND (leased_until IS NULL OR leased_until < now())` и ни словом
не упоминает `photo_id IS NOT NULL`, `lease_fence < 3`, алгоритм `SweepStuckJobs` или новую сигнатуру
порта `recognize(image, schema, opts: { model, deadlineMs })` — при том что `AC-foundation-17…21`
(в том же документе, ниже) и `02_pseudocode.md:164,168,173–183,197–198` (алгоритмы `LeaseRecognitionJob`,
`SweepStuckJobs`, `SelectModelProvider`) полностью и точно несут актуальный контракт. Дефекта в
самой приёмке нет — критерии и тесты корректны и опираются на верную версию контракта, читаемую из
`02_pseudocode.md`; пробел ЧИСТО документационный: тот, кто прочитает только прозу `FR-foundation-6`,
не узнает о существовании уборщика и предела захватов, пока не дойдёт до AC ниже.
**Исправление:** дописать в `FR-foundation-6` абзац с расширенным предикатом, ссылкой на
`SweepStuckJobs` и портом `opts: { model, deadlineMs }`, как это уже сделано в `02_pseudocode.md`.

## Security acceptance criteria

Фича вводит сессии, секреты трёх сервисов и роли БД — применимо целиком.

| Criterion | Статус | Evidence |
|-----------|--------|----------|
| Input Validation | Присутствует, специфично | `FR-foundation-2` (валидатор окружения, закрытые множества `{fake, live}`), `AC-foundation-2/3` |
| Authentication | Присутствует, специфично | `FR-foundation-4`/`AC-foundation-6/7`: cookie `HttpOnly; Secure; SameSite=Lax`, ≥128 бит энтропии, только хэш в базе |
| Authorization | Присутствует, специфично | `FR-foundation-3`/`AC-foundation-5`: три роли БД, `n4_app` без прав DDL, проверено запросом |
| Data Protection | Присутствует, специфично | `ip_prefix` вместо полного адреса, `NFR-foundation-2`/`AC-foundation-16`: редактор запрещённых значений |
| Multi-Tenant Isolation | Не применимо | Фича не вводит multi-tenant модель |
| Secret Management | Присутствует, специфично, с оговоркой VF-01 | `ANTHROPIC_API_KEY` только у `recognizer`, `TELEGRAM_BOT_TOKEN` только у `api`, fail-closed без дефолтов (`FR-foundation-2`); ПРОБЕЛ — S3-секреты не покрыты AC/тестом (см. VF-01) |
| Webhook Security | Не применимо | Фича не принимает вебхуков |

**Бонус:** +5 (пять из семи применимых категорий присутствуют специфично, ноль применимых категорий
отсутствует полностью — штраф −10 не применяется; VF-01 снижен до completeness-замечания, а не до
«критерий отсутствует»).

## Growth traceability

Не применимо (+0). `docs/product-discovery-brief.md` существует и несёт семя `FR-GROWTH-001…007`
проекта, но ни один `FR-GROWTH-nnn` не относится к `foundation`: growth-события (`growth_event`),
карточки, коды партнёра и Telegram-вход прямо перечислены в разделе «Вне объёма» спецификации фичи
(`01_specification.md:51–54`). Отсутствие growth-требований в этом документе — ожидаемое поведение
фичи-каркаса, а не пропуск.

## Дополнение: AC-foundation-17…21 (Попытка 2, 2026-09-12)

После основной поставки координатор расширил контракт `FR-foundation-6` решениями DEC-A-015
(модель/дедлайн задаёт вызывающий; незавершённая публикация невидима; предел захватов) и DEC-A-018
(уборщик застрявших заданий; десятое значение `failure_reason`). В `01_specification.md` добавлены
`AC-foundation-17…21`; в `02_pseudocode.md` — переписанный предикат `LeaseRecognitionJob`, новый
алгоритм `SweepStuckJobs`, новый контракт порта `SelectModelProvider`; в `04_refinement.md` и
`05_completion.md` — восемь новых тестов и строки покрытия. Пять критериев валидированы этой
Попыткой 2 (строки внесены в `## Criterion scenarios` выше, `VF-03` — новая находка). Ворота
`check-pipeline-gaps.sh --criterion-scenarios` на момент Попытки 1 отвечали `GAP` по этим пяти id;
после этой правки контур `foundation` проверен на ноль расхождений (см. раздел «Ворота» ниже).
Вердикт **не изменился: 🟢 READY** — все пять новых критериев имеют испытанные мутацией тесты
(девять прогонов «дефект возвращён → красный, код восстановлен → зелёный» из
`impl-foundation.md`), ни один не теряет `Testable`/`Completeness`/`Traceability` до нуля;
единственная новая находка (`VF-03`) — документационный пробел без ущерба тестируемости.

## Ворота (Попытка 2)

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --criterion-scenarios \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
Код возврата и разбор — см. квитанцию `receipts/validate-foundation.md` §«Попытка 2 (AC-17…21)»:
контур `foundation` — 0 GAP; остаточный код (если не 0) относится, как и в Попытке 1, к
контуру `project` или к соседним фичам без кода, а не к `foundation`.

## Проверено без замечаний

- Все 21 `AC-foundation-n` (1–16 в Попытке 1, 17–21 в Попытке 2) имеют строку в
  `## Criterion scenarios` (Traceability floor не сработал ни разу).
- Порядок операций безопасности (`security-operation-order.md`): частота ДО разбора тела
  (`FR-foundation-8`), квота списывается атомарно без «прочитать-потом-записать» (`FR-foundation-5`,
  `02_pseudocode.md:131`), аренда закрывает транзакцию ДО внешнего вызова (`FR-foundation-6`) — все
  три пары воспроизведены верно.
- Обязательные конкурентные тесты названы явно и НЕ подменены последовательными: квота (20
  параллельных при пределе 10 → ровно 10, `AC-foundation-9`) и аренда (`AC-foundation-10`) —
  соответствует `shared-resource-verification.md` и `testing.md` проекта.
- Guard-must-be-able-to-fail: у каждого стража (`ADR-001`-аналог здесь не применим, но
  `check-env-wiring.sh`, атомарность квоты, fencing, редактор журнала) в `04_refinement.md`
  §«Испытание стражей на внедрённом дефекте» назван внедряемый дефект и ожидаемая красная реакция —
  соответствует `guard-must-be-able-to-fail.md`.
- Fail-closed конфигурация (`honest-configuration.md` CFG-S1/CFG-I2/CFG-I3/CFG-I8): отсутствие,
  пустая строка и нераспознанное значение трактуются как отказ, а не как дефолт, для всех
  перечисленных FR-foundation-2 переменных, кроме пробела VF-01.
- Согласованность с каноном: 14 сущностей (`02_pseudocode.md` Data Structures), три `scope`
  квоты (`user/global/escalation`), 4 значения `recognition.status`, два осознанно добавленных
  маршрута (`POST /api/v1/auth/device`, `GET /health`) записаны и обоснованы, а не введены молча
  (`01_specification.md` §«Два расширения канона»).
- Реализуемость плана против `Architecture.md`: секреты закреплены за верными сервисами
  (`03_architecture.md` таблица переменных совпадает с `secrets-management.md` проекта), порты не
  публикуются кроме петли Caddy, ADR-002/003/007/009 процитированы по существу их решений (проверено
  чтением `docs/ADR.md`).
- Трассировка FR→AC→алгоритм: каждый из 16 исходных `AC-foundation-n` реализован РОВНО одним
  алгоритмом с меткой `REALISES` в `02_pseudocode.md` («Scenario Coverage»: `Not claimed` и
  `Claimed but absent` — оба списка пусты, проверено в Попытке 1). `AC-foundation-17…21` несут ТЕ ЖЕ
  формальные метки: `LeaseRecognitionJob` (`02_pseudocode.md:156–160`) объявляет
  `REQUIREMENT: AC-foundation-17`, `REQUIREMENT: AC-foundation-18` и `REALISES: …, AC-foundation-17,
  AC-foundation-18`; отдельный блок алгоритма (строки 175–177) — `REQUIREMENT`/`REALISES:
  AC-foundation-19` для уборщика; `SelectModelProvider` (строки 190–193) — `REQUIREMENT`/`REALISES`
  для `AC-foundation-20` и `AC-foundation-21`. Прозаический пробел — только в `01_specification.md`
  тексте `FR-foundation-6` (`VF-03`), не в трассировке алгоритмов.

---

**Валидатор:** Sonnet 5 (роль Phase 2, ранбук `docs/feature-runbook.md`). Бюджет: ≤ 30 минут.
