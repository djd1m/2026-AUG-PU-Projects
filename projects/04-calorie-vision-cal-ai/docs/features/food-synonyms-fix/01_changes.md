# Правка seed синонимов: было → стало (DEC-A-064, 29.09.2026)

**Источник истины.** Тот же дамп, что импортирован на стенд: `/home/dz-projects-2026/usda/merged/`
(SR Legacy 2018-04 + Foundation 2026-04-30, собран 13.09 для `npm run import:fdc`). Сверено:
173410 = «Butter, salted», 169705 = «Oats», 170286 = «Buckwheat», 171705 = «Avocados…» — ровно то,
что видели пользователи стенда. Сверена КАЖДАЯ из 153 строк seed по `fdc_id → name_en` дампа
(генератор правки проверял и наличие всех четырёх нутриентов у нового id — иначе импорт его
отверг бы и seed упал бы на стенде с `unresolved_fdc_id`).

**Корень дефекта.** `tests/fixtures/fdc/food.csv` была СОЧИНЕНА: настоящим id приписаны выдуманные
названия («173410 = Egg, whole, cooked, hard-boiled», «170286 = Buckwheat honey»). Строки
`nutritionist-ru-01` (первые 100) подбирались по этой фикстуре — и интеграционные тесты были
зелёными, потому что фикстура и seed лгали согласованно. Фикстура пересобрана из дампа (названия,
четыре нутриента, первая порция в порядке файла — как берёт импорт); синтетические 999001/999002
оставлены.

**Правило выбора.** SR Legacy (иначе Foundation); варёное/отварное → `cooked`/`boiled`/`stewed`/
`simmered`/`braised`; сырое и базовое слово → `raw`; консервированное → `canned`. Для частей рецептов
смысл компонента взят из прежней фикстуры (что автор ИМЕЛ В ВИДУ) и найден настоящий id.

**Итог.** Исправлено **85 строк из 153**: 79 прямых синонимов и 6 составных блюд (25 частей из 31);
всего 104 замены id. Из 53 строк `coordinator-ru-02` исправлено 5: «творог» (с овощами → обычный
4 %), «спагетти» (шпинатные → обычные сухие) и — по ревью Codex, круг 1 — «лосось»/«сёмга» (кета
`chum` → атлантический фермерский) и «куриная грудка» (с кожей → без кожи, как соседняя «грудка
куриная»). Там же «курица отварная» переведена с грудки на всё мясо курицы (171451). Без изменений
остались 68 строк.

**Ограничение, названное, а не скрытое.** «Лосось отварной», «семга запеченная» и «сельдь отварная»
указывают на `cooked, dry heat` (запечённая рыба): варёной позиции этих видов в SR Legacy нет.

## Самые опасные (ккал на 100 г по данным дампа)

| Строка | Было | Стало |
|---|---|---|
| масло сливочное | 116 (Lentils, cooked) | 717 (Butter, salted) |
| яйцо вареное / яйцо куриное вареное / яйцо вкрутую; оливье, часть 4 | 717 (Butter, salted) | 155 (Egg, hard-boiled) |
| кукуруза консервированная / кукуруза вареная | 654 (Nuts, walnuts) | 67 / 96 |
| арахис жареный | 45 (Orange juice) | 587 (Peanuts, dry-roasted) |
| творог обезжиренный / творог нежирный | 598 (Peanut butter) | 72 |
| свекла свежая / свекла вареная; борщ ч.2; винегрет ч.1 | 534 (Seeds, flaxseed) | 43 / 44 |
| сахар / сахар песок | 304 (Honey) | 387 (Sugars, granulated) |
| мед / мед гречишный | 343 (Buckwheat) | 304 (Honey) |

## Полная таблица (104 замены id: 79 строк + 25 частей рецептов)

