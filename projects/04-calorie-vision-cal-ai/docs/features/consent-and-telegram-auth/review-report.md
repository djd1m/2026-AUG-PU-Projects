Reviewer family: codex
Spec revision: sha256:a8e8a3807737def8f0bd4a96ea988b66e6e68eaab20bd941a76df9fd37c9b0c0

# Review — consent-and-telegram-auth

## Verdict

CHANGES_REQUIRED — остаются дефекты владения данными, побочные записи при отказе авторизации и неверное определение состояния входа на клиенте.

## Spec conformance

`met` означает соответствие по просмотренному коду и указанным тестам; интеграционные сценарии в этой проверке не исполнялись. Сокращённые заголовки тестов обозначены многоточием.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-consent-and-telegram-auth-1 | met | `tests/integration/auth-telegram.test.ts`, «AC-1: успешный вход переносит дневник целиком (3 записи)»: проверяются cookie, перенос трёх строк и отсутствие прежнего владельца. |
| AC-consent-and-telegram-auth-2 | met | `tests/unit/verify-init-data.test.ts`, «AC-2: изменённый байт полезной нагрузки…»; маршрут проверяет подпись до БД, разбора `user` и журналирования. |
| AC-consent-and-telegram-auth-3 | met | `tests/unit/verify-init-data.test.ts`, «AC-3: подлинная подпись, auth_date 25 часов назад — отклоняется (stale)»; общий отказ маршрута предшествует работе с БД. |
| AC-consent-and-telegram-auth-4 | met | `tests/unit/consent-guard-source.test.ts`, «POST /api/v1/auth/telegram отвечает 401 РОВНО из двух мест…»: подпись и свежесть сходятся в одной точке; replay обрабатывается отдельно. |
| AC-consent-and-telegram-auth-5 | not met | Последовательность «вход → эразура → повтор прежней initData» возвращает 401, но коммитит новый аккаунт; RV-consent-and-telegram-auth-02. |
| AC-consent-and-telegram-auth-6 | met | `tests/integration/auth-telegram.test.ts`, «AC-6: вход с другого устройства не теряет и не дублирует дневник ОБОИХ устройств»: проверяются общий аккаунт и сумма 4+2=6. |
| AC-consent-and-telegram-auth-7 | met | `tests/unit/verify-init-data.test.ts`, «AC-7: пустой init_data…»; интеграционный «AC-7: пустой init_data отклоняется 422, не 401». |
| AC-consent-and-telegram-auth-8 | unverifiable | `tests/integration/consent.test.ts`, два теста «AC-8…», проверяют `consent_at`; перенос проверяется отдельно в `auth-telegram.test.ts`. Полная цепочка экрана, записи и переноса всех полей не проверена. |
| AC-consent-and-telegram-auth-9 | unverifiable | `tests/integration/consent.test.ts`, «AC-9: decline не блокирует чтение результата…», проверяет только 200 и NULL; запросов результата и записи дневника нет. |
| AC-consent-and-telegram-auth-10 | not met | `decline` с `v99-does-not-exist` проходит до проверки известной версии; RV-consent-and-telegram-auth-04. |
| AC-consent-and-telegram-auth-11 | met | `tests/integration/enforce-before-diary-write.test.ts`, «АНОНИМНАЯ device_session без consent_at…» и «account без consent_at…»: прямой репозиторий отказывает, строк нет. |
| AC-consent-and-telegram-auth-12 | not met | Карточка, созданная через связанную сессию, сохраняет её `owner_key` и пропускается отзывом аккаунта; RV-consent-and-telegram-auth-01. |
| AC-consent-and-telegram-auth-13 | met | `tests/integration/account-delete.test.ts`, «AC-13: erase_all отвечает синхронно…»: статус, время запроса и две закрытые карточки; формула дедлайна проверена по коду. |
| AC-consent-and-telegram-auth-14 | met | `tests/integration/account-delete.test.ts`, «AC-14: повторный erase_all…»: 409 и неизменный дедлайн; `tests/concurrency/account-delete-race.test.ts` запускает два запроса через `Promise.all`. |
| AC-consent-and-telegram-auth-15 | not met | Строки с владельцем-сессией могут блокировать удаление `recognition` внешним ключом; RV-consent-and-telegram-auth-01. Проверки завершения к 72 часам также нет. |
| AC-consent-and-telegram-auth-16 | met | `tests/integration/erasure-job.test.ts`, «AC-16: активный скан откладывает удаление аккаунта…»; код пропускает владельца с `queued`, не отменяя скан. |
| AC-consent-and-telegram-auth-17 | met | `tests/integration/account-delete.test.ts`, «AC-17: без confirm — 422, статус не меняется». |
| AC-consent-and-telegram-auth-18 | met | `tests/unit/consent-denied-audit.test.ts`, «AC-18: без согласия — отказ и запись в аудит с причиной no_consent, без содержимого»; проверен также отказ источника истины. |
| AC-consent-and-telegram-auth-19 | met | `tests/unit/config.test.ts`, «AC-consent-and-telegram-auth-19: отсутствие или неверный формат TELEGRAM_BOT_TOKEN…»; `bootstrap.ts` завершает процесс до открытия сокета. |
| AC-consent-and-telegram-auth-20 | unverifiable | `tests/integration/auth-telegram.test.ts`, «AC-20: повторный вход после erased…», вручную меняет статус и проверяет новый ID; физическое удаление истории и `migrated_entries` этим тестом не доказаны. |

## Findings

