# procurement — source-derived feature specification

Source Specification sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd
Parent validation: ../../validation-report.md (six independent lenses and concrete closures). Owner A/full implementation approved; no renewed checkpoint.

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


### FR-procurement-4
Owner-only экспорт выбранной BudgetRevision/shopping list в CSV: stable element IDs, названия/ссылки/источник/region/store/date, unit/quantity/packs/price/amount, freshness/unknown/retained/phase и раздельные work/delivery/reserve. Исторический snapshot не называется текущей ценой. Только owner; CSV formula injection нейтрализуется, text/csv attachment nosniff/no-store. В публичный image share экспорт сметы не входит (ADR-006, ADR-008; CJM-12).
US-025: Как владелец, хочу забрать список покупок для ремонта.
- [SC-US-025-1] Given выбранная смета с known/unknown/retained rows; When download CSV; Then rows/provenance/phase/units/totals совпадают с immutable snapshot, unknown пустое/подписанное, dangerous formula text inert; другой owner получает404.


### AC-procurement-1
Source criterion SC-US-009-1: Given официальная ссылка и ручной снимок; When сохранён; Then все provenance-поля видны и подставляются в shopping line.

### AC-procurement-2
Source criterion SC-US-009-2: Given retailer 401/нет цены; When запрос обновления; Then blocked/unknown, нуля или текущей цены не появляется, предлагается ручное подтверждение.

### AC-procurement-3
Source criterion SC-US-009-3: Given fresh снимок; When сменён регион/магазин либо прошло 24h; Then effective freshness stale, подтверждённый статус снят до нового снимка.

### AC-procurement-4
Source criterion SC-US-010-1: Given площадь 18, запас 8%, упаковка 1.99, цена 160000 копеек; When calculate; Then 10 упаковок, 1600000 копеек, видимая формула.

### AC-procurement-5
Source criterion SC-US-010-2: Given unmatched/unselected товар даже при известных работах/доставке либо null coverage; When calculate; Then incomplete с видимыми unknown rows, неизвестное не теряется.

### AC-procurement-6
Source criterion SC-US-010-5: Given отрицательный/overflow input, несовместимые единицы либо floor_area для стены; When calculate; Then 422, предыдущая смета неизменна.

### AC-procurement-7
Source criterion SC-US-010-6: Given floor и wall material; When derive quantity; Then floor4.5×4=18 м², wall площадь равна длине стены×высоте минус её проёмы; GLB area unknown до явного user-confirmed surface quantity.

### AC-procurement-8
Source criterion SC-US-010-7: Given сохранённая смета и изменённые текущие shopping rows; When воспроизвожу старый snapshot без текущих rows; Then совпадают totals, phases, unresolved/complete, reserve и delta по стабильным element/cost IDs.

### AC-procurement-9
Source criterion SC-US-010-3: Given изменённые quantity/price/reserve и бюджетный лимит; When calculate; Then новая версия, точный delta, known/scenario отдельно; incomplete не получает «уложились».

### AC-procurement-10
Source criterion SC-US-010-4: Given цена 1600 ₽ целым вводом и ранний лимит; When введены/изменены значения; Then native input допускает submit, minor=160000, текущий лимит отображается и немедленно влияет на сравнение.

### AC-procurement-11
Source criterion SC-US-011-1: Given нет товара; When выбрал замену; Then видно отличие/новые габариты, новая версия и повторное согласование.

### AC-procurement-12
Source criterion SC-US-011-2: Given позиции двух этапов; When перенос строки; Then суммы этапов меняются, общая сумма неизменна.

### AC-procurement-13
Source criterion SC-US-011-3: Given старая смета; When возвращаюсь к дизайну и пересчитываю; Then сохранены обе версии и причина изменения, old approval не переиспользован.

### AC-procurement-14
Source criterion SC-US-011-4: Given неподтверждённая либо не помещающаяся замена; When replace; Then 409/422 с причиной, указатели/история не изменены.

### AC-procurement-15
Source criterion SC-US-025-1: Given выбранная смета с known/unknown/retained rows; When download CSV; Then rows/provenance/phase/units/totals совпадают с immutable snapshot, unknown пустое/подписанное, dangerous formula text inert; другой owner получает404.