| name_ru | было (id — name_en) | стало (id — name_en) | ккал/100 г | основание |
|---|---|---|---|---|
| гречка вареная | 169705 — Oats (Includes foods for USDA's Food Distribution Program) | 170686 — Buckwheat groats, roasted, cooked | 389 → 92 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| гречка отварная | 169705 — Oats (Includes foods for USDA's Food Distribution Program) | 170686 — Buckwheat groats, roasted, cooked | 389 → 92 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| греча вареная | 169705 — Oats (Includes foods for USDA's Food Distribution Program) | 170686 — Buckwheat groats, roasted, cooked | 389 → 92 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| гречневая каша | 169705 — Oats (Includes foods for USDA's Food Distribution Program) | 170686 — Buckwheat groats, roasted, cooked | 389 → 92 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| картофель вареный | 170026 — Potatoes, flesh and skin, raw | 170440 — Potatoes, boiled, cooked without skin, flesh, without salt | 77 → 86 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| картошка вареная | 170026 — Potatoes, flesh and skin, raw | 170440 — Potatoes, boiled, cooked without skin, flesh, without salt | 77 → 86 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| картофель отварной | 170026 — Potatoes, flesh and skin, raw | 170440 — Potatoes, boiled, cooked without skin, flesh, without salt | 77 → 86 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| пюре картофельное | 170026 — Potatoes, flesh and skin, raw | 168555 — Potatoes, mashed, home-prepared, whole milk and butter added | 77 → 113 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| капуста белокочанная | 169228 — Eggplant, raw | 169975 — Cabbage, raw | 25 → 25 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| капуста свежая | 169228 — Eggplant, raw | 169975 — Cabbage, raw | 25 → 25 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| морковь свежая | 169975 — Cabbage, raw | 170393 — Carrots, raw | 25 → 41 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| морковь сырая | 169975 — Cabbage, raw | 170393 — Carrots, raw | 25 → 41 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| масло растительное | 171413 — Oil, olive, salad or cooking | 171017 — Oil, sunflower, linoleic (less than 60%) | 884 → 884 | растительное масло в RU — подсолнечное |
| говядина вареная | 173687 — Fish, salmon, chinook, smoked | 169442 — Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, cooked, simmered | 117 → 201 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| говядина отварная | 173687 — Fish, salmon, chinook, smoked | 169442 — Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, cooked, simmered | 117 → 201 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| фарш говяжий жареный | 173687 — Fish, salmon, chinook, smoked | 174034 — Beef, ground, 85% lean meat / 15% fat, crumbles, cooked, pan-browned | 117 → 256 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| куриная грудка вареная | 171077 — Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw | 171478 — Chicken, broilers or fryers, breast, meat only, cooked, stewed | 120 → 151 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| куриная грудка отварная | 171077 — Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw | 171478 — Chicken, broilers or fryers, breast, meat only, cooked, stewed | 120 → 151 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| курица отварная | 171077 — Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw | 171451 — Chicken, broilers or fryers, meat only, cooked, stewed | 120 → 177 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| свинина отварная | 173424 — Egg, whole, cooked, hard-boiled | 168231 — Pork, fresh, loin, whole, separable lean only, cooked, braised | 155 → 204 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| свинина вареная | 173424 — Egg, whole, cooked, hard-boiled | 168231 — Pork, fresh, loin, whole, separable lean only, cooked, braised | 155 → 204 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| яйцо вареное | 173410 — Butter, salted | 173424 — Egg, whole, cooked, hard-boiled | 717 → 155 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| яйцо куриное вареное | 173410 — Butter, salted | 173424 — Egg, whole, cooked, hard-boiled | 717 → 155 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| яйцо вкрутую | 173410 — Butter, salted | 173424 — Egg, whole, cooked, hard-boiled | 717 → 155 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| молоко цельное | 171269 — Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim) | 171265 — Milk, whole, 3.25% milkfat, with added vitamin D | 34 → 61 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| молоко коровье | 171269 — Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim) | 171265 — Milk, whole, 3.25% milkfat, with added vitamin D | 34 → 61 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| творог обезжиренный | 172470 — Peanut butter, smooth style, without salt | 172181 — Cheese, cottage, nonfat, uncreamed, dry, large or small curd | 598 → 72 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| творог нежирный | 172470 — Peanut butter, smooth style, without salt | 173417 — Cheese, cottage, lowfat, 1% milkfat | 598 → 72 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| сметана | 171284 — Yogurt, plain, whole milk | 171257 — Cream, sour, cultured | 61 → 198 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| сметана домашняя | 171284 — Yogurt, plain, whole milk | 171257 — Cream, sour, cultured | 61 → 198 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| хлеб пшеничный | 167762 — Strawberries, raw | 172686 — Bread, wheat | 32 → 274 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| хлеб белый | 167762 — Strawberries, raw | 174924 — Bread, white, commercially prepared (includes soft bread crumbs) | 32 → 266 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| сахар | 169640 — Honey | 169655 — Sugars, granulated | 304 → 387 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| сахар песок | 169640 — Honey | 169655 — Sugars, granulated | 304 → 387 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| паста отварная | 169738 — Pasta, whole-wheat, dry (Includes foods for USDA's Food Distribution Program) | 169737 — Pasta, cooked, enriched, without added salt | 352 → 158 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| макароны отварные | 169738 — Pasta, whole-wheat, dry (Includes foods for USDA's Food Distribution Program) | 169737 — Pasta, cooked, enriched, without added salt | 352 → 158 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| лосось отварной | 175139 — Fish, sardine, Atlantic, canned in oil, drained solids with bone | 175168 — Fish, salmon, Atlantic, farmed, cooked, dry heat | 208 → 206 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| семга запеченная | 175139 — Fish, sardine, Atlantic, canned in oil, drained solids with bone | 175168 — Fish, salmon, Atlantic, farmed, cooked, dry heat | 208 → 206 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| свекла свежая | 169414 — Seeds, flaxseed | 169145 — Beets, raw | 534 → 43 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| свекла вареная | 169414 — Seeds, flaxseed | 169146 — Beets, cooked, boiled, drained | 534 → 44 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| горошек зеленый | 169986 — Cauliflower, raw | 170419 — Peas, green, raw | 25 → 81 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| горошек консервированный | 169986 — Cauliflower, raw | 170104 — Peas, green, canned, no salt added, drained solids | 25 → 69 | консервированное → canned |
| чеснок | 169967 — Broccoli, cooked, boiled, drained, without salt | 169230 — Garlic, raw | 35 → 149 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| чеснок свежий | 169967 — Broccoli, cooked, boiled, drained, without salt | 169230 — Garlic, raw | 35 → 149 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| масло сливочное | 172421 — Lentils, mature seeds, cooked, boiled, without salt | 173410 — Butter, salted | 116 → 717 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| йогурт натуральный | 173416 — Cheese, colby | 171284 — Yogurt, plain, whole milk | 394 → 61 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| йогурт | 173416 — Cheese, colby | 171284 — Yogurt, plain, whole milk | 394 → 61 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| грибы шампиньоны | 170419 — Peas, green, raw | 169251 — Mushrooms, white, raw | 81 → 22 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| грибы свежие | 170419 — Peas, green, raw | 169251 — Mushrooms, white, raw | 81 → 22 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| капуста цветная | 169241 — Kanpyo, (dried gourd strips) | 169986 — Cauliflower, raw | 258 → 25 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| цветная капуста | 169241 — Kanpyo, (dried gourd strips) | 169986 — Cauliflower, raw | 258 → 25 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| кабачок свежий | 168462 — Spinach, raw | 169291 — Squash, summer, zucchini, includes skin, raw | 23 → 17 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| кабачок | 168462 — Spinach, raw | 169291 — Squash, summer, zucchini, includes skin, raw | 23 → 17 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| тыква свежая | 174608 — Chicken breast, roll, oven-roasted | 168448 — Pumpkin, raw | 134 → 26 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| тыква | 174608 — Chicken breast, roll, oven-roasted | 168448 — Pumpkin, raw | 134 → 26 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| чечевица вареная | 170394 — Carrots, cooked, boiled, drained, without salt | 172421 — Lentils, mature seeds, cooked, boiled, without salt | 35 → 116 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| фасоль красная вареная | 169989 — Celery, cooked, boiled, drained, without salt | 175194 — Beans, kidney, red, mature seeds, cooked, boiled, without salt | 18 → 127 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| фасоль отварная | 169989 — Celery, cooked, boiled, drained, without salt | 175194 — Beans, kidney, red, mature seeds, cooked, boiled, without salt | 18 → 127 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| мед гречишный | 170286 — Buckwheat | 169640 — Honey | 343 → 304 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| мед | 170286 — Buckwheat | 169640 — Honey | 343 → 304 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| овсянка вареная | 169098 — Orange juice, raw (Includes foods for USDA's Food Distribution Program) | 173905 — Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt | 45 → 71 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| овсяная каша | 169098 — Orange juice, raw (Includes foods for USDA's Food Distribution Program) | 173905 — Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt | 45 → 71 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| кефир | 173417 — Cheese, cottage, lowfat, 1% milkfat | 170904 — Kefir, lowfat, plain, LIFEWAY | 72 → 43 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| кефир нежирный | 173417 — Cheese, cottage, lowfat, 1% milkfat | 170904 — Kefir, lowfat, plain, LIFEWAY | 72 → 43 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| сельдь отварная | 171705 — Avocados, raw, all commercial varieties | 175117 — Fish, herring, Atlantic, cooked, dry heat | 160 → 203 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| колбаса вареная | 173691 — Fish, salmon, sockeye, raw | 172013 — Bologna, beef and pork | 131 → 308 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| сосиски | 173691 — Fish, salmon, sockeye, raw | 171633 — Frankfurter, meat and poultry, cooked, boiled | 131 → 298 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| кукуруза вареная | 170187 — Nuts, walnuts, english | 169999 — Corn, sweet, yellow, cooked, boiled, drained, without salt | 654 → 96 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| кукуруза консервированная | 170187 — Nuts, walnuts, english | 169214 — Corn, sweet, yellow, canned, whole kernel, drained solids | 654 → 67 | консервированное → canned |
| арахис жареный | 169098 — Orange juice, raw (Includes foods for USDA's Food Distribution Program) | 173806 — Peanuts, all types, dry-roasted, without salt | 45 → 587 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| геркулес отварной | 169098 — Orange juice, raw (Includes foods for USDA's Food Distribution Program) | 173905 — Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt | 45 → 71 | готовое блюдо → позиция cooked/boiled/stewed ближайшая по смыслу |
| редис свежий | 168409 — Cucumber, with peel, raw | 169276 — Radishes, raw | 15 → 16 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| зелень свежая | 169228 — Eggplant, raw | 170416 — Parsley, fresh | 25 → 36 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| лаваш | 167762 — Strawberries, raw | 174915 — Bread, pita, white, enriched | 32 → 275 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| борщ (часть 1, доля 0.35) | 169228 — Eggplant, raw | 169975 — Cabbage, raw | 25 → 25 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| борщ (часть 2, доля 0.25) | 169414 — Seeds, flaxseed | 169145 — Beets, raw | 534 → 43 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| борщ (часть 3, доля 0.2) | 170026 — Potatoes, flesh and skin, raw | 170440 — Potatoes, boiled, cooked without skin, flesh, without salt | 77 → 86 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| борщ (часть 4, доля 0.15) | 173687 — Fish, salmon, chinook, smoked | 169442 — Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, cooked, simmered | 117 → 201 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| борщ (часть 5, доля 0.05) | 171413 — Oil, olive, salad or cooking | 171017 — Oil, sunflower, linoleic (less than 60%) | 884 → 884 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| оливье (часть 1, доля 0.3) | 170026 — Potatoes, flesh and skin, raw | 170440 — Potatoes, boiled, cooked without skin, flesh, without salt | 77 → 86 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| оливье (часть 2, доля 0.15) | 169975 — Cabbage, raw | 170394 — Carrots, cooked, boiled, drained, without salt | 25 → 35 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| оливье (часть 3, доля 0.15) | 169986 — Cauliflower, raw | 170104 — Peas, green, canned, no salt added, drained solids | 25 → 69 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| оливье (часть 4, доля 0.15) | 173410 — Butter, salted | 173424 — Egg, whole, cooked, hard-boiled | 717 → 155 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| оливье (часть 5, доля 0.15) | 173424 — Egg, whole, cooked, hard-boiled | 172013 — Bologna, beef and pork | 155 → 308 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| оливье (часть 6, доля 0.1) | 171284 — Yogurt, plain, whole milk | 171257 — Cream, sour, cultured | 61 → 198 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| плов с курицей (часть 2, доля 0.3) | 171077 — Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw | 171478 — Chicken, broilers or fryers, breast, meat only, cooked, stewed | 120 → 151 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| плов с курицей (часть 3, доля 0.1) | 169975 — Cabbage, raw | 170393 — Carrots, raw | 25 → 41 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| плов с курицей (часть 5, доля 0.05) | 171413 — Oil, olive, salad or cooking | 171017 — Oil, sunflower, linoleic (less than 60%) | 884 → 884 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| солянка (часть 1, доля 0.3) | 173691 — Fish, salmon, sockeye, raw | 174579 — Sausage, pork and beef, fresh, cooked | 131 → 396 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| солянка (часть 5, доля 0.15) | 173687 — Fish, salmon, chinook, smoked | 169442 — Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, cooked, simmered | 117 → 201 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| винегрет (часть 1, доля 0.3) | 169414 — Seeds, flaxseed | 169146 — Beets, cooked, boiled, drained | 534 → 44 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| винегрет (часть 2, доля 0.3) | 170026 — Potatoes, flesh and skin, raw | 170440 — Potatoes, boiled, cooked without skin, flesh, without salt | 77 → 86 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| винегрет (часть 3, доля 0.2) | 169975 — Cabbage, raw | 170394 — Carrots, cooked, boiled, drained, without salt | 25 → 35 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| винегрет (часть 4, доля 0.1) | 169989 — Celery, cooked, boiled, drained, without salt | 175194 — Beans, kidney, red, mature seeds, cooked, boiled, without salt | 18 → 127 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| винегрет (часть 5, доля 0.1) | 171413 — Oil, olive, salad or cooking | 171017 — Oil, sunflower, linoleic (less than 60%) | 884 → 884 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| рагу овощное (часть 1, доля 0.3) | 168462 — Spinach, raw | 169291 — Squash, summer, zucchini, includes skin, raw | 23 → 17 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| рагу овощное (часть 2, доля 0.3) | 170026 — Potatoes, flesh and skin, raw | 170440 — Potatoes, boiled, cooked without skin, flesh, without salt | 77 → 86 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| рагу овощное (часть 3, доля 0.2) | 169975 — Cabbage, raw | 170394 — Carrots, cooked, boiled, drained, without salt | 25 → 35 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| рагу овощное (часть 5, доля 0.1) | 171413 — Oil, olive, salad or cooking | 171017 — Oil, sunflower, linoleic (less than 60%) | 884 → 884 | часть рецепта: смысл компонента из прежней фикстуры → настоящая позиция SR Legacy |
| куриная грудка | 171474 — Chicken, broilers or fryers, breast, meat and skin, raw | 171077 — Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw | 172 → 120 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| лосось | 173689 — Fish, salmon, chum, raw | 175167 — Fish, salmon, Atlantic, farmed, raw | 120 → 208 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| сёмга | 173689 — Fish, salmon, chum, raw | 175167 — Fish, salmon, Atlantic, farmed, raw | 120 → 208 | сырой/базовый продукт → позиция raw/базовая SR Legacy |
| творог | 169078 — Cheese, cottage, with vegetables | 172179 — Cheese, cottage, creamed, large or small curd | 95 → 98 | прежняя позиция по смыслу верна лишь частично (шпинатные спагетти / творог с овощами) → базовая |
| спагетти | 168911 — Spaghetti, spinach, dry | 169736 — Pasta, dry, enriched | 372 → 371 | прежняя позиция по смыслу верна лишь частично (шпинатные спагетти / творог с овощами) → базовая |
