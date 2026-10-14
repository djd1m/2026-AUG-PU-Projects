# N8 — Specification v0.1

2026-10-13 · выбран CJM A · статус: для независимой валидации перед реализацией.
Источник полномочий: [project-input](project-input.md), последующее разрешение владельца на полный цикл без нового выбора CJM. Старые draft-brief остаются историей и не возвращают отменённую остановку.
TARGET_CATALOG: `projects/08-interior-ai-redesign/docs`; DOCUMENT_ROLE_MAP: specification=`Specification.md`, pseudocode=`Pseudocode.md`, architecture=`Architecture.md`, refinement=`Refinement.md`, completion=`Completion.md`.
Проверяемый MVP: самостоятельный владелец жилья проходит измеренное пространство + референсы → варианты → товары → бюджет → новая версия. Реальные AI/платежи реализуются как отключаемые интеграции; их успешные live-вызовы без разрешённых ключей/лимитов не являются критерием локальной поставки.

## Feature Matrix

| Фича | MVP / владелец модуля | Позже |
|---|---|---|
| F1 foundation | Аккаунт, сессия, приватные проекты/кабинет; identity | OAuth, email verification/reset через внешний сервис |
| F2 space-assets | Ручная прямоугольная комната с проёмами; GLB mesh; калибровка; reference upload/link; space | Автоматическое извлечение стен, FBX/OBJ/splat как размерная модель |
| F3 design | Детерминированный 3D/план, стили/предметы, история, constrained Gemini adapter + защищённые jobs; design | Фотореалистичные AI-изображения, walkthrough/video, инженерный проект |
| F4 procurement | Ручные товарные снимки/URL, упаковки, сметы, замены, stale и этапы; procurement | Гарантированный автоматический каталог/цены, retailer cart/checkout |
| F5 billing | Пакет credits + entitlement экспорта, ЮKassa adapter, защищённый webhook, по умолчанию off; billing | Подписка, автоматические refunds, store affiliate |
| F6 sharing | Скачать before/after с watermark; приватная отзывная ссылка без исходных обмеров; sharing | Индексируемая UGC-галерея, comments/совместное редактирование, партнёрские выплаты |

## Functional Requirements

### FR-foundation-1
Decision: ADR-001 — границы этой способности и обязательные guards.
Регистрация email/password, вход, выход и серверные отзываемые сессии; адаптировать N6 AuthService без `@n6/rag` и партнёрских зависимостей. Пароль 12–72 символа и не более72 UTF-8 байт (bcrypt иначе обрезает хвост); одинаковая явная валидация при register/login, email ≤254; bcrypt cost 10 минимум, токен ≥32 случайных байт, в БД только HMAC/hash. Cookie HttpOnly/SameSite=Lax, Secure при HTTPS; TTL 7 суток (проектное решение). Ошибки входа не раскрывают существование email; session lookup проверяет expiry/revoked/account active.
US-001: Как владелец, хочу возвращаться к своим проектам с защищённой сессией.
- [SC-US-001-1] Given новый адрес; When зарегистрировался, вышел и вошёл; Then кабинет доступен только новой действующей сессии.
- [SC-US-001-2] Given неверный пароль/истёкшая или отозванная сессия; When вход/чтение; Then общий 401, приватные данные отсутствуют.

- [SC-US-001-3] Given 72/73 UTF-8 bytes и multibyte пароль; When register/login; Then 72 допустим при ≥12 символах,73 отклоняется явно до bcrypt, suffix не становится эквивалентным паролем.

### FR-foundation-2
Создать/переименовать/архивировать проект, выбрать регион, открыть список и продолжить текущий шаг. Во всех проектах/дочерних сущностях проверяется owner account. Архивация делает проект read-only, отключает sharing и новые jobs; физическое удаление/аккаунт-erasure отдельно от MVP. Список курсорный ≤50.
US-002: Как владелец, хочу отдельные сохраняемые проекты и историю.
- [SC-US-002-1] Given два проекта; When изменён и перезагружен один; Then второй не изменён, состояние первого восстановлено.
- [SC-US-002-2] Given другой аккаунт/архив; When чужой ID либо мутация архива; Then 404 либо 409 PROJECT_ARCHIVED соответственно, данные не изменены.

