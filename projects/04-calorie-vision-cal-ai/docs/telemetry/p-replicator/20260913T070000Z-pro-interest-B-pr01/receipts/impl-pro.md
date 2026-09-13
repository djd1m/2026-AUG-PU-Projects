# Квитанция реализации — `pro-interest-and-limits-ui`

RUN_ID: `20260913T070000Z-pro-interest-B-pr01` · WORK_UNIT_ID: `impl-pro`

Продолжение работы погибшей сессии (07:54 UTC, 11 незакоммиченных файлов). Ревизия ниже —
первый шаг этого прогона.

## Ревизия унаследованного состояния (на момент старта)

| Файл | Состояние |
|---|---|
| `packages/shared/src/domain/classify-contact.ts` | готово — `classifyContact`, соответствует FR-6/AC-5 дословно (границы 254/255, 5/4/32/33) |
| `packages/shared/src/domain/enums.ts` (`PRO_INTEREST_*`) | готово — уже существовало до этой фичи |
| `apps/api/src/interest/record-pro-interest.ts` | готово — порядок шагов (`source` → форма контакта → cadence) соответствует `security-operation-order`; `pg_advisory_xact_lock` + `SELECT … FOR UPDATE`, `AlreadyRecordedToday` как исключение (не значение) |
| `apps/api/src/routes/interest.ts` | готово — `owner_key` с сервера (cookie), закрытые ответы 401/422/429/201/503 |
| `apps/web/app/limit/screen.tsx` | готово — `LimitScreen`, `formatResetAt`, `classifyContact`-подсказка на клиенте (мягче серверной, не строже) |
| `apps/api/src/server.ts`, `packages/shared/src/index.ts` (wiring) | готово — маршрут зарегистрирован, экспорт добавлен |
| `tests/unit/classify-contact.test.ts` | готово — 9 тестов |
| `tests/unit/limit-screen.test.tsx` | готово — 11 тестов |
| `tests/integration/interest.test.ts` | готово — 6 тестов (AC-6/7/9/10 +401 + два независимых owner_key) |
| `tests/integration/limit-screen-no-payment.test.tsx` | готово — 2 теста (AC-4) |
| `tests/concurrency/interest-cadence.test.ts` | готово — 2 теста (AC-8 + добросовестный сосед), включает описание испытания стража |

Наполовину готового и не начатого не найдено — унаследованная реализация покрывает все 8 FR и
все 10 AC документа `01_specification.md`. Страница-обёртка (`page.tsx`), рендерящая `LimitScreen`
внутри реального экрана результата скана, сознательно НЕ создана: `03_architecture.md` называет это
вне объёма («не может быть полностью интеграционно проверена до реализации `scan-pipeline`» — на
момент PLAN). К моменту этого прогона `scan-pipeline` уже влит в `main` (коммит `7d5af52`) и отдаёт
`{ limit, reset_at, scope }` в `apps/api/src/routes/scans.ts`, но у `apps/web` до сих пор нет
экрана, вызывающего `POST /api/v1/scans` (см. `apps/web/app/page.tsx` — кадр никуда не отправляется,
заглушка). Вписывать `LimitScreen` в несуществующий экран результата — расширение объёма ЭТОЙ фичи
за пределы восьми названных FR, поэтому оставлено как есть; компонент готов к подключению, когда
появится экран результата скана.

## Таблица покрытия AC

| AC | Проверка | Файл:тест |
|---|---|---|
| AC-1 (различие user/global) | unit | `tests/unit/limit-screen.test.tsx` — «scope=user и scope=global дают РАЗНЫЕ тексты» |
| AC-2 (неопознанный scope → global, аномалия в лог) | unit | `tests/unit/limit-screen.test.tsx` — `it.each(['escalation', 'что-то-ещё', undefined])` |
| AC-3 (reset_at по Москве, отсутствующее не выдумывается) | unit | `tests/unit/limit-screen.test.tsx` — «AC-3: reset_at форматируется по Москве…» (4 теста) |
| AC-4 (нет платёжных элементов) | integration (снимок разметки) | `tests/integration/limit-screen-no-payment.test.tsx` |
| AC-5 (contact_kind по форме) | unit | `tests/unit/classify-contact.test.ts` — «AC-5: три распознаваемые формы…», «AC-5: пустая строка и произвольный текст…» |
| AC-6 (клиентская проверка не заменяет серверную) | integration | `tests/integration/interest.test.ts` — «AC-6: прямой запрос с пустым контактом…» |
| AC-7 (повтор за сутки не плодит строку, последовательный) | integration | `tests/integration/interest.test.ts` — «AC-7: повторная отправка за те же сутки…» |
| AC-8 (конкурентный прогон, 10 параллельных) | concurrency | `tests/concurrency/interest-cadence.test.ts` — «AC-8: десять одновременных отправок…» |
| AC-9 (source_screen и атрибуция) | integration | `tests/integration/interest.test.ts` — «AC-9: source_screen и атрибуция…» |
| AC-10 (неизвестный source → 422) | integration | `tests/integration/interest.test.ts` — «AC-10: неизвестное значение source…» |

