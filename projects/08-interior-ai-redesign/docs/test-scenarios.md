# N8 — canonical BDD scenarios (source-bound plan)

Spec revision: sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd

65 independently named scenario criteria; actual test evidence is added by each implementation feature. No runtime pass is implied.

## Criterion scenarios

| Criterion | Scenario |
|---|---|
| SC-US-001-1 | SC-US-001-1 — новый адрес |
| SC-US-001-2 | SC-US-001-2 — неверный пароль/истёкшая или отозванная сессия |
| SC-US-001-3 | SC-US-001-3 — 72/73 UTF-8 bytes и multibyte пароль |
| SC-US-002-1 | SC-US-002-1 — два проекта |
| SC-US-002-2 | SC-US-002-2 — другой аккаунт/архив |
| SC-US-003-1 | SC-US-003-1 — 4.5×4×2.7 м и допустимые проёмы |
| SC-US-003-2 | SC-US-003-2 — ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб |
| SC-US-004-1 | SC-US-004-1 — безопасный GLB или reference image |
| SC-US-004-2 | SC-US-004-2 — oversized/повреждённый/remote-URI GLB либо изображение-bomb |
| SC-US-004-3 | SC-US-004-3 — чужой assetId |
| SC-US-005-1 | SC-US-005-1 — reference |
| SC-US-005-2 | SC-US-005-2 — недоступный Pinterest |
| SC-US-005-3 | SC-US-005-3 — заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/` |
| SC-US-006-1 | SC-US-006-1 — калиброванная основа |
| SC-US-006-2 | SC-US-006-2 — предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox |
| SC-US-007-1 | SC-US-007-1 — согласованный вариант |
| SC-US-007-2 | SC-US-007-2 — два одновременных редактирования |
| SC-US-007-3 | SC-US-007-3 — approved design |
| SC-US-008-1 | SC-US-008-1 — manual/off |
| SC-US-008-2 | SC-US-008-2 — enabled без caps/key или тестовый вредоносный ответ |
| SC-US-008-3 | SC-US-008-3 — два worker и один job/лимит |
| SC-US-008-4 | SC-US-008-4 — запрос уже dispatched |
| SC-US-008-5 | SC-US-008-5 — offline HTTP provider fixture с валидным JSON и подтверждённой стоимостью |
| SC-US-008-6 | SC-US-008-6 — поздний replay либо archive/refund/manual edit |
| SC-US-009-1 | SC-US-009-1 — официальная ссылка и ручной снимок |
| SC-US-009-2 | SC-US-009-2 — retailer 401/нет цены |
| SC-US-009-3 | SC-US-009-3 — fresh снимок |
| SC-US-010-1 | SC-US-010-1 — площадь 18, запас 8%, упаковка 1.99, цена 160000 копеек |
| SC-US-010-2 | SC-US-010-2 — unmatched/unselected товар даже при известных работах/доставке либо null coverage |
| SC-US-010-5 | SC-US-010-5 — отрицательный/overflow input, несовместимые единицы либо floor_area для стены |
| SC-US-010-6 | SC-US-010-6 — floor и wall material |
| SC-US-010-7 | SC-US-010-7 — сохранённая смета и изменённые текущие shopping rows |
| SC-US-010-3 | SC-US-010-3 — изменённые quantity/price/reserve и бюджетный лимит |
| SC-US-010-4 | SC-US-010-4 — цена 1600 ₽ целым вводом и ранний лимит |
| SC-US-011-1 | SC-US-011-1 — нет товара |
| SC-US-011-2 | SC-US-011-2 — позиции двух этапов |
| SC-US-011-3 | SC-US-011-3 — старая смета |
| SC-US-011-4 | SC-US-011-4 — неподтверждённая либо не помещающаяся замена |
| SC-US-012-1 | SC-US-012-1 — off/неполный live config |
| SC-US-012-2 | SC-US-012-2 — тестовый provider и одинаковый ключ |
| SC-US-013-1 | SC-US-013-1 — verified succeeded |
| SC-US-013-2 | SC-US-013-2 — чужой merchant/amount/test mode/payment linkage |
| SC-US-013-4 | SC-US-013-4 — verification timeout |
| SC-US-013-3 | SC-US-013-3 — refund.succeeded |
| SC-US-014-1 | SC-US-014-1 — первый вариант |
| SC-US-014-2 | SC-US-014-2 — активная ссылка |
| SC-US-014-3 | SC-US-014-3 — чужой аккаунт/неподтверждённые права |
| SC-US-015-1 | SC-US-015-1 — повторный event key |
| SC-US-015-2 | SC-US-015-2 — нет событий |
| SC-US-015-3 | SC-US-015-3 — первое allowlisted событие |
| SC-US-025-1 | SC-US-025-1 — выбранная смета с known/unknown/retained rows |
| SC-US-016-1 | SC-US-016-1 — cross-origin/request без CSRF либо чужой ID |
| SC-US-016-2 | SC-US-016-2 — 59 mutation attempts в минуте |
| SC-US-016-3 | SC-US-016-3 — valid owned bounded mutation и точный Origin |
| SC-US-019-1 | SC-US-019-1 — A и B |
| SC-US-020-1 | SC-US-020-1 — malformed/oversized/slow body |
| SC-US-020-2 | SC-US-020-2 — SQL/HTML/script/URL-userinfo input |
| SC-US-021-1 | SC-US-021-1 — secret-bearing failure |
| SC-US-017-1 | SC-US-017-1 — fresh isolated env |
| SC-US-017-2 | SC-US-017-2 — incompatible config/schema/storage |
| SC-US-018-1 | SC-US-018-1 — 390px и desktop |
| SC-US-022-1 | SC-US-022-1 — WebGL initialization failed |
| SC-US-023-1 | SC-US-023-1 — plan/reference/budget saved |
| SC-US-024-1 | SC-US-024-1 — exact build/fixture/host |
| SC-US-024-2 | SC-US-024-2 — immutable200-line fixture с Decimal/unknown/services/delivery/reserve |

## Scenarios

```gherkin
Scenario: SC-US-001-1
  Given новый адрес
  When зарегистрировался, вышел и вошёл
  Then кабинет доступен только новой действующей сессии.

