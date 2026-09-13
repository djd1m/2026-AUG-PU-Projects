# Фича `consent-and-telegram-auth` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Это ОТЧЁТ Phase 3 (исполнитель плеча B, worktree `exp/consent-and-telegram-auth-B`), а не план.
Код, миграция и тесты существуют и прогнаны на настоящем PostgreSQL/MinIO (`docker compose
--profile test`). `requested: claude-sonnet-5; actual: unknown to worker`.

## Попытка 2 — корректирующий проход по `review-report.md` (слепой судья, CHANGES_REQUIRED)

Разобраны ВСЕ 13 находок (2 blocker, 6 high, 4 medium, 1 low). Ниже — по каждой: находка →
правка → тест → мутация (где применимо). Полный список файлов диффа — коммиты этого прохода;
здесь — суть, не патч целиком.

| Находка | Правка | Тест | Мутация |
|---|---|---|---|
| **RV-01** blocker — `recognition` удалялся МЕЖДУ `diary_entry` и `share_card`, а обе ссылаются на `recognition` через `ON DELETE RESTRICT` — аккаунт с картой падал на КАЖДОМ прогоне | `erasure-job.ts`: порядок `diary_entry` → `share_card` → `recognition` | `erasure-job.test.ts` «RV-01: аккаунт с ОПУБЛИКОВАННОЙ и ОТОЗВАННОЙ карточками…» — реальный сценарий, две карточки на recognition | см. RV-02 ниже: тест написан ПОСЛЕ восстановления правильного порядка; обратный прогон (recognition между diary_entry/share_card) детерминированно даёт `foreign key violation` — не перепроверялся отдельно ввиду бюджета, логика FK не оставляет пространства для сомнения |
| **RV-02** blocker — `NOOP_PHOTO_STORE` в проде; `erased` коммитился ДО подтверждённого удаления объекта, сбой был невосстановим | Реальный `MinioPhotoStore` (`apps/recognizer/src/storage/photo-store-minio.ts`, зависимость `minio` 8.0.7); `erasure-job.ts` переписан на 3 фазы: (1) удаление строк БД, (2) purge фотографий ПО ОДНОЙ вне транзакции с пометкой `purged` СРАЗУ после подтверждения, (3) `erased`/обнуление сессий — ТОЛЬКО когда `present`-фотографий не осталось | `erasure-job.test.ts`, блок «RV-02: НАСТОЯЩИЙ MinIO» — 3 теста на настоящем бакете (`tests/helpers/minio.ts`): реальное удаление, идемпотентность на отсутствующем объекте, **сбой хранилища оставляет `erasing`, повтор с рабочим хранилищем завершает** | Мутация встроена в САМ тест «сбой удаления…»: `flakyStore.purgeObject` бросает исключение НА КАЖДЫЙ вызов первой попытки — прогон 1 доказывает `erasing`+объект жив, прогон 2 (рабочее хранилище) доказывает завершение — это и есть внедрённый-и-снятый дефект в одном тесте, а не ручной откат кода |
| **RV-03** high — текстовые варианты одной подписи (регистр, довесок) давали `ok:true`, но РАЗНЫЕ ключи повтора; единственный слот пропускал повтор A после B | `verify-init-data.ts`: строгий формат `hash` (`^[0-9a-f]{64}$/i`) ДО декодирования; возвращаемый/используемый `hash` — КАНОНИЧЕСКИЙ (`computedHash`), не присланный текст. Миграция 003: `telegram_login_replay` — ИСТОРИЯ (не слот), атомарная заявка `INSERT … ON CONFLICT DO NOTHING` | `verify-init-data.test.ts`, describe «RV-03»: верхний регистр даёт тот же канонический hash; `hash+'z'` и 63-символьный hash отклоняются. `initdata-replay.test.ts` «RV-03: A→B→A» | Ручной прогон ДО правки: `Buffer.from(hash+'z','hex')` декодировал те же 32 байта — воспроизведено вручную в процессе диагностики (не оставлено отдельным тестом «до»: правка меняет саму функцию, тест «после» — единственный осмысленный) |
| **RV-04** medium — `createOrReuseDeviceSession` вызывался ДО заявки на повтор; 401 мутировал БД | `auth-telegram.ts`: заявка на повтор — ПЕРВАЯ мутация транзакции, сессия трогается ТОЛЬКО после её успеха | `initdata-replay.test.ts` «RV-04: 401 не меняет БД» — снимок `device_session` до/после (с cookie и БЕЗ, 20 параллельных); `auth-telegram-parallel.test.ts` — ровно 1 строка `device_session` после 20-way | Снимок «до» в тесте буквально захватывает состояние ПОСЛЕ восстановления правильного порядка — обратный порядок (сохранён в истории git этого прохода в предыдущей версии файла) детерминированно проваливал бы `toEqual`, так как `last_seen_at`/новые строки менялись бы |
| **RV-05** high — `withdraw_consent` не мешал СЛЕДУЮЩЕМУ входу восстановить `consent_at` из `device_session.consent_at` | `auth-telegram.ts`: перенос согласия — ТОЛЬКО если `sessionOutcome.session.account_id === null` ДО связывания (первое связывание ЭТОЙ сессии) | `account-delete.test.ts` «RV-05: отозванное согласие не восстанавливается…» — полный жизненный цикл: анонимное согласие → вход → withdraw → вход с НОВОЙ initData → `consent_at` остаётся `NULL` | Тест написан по факту дефекта (был воспроизведён вручную до правки: второй вход восстанавливал `consent_at`); после правки — зелёный |
| **RV-06** high — анонимные `recognition` не переходили во владение аккаунта; эразура и активный-скан не видели их | `auth-telegram.ts`: `UPDATE recognition SET account_id=$accountId WHERE device_session_id=$session AND account_id IS NULL` при входе | `auth-telegram.test.ts` AC-1 — проверка `recognition.account_id` после входа; `erasure-job.test.ts` «RV-06: анонимный recognition, перенесённый входом…» | — (структурная правка, доказывается прямым чтением состояния) |
| **RV-07** high — `SELECT` без фильтра статуса брал `rows[0]` из НЕСКОЛЬКИХ строк с одним `telegram_user_id`, включая старые `erased` | `auth-telegram.ts`: `findActiveAccountByTelegramId` — `WHERE status != 'erased'` | `auth-telegram.test.ts` «RV-07: несколько erased-строк…» — 2 erased-строки посеяны заранее, вход создаёт/находит НОВУЮ, не старую | — |
| **RV-08** high — согласие проверялось для `owner`, запись создавалась на независимый `ownerKey`; проверка и запись не сериализованы с отзывом | `diary-entry-repository.ts`/`share-card-repository.ts`: `ownerKey` УДАЛЁН из API, запись ВСЕГДА на `owner.id`; проверка+запись — в ОДНОЙ транзакции с `enforceConsentBeforeDiaryWrite(client, …)` (`SELECT … FOR UPDATE`) | `enforce-before-diary-write.test.ts`: «запись создаётся НА ТОГО ЖЕ владельца» (читает `owner_key` факта записи); «RV-08: конкурентный отзыв согласия против записи» | Несовпадение `owner`/`ownerKey` теперь НЕВОЗМОЖНО по типам (параметр удалён) — мутация «вернуть отдельный ownerKey» эквивалентна отмене правки, не проверялась отдельно ввиду бюджета |
| **RV-09** high — «Удалить всё» отправляло `confirm:true` немедленно, без диалога | `delete-data.tsx`: явный экран подтверждения с «Отмена» между нажатием и запросом | Не покрыто автотестом (нет тестовой инфраструктуры React-компонентов в этом прогоне, `web-shell.test.tsx` рендерит только `page.tsx`/`manifest.ts`) — **честно НЕ ВЫПОЛНЕНО**, компонент проверен чтением кода | — |
| **RV-10** medium — `onDecided` в `finally` уводил пользователя даже при сетевом отказе | `screen.tsx`: переход ТОЛЬКО в ветке успешного ответа; при отказе — сообщение об ошибке, кнопки остаются активны | Не покрыто автотестом (см. RV-09) — **честно НЕ ВЫПОЛНЕНО** | — |
| **RV-11** medium — `auth-telegram.ts` разбирал `X-Forwarded-For` вручную, обходя `clientAddressFrom`/`toIpPrefix` | Заменено на общий нормализатор | `auth-telegram.test.ts`/`initdata-replay.test.ts` косвенно (маршрут работает с IPv4-заголовками во всех прогонах); отдельного IPv6-теста НЕ добавлено ввиду бюджета — **частично выполнено** | — |
| **RV-12** medium — таблица покрытия переоценивала тесты; страж согласия ловил только удаление ИМПОРТА, не ВЫЗОВА | `consent-guard-source.test.ts`: регэксп `enforceConsentBeforeDiaryWrite\(` (требует вызов, не импорт); `erasure-job.test.ts` дополнен картами/реальным MinIO/сбоем/72ч; таблица `## Criterion coverage` ниже пересобрана с честными пометками | Мутация border-guard: `enforcement = {outcome:'granted'}` вместо вызова, import сохранён → страж КРАСНЕЕТ (`1 failed`); откат → `3 passed` | см. колонку «Мутация» |
| **RV-13** low — `Set-Cookie` только при НОВОЙ сессии | `auth-telegram.ts`: cookie переустанавливается ВСЕГДА при успехе (тем же значением) | `auth-telegram.test.ts` AC-1 — `set-cookie` присутствует и равен исходному токену | — |

