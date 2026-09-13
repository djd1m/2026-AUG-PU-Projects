# Фича `share-card-and-growth-events` — псевдокод

Уточняет и реализует проектный `docs/Pseudocode.md` → `BuildShareCard` (строки 215–231). Имена
полей и статусов — из `docs/canon.md`; ничего не переизобретается.

## Data Structures

### Изменения полей существующих сущностей

Ни одна колонка не добавляется к `share_card` кроме ограничения уникальности (см. `03_architecture.md`
§«Изменения схемы»). `growth_event` не меняется — оба нужных типа (`share_click`, `card_view`) уже в
закрытом перечислении из пяти значений.

### Типы уровня кода (не таблицы)

`ShareCardRenderInput` — ЗАКРЫТОЕ множество из восьми полей, единственный вход рендера. Это САМ
контракт FR-share-card-and-growth-events-11, а не документация к нему:

```
ShareCardRenderInput = {
  dishName:      string,   // ≤ 60 симв. после sanitizeForCardText
  kcal:          Kcal,
  proteinG:      Macro,
  fatG:          Macro,
  carbG:         Macro,
  sourceLabel:   string,   // ≤ 80 симв., формат FR-SOURCE-002
  badgeRendered: boolean,
  photoUrl:      string,   // presigned GET к ОРИГИНАЛУ фото владельца (не к карточке — карточка ещё не существует)
}
```

Полей `weightKg`, `goalKcal`, `dailyTotalKcal`, `streakDays` в этом типе НЕТ и не может появиться без
правки строки стража (`GuardShareCardFieldSet`, ниже) — она красит любое отклонение множества в
любую сторону, не только добавление конкретного запрещённого имени.

`ConsentGateResult = 'granted' | 'refused'` — результат обращения к чужой границе
`EnforceConsentBeforeDiaryWrite` (owned by `consent-and-telegram-auth`); эта фича трактует её как
внешний порт с ДВУМЯ исходами, не заглядывая в её реализацию.

## Core Algorithms

### Algorithm: CreateShareCard

REQUIREMENT: `FR-share-card-and-growth-events-2`
REQUIREMENT: `FR-share-card-and-growth-events-4`
REQUIREMENT: `FR-share-card-and-growth-events-9`
REQUIREMENT: `NFR-share-card-and-growth-events-1`
REQUIREMENT: `NFR-share-card-and-growth-events-3`
REQUIREMENT: `AC-share-card-and-growth-events-2`
REQUIREMENT: `AC-share-card-and-growth-events-3`
REQUIREMENT: `AC-share-card-and-growth-events-6`
REQUIREMENT: `AC-share-card-and-growth-events-12`
REQUIREMENT: `AC-share-card-and-growth-events-17`
REQUIREMENT: `AC-share-card-and-growth-events-18`
REALISES: SC-US-007-1, AC-share-card-and-growth-events-2, AC-share-card-and-growth-events-3,
AC-share-card-and-growth-events-6, AC-share-card-and-growth-events-12,
AC-share-card-and-growth-events-17, AC-share-card-and-growth-events-18
INPUT: `owner_key` (из сессии вызывающего, НЕ из тела), `recognition_id` (из тела).
OUTPUT: `{ card_id, url }` (`201` — создана; `200` — уже существовала) либо
`refused(consent_required | not_owned | not_done)`.
STEPS:
1. `SELECT id, status, owner_key FROM recognition WHERE id = :recognition_id`. IF не найдено ИЛИ
   `owner_key` не совпадает с вызывающим THEN RETURN `404` (владение — как во ВСЕХ маршрутах канона:
   чужое и несуществующее неразличимы).
2. IF `recognition.status != 'done'` (включая `refused`) THEN RETURN `409` — делиться нечем
   (`BuildShareCard` шаг 2 root-документа).
3. `SELECT id FROM share_card WHERE recognition_id = :recognition_id`. IF найдено THEN RETURN `200
   { card_id: найденный id, url }` — идемпотентность, дальше не выполняется НИЧЕГО (в частности, шаг
   6 `share_click` пишется ВСЕ РАВНО — идемпотентно только СОЗДАНИЕ, не событие клика; см.
   `RecordShareClick` ниже, вызывается ОТДЕЛЬНО в обоих исходах).
