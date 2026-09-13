Reviewer family: codex
Spec revision: sha256:be1dff2a839d5ede26044e4769d0c0fb2ddd0dad5fcc30bdba1003435723ba6e

# Review — partner-codes-and-cabinet

## Verdict

CHANGES_REQUIRED — активация не подключена к распознаванию, обнаружены взаимная блокировка и обход учёта anti-fraud.

Проверена ревизия `094418e0df7a4cc6dd3708b560f21f28106732ae`, диф относительно `09cab1a`.
`met` ниже означает соответствие по исходникам и указанным тестам; выполнение PostgreSQL-тестов этим отчётом не подтверждается.

## Spec conformance

Обозначения путей: `I` = `tests/integration/partner/`, `C` = `tests/concurrency/partner/`, `U` = `tests/unit/partner/`. Заголовки тестов местами сокращены.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-partner-codes-and-cabinet-1 | met | `U/normalize-code.test.ts`: «код короче 4 символов → invalid, query не вызван»; `I/normalize-code.test.ts`: «невалидная форма и неизвестный… код не создают… attribution/growth_event». HTTP 422 проверен чтением обработчика. |
| AC-partner-codes-and-cabinet-2 | met | `I/apply-code.test.ts`: «applied/200: ровно одна attribution(pending, source=explicit, replaced_source=NULL), ровно один code_applied»; HTTP-код — по обработчику. |
| AC-partner-codes-and-cabinet-3 | met | `I/apply-code.test.ts`: «строка ОБНОВЛЕНА, replaced_source=cookie, source=explicit, partner_code_id=B»; запись обоих кодов в журнал подтверждена исходником. |
| AC-partner-codes-and-cabinet-4 | met | `I/apply-code.test.ts`: «другим кодом (explicit) → conflict/409…» и «тем же кодом…»; сравнивается состояние до/после. |
| AC-partner-codes-and-cabinet-5 | met | `I/apply-code.test.ts`: «deeplink поверх cookie → conflict/409…»; название перепутано, фактические входы соответствуют AC: cookie поверх deeplink. |
| AC-partner-codes-and-cabinet-6 | met | `C/apply-code-session.test.ts`: «два РАЗНЫХ кода одновременно дают ровно один applied и один conflict…»; `Promise.allSettled`, проверяются исходы, строка и событие. |
| AC-partner-codes-and-cabinet-7 | met | `I/apply-code.test.ts`: «rejected(code_blocked): attribution/growth_event не созданы»; аудит подтверждён исходником. |
| AC-partner-codes-and-cabinet-8 | met | `I/apply-code.test.ts`: «rejected(self_referral): attribution/growth_event не созданы»; аудит подтверждён исходником. |
| AC-partner-codes-and-cabinet-9 | not met | `C/anti-fraud.test.ts` проверяет 51-ю попытку и 20 параллельных вызовов, но всегда уравнивает IP сессии и запроса. Смена сети нарушает учёт: RV-03. |
| AC-partner-codes-and-cabinet-10 | met | `I/apply-code.test.ts`: «…шпион AntiFraudOnCode НЕ вызывается»; есть `not.toHaveBeenCalled()`. |
| AC-partner-codes-and-cabinet-11 | not met | `U/manual-unblock-guard.test.ts`: «литерал status = 'active'… ТОЛЬКО в manual-unblock.ts»; область сканирования ограничена API: RV-04. |
| AC-partner-codes-and-cabinet-12 | not met | `I/activate-attribution.test.ts`: «после первого: activated… после второго — без изменений» вызывает функцию напрямую, без распознавания; производственного вызова нет: RV-01. |
| AC-partner-codes-and-cabinet-13 | not met | `I/activate-attribution.test.ts`: «rejected(code_blocked): activated_at остаётся NULL…» проверяет изолированную функцию; событие распознавания её не запускает. |
| AC-partner-codes-and-cabinet-14 | not met | `I/activate-attribution.test.ts`: «rejected(self_referral): pending создана анонимной сессией…»; связь аккаунта меняется SQL, функция вызывается вручную. |
| AC-partner-codes-and-cabinet-15 | met | `I/dashboard.test.ts`: «window=day: РОВНО 5 card_view, 3 install, 2 activation, 1 share_click»; числа — литералы, проверяется `updated_at`; HTTP-путь изучен по коду. |
| AC-partner-codes-and-cabinet-16 | met | `I/dashboard.test.ts`: «GET /api/v1/partner/dashboard: 403, тело не содержит числовых счётчиков»; используется `app.inject` после локальной проверки Telegram initData. |
| AC-partner-codes-and-cabinet-17 | unverifiable | `U/dashboard-server-authority-guard.test.ts`: «routes/partner.ts не читает code из query/body/params…» — зелёный. Обязательного HTTP-сценария с чужим `?code=` нет; диагностирование файла и строки дефекта не проверяется. |
| AC-partner-codes-and-cabinet-18 | not met | `I/dashboard.test.ts`: «число наблюдений 12 (< 30) → строка…» фактически ожидает объект `{ insufficient_data: [12, 30] }`, не требуемую строку: RV-05. |
| AC-partner-codes-and-cabinet-19 | met | `I/dashboard.test.ts`: «ни одно из закрытого списка имён… не встречается в JSON-дереве ответа»; заполненные данные и литеральный список шести имён, тип ответа также изучен. |

## Findings

### RV-partner-codes-and-cabinet-01 — blocker
**`apps/api/src/partner/activate-attribution.ts:19`**

Функция активации не вызывается производственным кодом. Успешное распознавание через `apps/recognizer/src/lease.ts` оставляет атрибуцию `pending`; активация и повторная проверка блокировки/самореферала не происходят. Тесты вызывают функцию напрямую и не создают распознавания.