Scenario: SC-US-001-2
  Given неверный пароль/истёкшая или отозванная сессия
  When вход/чтение
  Then общий 401, приватные данные отсутствуют.

Scenario: SC-US-001-3
  Given 72/73 UTF-8 bytes и multibyte пароль
  When register/login
  Then 72 допустим при ≥12 символах,73 отклоняется явно до bcrypt, suffix не становится эквивалентным паролем.

Scenario: SC-US-002-1
  Given два проекта
  When изменён и перезагружен один
  Then второй не изменён, состояние первого восстановлено.

Scenario: SC-US-002-2
  Given другой аккаунт/архив
  When чужой ID либо мутация архива
  Then 404 либо 409 PROJECT_ARCHIVED соответственно, данные не изменены.

Scenario: SC-US-003-1
  Given 4.5×4×2.7 м и допустимые проёмы
  When подтвердил
  Then площадь пола 18 м², стабильный shell hash, видны план и 3D.

Scenario: SC-US-003-2
  Given ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб
  When согласование
  Then 422 либо 409 CALIBRATION_REQUIRED, проверенного статуса нет.

Scenario: SC-US-004-1
  Given безопасный GLB или reference image
  When upload
  Then исходный hash сохранён, asset доступен только owner, normalized image/thumbnail декодирован и перекодирован без EXIF, fixed MIME/nosniff, external resources не загружались.

Scenario: SC-US-004-2
  Given oversized/повреждённый/remote-URI GLB либо изображение-bomb
  When upload
  Then 413/415/422, нет опубликованного asset и сетевых запросов к вложенным URL.

Scenario: SC-US-004-3
  Given чужой assetId
  When скачать/использовать в проекте
  Then 404 даже при известном storage key.

Scenario: SC-US-005-1
  Given reference
  When выбраны tags/note и повторное открытие
  Then данные сохранены вместе с source/дата.

Scenario: SC-US-005-2
  Given недоступный Pinterest
  When добавлена ссылка
  Then предлагается upload, нет обещания импортированной доски или автоматического доступа.

