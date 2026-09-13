# Фича `partner-codes-and-cabinet` — завершение: план + факт реализации

## Статус документа

Реализация ВЫПОЛНЕНА (2026-09-13, продолжение сессии, оборванной в 07:54 UTC; исходный
implementation-код `apps/api/src/partner/*`, `routes/codes.ts`, `routes/partner.ts`,
`packages/shared/src/partner-types.ts` был написан прежней сессией и принят БЕЗ ИЗМЕНЕНИЙ после
построчной ревизии против `01-04_*.md`, кроме одного исправления — см. «Расхождение плана и
факта» ниже). Раздел `## Criterion coverage` ниже — ФАКТ (файлы существуют, тесты прогнаны на
настоящем PostgreSQL профиля `test`), плановая версия ссылок не стирается, а помечена там, где
разошлась.

## Правка после ревью (2026-09-13, слепой судья `codex`, `review-report.md`)

DEC-A-032: второго раунда ревью не будет, эта правка — последняя. Verdict исходного отчёта —
`CHANGES_REQUIRED`, 1 blocker + 2 high устранены; 3 medium — в разделе «Follow-up» ниже, по
явному указанию владельца НЕ чинятся в этом раунде.

| Находка | Правка | Тест |
|---|---|---|
| **RV-01 (blocker)** `activate-attribution.ts:19` — `activateAttributionOnRecognition` не вызывалась НИКАКИМ продакшен-путём: успешное распознавание оставляло атрибуцию `pending` навсегда | Функция перенесена в `packages/db/src/partner-attribution.ts` (recognizer не зависит от `@n4/api` — это и было причиной недостижимости) и подключена в `apps/recognizer/src/lease.ts` `recordResult`: `WRITE_RESULT` теперь `RETURNING device_session_id`, весь метод обёрнут в `withTransaction`, и при `record.status === 'done'` И только когда fence-защищённый `UPDATE` реально затронул строку (`RETURNING` вернул ряд) вызывается `activateAttributionOnRecognition(client, device_session_id)` ДО `COMMIT`. `apps/api/src/partner/activate-attribution.ts` теперь тонкий ре-экспорт из `@n4/db` (старые импорты не ломаются) | `tests/integration/partner/activation-production-wiring.test.ts` (4 теста): реальный `acquireLease`+`recordResult(status='done')` активирует; повторное успешное распознавание — идемпотентно (0 второе `growth_event`); сессия без кода — `no_attribution`, без побочных эффектов; устаревший fence — `stale_lease_result`, атрибуция НЕ тронута (общий откат) |
| **RV-02 (high)** `activate-attribution.ts:42` — обратный порядок блокировок (`FOR UPDATE` на `attribution` ДО codeLock, тогда как `ApplyPartnerCode` берёт codeLock ДО строки) — реальный deadlock между активацией и повторным применением того же кода | `packages/db/src/partner-attribution.ts`: код СНАЧАЛА подсматривается без лока (`stabilizeCandidateCode`), codeLock берётся ПЕРВЫМ и повторно проверяется БЕЗ удержания sessionLock (цикл до 5 попыток, ни разу не запрашивая новый codeLock, уже держа sessionLock — это и было бы источником обратной зависимости); sessionLock берётся ПОСЛЕДНИМ, тем же порядком, что `ApplyPartnerCode`. Названный остаточный (не устранённый) узкий зазор между финальной проверкой без sessionLock и его взятием — задокументирован в коде, не скрыт | `tests/concurrency/partner/activate-vs-apply.test.ts`: активация и повторное применение ТОГО ЖЕ кода одной сессией — управляемое пересечение на настоящем PostgreSQL; критерий — ни один вызов не падает `40P01 deadlock detected`, итог консистентен (`activated` ровно один раз, повтор применения — `conflict`) |
| **RV-03 (high)** `routes/codes.ts:36` + `anti-fraud.ts:33` — ключ проверки (свежий IP-префикс ТЕКУЩЕГО HTTP-запроса) не совпадал с ключом хранения (`device_session.ip_prefix`, замороженный при создании сессии); смена сети между созданием сессии и применением кода обнуляла счётчик и пропускала 51-ю попытку | `routes/codes.ts` `requireSession` больше не вычисляет `ipPrefix` из заголовка текущего запроса — читает ХРАНИМОЕ `device_session.ip_prefix` той же строкой, что и `id`. Семантика смены сети — НАЗВАНА явно (в коде и здесь): история сессии считается по её сети НА МОМЕНТ СОЗДАНИЯ навсегда, `ip_prefix` НЕ обновляется задним числом (иначе прошлые события «переехали» бы вслед за колонкой — симметричный отказ) | `tests/integration/partner/anti-fraud-ip-consistency.test.ts` (HTTP, 2 теста): 50 применений из сети A + 51-я попытка ТОЙ ЖЕ по-настоящему-созданной-в-A сессией, но с заголовком другой сети B в САМОМ запросе, — всё равно блокируется (было бы пропущено до правки); сессия, ДЕЙСТВИТЕЛЬНО созданная в другой сети целиком, получает свой независимый счётчик (named behavior, не обход) |