Именованный TODO разрешён архитектурным документом как промежуточное состояние, но не выполняет обязательные критерии поставки. Подключить функцию в транзакцию успешной записи результата с проверкой fence; добавить тест настоящего завершения распознавания, повторного успеха и общего rollback.

### RV-partner-codes-and-cabinet-02 — high
**`apps/api/src/partner/activate-attribution.ts:42`**

Активация сначала удерживает строку `attribution` через `FOR UPDATE`, затем запрашивает codeLock на строке 54. Применение делает наоборот: codeLock, затем `FOR UPDATE` (`apply-partner-code.ts:119`).

Допустимое расписание: активация удерживает attribution; применение того же кода удерживает codeLock и ждёт attribution; активация ждёт codeLock. Получается deadlock, одна транзакция будет отменена. Исправить общий порядок всех блокировок с повторной проверкой выбранного кода после захвата; добавить конкурентный тест применения и активации с управляемым пересечением.

### RV-partner-codes-and-cabinet-03 — high
**`apps/api/src/routes/codes.ts:36`**, **`apps/api/src/partner/anti-fraud.ts:33`**

Проверка получает текущий IP-префикс HTTP-запроса, а исторические применения считает по `device_session.ip_prefix`, сохранённому при создании сессии. Маршрут не согласует эти значения.

Воспроизводимый сценарий по коду: создать множество сессий в сети A, затем применить один код из сети B. Каждое событие через JOIN относится к A, тогда как следующий запрос снова считает B. При пустой истории B счётчик остаётся нулевым и 51-я попытка допускается.

Согласовать ключ проверки и ключ хранения событий. Простое обновление префикса сессии переносит также прошлые события, поэтому семантику смены сети нужно определить явно и закрепить HTTP-тестом.

### RV-partner-codes-and-cabinet-04 — medium
**`tests/unit/partner/manual-unblock-guard.test.ts:45`**

Страж «разблокировка только вручную» сканирует исключительно `apps/api/src`. Фоновый `UPDATE partner_code SET status='active'…` в `apps/recognizer/src` или административном скрипте останется невидимым. Это непосредственно заявленный класс внедряемого дефекта, а не экзотическая форма обхода регулярного выражения.

Расширить проверку на исполняемые области репозитория, сохранив точечное исключение ручной операции; подтвердить красный/зелёный результат мутацией вне API.

### RV-partner-codes-and-cabinet-05 — medium
**`apps/api/src/partner/dashboard-query.ts:44`**, **`tests/integration/partner/dashboard.test.ts:121`**

Спецификация требует строку «недостаточно данных (12 из 30)», реализация возвращает объект. Тест называет результат строкой, но проверяет объект. Клиентского преобразования в `apps/web` не найдено.

Архитектурная схема действительно предусматривает объект — документы противоречат друг другу. Согласовать контракт со спецификацией и проверять фактический пользовательский результат; текущий тест не доказывает требуемое представление.

### RV-partner-codes-and-cabinet-06 — medium
**`tests/integration/partner/apply-code.test.ts:192`**

Тест «перечитывает статус ПОСЛЕ захвата codeLock» блокирует код **до вызова** `applyPartnerCode`. Поэтому даже дефектная реализация, использующая статус из предварительного `normalizeAndFindCode`, увидит `blocked` и пройдёт тест.

Организовать изменение статуса между предварительным чтением и получением codeLock через отдельное соединение/барьер. Подтвердить, что удаление повторного чтения делает тест красным. Требуемой квитанции мутации для проверки порядка AC-10 в `05_completion.md` также нет.

## Что проверено без замечаний

- Запуск `npm test` остановился на `EROFS` при записи временного конфига. Совместимый запуск `npm test -- --configLoader runner --no-cache` завершился с кодом **0: 147/147 тестов, 23 файла, 6,69 с**, включая 11 тестов этой фичи.
- PostgreSQL integration/concurrency: **не запускал: требует стенд**. Исторические результаты из completion не выданы за собственный прогон.
- В применении кода статус перечитывается после codeLock; blocked/self-referral проверяются до записи. Атрибуция и `code_applied` записываются одной транзакцией.
- Порог допуска соответствует явному AC: 50 существующих событий блокируют следующую попытку. Разница с псевдокодом честно названа в completion.
- Конкурентные тесты партнёрских операций и аренды используют параллельные promises, а не последовательный цикл операций.
- Квота использует атомарный `ON CONFLICT … WHERE used < limit` в транзакции; первичная и эскалационная проверки стоят до соответствующих вызовов модели.
- Unit-проверки отсутствующих потолков, подписи initData, согласия и стражей ADR-001 прошли. Мутации исходников в этом read-only ревью не выполнялись.
- Rate limit зарегистрирован в `onRequest` до разбора тела. Кабинет разрешает владельца через серверный `account_id`; предусмотренное исключение `403` не выдаёт чужие счётчики.
- `db` и `storage` в compose используют `expose`, без публикации портов. В дифе фичи действующих секретов не обнаружено; отслеживается `.env.example`, не `.env`.
- Тесты фичи не вызывают внешние API; Telegram-проверка использует локально сформированный initData.
- Обязательный `docs/features/partner-codes-and-cabinet/validation-report.md` отсутствует. Доказательства Phase 2 по этому файлу проверить невозможно.
- Профиль: независимое read-only REVIEW, один исполнитель Codex; модель автора не выяснялась. Файлы и историческая телеметрия не изменялись. Общая длительность и расход токенов/стоимость не измерены; новая запись телеметрии не создавалась по ограничению брифа «только чтение».