4. НАЧАТЬ транзакцию. ПЕРВЫМ оператором: `SELECT consent_at FROM <account, если owner_key указывает
   на связанный аккаунт, ИНАЧЕ device_session> WHERE id = :owner_row_id FOR UPDATE` — блокировка ДО
   какого-либо решения; порядок операций и есть защита от гонки со `RevokeConsentOrErase`
   (`security-operation-order.md`, «Стык 2» в `01_specification.md`). Строка недоступна (владелец
   удалён параллельным `erase_all`) → ROLLBACK, RETURN `403 consent_required` — недоступность
   источника истины трактуется как отказ (`fail-closed-defaults.md`), а не как «пропустим проверку».
5. Вычислить `revoked_at_value = (consent_at IS NULL) ? now() : NULL`. Собрать
   `ShareCardRenderInput` через `BuildCardPayload` (ниже) и отрендерить файл ДО INSERT (рендер не
   зависит от `revoked_at`, но `object_key` нужен для строки).
6. `INSERT INTO share_card (recognition_id, owner_key, object_key, badge_rendered, revoked_at) VALUES
   (:recognition_id, :owner_key, :object_key, :badge_rendered, :revoked_at_value) ON CONFLICT
   (recognition_id) DO NOTHING RETURNING id`. `ON CONFLICT DO NOTHING` — вторая линия защиты ПРОТИВ
   гонки ДВУХ одновременных `CreateShareCard` на один `recognition_id` (шаг 3 читает вне транзакции и
   потому не исключает гонку сам по себе; конкурентный AC-17 проверяет именно это). IF `RETURNING`
   пуст (проиграли гонку) THEN `SELECT id FROM share_card WHERE recognition_id = :recognition_id`
   внутри ТОЙ ЖЕ транзакции и вернуть его — не создавать вторую строку и не терять уже отрендеренный
   файл впустую (он остаётся сиротой в бакете, уборка объектов без строки — эксплуатационная задача
   вне объёма этой фичи, названо в `05_completion.md`).
7. Зафиксировать транзакцию (снимает блокировку строки владельца).
8. IF `revoked_at_value IS NOT NULL` (согласие исчезло между шагом 1 верхнего уровня и шагом 4) THEN
   RETURN `403 consent_required` — карточка физически существует УЖЕ ЗАКРЫТОЙ (это НЕ дефект: строка
   нужна для будущей аналитики отказов, но клиенту как согласия не было, так и нет).
9. RETURN `201 { card_id, url: '/c/' + card_id }`.
COMPLEXITY: O(1), один индексный поиск плюс одна блокировка строки.

### Algorithm: BuildCardPayload

REQUIREMENT: `FR-share-card-and-growth-events-1`
REQUIREMENT: `AC-share-card-and-growth-events-1`
REQUIREMENT: `AC-share-card-and-growth-events-4`
REQUIREMENT: `AC-share-card-and-growth-events-5`
REQUIREMENT: `AC-share-card-and-growth-events-15`
REALISES: AC-share-card-and-growth-events-1, AC-share-card-and-growth-events-4,
AC-share-card-and-growth-events-5, AC-share-card-and-growth-events-13,
AC-share-card-and-growth-events-15
INPUT: `recognition` (со Snapshot из `source-and-correct`), `account.tier | NULL`.
OUTPUT: `ShareCardRenderInput` (ровно восемь полей).
STEPS:
1. Прочитать Snapshot скана: `dishName` (название верхнего/единственного `food_item`), `kcal_total`,
   `protein_total`, `fat_total`, `carb_total`, строку источника (имя базы + `source_id` + порция,
   формат FR-SOURCE-002). ЧИСЛА БЕРУТСЯ ИЗ SNAPSHOT, не из живой строки `food_item` (ADR-001,
   «переимпорт не меняет уже показанное число») и НЕ из `model_estimate_kcal` — второе чтение этого
   поля запрещено проектным правилом («ADR-001, путь показа», `04_refinement.md` этой фичи).
2. `dishName = sanitizeForCardText(dishName, 60)`; `sourceLabel = sanitizeForCardText(sourceLabel,
   80)` — см. `SanitizeForCardText` ниже.
3. `badgeRendered = (tier !== 'paid')` — `Fail-closed бейдж`, тот же расчёт, что шаг 4
   `BuildShareCard` root-документа.
4. `photoUrl` = presigned GET к `photo.object_key` ОРИГИНАЛА (не нормализованной копии для модели —
   зритель карточки должен видеть исходное фото, а не кадр 1568px для распознавания).