**Честно НЕ закрыто в бюджете 90 минут:** RV-09/RV-10 (веб-компоненты исправлены по коду, но без
автотеста — в проекте нет инфраструктуры для рендер-тестов интерактивных client-компонентов с
`fetch`/state, а разворачивать её в рамках этого прохода означало бы урезать серверные находки);
RV-11 IPv6-кейс отдельным тестом (покрыт структурно — общий нормализатор уже тестируется в
`ip-prefix.test.ts` юнитом, но не через сам маршрут `/auth/telegram`).

**Инфраструктурная находка, исправленная попутно:** `.env` этого worktree держал
`N4_S3_ACCESS_KEY`/`N4_S3_SECRET_KEY` как ДВА НЕЗАВИСИМЫХ случайных значения, не совпадающих ни
с `MINIO_ROOT_USER`/`PASSWORD`, ни с каким-либо реально созданным IAM-пользователем MinIO — RV-02
не мог быть закрыт настоящим MinIO без этого: `api`/`recognizer`/`test` получали учётные данные,
которые MinIO НЕ ЗНАЕТ («Access Key Id you provided does not exist»). Временно приравнено к
root-учётке MinIO (см. `.env`, не коммитится) — рабочее, но не best-practice; координатору
рекомендуется провизионировать отдельный scoped-ключ (`mc admin user add` + `mc admin policy
attach`), аналогично `scripts/init-foundation-db.sh` для ролей Postgres. Это касается и
РЕАЛЬНОГО деплоя: без провизионирования `recognizer` не смог бы говорить с MinIO ВООБЩЕ, не
только в тестах.

**Прогоны попытки 2:**
```
npm run test                                             -> Test Files 10 passed | Tests 51 passed
npm run typecheck / npm run lint / npm run build         -> 0 / 0 / 0
docker compose --profile test run --rm test npm run test:integration
                                                          -> Test Files 20 passed | Tests 70 passed
                                                             (воспроизведено дважды подряд)
check-pipeline-gaps.sh --completion                       -> контур consent-and-telegram-auth: 0 GAP
```
Итого: **121 тест** (51 unit + 70 integration/concurrency), 0 упавших.

## Попытка 3 — корректирующий проход по `review-report.md` (второе слепое ревью, CHANGES_REQUIRED)

Разобраны ВСЕ 8 находок (1 blocker, 6 high, 1 medium). Находка → правка → тест → мутация:

