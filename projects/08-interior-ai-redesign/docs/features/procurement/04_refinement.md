# procurement — adversarial checks

Read ../../Refinement.md requirement/scenario matrix and validation amendments; all relevant cases mandatory. Exact source criteria below, including negative/concurrency/state transitions, not coverage-by-title alone. Independent anti-drift after implementation+checks; fix code/spec by logged judgment. One review then concrete fixes/targeted closure, no optional polish.

- SC-US-009-1: Given официальная ссылка и ручной снимок; When сохранён; Then все provenance-поля видны и подставляются в shopping line.
- SC-US-009-2: Given retailer 401/нет цены; When запрос обновления; Then blocked/unknown, нуля или текущей цены не появляется, предлагается ручное подтверждение.
- SC-US-009-3: Given fresh снимок; When сменён регион/магазин либо прошло 24h; Then effective freshness stale, подтверждённый статус снят до нового снимка.
- SC-US-010-1: Given площадь 18, запас 8%, упаковка 1.99, цена 160000 копеек; When calculate; Then 10 упаковок, 1600000 копеек, видимая формула.
- SC-US-010-2: Given unmatched/unselected товар даже при известных работах/доставке либо null coverage; When calculate; Then incomplete с видимыми unknown rows, неизвестное не теряется.
- SC-US-010-5: Given отрицательный/overflow input, несовместимые единицы либо floor_area для стены; When calculate; Then 422, предыдущая смета неизменна.
- SC-US-010-6: Given floor и wall material; When derive quantity; Then floor4.5×4=18 м², wall площадь равна длине стены×высоте минус её проёмы; GLB area unknown до явного user-confirmed surface quantity.
- SC-US-010-7: Given сохранённая смета и изменённые текущие shopping rows; When воспроизвожу старый snapshot без текущих rows; Then совпадают totals, phases, unresolved/complete, reserve и delta по стабильным element/cost IDs.
- SC-US-010-3: Given изменённые quantity/price/reserve и бюджетный лимит; When calculate; Then новая версия, точный delta, known/scenario отдельно; incomplete не получает «уложились».
- SC-US-010-4: Given цена 1600 ₽ целым вводом и ранний лимит; When введены/изменены значения; Then native input допускает submit, minor=160000, текущий лимит отображается и немедленно влияет на сравнение.
- SC-US-011-1: Given нет товара; When выбрал замену; Then видно отличие/новые габариты, новая версия и повторное согласование.
- SC-US-011-2: Given позиции двух этапов; When перенос строки; Then суммы этапов меняются, общая сумма неизменна.
- SC-US-011-3: Given старая смета; When возвращаюсь к дизайну и пересчитываю; Then сохранены обе версии и причина изменения, old approval не переиспользован.
- SC-US-011-4: Given неподтверждённая либо не помещающаяся замена; When replace; Then 409/422 с причиной, указатели/история не изменены.
- SC-US-025-1: Given выбранная смета с known/unknown/retained rows; When download CSV; Then rows/provenance/phase/units/totals совпадают с immutable snapshot, unknown пустое/подписанное, dangerous formula text inert; другой owner получает404.