5. **Явная деструктуризация, НЕ спред.** RETURN `{ dishName, kcal: kcal_total, proteinG:
   protein_total, fatG: fat_total, carbG: carb_total, sourceLabel, badgeRendered, photoUrl }` —
   перечислены восемь имён буквально; вход функции МОЖЕТ содержать больше полей (например, если
   вызывающий код по ошибке передаст весь объект `diary_entry`), но результат — только эти восемь.
   Замена на `{ ...input }` — внедряемый дефект AC-share-card-and-growth-events-15.
COMPLEXITY: O(1).

### Algorithm: SanitizeForCardText

REQUIREMENT: `FR-share-card-and-growth-events-10`
REQUIREMENT: `AC-share-card-and-growth-events-13`
REALISES: AC-share-card-and-growth-events-13
INPUT: `value: string`, `maxLen: number`.
OUTPUT: строка, безопасная для ОБЕИХ поверхностей (SSR HTML и SVG-оверлей).
STEPS:
1. Удалить символы принудительного направления письма и форматирования Unicode: `U+202A`–`U+202E`
   (LRE/RLE/PDF/LRO/RLO), `U+2066`–`U+2069` (LRI/RLI/FSI/PDI), `U+061C` (ALM). Без этого шага строка
   визуально читается иначе, чем побайтово, ни один HTML/XML-экранировщик этого не ловит — это не
   разметка, а СИМВОЛЫ.
2. IF длина после шага 1 > `maxLen` THEN обрезать до `maxLen - 1` символов и добавить `…`.
3. RETURN результат БЕЗ HTML/XML-экранирования — это делает КАЖДЫЙ потребитель ОТДЕЛЬНО на своей
   поверхности (шаг 4-5), потому что правила экранирования HTML и XML/SVG пересекаются, но не тождественны
   бит-в-бит, и совмещать их в одной функции значит либо экранировать дважды, либо один раз неверно.
4. Потребитель SSR (`RenderPublicCardPage`): стандартное экранирование шаблонизатора React/Next —
   `&amp; &lt; &gt; &quot; &#39;`.
5. Потребитель растра (`RenderCardImage`): экранирование ТЕХ ЖЕ пяти символов внутри `<text>`
   SVG-узла ПЕРЕД передачей строки в `sharp().composite()`; `<`/`>` внутри текстового узла способны
   закрыть узел и открыть произвольный SVG-элемент (не «исполнение кода» — SVG-рендерер `sharp`
   выполняет разметку без скриптов, но НАРИСОВАТЬ фигуру поверх чисел он способен, и это тот же класс
   отказа «нарушение визуальной целостности вывода недоверенным текстом»).
COMPLEXITY: O(n) по длине строки.

### Algorithm: RenderCardImage

REQUIREMENT: `FR-share-card-and-growth-events-3`
REALISES: AC-share-card-and-growth-events-1, AC-share-card-and-growth-events-4,
AC-share-card-and-growth-events-5
INPUT: `ShareCardRenderInput`.
OUTPUT: буфер JPEG 1080×1920, объект положен в приватный бакет под НОВЫМ `object_key`
(`share-cards/<recognition_id>.jpg` — детерминированный ключ, повторный рендер того же скана
перезаписывает тот же объект, а не плодит мусор).
STEPS:
1. Загрузить `photoUrl` (шаг 4 `BuildCardPayload`), привести к области холста (`sharp`, `cover`-fit
   в верхние ~70% высоты).
2. Сгенерировать SVG-слой: название (экранированное шагом 5 `SanitizeForCardText`), четыре плитки
   чисел, строка источника, бейдж — В ВИДЕ единого SVG-документа с фиксированными координатами
   1080×1920 (те же числа, что `CHECK` в схеме `share_card`).
3. IF `badgeRendered` THEN нанести бейдж «распознано в Тарелке» высотой ≤ 153 px (1920 × 0,08,
   округление вниз) в углу, НЕ пересекающемся с прямоугольниками чисел (координаты плиток и бейджа
   не должны иметь общей области — проверяется геометрически в тесте, а не «на глаз»).
4. `sharp(фото).composite([{ input: svgBuffer }]).jpeg().toBuffer()`.
5. Загрузить результат в приватный бакет под `share-cards/<recognition_id>.jpg`; НИКАКОГО публичного
   пути к объекту не существует (ADR-010) — доступ только через presigned-URL, минтящийся в
   `RenderPublicCardPage`.
COMPLEXITY: O(1) на карточку, одна операция композиции (как в root-документе).

### Algorithm: GuardShareCardFieldSet (страж по исходнику)