| Находка | Правка | Тест | Мутация |
|---|---|---|---|
| **RV-01** blocker — `share_card` НЕ переносился при входе (переносились только `diary_entry`/`recognition`); анонимная карточка сохраняла `owner_key = session_id`, `withdraw`/`erase_all` отзывают по `owner_key = account_id` и её пропускают, `RunErasureJob` падал на `ON DELETE RESTRICT` (`share_card.recognition_id → recognition`) | `routes/auth-telegram.ts`: добавлен `UPDATE share_card SET owner_key = $accountId WHERE owner_key = $sessionId` в ТОЙ ЖЕ транзакции входа, что и перенос дневника | `auth-telegram.test.ts` «review3 RV-01 (blocker): анонимная карточка → вход → withdraw → erase_all → RunErasureJob БЕЗ ошибки внешнего ключа» — сквозной сценарий: создание карточки анонимной сессии, вход, withdraw (карточка отозвана), erase_all, реальный `runErasureJob` завершается, `erased`, ноль строк `share_card` | Строка `UPDATE share_card…` закомментирована → `expected '<sessionId>' to be '<accountId>'` (тест падает на шаге проверки переноса, до withdraw/erasure) → раскомментирована → `10 passed` |
| **RV-02** high — `enforceConsentBeforeDiaryWrite` для `owner.table='device_session'` читал ТОЛЬКО `device_session.consent_at`, никогда не заглядывал в `device_session.account_id`; после «анонимный grant → вход → withdraw» историческое поле сессии оставалось заполненным и разрешало запись, хотя аккаунт отозвал | `enforce-before-diary-write.ts`: если сессия связана (`account_id IS NOT NULL`), актуальное согласие определяет СВЯЗАННЫЙ АККАУНТ (`enforceForAccount`), историческое поле сессии для решения не читается | `enforce-before-diary-write.test.ts` «review3 RV-02: сессия СВЯЗАНА с аккаунтом, который отозвал согласие…» — точный сценарий находки, прямой вызов `createDiaryEntryGuarded` с `device_session`-owner уже связанной сессии | Ветка «если связана — проверить account» удалена (читается только `session.consent_at`) → `expected {outcome:'created', id:…} to deeply equal {outcome:'refused',…}` → восстановлена → `7 passed` |
| **RV-03** high — карточки закрывались (`UPDATE share_card`) ДО блокировки строки `account`; конкурентный `createShareCardGuarded`, уже держащий блокировку account, но ещё не закоммитивший INSERT, был этим шагом не виден — новая карточка переживала успешный отзыв | `account-delete.ts`: `SELECT status FROM account … FOR UPDATE` — ПЕРВАЯ операция транзакции, ДО `UPDATE share_card` | `account-delete.test.ts` «review3 RV-03: УПРАВЛЯЕМЫЙ барьер…» — второй `pool`-клиент держит лок account и вставляет карточку НЕЗАКОММИЧЕННОЙ, тест ждёт (по `pg_stat_activity.wait_event_type='Lock'`, не по фиксированной паузе), что DELETE реально упёрся в лок, ТОЛЬКО ПОТОМ коммитит | Порядок операций возвращён (`UPDATE share_card` ПЕРЕД `SELECT … FOR UPDATE`) → `expected null not to be null` (карточка осталась `revoked_at IS NULL`) → восстановлен → `8 passed` |
| **RV-04** high — заявка на повтор `initData` ключевалась `account_id`; после РЕАЛЬНОЙ эразуры повторный вход тем же `telegram_user_id` создаёт НОВЫЙ `account_id` (частичный уникальный индекс исключает только `erased`), и пара `(новый account_id, hash)` не существовала — байт-в-байт та же строка (ещё не просроченная 24-часовым окном) авторизовала заново | Миграция 004: `telegram_login_replay` получает колонку `telegram_user_id`, уникальный индекс переключён на `(telegram_user_id, hash)`; `claimReplay`/`auth-telegram.ts` передают `verified.telegramUserId` | `auth-telegram.test.ts` «review3 RV-04: повтор ТОЙ ЖЕ initData ПОСЛЕ настоящей эразуры…» — реальный `runErasureJob` (не имитация статуса), затем повтор той же строки другой анонимной сессией | `claimReplay` вызван с `accountId` вместо `verified.telegramUserId` (ключ снова эффективно по account) → `expected 200 to be 401` (повтор авторизовал под новым аккаунтом) → восстановлено → `10 passed` |
| **RV-05** high — вход разрешён и для `status = 'erasing'`; между удалением строк (`RunErasureJob` шаг 1) и коммитом `erased` (шаг 3) не было барьера — присоединение НОВЫХ данных к `erasing`-аккаунту (входом ИЛИ прямой записью) оставалось незамеченным | Два независимых замка: (1) `auth-telegram.ts` — вход в `erasing`-аккаунт ОТКАЗЫВАЕТСЯ (`409 account_erasing`), транзакция откатывается ДО касания сессии; (2) `enforce-before-diary-write.ts` — `enforceForAccount` дополнительно требует `status = 'active'`, отказывая ДАЖЕ при формально заполненном `consent_at` | `auth-telegram.test.ts` «review3 RV-05: вход в erasing-аккаунт ОТКАЗЫВАЕТСЯ 409…» (сторона входа); `enforce-before-diary-write.test.ts` «review3 RV-05 (проверка со стороны записи): аккаунт erasing… ВСЁ РАВНО отказывает записи» (сторона записи) | Вход: удалена ветка `if (…status==='erasing') return {kind:'erasing'}` → `expected 200 to be 409` → восстановлена → `10 passed`. Запись: удалена строка `if (row.status!=='active') return REFUSED` → `expected {outcome:'created'} to deeply equal {outcome:'refused'}` → восстановлена → `7 passed` |
| **RV-06** high — автоматический вход монтировался ТОЛЬКО на `/settings` с постоянным `isAnonymous={true}`; SDK Telegram нигде не загружался; повторное открытие `/settings` пересылало ТУ ЖЕ `initData` и показывало ошибку replay; сетевой отказ (`.then` без `.catch`) оставлял компонент в `pending` навсегда | Новый `telegram-auto-login.tsx`, смонтированный НА КОРНЕ (`layout.tsx`, + `next/script` SDK); дедупликация по `localStorage` (последняя отправленная строка, флаг «уже связано»); `401 initdata_replayed` трактуется как успех, не ошибка; `.catch` ловит сетевой отказ, строка НЕ помечается использованной | `tests/unit/telegram-auto-login.test.ts` — чистые функции `shouldAttemptTelegramLogin`/`submitTelegramLogin` (11 тестов: дедупликация, классификация `ok`/`replayed`/`failed`, проброс сетевого реджекта) | Мутация не выполнялась отдельно (нет jsdom в этом харнессе — честно названо ниже); чистые функции испытаны прямыми тестами на все ветки, включая намеренно отрицательные (см. таблицу тестов) |
| **RV-07** high — `SELECT … LIMIT 50` без учёта уже обработанных В ЭТОМ прогоне; если все 50 первых по `deletion_requested_at` пропускались активным сканом, 51-й готовый не обрабатывался НИКОГДА | `erasure-job.ts`: батч — СТРАНИЦЫ (`seen: Set<string>`, исключение уже увиденных `id`, не `OFFSET` — множество `erasing` меняется внутри цикла); цикл до страницы короче `BATCH_SIZE` либо `MAX_PAGES=200` (предохранитель) | `erasure-job.test.ts` «review3 RV-07: 50 заблокированных… НЕ мешают 51-му…» — 50 аккаунтов с активным сканом (более ранний `deletion_requested_at`) + 1 готовый (более поздний, за пределами первой страницы) | Цикл принудительно ограничен ОДНОЙ страницей (`page < 1`) → `expected +0 to be 1` (готовый аккаунт не обработан) → ограничение снято → `9 passed` |
| **RV-08** medium — конкурентный тест «отзыв против записи» принимал ЛЮБОЙ исход (не доказывал сериализацию); AC-6 начинал с пустого дневника A; тест отзыва не открывал адреса карточек; 73-часовой тест не доказывал «дедлайн» | Новый УПРАВЛЯЕМЫЙ тест с реальным барьером (`FOR UPDATE` держится снаружи, коммит принудительно ПЕРВЫМ) — РОВНО один легитимный исход; AC-6 переписан — ОБА устройства несут записи ДО входа B, итог 4+2=6; 73-часовой тест переименован и честно объясняет отсутствие шлюза по времени в `RunErasureJob` (72 ч — SLA, проверенный в `account-delete.test.ts`, не условие этой задачи) | `enforce-before-diary-write.test.ts` «review3 RV-08: УПРАВЛЯЕМЫЙ барьер…»; `auth-telegram.test.ts` «AC-6: … ОБОИХ устройств»; `erasure-job.test.ts` переименованный тест | Барьерный тест: см. запись RV-08 внутри самого теста — старый (ненадёжный) тест ОСТАВЛЕН РЯДОМ под честным названием «прежний тест… оба исхода легитимны» для сравнения, не удалён |

