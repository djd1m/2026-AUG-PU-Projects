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
| `bash scripts/check-pipeline-gaps.sh projects/04-calorie-vision-cal-ai --completion --role-map-source .claude/commands/feature.md --project-role-map-source projects/04-calorie-vision-cal-ai/.claude/skills/sparc-prd-mini/SKILL.md` (из корня) | — | код 0; ❌/⚠️ в выводе — `PR-002 managed BaaS` (3 упоминания Supabase в СТАРЫХ телеметрических логах `docs/telemetry/.../20260912T144952Z…` и `…20260912T171708Z…`, коммиты `b54a992`/`6b65f16`, Phase 1-2 проекта, до этой фичи), `PR-003`/`PR-007` (ссылки FR-LOOK-00x, ADR-002/004/008 — проектные документы Phase 0.5/0, вне дерева этой фичи). Ни одно упоминание не задето этой фичей — контур `pro-interest-and-limits-ui` без GAP; проектные предупреждения существовали до старта этой ветки |
| `docker compose --profile test down -v` | — | стенд снят, тома удалены |

Схема НЕ менялась: `pro_interest`, `attribution`, `partner_code` уже объявлены `001_init.sql`
(фичей `foundation`), отклонения от плана (создание `009_pro_interest.sql`) не потребовалось.

Status: completed