REQUIREMENT: `FR-share-card-and-growth-events-11`
REQUIREMENT: `AC-share-card-and-growth-events-14`
REALISES: AC-share-card-and-growth-events-14
INPUT: исходный файл `packages/shared/src/domain/share-card.ts`.
OUTPUT: `pass | fail(лишние_поля, недостающие_поля)`.
STEPS:
1. Разобрать AST типа `ShareCardRenderInput`, собрать множество имён его полей.
2. Сравнить С РАВЕНСТВОМ множеств (не с подмножеством) с эталонным списком из восьми имён
   (`dishName, kcal, proteinG, fatG, carbG, sourceLabel, badgeRendered, photoUrl`).
3. Любое расхождение В ЛЮБУЮ СТОРОНУ (лишнее ИЛИ недостающее поле) → `fail`, вывод называет ИМЕНА
   расхождений. Проверяется именно МНОЖЕСТВО целиком, а не строка «нет поля weightKg» — иначе новое
   имя того же смысла (`dailyTotalKcal`) прошло бы незамеченным (тот же урок, что ADR-001, схема
   ответа модели).
COMPLEXITY: O(1), один разбор файла.

### Algorithm: RenderPublicCardPage

REQUIREMENT: `FR-share-card-and-growth-events-5`
REQUIREMENT: `FR-share-card-and-growth-events-6`
REQUIREMENT: `NFR-share-card-and-growth-events-2`
REQUIREMENT: `AC-share-card-and-growth-events-7`
REQUIREMENT: `AC-share-card-and-growth-events-8`
REQUIREMENT: `AC-share-card-and-growth-events-9`
REALISES: AC-share-card-and-growth-events-7, AC-share-card-and-growth-events-8,
AC-share-card-and-growth-events-9, AC-share-card-and-growth-events-10
INPUT: `card_id` из URL, БЕЗ cookie.
OUTPUT: SSR HTML `200` с OpenGraph-превью и `<img>`, либо `404`; на ОБОИХ исходах заголовок
`Cache-Control: no-store`.
STEPS:
1. `SELECT owner_key, object_key, revoked_at FROM share_card WHERE id = :card_id`. IF не найдено ИЛИ
   `revoked_at IS NOT NULL` THEN RETURN `404` без содержимого — устанавливается ТОТ ЖЕ заголовок
   `no-store`, что и на успехе (шаг 5), одним и тем же местом в коде, а не двумя разными путями,
   которые могли бы разойтись.
2. Минтить presigned GET-URL к `object_key`, TTL 15 минут (ADR-010, тот же срок, что у приватных фото
   владельца). Минтинг происходит СТРОГО ПОСЛЕ проверки шага 1 — для отозванной/неизвестной карточки
   адрес не существует вовсе, а не «выдан, но бакет тоже откажет»: два независимых источника отказа
   создали бы гонку между их собственным рассинхроном.
3. Разрешить `owner_key` до `device_session_id` владельца (для события шага 5) и до
   `partner_code_id` его атрибуции, если есть (чтение, не запись — атрибуцию ведёт
   `partner-codes-and-cabinet`).
4. Отрисовать SSR-страницу: `<meta property="og:image" content=presigned-url>`, `<img
   src=presigned-url>`, название и источник — ЭКРАНИРОВАННЫЕ шагом 4 `SanitizeForCardText` (значения
   УЖЕ прошли шаг при создании карточки; здесь ПОВТОРНОЕ HTML-экранирование при вставке в разметку —
   стандартная защита шаблонизатора, а не дублирование логики).
5. `RecordCardView(card_id, owner_device_session_id, owner_partner_code_id)` — АСИНХРОННО ПОСЛЕ
   решения отдать `200` (не блокирует ответ зрителю; сбой записи события не должен превращать
   успешный просмотр в ошибку зрителю — событие теряется, а не карточка).
6. RETURN `200` с заголовком `Cache-Control: no-store`, установленным ОДНОЙ строкой кода для веток 1
   и 6 (не двумя копиями).
COMPLEXITY: O(1), один индексный поиск по `id` (первичный ключ).

### Algorithm: RecordCardView / RecordShareClick