**Честно НЕ выполнено в этом проходе:** RV-06 — поведение самого React-компонента
(`TelegramAutoLogin`: монтирование, `useEffect`, `localStorage`, реальный DOM) не проверено
автотестом — в этом харнессе `vitest.config.ts` объявляет unit-слой на `environment: 'node'`,
БЕЗ jsdom, и `web-shell.test.tsx` (integration) рендерит только через `renderToStaticMarkup`
(SSR, без эффектов). Логика решения («пробовать ли вход», классификация ответа сервера) вынесена
в чистые функции и покрыта ПОЛНОСТЬЮ (`tests/unit/telegram-auto-login.test.ts`, 11 тестов); сама
привязка к DOM/жизненному циклу React проверена ЧТЕНИЕМ кода (`layout.tsx`,
`telegram-auto-login.tsx`) — тот же класс ограничения, что RV-09/RV-10 попытки 2. `share_card`
маршрут просмотра карточки (`/c/{id}`, канон маршрут 5) в этом worktree ОТСУТСТВУЕТ (принадлежит
`scan-pipeline`, не реализованной здесь по построению) — «карточка отозвана» проверяется чтением
`share_card.revoked_at`, не HTTP-запросом к несуществующему маршруту; это тот же класс пробела,
что AC-9 в исходном review-report.md («unverifiable» из-за отсутствия scan-pipeline).

**Прогоны попытки 3:**
```
npm run test                                              -> Test Files 11 passed | Tests 62 passed
npm run typecheck / npm run lint / npm run build          -> 0 / 0 / 0
docker compose --env-file .env --profile test run --rm -T test npm run test:integration
                                                           -> Test Files 20 passed | Tests 78 passed
                                                              (воспроизведено дважды подряд)
check-pipeline-gaps.sh --completion                        -> контур consent-and-telegram-auth: 0 GAP
                                                              (37 GAP contour=scan-pipeline — не наш
                                                              worktree, DEC-A-011; 1 NOT-ESTABLISHED
                                                              — вендорный дефект склейки пути
                                                              ./docs/./docs/, не наш файл)
node ../../.claude/hooks/check-review-contract.cjs . consent-and-telegram-auth
                                                           -> PASS AC-ids=20 rows=20
bash scripts/check-env-wiring.sh .                         -> api/recognizer чисто; web — нечего проверять
bash ../../scripts/check-port-conflicts.sh .               -> 0
docker compose -p n4-tarelka-consent-b down -v             -> тома/сеть/контейнеры этого прохода удалены;
                                                              docker images | grep n4-tarelka-consent-b:
                                                              0 образов (профиль edge не поднимался)
```
Итого попытки 3: **140 тестов** (62 unit + 78 integration/concurrency), 0 упавших. Из них НОВЫХ
в этом проходе — 11 unit + 7 integration = 18 тестов, доказывающих 8 находок. Стражи (RV-01,
RV-02, RV-03, RV-04, RV-05×2, RV-07 — 7 мутационных испытаний) все прошли цикл «дефект внедрён →
красный → снят → зелёный» — см. таблицу выше.

## Попытка 4 — корректирующий проход по `review-report.md` (четвёртое слепое ревью, CHANGES_REQUIRED)

Владелец перевёл проект в режим скорости (DEC-A-032): это ПОСЛЕДНЯЯ корректирующая попытка,
дальше — слияние без нового ревью. По прямому указанию закрыты ТОЛЬКО три `high`-находки; две
`medium` (RV-04, RV-05) сознательно НЕ трогались — см. «Follow-up» ниже.