Прогон после правок: `npm run typecheck`/`lint`/`build` — 0; unit 147/147 без `DATABASE_URL`; integration+concurrency — **176/176** зелёных (43/43 файла, включая 3 новых теста), `web-manifest.test.ts` в этом прогоне тоже зелёный; `down -v` выполнен.

## Follow-up, не блокирующий закрытие (medium — по решению владельца НЕ чинятся в этом раунде)

- **RV-04** (`tests/unit/partner/manual-unblock-guard.test.ts:45`) — страж «разблокировка только вручную» сканирует только `apps/api/src`; фоновый автосброс `blocked → active` в `apps/recognizer/src` или админ-скрипте остался бы невидим.
- **RV-05** (`apps/api/src/partner/dashboard-query.ts:44`, `tests/integration/partner/dashboard.test.ts:121`) — спецификация требует строку «недостаточно данных (n из 30)», реализация и тест сверяют объект `{ insufficient_data: [n, 30] }`; контракт со спецификацией не согласован.
- **RV-06** (`tests/integration/partner/apply-code.test.ts:192`) — тест «перечитывает статус после codeLock» блокирует код ДО вызова `applyPartnerCode`, поэтому не отличает исправленный порядок операций от дефектного (статус из предварительного `normalizeAndFindCode`); квитанция мутации для AC-10 в этом документе тоже отсутствует.

## Расхождение плана и факта: порог anti-fraud (уточнение, не дефект)

`02_pseudocode.md` (`AntiFraudOnCode`, шаг 3) буквально пишет `IF count > 50 THEN block`, где
`count` — количество УЖЕ существующих (до текущей попытки) `code_applied`. При такой семантике
50 существующих применений НЕ блокируют 51-ю попытку (50 не больше 50) — блокируется только
52-я (существующих уже 51). Это на единицу расходится с явным разъяснением тут же в
`01_specification.md` FR-3 («Порог — `> 50`, то есть 51-е применение блокирует код») и с самим
текстом `AC-partner-codes-and-cabinet-9` («Given код с 50 засчитанными … When выполняется 51-е
применение … Then … 51-я попытка получает rejected»).

**Решение реализующего агента:** приоритет отдан АКРИТЕРИЮ ПРИЁМКИ (AC-9) и явному разъяснению
FR-3, а не буквальному тексту `> 50` в пседокоде — потому что AC — измеримый контракт поставки,
а «(то есть 51-е применение блокирует)» это авторская, а не автоматически выведенная интерпретация
того же порога. `apps/api/src/partner/anti-fraud.ts` сравнивает `existing count < 50` для допуска
(было `<= 50`): при 50 уже существующих 51-я попытка получает `block` НЕ будучи записанной,
счётчик никогда не превышает 50. Проверено конкурентным тестом на реальном PostgreSQL
(`tests/concurrency/partner/anti-fraud.test.ts`, оба случая AC-9а/б — см. `## Criterion coverage`).
`02_pseudocode.md` не правился (вне мандата этой сессии — правка исходного плана); расхождение
названо здесь явно, как того требует шапка документа.

## Готовность к реализации

- Миграций НЕ требуется: пять нужных таблиц и оба индекса уже в `packages/db/migrations/001_init.sql`.
- Секретов НЕ требуется: только уже обязательный `DATABASE_URL`.
- Единственная неизвестная на момент планирования — точный путь файла, где `source-and-correct`
  переводит `recognition.status` в `done` (эта фича его ещё не написала). Контракт вызова назван в
  `03_architecture.md`; конкретную строку интеграции подставляет реализующий агент по факту
  существования того кода.

## Перед передачей результата — ФАКТИЧЕСКИЙ прогон (2026-09-13)