**RV-consent-and-telegram-auth-01 — high — `apps/api/src/share/share-card-repository.ts:34`.**
Для `owner={table:'device_session', id:S}`, где S связан с аккаунтом A, изменённый guard проверяет согласие A, но репозиторий записывает `owner_key=S`. Аналогично работает `diary-entry-repository.ts`.
Последовательность: связать S с A → дать согласие A → создать карточку через S → отозвать согласие A. Обновление карточек по `owner_key=A` пропустит созданную карточку. При эразуре оставшаяся ссылка на `recognition` аккаунта A блокирует его удаление через `ON DELETE RESTRICT`.
Исправить: разрешать канонического владельца под блокировкой и использовать его одновременно для проверки и INSERT. Добавить сценарий создания **после** связывания с последующими отзывом и эразурой.

**RV-consent-and-telegram-auth-02 — high — `apps/api/src/routes/auth-telegram.ts:153`.**
После эразуры старый аккаунт исключён из активного поиска. Повтор прежней свежей initData сначала вставляет новый аккаунт, затем получает конфликт replay и возвращает `{kind:'replayed'}`. `withTransaction` коммитит обычный возврат: ответ 401 оставляет новую строку `account`.
Тест «review3 RV-04 … ПОСЛЕ настоящей эразуры…» проверяет отказ и отсутствие связывания сессии, но не отсутствие нового аккаунта.
Исправить: откатывать транзакцию при replay либо исключить создание аккаунта до успешной проверки повтора. Проверять полный снимок аккаунтов и сессий до и после отказа.

**RV-consent-and-telegram-auth-03 — high — `apps/web/app/telegram-auto-login.tsx:57`.**
Постоянный `localStorage`-флаг запрещает вход даже со свежей initData после истечения cookie или завершения удаления аккаунта. Флаг не связан с текущей серверной сессией и не сбрасывается экраном удаления.
Дополнительно строка 118 считает `401 initdata_replayed` доказательством входа текущего браузера. Сервер этим ответом как раз отказывает в связывании: строка могла ранее использоваться другой сессией.
Исправить: подтверждать вход состоянием текущей серверной сессии; дедупликацию ограничить конкретной попыткой и сессией. Не превращать replay в успешную авторизацию. Текущие unit-тесты закрепляют ошибочное поведение.

**RV-consent-and-telegram-auth-04 — medium — `apps/api/src/consent/grant-or-decline.ts:38`.**
Ветка `decline` возвращается раньше проверки версии. Запрос с `decision:'decline'` и `consent_version:'v99-does-not-exist'` получает 200, хотя критерий неизвестной версии требует 422.
Исправить: проверять известность версии до разветвления по решению. Добавить маршрутный тест неизвестной версии для обоих решений.

**RV-consent-and-telegram-auth-05 — medium — `tests/integration/consent.test.ts:95`.**
Заголовок теста обещает доступность результата и запрет дневника, но тело проверяет только ответ согласия и `consent_at=NULL`. В текущем сервере маршрут чтения скана вообще не зарегистрирован.
Аналогичные пробелы: `account-delete.test.ts:71` не открывает адреса карточек; тест 73-часовой давности в `erasure-job.test.ts` прямо признаёт, что не доказывает дедлайн; AC-20 подменяет эразуру обновлением статуса.
Исправить: дополнить сквозными проверками на интегрированном стенде и до этого отмечать неподтверждённые части критериев как `unverifiable`. В таблице покрытия также исправить заголовок AC-6: добавленного там пояснения в фактическом названии теста нет.

## Что проверено без замечаний

- Проверен дифф `69913ac..3cb31ee738a2d0a0ec0c580408c6cf980fca972c`: 16 файлов, 1115 добавлений, 180 удалений.
- `npm test`: **11 файлов, 62 теста прошли**, exit 0; длительность Vitest — **1,12 с**. Интеграционные и конкурентные тесты **не запускал: требует стенд** PostgreSQL/MinIO.
- Подпись проверяется до разбора `user` и свежести; используется `timingSafeEqual`, строгий формат hash и канонический ключ replay. Ограничитель частоты установлен на `onRequest`.
- Отсутствующие три потолка и неверный токен отклоняются конфигурацией до запуска API. Конкурентные тесты квоты и аренды используют реальные параллельные операции; пороги заданы тестовыми литералами.
- Атомарный оператор квоты присутствует. Сквозное списание перед каждым вызовом модели здесь не подтверждено: `scan-pipeline` отсутствует в текущем контуре.
- Страж ADR-001 существует и прошёл unit-прогон. В `docs/features/foundation/05_completion.md:74` записана мутация `calories` с красным результатом; самостоятельно мутацию не повторял.
- Удаление карточек предшествует удалению распознаваний; реальные фото удаляются через MinIO, неудача удаления оставляет аккаунт для повторной обработки.
- В compose хранилища не публикуются; единственный опубликованный порт принадлежит proxy и привязан к loopback. В просмотренном диффе секретов не обнаружено; `.env` не отслеживается. Unit-тесты используют подмену сетевых вызовов.
- Профиль проверки: слепое read-only ревью, один исполнитель Codex; точный идентификатор модели, токены и стоимость недоступны. Новая телеметрия не записывалась. Каталог исходных доказательств: `docs/telemetry/p-replicator/20260912T20183418Z-consent-and-telegram-auth-B-7076/evidence/` — фактический каталог задания имеет имя `20260912T201834Z-consent-and-telegram-auth-B-7076`.