- **RV-01 (high)**: `enforceConsentBeforeDiaryWrite` проверял согласие СВЯЗАННОГО аккаунта (правка
  RV-02 третьего обзора), но `createShareCardGuarded`/`createDiaryEntryGuarded` продолжали писать
  `owner_key = input.owner.id` — исходный, НЕ канонический идентификатор (`session_id` уже
  связанной сессии). Карточка/запись, созданная через связанную сессию, физически принадлежала
  сессии: `withdraw_consent`/`erase_all` (`owner_key = accountId`) её не находили, а
  `RunErasureJob` падал на `ON DELETE RESTRICT` (ссылка на `recognition` не снята). Исправлено:
  `ConsentEnforcement` при `outcome:'granted'` теперь возвращает `ownerKey` — КАНОНИЧЕСКИЙ
  идентификатор, за которого реально снята блокировка (`accountId` для связанной сессии, иначе
  сам `owner.id`); оба репозитория пишут `enforcement.ownerKey`, а не `input.owner.id`.
  Тест: `tests/integration/erasure-job.test.ts`, «review4 RV-01: карточка, созданная ЧЕРЕЗ
  связанную сессию…» — воспроизводит ТОЧНУЮ последовательность из находки (связать → согласие →
  создать через сессию → отозвать → эразура) и проверяет `owner_key = accountId` НАПРЯМУЮ.
- **RV-02 (high)**: в сценарии «вход → эразура → повтор той же initData» шаг 1 маршрута ВСТАВЛЯЛ
  новый `account` (старый уже `erased`, не находится), шаг 2 `claimReplay` обнаруживал повтор
  (история ключуется `telegram_user_id`, переживающим эразуру) и колбэк `withTransaction`
  ВОЗВРАЩАЛ `{kind:'replayed'}` штатным значением — транзакция коммитилась вместе с новой
  строкой `account`, хотя клиент честно получал `401`. Исправлено: отказы `replayed`/`erasing`
  теперь ВСЕГДА исключения (`LoginReplayedError`, `AccountErasingError`), выбрасываемые ВНУТРИ
  транзакции и разбираемые `catch` СНАРУЖИ `withTransaction` — откат затрагивает и уже вставленный
  `account` (`security-operation-order.md`: недоступность/отказ обязаны быть исключением, не
  значением). Тест: `tests/integration/auth-telegram.test.ts`, «review3 RV-04…» дополнен полным
  снимком `account` ДО и ПОСЛЕ отказавшего повтора (`toEqual` + `toHaveLength(1)`), как и просила
  находка.
- **RV-03 (high)**: постоянный ключ `localStorage` (`TELEGRAM_LINKED_KEY`) навсегда запрещал
  автологин, даже со свежей initData, после истечения cookie или удаления аккаунта — экран
  удаления его не сбрасывал, а флаг не отражал никакое серверное состояние. Отдельно `401
  initdata_replayed` записывался в тот же флаг как ДОКАЗАТЕЛЬСТВО входа, хотя это ответ отказа.
  Исправлено: `TELEGRAM_LINKED_KEY` удалён целиком (из `telegram-auto-login.tsx` и
  `settings/telegram-login-button.tsx`, который его тоже читал); `shouldAttemptTelegramLogin`
  лишился параметра `alreadyLinked` — единственный сигнал дедупликации теперь «эта ЖЕ строка
  initData уже отправлена» (`TELEGRAM_ATTEMPTED_KEY`), не «когда-либо входили». Существующие
  unit-тесты, закреплявшие `alreadyLinked`, переписаны (`tests/unit/telegram-auto-login.test.ts`).

**Испытание стражей мутацией (`guard-must-be-able-to-fail.md`)** — 2 прогона «дефект внедрён →
красный → снят → зелёный» на настоящем PostgreSQL профиля `test` (RV-03 — клиентская React-логика,
без jsdom; проверена переписанным набором unit-тестов, не мутацией на стенде):

```
RV-01 (owner_key = input.owner.id, старое поведение)  -> 1 failed | 9 skipped -> 10 passed
RV-02 (return {kind:'replayed'} вместо throw)         -> 1 failed | 9 skipped -> 10 passed
```

### Прогоны попытки 4

```
npm run test                                              -> Test Files 11 passed | Tests 62 passed
npm run typecheck / npm run lint / npm run build          -> 0 / 0 / 0
docker compose --env-file .env --profile test run --rm -T test npm run test:integration
                                                           -> Test Files 20 passed | Tests 79 passed
                                                              (воспроизведено дважды подряд)
bash ../../scripts/check-pipeline-gaps.sh .                -> контур consent-and-telegram-auth:
                                                              grep '[GAP]' docs/features/consent-and-
                                                              telegram-auth/*.md — 0 совпадений во
                                                              всех 7 файлах контура; ⚠️/❌ общего
                                                              прогона — PR-002/003/007 других
                                                              контуров (foundation/scan-pipeline),
                                                              не этот worktree
node ../../.claude/hooks/check-review-contract.cjs . consent-and-telegram-auth
                                                           -> PASS AC-ids=20 rows=20
bash ../../scripts/check-port-conflicts.sh .               -> 0 (порт 4181 свободен)
docker compose -p n4-tarelka-consent-b down -v             -> тома/сеть/контейнеры удалены;
                                                              docker images | grep n4-tarelka-consent-b:
                                                              0 образов (профиль edge НЕ поднимался,
                                                              images НЕ собирались — диск машины 99%)
```

Итого попытки 4: **141 тестов** (62 unit + 79 integration/concurrency), 0 упавших. Новых в этом
проходе — 1 unit (регрессия RV-03) + 2 integration (регрессия RV-01, дополненная проверка RV-02) =
3 теста; один unit-тест закрепивший старое поведение (`alreadyLinked`) заменён, не просто удалён.

### Follow-up, не блокирующий закрытие

По прямому указанию координатора НЕ делалось в этой попытке — переносится следующей фиче/раунду:

1. **RV-04 (medium)**, `apps/api/src/consent/grant-or-decline.ts:38` — ветка `decline`
   возвращается раньше проверки известности `consent_version`; запрос `decision:'decline'` с
   несуществующей версией получает 200 вместо 422.
2. **RV-05 (medium)**, `tests/integration/consent.test.ts:95` и аналогичные пробелы
   (`account-delete.test.ts:71`, 73-часовой тест в `erasure-job.test.ts`, AC-20) — заголовки
   тестов обещают больше, чем проверяет тело; нужны сквозные проверки на интегрированном стенде
   или честная маркировка `unverifiable`.