REQUIREMENT: `FR-share-card-and-growth-events-7`
REQUIREMENT: `FR-share-card-and-growth-events-8`
REQUIREMENT: `AC-share-card-and-growth-events-10`
REQUIREMENT: `AC-share-card-and-growth-events-11`
REALISES: AC-share-card-and-growth-events-10, AC-share-card-and-growth-events-11
INPUT: `share_card_id`, `device_session_id` (владельца — для `card_view`; вызывающего — для
`share_click`), `partner_code_id?`.
OUTPUT: одна строка `growth_event`.
STEPS:
1. `INSERT INTO growth_event (type, device_session_id, partner_code_id, share_card_id) VALUES
   (:type, :device_session_id, :partner_code_id, :share_card_id)`. Ни дедупликации, ни уникального
   ограничения НЕТ НАМЕРЕННО: метрика недели считает ФАКТ «есть ли хотя бы одно событие», а кабинет
   партнёра (другая фича) — количество отдельных событий как «число переходов»/«число шерингов»;
   схлопывание в одну строку исказило бы ИМЕННО этот счётчик.
2. `card_view` вызывается ТОЛЬКО из ветки `200` (шаг 5 `RenderPublicCardPage`); `share_click`
   вызывается из ОБОИХ исходов `CreateShareCard`, где карточка в итоге существует и доступна —
   `201` (только что создана) И `200` (уже существовала) — но НЕ из `403`/`404`/`409`.
COMPLEXITY: O(1), одна вставка.

### Algorithm: ApplyShareCardMigration

REQUIREMENT: `AC-share-card-and-growth-events-16`
REALISES: AC-share-card-and-growth-events-16
INPUT: каталог `packages/db/migrations/`.
OUTPUT: применённая или пропущенная (уже применена) миграция.
STEPS:
1. Добавить `ALTER TABLE share_card ADD CONSTRAINT share_card_recognition_id_unique UNIQUE
   (recognition_id);` следующим по номеру файлом (номер подтверждается сверкой с фактическим
   состоянием каталога при реализации, см. `03_architecture.md`).
2. Раннер применяет файл один раз, журналирует в `schema_migration`; повторный прогон применяет
   ноль файлов (тот же раннер, что уже существует, `foundation`).
3. Ограничение проверяется НА УРОВНЕ БАЗЫ прямым `INSERT` теста, а не только через код `api` —
   вторая независимая попытка вставки с тем же `recognition_id` обязана быть отбита самой базой.
COMPLEXITY: O(1).

## API Contracts (дополнение к каноническим маршрутам 5–6)

| # | Маршрут | Тело | Успех | Отказ |
|---|---|---|---|---|
| 5 | `POST /api/v1/share-cards` | `{ recognition_id }` | `201`/`200 { card_id, url }` | `401` нет сессии · `404` чужой/несуществующий скан · `409` не `done` · `403 consent_required` |
| 6 | `GET /c/{card_id}` | — | `200` HTML + `og:image` | `404` (удалена/отозвана/неизвестна — один ответ) |

## State Transitions

`share_card` не имеет статусной колонки — состояние наблюдается через `revoked_at`:

```
(строки нет) --CreateShareCard(consent=granted)--> revoked_at=NULL (открыта)
(строки нет) --CreateShareCard(consent=refused на шаге 4)--> revoked_at=created_at (рождена закрытой)
revoked_at=NULL --RevokeConsentOrErase (чужая фича)--> revoked_at=now()
revoked_at=<любое не NULL> --(нет пути назад)--> закрыта НАВСЕГДА
```

Закрытие необратимо: ни один алгоритм этой фичи не обнуляет `revoked_at`.

## Error Handling Strategy

| Условие | Ответ | Событие |
|---|---|---|
| Чужой/несуществующий `recognition_id` | `404` | нет |
| `recognition.status != done` | `409` | нет |
| Согласие отсутствует (граница чужой фичи отказала) | `403 consent_required` | нет |
| Владелец удалён параллельно (блокировка недоступна) | `403 consent_required` | нет |
| Карточка отозвана/неизвестна на GET | `404` | нет |
| Успешное создание/повтор создания | `201`/`200` | `share_click` (не `card_view`) |
| Успешный просмотр `/c/{card_id}` | `200` | `card_view` (не `share_click`) |

## Scenario Coverage

| Сценарий | Алгоритм | Слой |
|---|---|---|
| SC-US-007-1 | `CreateShareCard`, `RenderCardImage` | integration |
| SC-US-007-2 | `BuildCardPayload`, `GuardShareCardFieldSet` | unit + guard |
| `@FR-GROWTH-001 @security` | `RenderPublicCardPage` | integration |
| `@FR-GROWTH-007 @security` | `RecordCardView` | integration |