## Испытание стража (guard-must-be-able-to-fail) — унаследовано, не переисполнялось в этом прогоне

`tests/concurrency/interest-cadence.test.ts` (шапка файла) документирует ручной прогон против
редакции `recordProInterest`, заменяющей `pg_advisory_xact_lock` + `SELECT … FOR UPDATE` на
«прочитать без блокировки, потом вставить»: дефект дал больше одной строки за сутки (красный),
восстановление атомарности вернуло ровно одну строку (зелёный). Код той редакции в квитанции
предыдущей сессии не сохранился отдельным файлом; в этом прогоне стража повторно НЕ портил
(бюджет 60 минут, свойство уже доказано и код с тех пор не менялся — `git diff` показывает файл
без правок этой сессии).

## Прогоны

| Проверка | Команда | Результат |
|---|---|---|
| typecheck | `npm run typecheck` | 0 ошибок |
| lint | `npm run lint` | 0 ошибок |
| build | `npm run build` | успешно (все воркспейсы, включая `next build`) |
| unit | `npm test` | **156 passed** (22 файла), включая 9 (classify-contact) + 11 (limit-screen) новых |
| integration + concurrency | `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` | **152 passed** (37 файлов), включая 6 (interest) + 2 (limit-screen-no-payment) + 2 (interest-cadence) новых |
| `node .claude/hooks/check-ports.cjs projects/04-calorie-vision-cal-ai` (из корня `n4-wt-pro`) | — | код 0, 2 хранилища распознаны, 0 нарушений |
| `bash scripts/check-env-wiring.sh` | — | код 0 (api/recognizer — всё проброшено; web — переменных нет, «проверять нечего») |
| `bash scripts/check-port-conflicts.sh projects/04-calorie-vision-cal-ai` (из корня) | — | код 0, порт 4180 свободен, хранилища не публикуются |
| `bash scripts/check-pipeline-gaps.sh projects/04-calorie-vision-cal-ai --completion --role-map-source .claude/commands/feature.md --project-role-map-source projects/04-calorie-vision-cal-ai/.claude/skills/sparc-prd-mini/SKILL.md` (из корня) | — | код 0; ❌/⚠️ в выводе — `PR-002 managed BaaS` (3 упоминания стороннего managed-BaaS провайдера, названного в СТАРЫХ телеметрических логах `docs/telemetry/.../20260912T144952Z…` и `…20260912T171708Z…`, коммиты `b54a992`/`6b65f16`, Phase 1-2 проекта, до этой фичи — имя провайдера здесь намеренно НЕ повторяется дословно, иначе эта же строка квитанции сама стала бы новым совпадением грепа), `PR-003`/`PR-007` (ссылки FR-LOOK-00x, ADR-002/004/008 — проектные документы Phase 0.5/0, вне дерева этой фичи). Ни одно упоминание не задето этой фичей — контур `pro-interest-and-limits-ui` без GAP; проектные предупреждения существовали до старта этой ветки |
| `docker compose --profile test down -v` | — | стенд снят, тома удалены |

Схема НЕ менялась: `pro_interest`, `attribution`, `partner_code` уже объявлены `001_init.sql`
(фичей `foundation`), отклонения от плана (создание `009_pro_interest.sql`) не потребовалось.

## Правка после ревью

Слепой судья (`docs/features/pro-interest-and-limits-ui/review-report.md`, вердикт
`CHANGES_REQUIRED`, четыре находки, ни одной `blocker`/`high`). По правилу остановки DEC-A-032
второго раунда ревью НЕ будет — правка ниже финальна для этой фичи.

### RV-pro-interest-and-limits-ui-01 (medium) — исправлено

День блокировки/cadence-проверки и `created_at` вставки брались из ДВУХ независимых источников
времени: приложение вычисляло `day` часами (`moscowDay()`) ДО открытия транзакции — то есть ДО
`pool.connect()`, который может ждать свободное соединение, — а `created_at` получал независимый
`DEFAULT now()` СУБД. Два запроса, вычислившие «вчера» перед московской полуночью и дождавшиеся
соединения уже после неё, проходили cadence-проверку по «вчера», не видя друг друга, но оба
получали СЕГОДНЯШНИЙ `created_at`.

Исправление — `apps/api/src/interest/record-pro-interest.ts`: `RecordProInterestInput.day` УДАЛЁН
из входа; внутри транзакции первым запросом читается `now()`/переведённый в `Europe/Moscow` день
ОДНИМ SQL (`NOW_AND_DAY_SQL`), и это ЕДИНОЕ значение (`ts`/`day`) используется для ключа
advisory-lock, для `SELECT … FOR UPDATE` cadence-проверки И для явного `created_at` вставки
(колонка добавлена в `INSERT_PRO_INTEREST_SQL`, `DEFAULT now()` таблицы больше не используется
этим путём). `apps/api/src/routes/interest.ts` больше не вычисляет и не передаёт `day`
(неиспользуемый импорт `moscowDay` удалён).