| Проверка | Результат |
|---|---|
| `npm run typecheck` | 0 ошибок |
| `npm run lint` | чисто |
| `npm run build` (все пять пакетов, включая `@n4/web` → `next build`) | успешно |
| `npx vitest run` (unit-слой, БЕЗ `DATABASE_URL`) | 147/147 зелёных, включая 11 новых тестов фичи (нормализация формы, оба стража) — база НЕ вызывается на unit-слое (проверено шпионом, не реальным Postgres) |
| `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` | 166 зелёных / 3 скипнуто; ЕДИНСТВЕННЫЙ красный файл — `tests/integration/web-manifest.test.ts` (`next start` не поднимается в контейнере за отведённое время) — это `apps/web`, фичи не касается, воспроизведено и ДО правок этой сессии (изолированный повторный прогон того же файла подтвердил тот же таймаут независимо от партнёрских тестов) |
| `node ../../.claude/hooks/check-ports.cjs .` | `0` — хранилища не публикуются, reverse-proxy в compose нет |
| `bash ../../scripts/check-env-wiring.sh` | `0` — `api`/`recognizer`: все читаемые переменные проброшены |
| `bash ../../scripts/check-port-conflicts.sh .` | `0` — порт 4180 свободен, БД/хранилище не смотрят в интернет |
| `bash ../../scripts/check-pipeline-gaps.sh . --completion --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md` | код возврата `1` (блокирующие находки), но ВСЕ найденные пункты — `PR-002` (упоминание managed BaaS в `docs/Architecture.md:85`, в контексте «managed BaaS … запрещены», не предложение использовать), `PR-003` (трассировка `FR-LOOK-*` источника `source-product-profile`, вне этой фичи), `PR-007` (формат ссылки на `ADR-002/004/008` в `docs/ADR.md`, авторства Phase 1, задолго до этой сессии), несколько открытых пометок-пробелов в других разделах документации проекта — ни одна не лежит в `docs/features/partner-codes-and-cabinet/` или в файлах этой фичи. **Контур фичи — без открытых пометок-пробелов**, но проект в целом (вне мандата этой сессии) — нет |

**Испытание стражей (`guard-must-be-able-to-fail.md`), обе строки квитанции:**

```text
AC-11 (разблокировка только вручную):
  дефект внедрён (функция backgroundAutoUnblock с UPDATE partner_code SET status='active'
  WHERE blocked_at < now() - interval '1 hour', вне manual-unblock.ts)
    -> Tests  2 failed | 1 passed  (offenders: ["apps/api/src/partner/apply-partner-code.ts"])
  дефект удалён -> Tests  3 passed

AC-17 (код кабинета только с сервера):
  дефект внедрён (queryPartnerDashboard(pool, { accountId: request.query.code ?? accountId, window }))
    -> Tests  1 failed | 2 passed
  дефект удалён -> Tests  3 passed
```

## Известный, честно названный пробел (follow-up, не блокирует Phase 1)

**FU-partner-codes-and-cabinet-1.** `attribution.reject_reason = antifraud_ip_burst` НИКОГДА не
записывается этой фичей: `ActivateAttributionOnRecognition` при заблокированном коде всегда пишет
`code_blocked`, не различая, была ли исходная причина блокировки `antifraud_ip_burst` или `manual`
(см. `01_specification.md`, «Решение…», и `02_pseudocode.md`, конец `ActivateAttributionOnRecognition`).
Причина: узнать задним числом, какая ИЗ ДВУХ причин действовала В МОМЕНТ, когда конкретная
`pending`-строка ещё не была активирована, без хранения снимка на момент блокировки, было бы
изобретением факта. Колонка `reject_reason` при этом остаётся ЗАКРЫТЫМ перечислением из трёх
значений (канон не меняется) — значение `antifraud_ip_burst` в ней просто не достижимо кодом этой
фичи. Устранение — отдельное решение владельца канона: либо принять асимметрию, либо ввести снимок
причины блокировки на момент создания `pending`-атрибуции (полноценная миграция, вне этого плана).

## Вне охвата (следующие фичи роадмапа или отдельные решения)

- Выдача кода партнёру (административный процесс, вне API недели).
- Деактивация партнёра (`partner.status`) как отдельный сценарий, влияющий на его коды.
- Живой прогон `GET /api/v1/partner/dashboard` на развёрнутом стенде по внешнему адресу
  (`deployment-seams.md`) — часть общего E2E CJM, не отдельного смоука этой фичи.

## Criterion coverage