### FR-space-1
Decision: ADR-002 — границы этой способности и обязательные guards.
Ручной план задаёт длину/ширину/высоту в метрах и прямоугольные дверные/оконные проёмы с wallId/offset/width/height/sill. Размеры конечные: стороны 0.5–50 м, высота 1.5–10 м; проёмы внутри стены и не перекрываются. После подтверждения создаётся immutable ShellRevision; её изменяют только новой ревизией. GLB калибруется двумя выбранными точками и фактической длиной отрезка; дополнительные контрольные отрезки и пользовательский допуск записываются. Без масштаба/подтверждения оболочки нельзя согласовать проверенный вариант. Это проверка введённой основы, не гарантия физической точности scan.
US-003: Как владелец, хочу увидеть и подтвердить реальные размеры до выбора дизайна.
- [SC-US-003-1] Given 4.5×4×2.7 м и допустимые проёмы; When подтвердил; Then площадь пола 18 м², стабильный shell hash, видны план и 3D.
- [SC-US-003-2] Given ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб; When согласование; Then 422 либо 409 CALIBRATION_REQUIRED, проверенного статуса нет.

### FR-space-2
Decision: ADR-009 — границы этой способности и обязательные guards.
Приватная загрузка изображений JPG/PNG/WebP ≤10 MiB и GLB v2 mesh ≤25 MiB. Проверять magic bytes, размеры, фактические байты; картинки ≤20 MP с удалением EXIF; GLB только embedded ресурсы, без remote/data URI, animation/skin/неразрешённых extension, ≤250k triangles/1000 nodes, decode/validation deadline 10 s. Исходник хранится отдельно от нормализованной копии. Splat/FBX/OBJ/PDF в этом MVP отклоняются с предложением ручного плана; только загрузка GLB не создаёт измеренную комнату. Произвольные mesh не превращаются автоматически в стены; исходная геометрия сохраняется целиком.
US-004: Как владелец, хочу добавить исходники, сохранив приватность и понятные ограничения.
- [SC-US-004-1] Given безопасный GLB или reference image; When upload; Then исходный hash сохранён, asset доступен только owner, normalized image/thumbnail декодирован и перекодирован без EXIF, fixed MIME/nosniff, external resources не загружались.
- [SC-US-004-2] Given oversized/повреждённый/remote-URI GLB либо изображение-bomb; When upload; Then 413/415/422, нет опубликованного asset и сетевых запросов к вложенным URL.
- [SC-US-004-3] Given чужой assetId; When скачать/использовать в проекте; Then 404 даже при известном storage key.