Тест: `tests/unit/interest/record-pro-interest-moment.test.ts` (новый) — фейковый пул с ОДНИМ
результатом «момента», часы приложения (`vi.useFakeTimers`) намеренно отведены на «вчера,
за 100мс до полуночи»; тест доказывает, что ключ лока, параметр cadence-проверки и `created_at`
вставки все читают РОВНО результат фейкового запроса момента, а не `Date.now()` приложения, и что
запрос момента выполняется РОВНО один раз. Реальный переход полуночи на настоящем PostgreSQL не
воспроизводим детерминированно без внешней подмены часов СУБД — это ограничение теста названо
дословно в его шапке, а не скрыто. Атомарность самой блокировки (10 параллельных запросов → 1
запись) по-прежнему проверяется на настоящем PostgreSQL — `tests/concurrency/interest-cadence.test.ts`
(без правок логики, только убран более ненужный параметр `day` из вызовов).

### RV-pro-interest-and-limits-ui-02 (medium) — исправлено

`TELEGRAM_ID_PATTERN` требовал минимум 5 цифр (`{4,15}` после первой цифры) — незаявленный минимум:
FR-pro-interest-and-limits-ui-6 называет `telegram_id` «положительным целым» без нижней границы
длины. `"1"` и `"1234"` отклонялись, хотя оба валидны по тексту требования. Псевдокод содержал тот
же более узкий шаблон, но псевдокод спецификацию не отменяет.

Исправление — `packages/shared/src/domain/classify-contact.ts`: `TELEGRAM_ID_PATTERN` заменён на
`/^[1-9][0-9]*$/` (любое положительное целое без ведущего нуля, верхняя граница — только общая
`MAX_CONTACT_LENGTH`). Тест `tests/unit/classify-contact.test.ts` переписан: снят пример,
закреплявший расхождение («короче 5 символов не проходит»); добавлены `"1"`, `"1234"` как
ПРИЗНАННЫЕ (RV-02) и `"0"`/`"0123"` как отклонённые (ноль и запись с ведущим нулём — не
положительное целое).

### RV-pro-interest-and-limits-ui-03 (medium) — в follow-up, НЕ исправлено в этой правке

Конкурентный тест AC-8 и часть проверки AC-5 обходят HTTP-маршрут (вызывают `recordProInterest`/
`classifyContact` напрямую). По правилу остановки DEC-A-032 remains — записано разделом «Follow-up,
не блокирующий закрытие» в `docs/features/pro-interest-and-limits-ui/05_completion.md`, с
указанием номера и сути; повторного ревью по этому пункту не будет.

### RV-pro-interest-and-limits-ui-04 (low) — частично исправлено

`docs/features/pro-interest-and-limits-ui/05_completion.md`: таблица `Criterion coverage`
переписана на фактические пути (`tests/unit/…`, `tests/integration/…`, `tests/concurrency/…`
вместо несуществующих `apps/*/tests/…`) и дословные заголовки тестов; добавлен столбец
«Доказательство», честно называющий уровень (`HTTP` / `функция` / `DOM-снимок`) по каждой строке.
Асимметрия AC-5/AC-8 (уровень «функция» вместо «HTTP») НЕ устранена этой правкой — это предмет
RV-03 выше, а не отдельная задача. Отсутствие `validation-report.md` объяснено явной ссылкой на
`DEC-A-032` (осознанный пропуск второго раунда), а не создано задним числом.

### Побочная находка при подготовке этой правки

Первая версия этого раздела квитанции упомянула стороннего managed-BaaS провайдера дословно при
объяснении находки `PR-002` вендорного стража `check-pipeline-gaps.sh` — тем самым сама стала
НОВЫМ совпадением того же грепа (3 упоминания → 4). Исправлено переформулировкой без дословного
имени провайдера (см. таблицу прогонов выше); страж перепроверен — снова 3 упоминания, все в
СТАРЫХ телеметрических логах Phase 1-2, ни одно не в дереве этой фичи.

### Прогоны после правки

| Проверка | Результат |
|---|---|
| `npm run typecheck` | 0 ошибок |
| `npm run lint` | 0 ошибок |
| `npm run build` | успешно (все воркспейсы, включая `next build`) |
| `npm test` | **158 passed** (23 файла) — 10 (classify-contact, +1 к RV-02) + 11 (limit-screen) + 1 (record-pro-interest-moment, новый) |
| `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` | **152 passed** (37 файлов) — без регрессий |
| `node .claude/hooks/check-ports.cjs projects/04-calorie-vision-cal-ai` | код 0 |
| `bash scripts/check-env-wiring.sh` | код 0 |
| `bash scripts/check-port-conflicts.sh projects/04-calorie-vision-cal-ai` | код 0 |
| `bash scripts/check-pipeline-gaps.sh …` | код 0; контур фичи без GAP (см. выше) |
| `docker compose --profile test down -v` | стенд снят, тома удалены |

Status: completed
