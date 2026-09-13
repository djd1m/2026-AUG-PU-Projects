# Фича `pro-interest-and-limits-ui` — план завершения

## Статус документа

**РЕАЛИЗОВАНО.** Раздел `## Criterion coverage` ниже — ФАКТ: реальные пути и дословные заголовки
существующих файлов тестов (правка RV-pro-interest-and-limits-ui-04, `review-report.md`; таблица
ниже была ПЛАНИРУЕМОЙ до этой правки и указывала на несуществующий каталог `apps/*/tests`).

**Отдельный `docs/features/pro-interest-and-limits-ui/validation-report.md` (Phase 2 VALIDATE)
НЕ существует и не создаётся задним числом.** Это ОСОЗНАННЫЙ пропуск стадии, а не забытый шаг:
`01_specification.md` (шапка) называет режим фичи явно — «скорость (DEC-A-032) — один раунд
слепого ревью, без второго раунда валидации» (`docs/decisions-autonomous.md`, `DEC-A-032`, принято
владельцем 2026-09-13 06:45). Единственный пройденный раунд проверки — слепое ревью, его отчёт
`docs/features/pro-interest-and-limits-ui/review-report.md` (вердикт `CHANGES_REQUIRED`, четыре
находки, ни одной `blocker`/`high`; по DEC-A-032 второго раунда не будет).

## Порядок выполнения Phase 3

1. `ClassifyContact` в `packages/shared` (чистая функция, без побочных эффектов) — юнит-тесты первыми,
   реализация по ним.
2. Обработчик `POST /api/v1/interest` в `apps/api/src/routes/interest.ts`: валидация `source`,
   вызов `ClassifyContact`, транзакционная cadence-проверка-и-вставка в `packages/db`.
3. Последовательный интеграционный тест маршрута (`201`/`422`/`429` по одному владельцу).
4. Конкурентный тест cadence (AC-8) — на настоящем PostgreSQL профиля `test`, по образцу
   `tests/concurrency/quota-parallel.test.ts` фичи `foundation`.
5. `LimitScreen` и `InterestForm` в `apps/web`: рендер по `scope`/`reset_at`, форма, состояние
   «уже записали».
6. Снимок разметки на отсутствие платёжных элементов.
7. Испытание стража cadence на внедрённом дефекте («прочитать, потом записать»).

## Команды