Scenario: SC-US-005-3
  Given заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/`
  When сохранена/переоткрыта
  Then исходная ссылка сохранена и доступна, не заменена общим Pinterest URL.

Scenario: SC-US-006-1
  Given калиброванная основа
  When меняю стиль/мебель/ракурс и до/после
  Then shell hash/размеры/проёмы неизменны, выбор сохранён.

Scenario: SC-US-006-2
  Given предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox
  When сохранить
  Then 422 SCENE_INVALID, предыдущий вариант цел.

Scenario: SC-US-007-1
  Given согласованный вариант
  When поменял размер/стиль
  Then новая revision, старый результат доступен, quantities пересчитываются по новой подтверждённой площади либо остаются unknown.

Scenario: SC-US-007-2
  Given два одновременных редактирования
  When одинаковый expectedVersion
  Then один commit, второй 409 VERSION_CONFLICT без потери данных.

Scenario: SC-US-007-3
  Given approved design
  When изменён стиль или выбран другой исторический вариант
  Then создана новая draft revision, approval снят, история сохранена, покупки показывают предупреждение до повторного согласования.

Scenario: SC-US-008-1
  Given manual/off
  When пользователь ищет AI
  Then видна надпись «Ручной режим · AI не подключён», пресеты сохраняются и network spy показывает0 внешних AI-вызовов.

Scenario: SC-US-008-2
  Given enabled без caps/key или тестовый вредоносный ответ
  When startup/validation
  Then отказ startup либо job failed, shell не меняется.

Scenario: SC-US-008-3
  Given два worker и один job/лимит
  When параллельный claim/dispatch
  Then один dispatch, caps атомарны, старый fence не завершает job повторно.

Scenario: SC-US-008-4
  Given запрос уже dispatched
  When timeout/crash
  Then job uncertain, cost/usage неизвестны и reservation сохранена, автоматического платного redispatch нет.

Scenario: SC-US-008-5
  Given offline HTTP provider fixture с валидным JSON и подтверждённой стоимостью
  When job завершён
  Then одна draft revision текущего shell, один held credit consumed, обе reservations reconciled по фактическому cost, live network не вызывалась.

Scenario: SC-US-008-6
  Given поздний replay либо archive/refund/manual edit
  When retry/mark-dispatch/completion
  Then replay возвращает прежний job по тому же inputHash, archive до mark запрещает dispatch, поздний результат не заменяет новую ручную работу, consent body неизменен.

Scenario: SC-US-009-1
  Given официальная ссылка и ручной снимок
  When сохранён
  Then все provenance-поля видны и подставляются в shopping line.

Scenario: SC-US-009-2
  Given retailer 401/нет цены
  When запрос обновления
  Then blocked/unknown, нуля или текущей цены не появляется, предлагается ручное подтверждение.

Scenario: SC-US-009-3
  Given fresh снимок
  When сменён регион/магазин либо прошло 24h
  Then effective freshness stale, подтверждённый статус снят до нового снимка.

Scenario: SC-US-010-1
  Given площадь 18, запас 8%, упаковка 1.99, цена 160000 копеек
  When calculate
  Then 10 упаковок, 1600000 копеек, видимая формула.

Scenario: SC-US-010-2
  Given unmatched/unselected товар даже при известных работах/доставке либо null coverage
  When calculate
  Then incomplete с видимыми unknown rows, неизвестное не теряется.

Scenario: SC-US-010-5
  Given отрицательный/overflow input, несовместимые единицы либо floor_area для стены
  When calculate
  Then 422, предыдущая смета неизменна.

Scenario: SC-US-010-6
  Given floor и wall material
  When derive quantity
  Then floor4.5×4=18 м², wall площадь равна длине стены×высоте минус её проёмы; GLB area unknown до явного user-confirmed surface quantity.

Scenario: SC-US-010-7
  Given сохранённая смета и изменённые текущие shopping rows
  When воспроизвожу старый snapshot без текущих rows
  Then совпадают totals, phases, unresolved/complete, reserve и delta по стабильным element/cost IDs.

Scenario: SC-US-010-3
  Given изменённые quantity/price/reserve и бюджетный лимит
  When calculate
  Then новая версия, точный delta, known/scenario отдельно; incomplete не получает «уложились».

Scenario: SC-US-010-4
  Given цена 1600 ₽ целым вводом и ранний лимит
  When введены/изменены значения
  Then native input допускает submit, minor=160000, текущий лимит отображается и немедленно влияет на сравнение.

Scenario: SC-US-011-1
  Given нет товара
  When выбрал замену
  Then видно отличие/новые габариты, новая версия и повторное согласование.

Scenario: SC-US-011-2
  Given позиции двух этапов
  When перенос строки
  Then суммы этапов меняются, общая сумма неизменна.

Scenario: SC-US-011-3
  Given старая смета
  When возвращаюсь к дизайну и пересчитываю
  Then сохранены обе версии и причина изменения, old approval не переиспользован.

Scenario: SC-US-011-4
  Given неподтверждённая либо не помещающаяся замена
  When replace
  Then 409/422 с причиной, указатели/история не изменены.

Scenario: SC-US-012-1
  Given off/неполный live config
  When checkout/start
  Then отключён checkout/отказ startup, денег и entitlement нет.

Scenario: SC-US-012-2
  Given тестовый provider и одинаковый ключ
  When два checkout
  Then один order/remote id; клиент не меняет цену/credits.

Scenario: SC-US-013-1
  Given verified succeeded
  When webhook replay/concurrent delivery
  Then одно начисление и один ledger outcome.

Scenario: SC-US-013-2
  Given чужой merchant/amount/test mode/payment linkage
  When webhook
  Then 400, credits/ledger неизменны.

Scenario: SC-US-013-4
  Given verification timeout
  When та же delivery повторена с подтверждённым provider response
  Then первый503 не занимает event key, повтор начисляет пакет ровно один раз.

Scenario: SC-US-013-3
  Given refund.succeeded
  When verified event
  Then новые live jobs запрещены и export entitlement отозван, audit/history доступны.

Scenario: SC-US-014-1
  Given первый вариант
  When export/share preview
  Then обе кнопки рядом, watermark соответствует entitlement, исходные приватные данные не включены.

Scenario: SC-US-014-2
  Given активная ссылка
  When owner отзывает/архивирует проект или TTL истёк
  Then последующий view/image 404, cache no-store; ранее скачанные копии не обещано удалить.

Scenario: SC-US-014-3
  Given чужой аккаунт/неподтверждённые права
  When создание link
  Then отказ без публикации.

Scenario: SC-US-015-1
  Given повторный event key
  When повторная запись
  Then один event, нет исходных фото/текста/токенов в log.

Scenario: SC-US-015-2
  Given нет событий
  When локальная readonly метрика
  Then наблюдаемое0 либо unknown при отказе хранилища, не прогноз конверсии.

Scenario: SC-US-015-3
  Given первое allowlisted событие
  When записано
  Then count1 в явном 30-day reporting window; share_created не означает external sharing.

Scenario: SC-US-025-1
  Given выбранная смета с known/unknown/retained rows
  When download CSV
  Then rows/provenance/phase/units/totals совпадают с immutable snapshot, unknown пустое/подписанное, dangerous formula text inert; другой owner получает404.

Scenario: SC-US-016-1
  Given cross-origin/request без CSRF либо чужой ID
  When mutation/read
  Then 403/404, side effect отсутствует.

Scenario: SC-US-016-2
  Given 59 mutation attempts в минуте
  When 20 одновременных requests одного actor
  Then ровно1 проходит и19 получают429/Retry-After; счёт включает отклонённые/невалидные попытки.

Scenario: SC-US-016-3
  Given valid owned bounded mutation и точный Origin
  When active session обращается ниже лимита
  Then одна успешная mutation с сохранённым результатом.

Scenario: SC-US-019-1
  Given A и B
  When A использует B ID в URL/scalar/array/JSON relation
  Then 404 без private bytes/side effect, разрешённое owned чтение успешно.

Scenario: SC-US-020-1
  Given malformed/oversized/slow body
  When повтор обращений
  Then rate counted до parse, typed400/413/timeout до decode, DB connection не удерживается на body read.

Scenario: SC-US-020-2
  Given SQL/HTML/script/URL-userinfo input
  When accepted text or rejected URL обрабатывается
  Then SQL параметризован, markup escaped, shell/network execution отсутствует.

Scenario: SC-US-021-1
  Given secret-bearing failure
  When exception обработан
  Then журнал содержит только code/requestId/latency/hashed IDs, без password/token/plan/payload.

Scenario: SC-US-017-1
  Given fresh isolated env
  When migrate/build/start
  Then health ready, DB не имеет published ports, project data переживают restart.

Scenario: SC-US-017-2
  Given incompatible config/schema/storage
  When ready/start
  Then non-ready/отказ startup с redacted причиной, live inference/payment не вызываются.

Scenario: SC-US-018-1
  Given 390px и desktop
  When keyboard выбирает steps и submit формы
  Then виден focus, controls имеют labels, ошибки текстовые, document.scrollWidth≤innerWidth; canonical actions: create/open project, save/confirm plan, add reference, save/approve design, add/replace product, calculate budget, export/share/revoke.

Scenario: SC-US-022-1
  Given WebGL initialization failed
  When открываю viewer
  Then видны2D план/размеры и список объектов, можно сохранить вариант, нет сообщения об успешной3D загрузке.

Scenario: SC-US-023-1
  Given plan/reference/budget saved
  When reload либо field validation fails
  Then сохранённые значения восстановлены, незавершённый ввод остаётся при typed field error, новые ошибки получают focus/text.

Scenario: SC-US-024-1
  Given exact build/fixture/host
  When 10 clients каждый выполняет20 warm-up+100 measured GET owned project/list requests
  Then nearest-rank p95≤500ms для1000 ответов, status/body проверены, ошибки/timeouts не удаляются и валят проверку.

Scenario: SC-US-024-2
  Given immutable200-line fixture с Decimal/unknown/services/delivery/reserve
  When 50 warm-up+1000 measured calculations
  Then nearest-rank p95≤100ms и1000 canonical result hashes равны golden; exception/missing sample валит проверку.

```