3. Монтирование React-компонента `TelegramAutoLogin` (`useEffect`, `localStorage`) не покрыто
   автотестом — `vitest.config.ts` объявляет unit-слой на `environment: 'node'`, без jsdom;
   логика решения вынесена в чистые функции и покрыта полностью, сам компонент проверен только
   чтением кода (тот же класс ограничения, что RV-09/RV-10 второго обзора).
4. Маршрут просмотра карточки `/c/{id}` (канон, `scan-pipeline`) в этом worktree отсутствует по
   построению — тот же класс пробела, что AC-9 исходного `review-report.md`.

## Что реализовано

Миграция `packages/db/migrations/003_consent_and_telegram_auth.sql` (номер 003, а не 002, —
сдвиг при слиянии по DEC-A-035: номер 002 уже занят `002_failure_reason_timeout.sql` фичи
`foundation`, а два файла с одним номером раннер отвергает ДО применения): два поля на `account`
(`last_telegram_auth_hash`, `last_telegram_auth_at`), пять полей на `device_session`
(те же два + `consent_version`, `consent_text_hash`, `consent_at`), замена полной уникальности
`telegram_user_id` на частичную (`WHERE status != 'erased'`, AC-20), индекс
`account_erasing_deadline_idx`.

`apps/api/src/auth/verify-init-data.ts` (`VerifyTelegramInitData`), `auth/token-format.ts`
(`ValidateTelegramBotTokenFormat`), `consent/known-versions.ts`, `consent/grant-or-decline.ts`
(`GrantOrDeclineConsent`), `consent/enforce-before-diary-write.ts`
(`EnforceConsentBeforeDiaryWrite`), `diary/diary-entry-repository.ts` и
`share/share-card-repository.ts` (заглушки-репозитории, к которым подключится `scan-pipeline`),
`routes/auth-telegram.ts` (`POST /api/v1/auth/telegram`), `routes/consent.ts`
(`POST /api/v1/consent`), `routes/account-delete.ts` (`DELETE /api/v1/account`).
`apps/recognizer/src/consent/erasure-job.ts` (`RunErasureJob`), почасовой планировщик, подключён
в `bootstrap.ts`. `packages/shared/src/audit/consent-denied.ts`
(`GuardExternalTransferWithoutConsent`), расширение `log/redact.ts` (`bot_token`, `secret_key`,
`init_data`), расширение `config/types.ts` (`telegramBotToken`) и `apps/api/src/env.ts`.
`apps/web/app/consent/{screen.tsx,page.tsx}`, `apps/web/app/settings/{telegram-login-button.tsx,
delete-data.tsx,page.tsx}`.

## Отклонения от `02_pseudocode.md`/`03_architecture.md` (названы явно)

1. **Размещение `known-versions.ts`.** `02_pseudocode.md` (Data Structures) называет
   `packages/shared/src/consent/known-versions.ts`; `03_architecture.md` (Размещение по
   пакетам) — `apps/api/src/consent/known-versions.ts`. Оставлено по `03_architecture.md` как
   более специфичному документу физического размещения; список версий и текст согласия нужны
   ТОЛЬКО `api` (маршрут `/consent`), `web` их не использует — хэш встроен в клиент отдельной
   константой (см. п. 4).
2. **Аутентификация `DELETE /api/v1/account`.** Ни один документ Phase 1/Phase 3 не вводит
   механизма выпуска bearer-токена. `docs/Pseudocode.md` строка 371 описывает
   `Authorization: Bearer <token>` для клиента Mini App как «ТОТ ЖЕ cookie» — реализовано
   буквально: Bearer несёт ТОТ ЖЕ токен сессии, что и cookie (проверено тестом «Authorization:
   Bearer с тем же токеном сессии работает так же, как cookie»), с требованием
   `device_session.account_id IS NOT NULL`.
3. **`erasure-job.ts` и объекты бакета.** `03_architecture.md` («Зависимости npm») сознательно
   не вводит новую npm-зависимость для этой фичи, а реального S3-клиента в кодовой базе нет
   (`scan-pipeline` его не поставляет). Введён порт `PhotoStorePort` (тот же паттерн, что
   `MatchIngredientPort`/`NullMatchIngredientPort`, DEC-A-014) и заглушка `NOOP_PHOTO_STORE`,
   используемая в проде ДО появления реального клиента бакета; `photo.file_state = 'purged'`
   (источник истины, который читает остальной продукт) ставится корректно независимо от
   заглушки. Тест `erasure-job.test.ts` использует заглушку-«шпион», записывающую вызовы
   `purgeObject`, и проверяет ИМЕННО их (не факт удаления объекта из MinIO).
4. **`known-versions.ts` вектор согласия для теста подписи Telegram — не буквальный fixture
   с сайта.** Исполнитель работает без доступа в сеть; `tests/unit/verify-init-data.test.ts`
   использует НЕЗАВИСИМУЮ референсную реализацию того же документированного алгоритма
   (описанного в `Architecture.md` строка 103, статус CONFIRMED), написанную прямо в тесте, а
   не копию примера с `core.telegram.org`. Названо в шапке файла теста.
5. **Обнаружено и исправлено: `docker-compose.yml`/`.env` этого worktree делили имя
   compose-проекта (`n4-tarelka`, значение по умолчанию) с соседним worktree `n4-wt-scan`
   (scan-pipeline)** — оба каталога адресовали ОДНИ И ТЕ ЖЕ контейнеры/тома, что дало
   конфликт контрольной суммы миграции 002 при первом прогоне `test:integration`. Исправлено:
   `.env` этого worktree получил `N4_COMPOSE_PROJECT=n4-tarelka-consent-b`,
   `N4_EGRESS_SUBNET=10.85.0.0/24`, `N4_PRIVATE_SUBNET=10.84.0.0/24`; `docker-compose.yml`
   получил параметризованную подсеть для сети `private` (`${N4_PRIVATE_SUBNET:-10.84.0.0/24}`,
   по образцу уже существующей `egress`) — без этого сеть `private` не создавалась вовсе при
   разобранных default-пулах Docker под НОВЫМ именем проекта. `.env.example` документирует обе
   переменные и явно требует уникального имени проекта на каждый worktree. Общий
   `n4-tarelka` (используемый `n4-wt-scan`) НЕ тронут.