**Таблица ФАКТИЧЕСКАЯ** (прогнана 2026-09-13 на реальном PostgreSQL профиля `test`, кроме
отмеченных `[unit]`, которые намеренно БЕЗ базы — `vitest.config.ts`). Расхождения с ПЛАНОВЫМ
расположением (см. историю файла) отмечены `←план: …`.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-partner-codes-and-cabinet-1 | tests/unit/partner/normalize-code.test.ts [unit] + tests/integration/partner/normalize-code.test.ts | форма/границы 4-12 короткуют до базы [unit]; неизвестный код и найденные границы — на реальном Postgres |
| AC-partner-codes-and-cabinet-2 | tests/integration/partner/apply-code.test.ts | первое применение создаёт pending-атрибуцию и одно событие code_applied |
| AC-partner-codes-and-cabinet-3 | tests/integration/partner/apply-code.test.ts | явный код заменяет cookie и записывает replaced_source |
| AC-partner-codes-and-cabinet-4 | tests/integration/partner/apply-code.test.ts | explicit не перебивается ни другим, ни тем же кодом |
| AC-partner-codes-and-cabinet-5 | tests/integration/partner/apply-code.test.ts | слабый источник не перебивает слабый |
| AC-partner-codes-and-cabinet-6 | tests/concurrency/partner/apply-code-session.test.ts | два кода одной сессией одновременно дают один applied и один conflict, ни один не падает 23505 |
| AC-partner-codes-and-cabinet-7 | tests/integration/partner/apply-code.test.ts | заблокированный код отклоняется до записи в attribution |
| AC-partner-codes-and-cabinet-8 | tests/integration/partner/apply-code.test.ts | самореферал отклоняется до записи в attribution (+ edge case «не тот владелец — не самореферал») |
| AC-partner-codes-and-cabinet-9 | tests/concurrency/partner/anti-fraud.test.ts | (а) 51-е применение блокирует код последовательно; (б) 20 одновременных при 45 исходных — 5 applied, 1 antifraud_ip_burst, 14 code_blocked, ровно одна причина блокировки |
| AC-partner-codes-and-cabinet-10 | tests/integration/partner/apply-code.test.ts ←план: anti-fraud.test.ts | rejected(code_blocked) шагом 4 гейта, шпион AntiFraudCheck НЕ вызван |
| AC-partner-codes-and-cabinet-11 | tests/unit/partner/manual-unblock-guard.test.ts [unit, страж по исходнику] ←план: integration | испытан внедрённым дефектом (см. квитанцию выше) |
| AC-partner-codes-and-cabinet-12 | tests/integration/partner/activate-attribution.test.ts | первое успешное распознавание активирует, второе — no-op; отдельно: сессия без кода — no_attribution |
| AC-partner-codes-and-cabinet-13 | tests/integration/partner/activate-attribution.test.ts | код заблокирован между применением и распознаванием даёт rejected(code_blocked) |
| AC-partner-codes-and-cabinet-14 | tests/integration/partner/activate-attribution.test.ts | самореферал, обнаруженный после входа через Telegram, даёт rejected(self_referral) |
| AC-partner-codes-and-cabinet-15 | tests/integration/partner/dashboard.test.ts | четыре счётчика кабинета совпадают с посеянными growth_event (функция `queryPartnerDashboard` напрямую) |
| AC-partner-codes-and-cabinet-16 | tests/integration/partner/dashboard.test.ts | не-партнёр → 403 без утечки счётчиков (HTTP, реальный вход через Telegram); без входа → 401; неизвестный accountId → not_partner на функции |
| AC-partner-codes-and-cabinet-17 | tests/unit/partner/dashboard-server-authority-guard.test.ts [unit, страж по исходнику] ←план: integration | испытан внедрённым дефектом (см. квитанцию выше) |
| AC-partner-codes-and-cabinet-18 | tests/integration/partner/dashboard.test.ts | честные нули (no_data=true) и порог n<30 (`insufficient_data`) вместо процента, раздельно `i`/`conv` |
| AC-partner-codes-and-cabinet-19 | tests/integration/partner/dashboard.test.ts ←план: unit/dashboard-schema.test.ts | сериализованный ответ не содержит ни одного из 6 запрещённых имён (проверено на живых данных, не на пустой схеме — решение: денежное поле легче пропустить на заполненном ответе, чем на пустом) |

**Дополнительные тесты правки после ревью** (сверх Criterion coverage, закрывают RV-01/02/03,
не переоткрывают отдельные AC-номера — они лежат на пересечении нескольких AC/NFR):
`tests/integration/partner/activation-production-wiring.test.ts`,
`tests/concurrency/partner/activate-vs-apply.test.ts`,
`tests/integration/partner/anti-fraud-ip-consistency.test.ts` — таблица находка→правка→тест выше.

## Answer-map PD-*
PD-REUSE-001 ← FR-partner-codes-and-cabinet-3 (anti-fraud перенесён из N1 как отправная точка).
PD-PRICE-001 ← FR-partner-codes-and-cabinet-10 (в кабинете нет денег).