```bash
npm test                       # unit + integration, включая конкурентный тест cadence
npm run lint && npm run build
node ../../.claude/hooks/check-ports.cjs .
bash ../../scripts/check-port-conflicts.sh .
bash ../../scripts/complexity-router.sh                    # подтверждение тира T/S/M перед стартом
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

## Чеклист готовности (выполнено)

- [x] `ClassifyContact` покрыт таблицей примеров, включая границы длины и обе формы Telegram
      (логин и числовой `telegram_id`; RV-02: `telegram_id` — ЛЮБОЕ положительное целое, без
      незаявленного минимума длины).
- [x] `POST /api/v1/interest` отвечает `201`/`422`/`429` по критериям AC-5, AC-6, AC-10.
- [x] Конкурентный прогон AC-8 зелёный; тот же прогон краснеет на редакции «прочитать-записать»
      (обе строки в квитанции Phase 3, `guard-must-be-able-to-fail`).
- [x] `LimitScreen` различает `scope = user` и `scope = global`, fail-closed на прочих значениях.
- [x] Форматирование `reset_at`: успешный разбор → время по Москве; неразбираемое/отсутствующее →
      общий текст без выдуманного часа.
- [x] Снимок разметки: ни одного платёжного элемента, есть текст «оплаты сейчас нет».
- [x] `source_screen` и `partner_code_id` сохраняются верно (AC-9), неизвестный `source` отклонён
      (AC-10).
- [x] Названо явно: сквозной путь от реального отказа `scan-pipeline` до этого экрана не проверен
      (см. «Что эта фича НЕ доказывает» ниже; `scan-pipeline` к моменту правки уже реализован, но
      `apps/web` ещё не вызывает `POST /api/v1/scans` ни с одной страницы).
- [x] `check-pipeline-gaps.sh` — контур `pro-interest-and-limits-ui` без GAP (проверено после
      правки после ревью: код 0, замечания вывода — проектные, вне дерева этой фичи).
- [x] RV-01 (день блокировки/проверки и `created_at` — из ОДНОГО момента транзакции, а не из
      часов приложения ДО открытия соединения) — исправлено, `tests/unit/interest/record-pro-interest-moment.test.ts`.
- [x] RV-02 (`telegram_id` — любое положительное целое) — исправлено, `tests/unit/classify-contact.test.ts`.

## Criterion coverage (ФАКТ — правка RV-04, дословные пути и заголовки)

Столбец «Доказательство» называет уровень честно: `HTTP` — через реальный маршрут (`app.inject`),
`функция` — вызовом функции напрямую, минуя HTTP и определение владельца маршрутом, `DOM-снимок` —
`renderToStaticMarkup`, без браузера и без БД. RV-pro-interest-and-limits-ui-03 (см. «Follow-up»
ниже) — это АСИММЕТРИЯ уровня AC-5 и AC-8 против AC-6/7/9/10: она остаётся, эта правка её только
называет честно, не устраняет.

| Criterion | Test file | Заголовок (дословно) | Доказательство |
|-----------|-----------|------------------------|-----------------|
| AC-pro-interest-and-limits-ui-1 | `tests/unit/limit-screen.test.tsx` | `scope=user и scope=global дают РАЗНЫЕ тексты, каждый называет свою причину` | DOM-снимок |
| AC-pro-interest-and-limits-ui-2 | `tests/unit/limit-screen.test.tsx` | `scope=%s рендерит только общий текст и логирует аномалию` (`it.each`, `escalation`/`что-то-ещё`/`undefined`) | DOM-снимок |
| AC-pro-interest-and-limits-ui-3 | `tests/unit/limit-screen.test.tsx` | `полночь по Москве форматируется как 00:00, дата обнуления НЕ сегодняшняя — дата тоже показана` и три соседних `it` | DOM-снимок |
| AC-pro-interest-and-limits-ui-4 | `tests/integration/limit-screen-no-payment.test.tsx` | `scope=$scope: ни одно запрещённое слово не найдено, есть текст «оплаты сейчас нет»` (`it.each`) | DOM-снимок (каталог `tests/integration/`, но без БД — см. `04_refinement.md`, «Стратегия проверок») |
| AC-pro-interest-and-limits-ui-5 | `tests/unit/classify-contact.test.ts` | `AC-5: три распознаваемые формы дают email/telegram/telegram` и `AC-5: пустая строка и произвольный текст не классифицируются` | функция (`classifyContact` напрямую) — **не HTTP**, полной таблицы запросов к `POST /api/v1/interest` нет (RV-03, follow-up) |
| AC-pro-interest-and-limits-ui-6 | `tests/integration/interest.test.ts` | `AC-6: прямой запрос с пустым контактом получает 422 в обход клиента, строка не создаётся` | HTTP (`app.inject`, реальный PostgreSQL) |
| AC-pro-interest-and-limits-ui-7 | `tests/integration/interest.test.ts` | `AC-7: повторная отправка за те же сутки получает 429 и не плодит строку` | HTTP (`app.inject`, реальный PostgreSQL); ПОСЛЕДОВАТЕЛЬНЫЙ — не проверяет гонку, только границу суток закрывает конкурентный тест ниже |
| AC-pro-interest-and-limits-ui-8 | `tests/concurrency/interest-cadence.test.ts` | `AC-8: десять одновременных отправок одного владельца дают ровно одну запись` | функция (`recordProInterest` напрямую, реальный PostgreSQL, настоящая конкурентность `Promise.all`) — **не HTTP**, статусы `201`/`429` и определение владельца маршрутом не проверяются этим тестом (RV-03, follow-up) |
| AC-pro-interest-and-limits-ui-9 | `tests/integration/interest.test.ts` | `AC-9: source_screen и атрибуция сохраняются верно; без атрибуции — NULL, не пропущенное поле` | HTTP (`app.inject`, реальный PostgreSQL) |
| AC-pro-interest-and-limits-ui-10 | `tests/integration/interest.test.ts` | `AC-10: неизвестное значение source отклоняется 422, строка не создаётся` | HTTP (`app.inject`, реальный PostgreSQL) |

## Follow-up, не блокирующий закрытие

По правилу остановки DEC-A-032 (один раунд слепого ревью на фичу; `medium`/`low` без блокеров и
`high` уходят в follow-up без повторного ревью) — находки review-report.md, НЕ исправленные в этой
правке:

- **RV-pro-interest-and-limits-ui-03** (`tests/concurrency/interest-cadence.test.ts:40`;
  `tests/integration/interest.test.ts:77`) — конкурентный тест AC-8 ходит МИМО маршрута
  (`recordProInterest` напрямую, не `app.inject`): нужны десять параллельных `app.inject` с
  проверкой ровно одного `201`, девяти `429` и одной строки в БД. Для AC-5 нет полной HTTP-таблицы
  (все пять значений `"a@b.ru"`/`"@ivan_petrov"`/`"79991234567"`/`""`/`"просто текст"` — через
  реальный `POST /api/v1/interest`, не только через `classifyContact()`). Испытание стража cadence
  предъявлено как историческое утверждение (комментарий в шапке теста, несохранённая редакция) —
  нужно воспроизводимое доказательство «мутация → красный; восстановление → зелёный» (файл или
  команда, а не ссылка на прошлый ручной прогон).
- **RV-pro-interest-and-limits-ui-04 (частично осталось)** — эта правка заменила пути и заголовки
  таблицы `Criterion coverage` на фактические (см. выше) и честно разметила уровень доказательства
  по каждой строке. НЕ сделано в рамках этой правки: сама асимметрия AC-5/AC-8 (функция вместо
  HTTP) не устранена — это и есть предмет RV-03 выше, а не отдельная задача.

## Что эта фича НЕ будет доказывать (называется заранее)

- Сквозной путь «реальный отказ квоты на сканировании → этот экран» — на момент PLAN зависел от
  `scan-pipeline`, не реализованной тогда; к моменту правки после ревью `scan-pipeline` уже влит
  (`apps/api/src/routes/scans.ts` отдаёт `{ limit, reset_at, scope }`), но `apps/web` до сих пор не
  вызывает `POST /api/v1/scans` ни с одной страницы (`apps/web/app/page.tsx` — заглушка) — сквозной
  путь по-прежнему не может быть пройден целиком, теперь по ДРУГОЙ причине.
- Доставляемость почты, существование Telegram-аккаунта.
- Конверсию показа в отправку контакта.