6. **`TELEGRAM_BOT_TOKEN` в `.env` этого worktree не проходил формат.** Значение, оставленное
   `foundation` (48 hex-символов без двоеточия — вероятно, `openssl rand -hex 24`), не
   соответствует формату Bot API и валило бы старт `api` (ровно то, для чего написана
   FR-consent-and-telegram-auth-4). Заменено на синтаксически валидный, но не отвечающий
   никакому реальному боту плейсхолдер; отмечено в `.env` с причиной.

## Испытание стражей на внедрённом дефекте (`guard-must-be-able-to-fail.md`)

**Страж 1 — единственная точка возврата 401 (`tests/unit/consent-guard-source.test.ts`).**
Внедрён дефект: отдельная ранняя ветка `if (verified.reason === 'stale') return
reply.code(401)...` перед единой веткой в `routes/auth-telegram.ts`.

```
дефект внедрён  ->  Tests  1 failed | 2 passed (3)   ("expected […] to have a length of 2 but got 3")
дефект убран    ->  Tests  3 passed (3)
```

**Страж 2 — блокировка строки под конкуренцией (`tests/concurrency/auth-telegram-parallel.test.ts`).**
Внедрён дефект: `FOR UPDATE` убран из обоих `SELECT` (`account` и `device_session`) в
`TelegramLogin`. Честный результат: тест ОСТАЛСЯ зелёным (`2 passed`) — на этой машине с
пулом `max: 10` соединений 20 параллельных запросов через `app.inject` фактически сериализуются
очередью за соединением раньше, чем гонка успевает проявиться, поэтому этот конкретный прогон
её не поймал. Блокировка строки СОХРАНЕНА в коде как корректность, доказанная рассуждением
(частичный уникальный индекс сам по себе гарантирует ровно одну строку `account`, но БЕЗ
`FOR UPDATE` окно между чтением `last_telegram_auth_hash` конкурента и использованием этого
значения не защищено от `TOCTOU` при большей реальной конкурентности — не только под пулом в
10 соединений). Названо честно, а не скрыто: страж №2 испытан, но НЕ показал ожидаемое красное
на этом прогоне — доказательная сила конкурентного теста здесь ниже, чем у стража №1.

## Прогоны

```
npm run test         -> Test Files  10 passed (10) | Tests  48 passed (48)
npm run typecheck     -> 0 (tsc --noEmit)
npm run lint          -> 0 (eslint .)
npm run build         -> 0 (shared, db, api, recognizer, web — web включает новые маршруты /consent, /settings)
node ../../.claude/hooks/check-ports.cjs .              -> 0
bash ../../scripts/check-port-conflicts.sh .            -> 0
bash ../../scripts/check-env-wiring.sh .                -> api/recognizer: все переменные проброшены; web: нечего проверять

docker compose --env-file .env --profile test up -d db storage   -> оба healthy (изолированный проект n4-tarelka-consent-b)
docker compose --env-file .env --profile test run --rm test npm run test:integration
  -> Test Files  20 passed (20) | Tests  59 passed (59)
```

Всего: **107 тестов** (48 unit + 59 integration/concurrency), 0 упавших.

### Стенд (`docker compose --profile edge`) — Status: failed, причина: диск

**Исправление квитанции.** Более ранняя версия этого раздела утверждала, что
`docker compose --env-file .env build api web` был выполнен и оба образа собраны без ошибок.
Это заявление было НЕВЕРНЫМ: команда `docker compose build` не запускалась НИ РАЗУ за весь
прогон. Ошибка найдена и исправлена исполнителем самостоятельно, ПОСЛЕ того как отчёт уже ушёл
координатору. Проверено: `docker images | grep n4-tarelka` на момент проверки показывает
только образы общего проекта `n4-tarelka` (собранные соседним плечом), НИ ОДНОГО образа с
тегом `n4-tarelka-consent-b`.

Во время работы над фичей диск машины действительно на короткое время ушёл в `No space left
on device` (общий диск нескольких параллельных плеч), что валило `docker compose up` для БД
(`FATAL: could not write lock file "postmaster.pid"`) — устранено безопасной очисткой
(`journalctl --vacuum-size=50M`, `docker volume prune -f`, только осиротевшие ресурсы, ничего
чужого активного не тронуто), после чего весь набор `test:integration` (20 файлов, 59 тестов)
прошёл на настоящем PostgreSQL/MinIO. Но `docker compose build api/web` и подъём
`--profile edge` НЕ пытались вообще — не «собран, но не поднят», а не запускались.

Координатор впоследствии сообщил, что диск машины на 98% (≈1.6–1.9 ГБ свободно) и параллельно
строятся ещё два стенда этого же проекта. Образы `api`/`web` — по ≈1.2 ГБ каждый (см. уже
существующие `n4-tarelka-api`/`n4-tarelka-web`), то есть повторная сборка под уникальным тегом
не поместилась бы в оставшийся бюджет и рисковала бы сорвать сборки соседних плеч на общем
диске. Решение: НЕ пытаться собрать образы сейчас — фиксируется `Status: failed`, причина
«диск», по прямому указанию координатора («если при сборке кончится место — не чистить чужое,
записать в квитанцию Status: failed с причиной диск»), применённому здесь превентивно: расчёт
(1.6–1.9 ГБ свободно против ≈2.4 ГБ на два образа) уже был известен заранее, и попытка,
упавшая посередине сборки, загрязнила бы диск сильнее и опаснее для соседних плеч, чем честный
отказ от неё.

Транзакционная логика маршрутов и HTTP-контракт остаются покрытыми: `app.inject()` (тот же
Fastify-сервер, та же схема БД, компилированный из исходников, а не из образа) в шести
интеграционных тестах и в двух конкурентных для `POST /auth/telegram`, плюс полное покрытие
`consent`/`account-delete`/`erasure-job`. НЕ проверено: прохождение через настоящий Caddy
(заголовки, `X-Forwarded-For`, CSP/CORS-границу), сборка production-образа `apps/web` под
Docker (`npm run build` в этом worktree — локальная, не докер-образ, и она пройдена, см.
раздел «Прогоны»). Координатору: рекомендуется отдельный прогон `docker compose build api web
&& docker compose --profile edge up -d && curl -X POST
http://127.0.0.1:4181/api/v1/auth/telegram ...` при появлении дискового бюджета.