### FR-space-3
Референс содержит user-uploaded image либо HTTPS-ссылку без credentials, note ≤2000 символов и tags color/material/form. Сервер не скачивает произвольную ссылку; сохраняет её для открытия пользователем. Pinterest API необязателен и в MVP отключён: ссылка + upload работают без OAuth. Текст/имена всегда экранируются; пользователь подтверждает право использовать изображение, отдельного согласия на публикацию это не даёт.
US-005: Как владелец, хочу объяснить, какие детали нравятся.
- [SC-US-005-1] Given reference; When выбраны tags/note и повторное открытие; Then данные сохранены вместе с source/дата.
- [SC-US-005-2] Given недоступный Pinterest; When добавлена ссылка; Then предлагается upload, нет обещания импортированной доски или автоматического доступа.
- [SC-US-005-3] Given заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/`; When сохранена/переоткрыта; Then исходная ссылка сохранена и доступна, не заменена общим Pinterest URL.

### FR-design-1
Decision: ADR-003 — границы этой способности и обязательные guards.
Один Babylon.js viewer отображает ручную оболочку или immutable GLB, материалы и разрешённые object primitives с известными габаритами. Вариант хранит shellId/hash, materials, objects, references и style; никакого исполняемого AI-кода/новых shell meshes. Пресеты и ручная расстановка доступны без AI. До/после используют одну камеру; план, 3D и список размеров доступны явно. Проверка invariants запрещает любые трансформации оболочки. BBox fit для ручной прямоугольной комнаты проверяет габариты/пересечения и проёмы; для GLB без семантической оболочки fit=unconfirmed. UI различает «геометрия основы неизменна» и физическую точность/эргономику.
US-006: Как владелец, хочу сравнить оформления собственной комнаты.
- [SC-US-006-1] Given калиброванная основа; When меняю стиль/мебель/ракурс и до/после; Then shell hash/размеры/проёмы неизменны, выбор сохранён.
- [SC-US-006-2] Given предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox; When сохранить; Then 422 SCENE_INVALID, предыдущий вариант цел.

### FR-design-2
DesignRevision — immutable содержимое с parentId; статусы draft/approved/superseded. Согласование привязано к текущим shellId и project version. Изменение размеров создаёт новую основу, снимает актуальность согласования/fit, сохраняет старые версии и помечает dependent бюджет stale. Возврат к прежнему виду создаёт новую revision, не переписывает историю. Для GLB общая площадь материалов вводится отдельно; bbox не выдаётся за площадь пола.
US-007: Как владелец, хочу менять решение и видеть последствия.
- [SC-US-007-1] Given согласованный вариант; When поменял размер/стиль; Then новая revision, старый результат доступен, quantities пересчитываются по новой подтверждённой площади либо остаются unknown.
- [SC-US-007-2] Given два одновременных редактирования; When одинаковый expectedVersion; Then один commit, второй 409 VERSION_CONFLICT без потери данных.
- [SC-US-007-3] Given approved design; When изменён стиль или выбран другой исторический вариант; Then создана новая draft revision, approval снят, история сохранена, покупки показывают предупреждение до повторного согласования.

### FR-design-3
Decision: ADR-004 — границы этой способности и обязательные guards.
Реальный OpenRouter text/structured scene adapter существует за `SceneProposalProvider`. Режим manual по умолчанию; demo исключительно явно подписанный локальный fixture; live требует ключа, allowlisted model ID, актуальной rate ceiling, max tokens, per-job/account-day/global-day spend caps и разрешения оператора. Неполный/неизвестный config — startup failure. Весь сериализованный text request ≤32 KiB UTF-8, max_tokens 1–4096, response ≤256 KiB, timeout 30s; caps положительные safe-integer microUSD. Изображения/сами планы внешнему AI в MVP не отправляются; только согласованный пользователем текст размеров/notes и каталог, фиксированный preview отправляемых полей. Ответ проходит строгую JSON Schema и semantic scene validator. Разрешён только declarative JSON; tools при реализации только read-only allowlist каталога с общим лимитом 0 по умолчанию (без них MVP полон). Live-test сейчас не разрешён.
US-008: Как владелец, хочу опциональную AI-подсказку с ясными ограничениями.
- [SC-US-008-1] Given manual/off; When пользователь ищет AI; Then видна надпись «Ручной режим · AI не подключён», пресеты сохраняются и network spy показывает0 внешних AI-вызовов.
- [SC-US-008-2] Given enabled без caps/key или тестовый вредоносный ответ; When startup/validation; Then отказ startup либо job failed, shell не меняется.
- [SC-US-008-3] Given два worker и один job/лимит; When параллельный claim/dispatch; Then один dispatch, caps атомарны, старый fence не завершает job повторно.
- [SC-US-008-4] Given запрос уже dispatched; When timeout/crash; Then job uncertain, cost/usage неизвестны и reservation сохранена, автоматического платного redispatch нет.
- [SC-US-008-5] Given offline HTTP provider fixture с валидным JSON и подтверждённой стоимостью; When job завершён; Then одна draft revision текущего shell, один held credit consumed, обе reservations reconciled по фактическому cost, live network не вызывалась.
- [SC-US-008-6] Given поздний replay либо archive/refund/manual edit; When retry/mark-dispatch/completion; Then replay возвращает прежний job по тому же inputHash, archive до mark запрещает dispatch, поздний результат не заменяет новую ручную работу, consent body неизменен.

### FR-procurement-1
Decision: ADR-005 — границы этой способности и обязательные guards.
Привязать каждый design element (выбранную поверхность/предмет) к реальному товару по официальному URL либо оставить unmatched; отсутствие строки не исключает элемент из расчёта неизвестного. «Оставить имеющееся» допустимо только явным выбором retained с пояснением, видимым в смете. ProductSnapshot включает retailer/seller, article/name, region/store, observedAt, source=manual|api|scraper|demo, sourceURL, priceMinor|null, saleUnit, coverage, stock=in_stock|out_of_stock|unknown, freshness=fresh|stale|unknown|blocked. Manual fresh означает «пользователь подтвердил дату/регион/данные», не независимую проверку. Без даты/региона freshness=unknown. Freshness не обещает доступность. API/scraper adapter может честно вернуть blocked; автоматическая добыча цены исключена из обязательного MVP.
US-009: Как владелец, хочу конкретные места покупки с понятной актуальностью.
- [SC-US-009-1] Given официальная ссылка и ручной снимок; When сохранён; Then все provenance-поля видны и подставляются в shopping line.
- [SC-US-009-2] Given retailer 401/нет цены; When запрос обновления; Then blocked/unknown, нуля или текущей цены не появляется, предлагается ручное подтверждение.
- [SC-US-009-3] Given fresh снимок; When сменён регион/магазин либо прошло 24h; Then effective freshness stale, подтверждённый статус снят до нового снимка.

### FR-procurement-2
Decision: ADR-006 — границы этой способности и обязательные guards.
Расчёты decimal/integer, без float-money. Базовая потребность × (1+запас) → ceil до упаковки; штучные товары округляются вверх. SaleUnit и baseUnit проверяются на совместимость, неизвестный coverage не угадывается. BudgetRevision хранит immutable снимок входов/вычислений; материалы, работы, доставка/подъём, оценки неизвестного и денежный резерв раздельны. Значение null не равно 0. `knownSubtotal`, `scenarioTotal`, `unresolvedCount`, `complete` различны; неполный состав не называется финальной ценой ремонта. Reservation не включает скрытый процент.
US-010: Как владелец, хочу видеть, из чего складывается сумма.
- [SC-US-010-1] Given площадь 18, запас 8%, упаковка 1.99, цена 160000 копеек; When calculate; Then 10 упаковок, 1600000 копеек, видимая формула.
- [SC-US-010-2] Given unmatched/unselected товар даже при известных работах/доставке либо null coverage; When calculate; Then incomplete с видимыми unknown rows, неизвестное не теряется.
- [SC-US-010-5] Given отрицательный/overflow input, несовместимые единицы либо floor_area для стены; When calculate; Then 422, предыдущая смета неизменна.
- [SC-US-010-6] Given floor и wall material; When derive quantity; Then floor4.5×4=18 м², wall площадь равна длине стены×высоте минус её проёмы; GLB area unknown до явного user-confirmed surface quantity.
- [SC-US-010-7] Given сохранённая смета и изменённые текущие shopping rows; When воспроизвожу старый snapshot без текущих rows; Then совпадают totals, phases, unresolved/complete, reserve и delta по стабильным element/cost IDs.
- [SC-US-010-3] Given изменённые quantity/price/reserve и бюджетный лимит; When calculate; Then новая версия, точный delta, known/scenario отдельно; incomplete не получает «уложились».
- [SC-US-010-4] Given цена 1600 ₽ целым вводом и ранний лимит; When введены/изменены значения; Then native input допускает submit, minor=160000, текущий лимит отображается и немедленно влияет на сравнение.

### FR-procurement-3
Замена out-of-stock позиции требует принятия пользователя и новой design revision при изменении вида/габаритов; fit проверяется заново. Позиции могут иметь phase=preparation|finishing|furnishing, перенос не меняет общий бюджет. Изменение цены/товара/региона/основы помечает существующий budget outdated, новый расчёт и согласование явны. Бюджет привязан к design revision, но ручная работа над черновиком возможна с draft label.
US-011: Как владелец, хочу пересматривать план без утраты решений.
- [SC-US-011-1] Given нет товара; When выбрал замену; Then видно отличие/новые габариты, новая версия и повторное согласование.
- [SC-US-011-2] Given позиции двух этапов; When перенос строки; Then суммы этапов меняются, общая сумма неизменна.
- [SC-US-011-3] Given старая смета; When возвращаюсь к дизайну и пересчитываю; Then сохранены обе версии и причина изменения, old approval не переиспользован.
- [SC-US-011-4] Given неподтверждённая либо не помещающаяся замена; When replace; Then 409/422 с причиной, указатели/история не изменены.

### FR-billing-1
Платёжная способность: серверный пакет `{sku,priceMinor,currency:RUB,credits,unwatermarkedExport}`; стоимость/credits только из доверенного config, без цены клиента. PaymentProvider адаптирован из N6/N4. default mode=off: checkout 503 PAYMENTS_DISABLED, UI говорит «оплата не настроена». live требует merchant key/shopId/testMode, HTTPS origin и явного SKU config; missing config блокирует старт. Fake доступен только unit/integration через injection при NODE_ENV=test, никогда как normal app payment mode. Создание intent идемпотентно; returnURL не выдаёт credits.
US-012: Как владелец, хочу понимать доступность и состав платного пакета.
- [SC-US-012-1] Given off/неполный live config; When checkout/start; Then отключён checkout/отказ startup, денег и entitlement нет.
- [SC-US-012-2] Given тестовый provider и одинаковый ключ; When два checkout; Then один order/remote id; клиент не меняет цену/credits.

### FR-billing-2
Decision: ADR-007 — границы этой способности и обязательные guards.
Webhook — сигнал для повторного запроса к ЮKassa, а не доказательство платежа. Проверять IP через доверенную proxy-chain, provider status, paid, merchant, test mode, currency, amount и metadata.orderId. Один succeeded intent даёт credits и export entitlement однократно в транзакции с event ledger; ошибки провайдера не занимают event key. Частичный/полный refund сигнал не игнорируется: фиксируется, аккаунт блокируется для новых live jobs, paid export отзывается до ручной сверки; автоматический refund API вне scope. Платёжную историю владелец видит в кабинете.
US-013: Как владелец, хочу корректный учёт оплаченного пакета.
- [SC-US-013-1] Given verified succeeded; When webhook replay/concurrent delivery; Then одно начисление и один ledger outcome.
- [SC-US-013-2] Given чужой merchant/amount/test mode/payment linkage; When webhook; Then 400, credits/ledger неизменны.
- [SC-US-013-4] Given verification timeout; When та же delivery повторена с подтверждённым provider response; Then первый503 не занимает event key, повтор начисляет пакет ровно один раз.
- [SC-US-013-3] Given refund.succeeded; When verified event; Then новые live jobs запрещены и export entitlement отозван, audit/history доступны.

### FR-sharing-1
Decision: ADR-008 — границы этой способности и обязательные guards.
На первом варианте видны owner-initiated «Скачать до/после» и «Поделиться». Скачать PNG с одинаковой камерой/видимым названием типа результата; watermark N8 для бесплатного/manual, снятие только по verified entitlement. Private share link — случайный token≥32 bytes, в БД hash, истекает через 7 суток, отзыв owner; только замороженный подготовленный before/after image + выбранная подпись, без адреса, plan/GLB, размеров, refs и бюджета. Пользователь видит preview и подтверждает права. Noindex, no public listing, no автопубликации/отправки. Гость получает только image/подпись и ссылку начать свой проект, не исходные IDs.
US-014: Как владелец, хочу обсудить образ и контролировать раскрытие.
- [SC-US-014-1] Given первый вариант; When export/share preview; Then обе кнопки рядом, watermark соответствует entitlement, исходные приватные данные не включены.
- [SC-US-014-2] Given активная ссылка; When owner отзывает/архивирует проект или TTL истёк; Then последующий view/image 404, cache no-store; ранее скачанные копии не обещано удалить.
- [SC-US-014-3] Given чужой аккаунт/неподтверждённые права; When создание link; Then отказ без публикации.

### FR-sharing-2
Без внешней аналитики записывать минимальные first_design_viewed/export_created/share_created/share_viewed/new_project_from_share, requestId, timestamp и псевдонимные project/account IDs где допустимо. ExportCreated не называется фактическим внешним шерингом. Пользовательский feedback в приложении не имитируется отсутствующим событием; counts считаются только из записанных событий.
US-015: Как владелец продукта, хочу понимать использование, не выдумывая growth.
- [SC-US-015-1] Given повторный event key; When повторная запись; Then один event, нет исходных фото/текста/токенов в log.
- [SC-US-015-2] Given нет событий; When локальная readonly метрика; Then наблюдаемое0 либо unknown при отказе хранилища, не прогноз конверсии.
- [SC-US-015-3] Given первое allowlisted событие; When записано; Then count1 в явном 30-day reporting window; share_created не означает external sharing.

### FR-procurement-4
Owner-only экспорт выбранной BudgetRevision/shopping list в CSV: stable element IDs, названия/ссылки/источник/region/store/date, unit/quantity/packs/price/amount, freshness/unknown/retained/phase и раздельные work/delivery/reserve. Исторический snapshot не называется текущей ценой. Только owner; CSV formula injection нейтрализуется, text/csv attachment nosniff/no-store. В публичный image share экспорт сметы не входит (ADR-006, ADR-008; CJM-12).
US-025: Как владелец, хочу забрать список покупок для ремонта.
- [SC-US-025-1] Given выбранная смета с known/unknown/retained rows; When download CSV; Then rows/provenance/phase/units/totals совпадают с immutable snapshot, unknown пустое/подписанное, dangerous formula text inert; другой owner получает404.

## Non-Functional Requirements

### NFR-security-1
Owner check в каждом repository-read/write и file route; неизвестный и чужой ID одинаковы 404. Same-origin + CSRF на cookie mutations, включая auth; webhook исключён из CSRF и имеет собственную verification. JSON≤256 KiB, upload bounded до decode, URLs не fetch; secrets только env server-side, redact logs. Rate limit атомарный Postgres: auth 10/min/IP, mutation 60/min/account, share-read 60/min/IP (проектные начальные лимиты). Security headers/CSP запрещают inline executable user content. IP заголовкам доверять только настроенному внутреннему proxy.
US-016: Как владелец, хочу безопасную cookie mutation через единый session/Origin guard.
- [SC-US-016-1] Given cross-origin/request без CSRF либо чужой ID; When mutation/read; Then 403/404, side effect отсутствует.
- [SC-US-016-2] Given 59 mutation attempts в минуте; When 20 одновременных requests одного actor; Then ровно1 проходит и19 получают429/Retry-After; счёт включает отклонённые/невалидные попытки.
- [SC-US-016-3] Given valid owned bounded mutation и точный Origin; When active session обращается ниже лимита; Then одна успешная mutation с сохранённым результатом.
US-019: Как владелец, хочу изоляцию project/file/relation чтения и записи.
- [SC-US-019-1] Given A и B; When A использует B ID в URL/scalar/array/JSON relation; Then 404 без private bytes/side effect, разрешённое owned чтение успешно.
US-020: Как оператор, хочу bounded transport/input gate отдельно от бизнес-логики.
- [SC-US-020-1] Given malformed/oversized/slow body; When повтор обращений; Then rate counted до parse, typed400/413/timeout до decode, DB connection не удерживается на body read.
- [SC-US-020-2] Given SQL/HTML/script/URL-userinfo input; When accepted text or rejected URL обрабатывается; Then SQL параметризован, markup escaped, shell/network execution отсутствует.
US-021: Как оператор, хочу redacted журнал отказов по requestId.
- [SC-US-021-1] Given secret-bearing failure; When exception обработан; Then журнал содержит только code/requestId/latency/hashed IDs, без password/token/plan/payload.

### NFR-integrity-1
Все write commands с `expectedVersion` и owner binding; долгий I/O вне DB transaction; conditional CAS/fence на завершение. Numeric sizes в decimal strings до вычисления, money safe integer minor ≤10^12 на строку, totals≤10^14, проценты 0–100, quantities≤10^8. Переполнение/неfinite/неподдерживаемые единицы отклоняются, не saturate. Revision content hash и IDs неизменяемы; link на новую сущность того же проекта проверяется FK/transaction.

### NFR-cost-1
Спенд в integer microUSD, отдельно от RUB/credits. Дополнительные жёсткие начальные ceilings: **5 live admissions на аккаунт / 20 глобально за UTC-сутки**, по всем попыткам, включая failed/uncertain (и консервативно неотправленные admitted jobs); анонимный live admission запрещён. Это проектные защитные максимумы, не разрешение тратить. Денежные caps не имеют live-default: оператор задаёт положительные job≤account-day≤global-day в отдельном разрешённом config, отсутствие любого отказывает при включении. Атомарно резервировать per-job ceiling в account-day и global-day; UTC-day фиксируется при admission, reservation переживает полночь/timeout. `requestDispatchedAt` записывается до запроса; после uncertain исхода no automatic redispatch и funds не освобождаются до ручной reconcile. Суточный reset не снимает unresolved exposure: outstanding reservations учитываются независимо от дня. Выход usage неизвестен → null, не 0. Владелец видит собственные admissions/reserved/known/unknown в `/dashboard/usage` и `/api/me`; оператор — глобальный SpendBudget через локальную readonly query. Caps ограничивают admission, не доказывают фактический биллинг провайдера; live включает отдельный provider-key hard limit после проверки его конфигурации оператором.

### NFR-operations-1
Decision: ADR-010 — границы этой способности и обязательные guards.
Изолированный compose: web+worker+Postgres, DB только expose; web bind `127.0.0.1:${N8_HTTP_PORT:-3088}` после обязательного check-port-conflicts. Никакого внешнего домена/деплоя. `/health/live` без данных, `/health/ready` проверяет DB/schema/storage и config, не вызывает платные API. Startup/worker failures fail closed. Миграции versioned, rollback тестируется на ephemeral DB; не откатывать данные без backup.
US-017: Как оператор, хочу воспроизводимую безопасную локальную поставку.
- [SC-US-017-1] Given fresh isolated env; When migrate/build/start; Then health ready, DB не имеет published ports, project data переживают restart.
- [SC-US-017-2] Given incompatible config/schema/storage; When ready/start; Then non-ready/отказ startup с redacted причиной, live inference/payment не вызываются.

### NFR-quality-1
390px и desktop: видимый фокус, подписи, текст ошибок, keyboard navigation, отсутствие горизонтальной прокрутки ключевых действий. Видны manual/demo/live labels, missing/blocked/stale, история и progress; disabled кнопка имеет причину. Viewer failure оставляет план/размеры/список доступными. Не заявлять WCAG certification без аудита.
US-018: Как пользователь, хочу keyboard-навигацию по панели и формам проекта на390px.
- [SC-US-018-1] Given 390px и desktop; When keyboard выбирает steps и submit формы; Then виден focus, controls имеют labels, ошибки текстовые, document.scrollWidth≤innerWidth; canonical actions: create/open project, save/confirm plan, add reference, save/approve design, add/replace product, calculate budget, export/share/revoke.
US-022: Как пользователь, хочу usable план при недоступном WebGL.
- [SC-US-022-1] Given WebGL initialization failed; When открываю viewer; Then видны2D план/размеры и список объектов, можно сохранить вариант, нет сообщения об успешной3D загрузке.
US-023: Как пользователь, хочу восстановление ввода основных трёх форм.
- [SC-US-023-1] Given plan/reference/budget saved; When reload либо field validation fails; Then сохранённые значения восстановлены, незавершённый ввод остаётся при typed field error, новые ошибки получают focus/text.

### NFR-performance-1
Начальные guardrails (предложение команды, не benchmark): ≤20 проектов/account, ≤20 refs/project, ≤200 design objects/revision, ≤200 shopping lines/budget, ≤100 revisions/project. Списки ≤50/page. Цель обычного API p95≤500ms при 10 параллельных локальных клиентах на согласованном fixture; исключены bcrypt, upload/3D parse и provider. Цель пересчёта 200 строк ≤100ms в unit benchmark; фиксировать железо/данные и фактический результат, при превышении исправлять или явно пересматривать NFR. «25 секунд» не SLA.
US-024: Как оператор, хочу воспроизводимую оценку обычного API и расчёта200 строк.
- [SC-US-024-1] Given exact build/fixture/host; When 10 clients каждый выполняет20 warm-up+100 measured GET owned project/list requests; Then nearest-rank p95≤500ms для1000 ответов, status/body проверены, ошибки/timeouts не удаляются и валят проверку.
- [SC-US-024-2] Given immutable200-line fixture с Decimal/unknown/services/delivery/reserve; When 50 warm-up+1000 measured calculations; Then nearest-rank p95≤100ms и1000 canonical result hashes равны golden; exception/missing sample валит проверку.

## Requirement ownership / acceptance

| Feature | Machine keys | Обязательные suites |
|---|---|---|
| F1 | FR-foundation-1/2, NFR-security-1 | auth, ownership, CSRF/rate |
| F2 | FR-space-1/2/3 | space-calibration, asset-boundaries, references |
| F3 | FR-design-1/2/3, NFR-integrity-1, NFR-cost-1 | scene-invariants, revision-concurrency, job-budget |
| F4 | FR-procurement-1/2/3/4 | snapshots, budget-decimal, substitutions, owner-csv-export |
| F5 | FR-billing-1/2 | payment-config, checkout-idempotency, webhook-replay-rollback |
| F6 | FR-sharing-1/2, NFR-quality-1 | share-privacy, export-entitlement, browser-journey |
| Integrate | NFR-operations-1, NFR-performance-1 | compose-smoke, migration-recovery, bounded-load |

Все 22 точных machine keys объявлены только headings выше; таблица использует сокращения, не новые декларации. При реализации каждую SC строку связать с test/evidence и ревизией. До завершения каждой фичи — независимый двусторонний anti-drift; scope/spec corrections разрешены, но каждый before/after и повтор затронутых checks записываются.

## Validation amendments — concrete invariants, 2026-10-13

- Uploads: only ordinary kind reference/room_photo/glb; share_image is server export-only. One parser slot in the single web instance; busy→503. Body deadline10s and decode deadline10s; memory limit512MiB. GLB allowlist only uncompressed triangle mesh plus KHR_materials_unlit, embedded images total≤20MP, accessor components≤8million, vertices≤750k. Retained assets≤64/project,≤200MiB/project,≤1GiB/account including reservations; normalized output≤20MiB; free storage≥512MiB before upload. Reserve before streaming under Account→Project locks, release on failure; stale pending cleanup after15min.
- Export provenance: Asset immutable server-owned designId/hash, normalized key/hash, watermark decision/schemaVersion. Raw upload cannot choose share_image or provenance. Only matching exported design can share. Application-generated frame/DTO/metadata omit private fields; reencoding cannot remove sensitive text in owner-supplied pixels, so preview/rights consent applies to pixels. Refund revokes existing unwatermarked links and access to unwatermarked derivatives; regenerate watermarked export. Downloaded copies cannot be recalled.
- Every Job stores exact bounded serialized outbound request, consentHash, originProjectVersion/currentDesignId and expiry created+120s. Idempotency lookup precedes mutable admission checks. Mark-dispatched transaction is the authorization linearization point; archive/refund before it prevents call, after it means in-flight only. Completion appends detached draft if newer same-shell work exists; it never overwrites newer pointers; archive suppresses application. Refund also blocks admitted-but-undispatched jobs.
- Refund verification fetches refund ID, succeeded/RUB/0<amount≤original payment, then refund.payment_id-linked payment and immutable order/merchant/test/amount/metadata. Partial refund does not have to equal full payment. Unknown outcomes retain holds; local audited reconciliation requires explicit evidence + expected state/fence + cost and terminal result, no public endpoint/redispatch.
- Reserve base is known_subtotal or scenario_subtotal computed server-side; client cannot send arbitrary reserveBaseMinor. Cost rows include explicit excluded+reason for self-performed/out-of-scope work, no empty arrays masquerading as free work/delivery. Quantity source floor_area/wall_area/surface_area/manual has exact element/unit binding and user-confirmed provenance where entered.
- Camera pose in this MVP is transient; persisted choices are style/materials/objects/references. Before/after export uses one current camera. References enforce exactly one image or URL source. Snapshot creation is independent of element; binding occurs only through owned line command.
- Custom Node server is the only HTTP entrypoint; it overwrites/removes reserved peer/forwarded headers from socket.remoteAddress, normalizes mapped IPv6, missing peer fails closed. No next-start/standalone bypass; local loopback/gateway is never trusted as provider. Rate gate runs before body parsing; quota gate after validation. Runtime role cannot create schema/tables.

## Growth seed disposition

| ID | Реализация / причина |
|---|---|
| FR-GROWTH-101 | FR-sharing-1: owner preview и добровольная private image link, без auto send |
| FR-GROWTH-102 | rejected: preference voting/comments вне первой homeowner поставки; гость обсуждает изображение вне приложения |
| FR-GROWTH-103 | FR-sharing-1: только выбранные image+caption, revoke/no-store; budget/notes/measurements excluded by default and not exposed |
| FR-GROWTH-104 | FR-sharing-2: CTA начать свой project, без чужих исходников/bonus |
| FR-GROWTH-105 | rejected: партнёрства с магазинами явно отложены владельцем, core procurement работает без комиссии |

Исходные prompt obligations остаются отдельными: FR-GROWTH-001 export/share affordances; FR-GROWTH-003 verified paid watermark capability; FR-GROWTH-004 rejected: affiliate блогеры deferred до проверки homeowner core; FR-GROWTH-005 rejected: публичная SEO-gallery deferred из-за moderation/rights/indexability scope. Новые101–105 не переопределяют старые001–005.