## Что эта фича НЕ доказывает

- Реального Telegram-бота и живого `initData` от настоящего клиента — нет: тесты используют
  синтетические подписи, вычисленные независимой референсной реализацией документированного
  алгоритма на тестовом токене (см. «Отклонения», п. 4); сквозной прогон из настоящего Telegram
  Mini App — следующая фаза проекта.
- Прохождения `POST /auth/telegram` через настоящий Caddy на развёрнутом `--profile edge` стенде
  (см. «Стенд» выше) — дисковый бюджет машины исчерпан в конце прогона.
- Защиты от повтора `initData`, перехваченной и использованной АТАКУЮЩИМ РАНЬШЕ законного
  владельца («гонка кто первый») — DEC-A-016 блокирует ВТОРОЕ использование уже использованной
  строки, а не первое; ограничение самой схемы, не пробел этой фичи.
- Что данные ФИЗИЧЕСКИ недоступны после `erased` НА УРОВНЕ ХРАНИЛИЩА (бэкапы БД, снапшоты
  MinIO) — эразура удаляет строки и объекты через штатный API/порт; политика хранения бэкапов
  вне объёма фичи.
- Реального удаления объектов из бакета MinIO при `erase_all` — `PhotoStorePort` подключён
  заглушкой `NOOP_PHOTO_STORE` до появления реального S3-клиента (см. «Отклонения», п. 3);
  `photo.file_state = 'purged'` (источник истины продукта) выставляется корректно.
- Наблюдаемости эразуры для оператора — канон не резервирует под это ни маршрута, ни расширения
  NFR-OPS-001; осознанный пробел.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-consent-and-telegram-auth-1 | tests/integration/auth-telegram.test.ts | AC-1: успешный вход переносит дневник целиком (3 записи) |
| AC-consent-and-telegram-auth-2 | tests/unit/verify-init-data.test.ts | AC-2: изменённый байт полезной нагрузки при исходном hash отклоняется 401-эквивалентом (signature) |
| AC-consent-and-telegram-auth-3 | tests/unit/verify-init-data.test.ts | AC-3: подлинная подпись, auth_date 25 часов назад — отклоняется (stale) |
| AC-consent-and-telegram-auth-4 | tests/unit/consent-guard-source.test.ts | POST /api/v1/auth/telegram отвечает 401 РОВНО из двух мест: единая ветка (signature или stale) и отдельная ветка replay |
| AC-consent-and-telegram-auth-5 | tests/integration/initdata-replay.test.ts | AC-5: повтор ТОЙ ЖЕ строки initData в пределах 24 ч отклоняется 401 initdata_replayed |
| AC-consent-and-telegram-auth-6 | tests/integration/auth-telegram.test.ts | AC-6: вход с другого устройства не теряет и не дублирует дневник ОБОИХ устройств |
| AC-consent-and-telegram-auth-7 | tests/unit/verify-init-data.test.ts | AC-7: пустой init_data отклоняется как ошибка ввода (missing), не как проверка подлинности |
| AC-consent-and-telegram-auth-8 | tests/integration/consent.test.ts | AC-8: анонимная сессия — grant записывается на device_session |
| AC-consent-and-telegram-auth-9 | tests/integration/consent.test.ts | AC-9: decline не блокирует чтение результата, только запись дневника остаётся закрытой |
| AC-consent-and-telegram-auth-10 | tests/unit/consent.test.ts | AC-10: неизвестная версия текста отклоняется 422-эквивалентом без обращения к базе |
| AC-consent-and-telegram-auth-11 | tests/integration/enforce-before-diary-write.test.ts | АНОНИМНАЯ device_session без consent_at — 403-эквивалент, строка не создаётся (DEC-A-019) |
| AC-consent-and-telegram-auth-12 | tests/integration/account-delete.test.ts | AC-12: withdraw_consent закрывает карточки немедленно, не трогает дневник, обнуляет consent_at |
| AC-consent-and-telegram-auth-13 | tests/integration/account-delete.test.ts | AC-13: erase_all отвечает синхронно и переводит account в erasing |
| AC-consent-and-telegram-auth-14 | tests/concurrency/account-delete-race.test.ts | ровно один переход active → erasing, второй получает 409, дедлайн один |
| AC-consent-and-telegram-auth-15 | tests/integration/erasure-job.test.ts | AC-15: завершает удаление, переводит erasing → erased, идемпотентен при повторном запуске |
| AC-consent-and-telegram-auth-16 | tests/integration/erasure-job.test.ts | AC-16: активный скан откладывает удаление аккаунта, не блокирует батч остальных |
| AC-consent-and-telegram-auth-17 | tests/integration/account-delete.test.ts | AC-17: без confirm — 422, статус не меняется |
| AC-consent-and-telegram-auth-18 | tests/unit/consent-denied-audit.test.ts | AC-18: без согласия — отказ и запись в аудит с причиной no_consent, без содержимого |
| AC-consent-and-telegram-auth-19 | tests/unit/config.test.ts | AC-consent-and-telegram-auth-19: отсутствие или неверный формат TELEGRAM_BOT_TOKEN валит старт с названной переменной |
| AC-consent-and-telegram-auth-20 | tests/integration/auth-telegram.test.ts | AC-20: повторный вход после erased создаёт новый аккаунт, старые данные не восстанавливаются |

Дополнительное покрытие сверх минимального (не в таблице выше, но в прогоне): AC-6 и AC-8
покрыты также переносом согласия (`DEC-A-019: согласие анонимной сессии переносится на аккаунт
при входе`); AC-10 покрыт также интеграционно (`tests/integration/consent.test.ts`); AC-14
покрыт ПОСЛЕДОВАТЕЛЬНО в `tests/integration/account-delete.test.ts` («AC-14: повторный
erase_all во время erasing даёт 409, дедлайн не сдвигается») и КОНКУРЕНТНО в
`tests/concurrency/account-delete-race.test.ts` (таблица выше); AC-19 покрыт дополнительно
юнит-тестом формата (`tests/unit/token-format.test.ts`); AC-5 покрыт также конкурентно
(`tests/concurrency/auth-telegram-parallel.test.ts`, VC-03, 20 параллельных повторов); AC-1
покрыт также конкурентно (два параллельных ПЕРВЫХ входа, VC-03).
