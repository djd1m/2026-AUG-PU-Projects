# Скрейпинг публичных карточек российских DIY-сетей: ограниченная проверка

**Дата наблюдения:** 2026-10-13 UTC  
**Объекты:** Лемана ПРО и «Дом Лента»; только `robots.txt`, публичные документы и по одной карточке товара.  
**Граница:** без входа, cookie/session replay, CAPTCHA/challenge bypass, proxy rotation и массового обхода. Это техническая оценка, не правовое заключение.

## Решение

| Сайт | Технический статус | Вывод для N8 |
|---|---|---|
| Лемана ПРО | **Не подтверждено для production scraping.** `robots.txt` не запрещает обычный `/product/.../`, но прямой GET выбранной карточки вернул QRATOR HTTP 401. HTML, JSON-LD и embedded state получить не удалось. | Не обещать автоматические цены/остатки. Разрешить только отдельный эксперимент обычным Playwright-браузером после проверки условий и согласования; основной путь — одобренный B2B/API либо deep link + подтверждение пользователя. |
| Дом Лента | **Условно жизнеспособно для узкого on-demand parser, но не подтверждено end-to-end.** `robots.txt` разрешает `/product/.../`, прямой GET вернул QRATOR HTTP 401. Публично проиндексированный render официальной карточки содержит название, бренд, артикул и явный остаток, но в снятом представлении цены/региона не было. | Провести пилот на 10 разрешённых карточках через обычный Playwright с одним контекстом и без обхода challenge. Go только если стабильно извлекаются регион, продажная единица, цена и наличие, а условия использования допускают сценарий. |

Скрейпинг следует считать **дополнительным источником снимков**, а не заменой каталожного контракта. Даже успешный parser не подтверждает разрешение на систематическое использование или право переиздавать данные. `robots.txt` управляет обходом роботов, но сам по себе не является лицензией или юридическим разрешением.

## Прямые наблюдения и источники

| Проверка | Наблюдение |
|---|---|
| [Лемана ПРО robots.txt](https://lemanapro.ru/robots.txt) | HTTP 200; группа `User-agent: *` не содержит запрета обычного `/product/.../`, но запрещает query strings (`*?`, `*&`), поиск, basket/checkout/login и другие пути. `robots.txt` меняется; читать перед каждым сеансом. |
| [Лемана ПРО, карточка ламината](https://lemanapro.ru/product/laminat-kreaforta-dub-don-33-klass-tolshchina-8-mm-s-faskoy-199-m-89433614/) | Прямой GET 2026-10-13 вернул HTTP 401, `server: QRATOR`, тело 265 байт. JSON-LD/embedded state не инспектированы из-за отказа. Поисковый индекс ранее показывал артикул, регион, цену за м²/упаковку и наличие, но это не текущий снимок и не доказательство parser feasibility. |
| [Лемана ПРО: правила магазина](https://lemanapro.ru/pravila/) | Публичная страница при проверке через web fetch вернула 403. Конкретные применимые ограничения автоматизированного доступа в этой попытке не установлены. До production нужен просмотр актуального текста владельцем продукта/юристом или письменное разрешение сети. |
| [Дом Лента robots.txt](https://domlenta.ru/robots.txt) | HTTP 200; `User-agent: *` не запрещает обычный `/product/.../`, но запрещает `/api/*`, поиск, checkout, смену магазина и многие query/filter routes; опубликован sitemap index. Нельзя обращаться к запрещённым `/api/*` как к «скрытому API». |
| [Дом Лента, карточка товара](https://domlenta.ru/product/dvernaya-korobka-invisible-alyumin-skrmontazh-2100-mm-rossiya-798888/) | Прямой GET 2026-10-13 вернул QRATOR HTTP 401. Доступный публичный render официальной страницы показал: название, бренд VELLDORIS, артикул 798888 и «В наличии 4 шт». Цена, sale unit, регион и JSON-LD в доступном представлении не подтверждены. |
| [Дом Лента: пользовательское соглашение](https://domlenta.ru/info/user-agreement/) и [правила](https://domlenta.ru/info/rules/) | URL доступны публично, но извлечённое представление в этой попытке содержало навигацию без текста условий. Нельзя утверждать ни разрешение, ни запрет систематического сбора. |

Локальный browser runtime не найден, а установка запрещена scope задачи, поэтому Playwright-проверка не выполнялась. Это пробел измерения, а не неудачный browser test.

## Сравнение способов

| Способ | Плюсы | Результат проверки / риск | Решение |
|---|---|---|---|
| HTTP + HTML parser | Дешевле, детерминированнее, проще лимитировать. | Обе карточки вернули 401; текущий HTML недоступен. | Сейчас **no-go** для обоих сайтов. Повторять только после явного изменения ответа, без маскировки/обхода. |
| JSON-LD / публичные structured data | Семантические `Product`/`Offer` обычно устойчивее CSS-селекторов. | Фактический JSON-LD обеих карточек не удалось увидеть. По индексированному render нельзя доказать его наличие. | Первый extractor в будущем пилоте; отсутствие нужного поля ведёт к `unknown`, не к DOM-угадыванию. |
| Playwright, обычный browser render | Выполняет клиентский JS и видит тот же публичный UI; официальный Playwright поддерживает Chromium/Firefox/WebKit и browser automation: [репозиторий](https://github.com/microsoft/playwright). | Не проверен локально. Если появляется CAPTCHA/challenge или 401/403 — остановка, без stealth/fingerprint/proxy tricks. Ресурсоёмок, DOM хрупок. | **Условный пилот**, один browser context/site, только продуктовые deep links. |
| Одобренный API | Явный контракт, поля региона/цен/остатков и контроль доступа. | У Лемана ПРО B2B API требует одобрения и credentials; у Дом Лента одобренный consumer contract не подтверждён. | Предпочтительный production-источник, если сеть согласует use case. |

## Переиспользование и кандидаты

Сначала проверены проекты 1–7. В N6 уже есть пригодные защитные примитивы:

- `projects/06-rag-sales-chatbase/apps/worker/src/crawl/robots.ts`: robots-first и выбор группы по продуктовой части User-Agent;
- `.../safe-get.ts`: проверка адреса/redirect, таймаут, byte cap, один запрос за паузу;
- `.../crawl-site.ts` и `limits.ts`: один поток, лимиты запросов/времени и честные skip reasons.

Решение: **adapt** эти паттерны и тесты, не копировать целиком текстовый crawler. Retail adapter должен брать заданные product URLs, не открывать sitemap/category crawl и не следовать произвольным ссылкам.

Обязательный GitHub-поиск после локального:

| Кандидат | Подтверждённая возможность | Решение |
|---|---|---|
| [Cheerio](https://github.com/cheeriojs/cheerio) (MIT) | Быстрый server-side HTML/XML parser поверх parse5/htmlparser2. | **Adapt только parser layer** после успешного HTTP/Playwright content capture. Сам QRATOR 401 не решает. |
| [Playwright](https://github.com/microsoft/playwright) (Apache-2.0) | Управляет Chromium/Firefox/WebKit и подходит для browser automation/web scraping. | **Пилотный renderer**, если обычный browser проходит публичную карточку без challenge; не средство обхода. |
| [Crawlee](https://github.com/apify/crawlee) (Apache-2.0) | `CheerioCrawler` для HTML, `PlaywrightCrawler` для JS, лимиты concurrency/rate. | **Отложить**: для двух адаптеров и on-demand refresh мета-фреймворк избыточен. Вернуться при ≥3 стабильных источниках и очереди обновлений. Не использовать session/proxy rotation для обхода блокировок. |

## Контракт адаптера

```ts
type RetailSnapshot = {
  retailer: 'lemanapro' | 'domlenta'; canonicalUrl: string;
  productId: string | null; sku: string | null; name: string | null;
  region: { id: string | null; label: string | null; source: 'page'|'input'|'unknown' };
  store: { id: string | null; label: string | null } | null;
  saleUnit: 'piece'|'pack'|'m2'|'lm'|'l'|'kg'|'unknown';
  pack: { baseQty: number; baseUnit: string } | null;
  price: { amountRub: number; basis: 'sale_unit'|'base_unit'|'unknown' } | null;
  stock: { status: 'in_stock'|'out_of_stock'|'unknown'; qty: number | null; raw: string | null };
  observedAt: string; sourceKind: 'jsonld'|'embedded'|'dom'|'manual';
  fieldEvidence: Record<string, string>; parserVersion: string;
  status: 'fresh'|'stale'|'blocked'|'parse_error'|'region_unknown';
}
```

Метод `fetchProduct({url, region, store?})` возвращает snapshot и diagnostics, никогда «лучшее предположение». Порядок extraction: JSON-LD `Product/Offer` → явно именованный public embedded state → устойчивые видимые labels → `unknown`. Цена валидна только вместе с регионом; остаток магазина — только вместе с store.

## Ограничения обновления и отказоустойчивость

Пилотные значения ниже — `[H]`, их нужно согласовать с владельцами сайтов или ужесточить по наблюдениям:

- Один concurrent request/browser page на сайт; минимум 5 секунд между началами запросов; идентифицируемый User-Agent с contact URL.
- Только URL товаров из пользовательского shortlist; максимум 20 refresh за действие и 100 product pages/site/day в пилоте. Никакого category/search crawl.
- Читать `robots.txt` до сеанса и кешировать максимум 1 час. Новый запрет немедленно останавливает соответствующие URL.
- На 401/403/CAPTCHA/challenge — `blocked` и остановка site queue на 6 часов; на 429 учитывать `Retry-After`, иначе 1 час; на 5xx/timeouts — 15 мин → 1 ч → 6 ч, не более трёх попыток.
- Не хранить challenge cookies для повторного обхода и не менять proxy/fingerprint. Browser context можно сохранять лишь в рамках одной публичной сессии, если не появляется barrier.
- Price TTL `[H]` 4 часа, stock TTL `[H]` 30 минут, product identity/pack TTL `[H]` 7 дней. Перед purchase/deep link refresh обязателен; просроченное показывается как «нужно обновить».
- Смена региона или магазина инвалидирует `price`, `stock`, `delivery`; смена canonical SKU или pack size инвалидирует расчёт количества и budget diff.
- Diff хранит old/new snapshot и причины: `price_changed`, `stock_changed`, `pack_changed`, `region_changed`, `parser_changed`. Массовый null/drop полей после parser update — circuit breaker, не обновление каталога.
- Количество остатка принимается только как явное неотрицательное целое рядом с выбранным магазином. «В наличии», «много», `100+` сохраняются в `raw`, а `qty=null`; число из общего availability не приписывать магазину.
- Если пользовательская потребность выше подтверждённого `stock.qty`, позиция получает `partial_stock`; автоматическое обещание покупки запрещено. Значения цены/количества за пределами разумного numeric parser range отвергаются как parse error, а не clamp.

## Пользовательские состояния и fallback

- `fresh`: «Проверено 13 окт., 20:35 UTC · Москва · магазин X».
- `stale`: цена видна зачёркнутой/серой и исключается из «подтверждённой суммы» до refresh.
- `region_unknown`: товар можно сохранить, но цена и наличие не входят в подтверждённый бюджет.
- `blocked`: «Магазин временно не разрешил автоматическую проверку» + официальный deep link + ручной ввод цены/остатка с отметкой `manual`.
- `parse_error`: оставить последний snapshot как stale, открыть карточку и предложить пользователю подтвердить данные; не показывать ноль.
- Доставка всегда `quote_required`, пока не получен адресный расчёт магазина; product-page scraper не должен выводить её из баннера.

## Следующая проверка и критерий go/no-go

1. Получить актуальные условия использования обоих сайтов из доступного пользователю browser session и отдельно согласовать допустимость ограниченного коммерческого сбора; robots недостаточно.
2. В подготовленном окружении Playwright открыть по 5 карточек из двух категорий и двух московских магазинов, без login/challenge actions.
3. Зафиксировать raw HTML hash и наличие JSON-LD/embedded state; прогнать один и тот же parser дважды с интервалом ≥30 минут.
4. Сверить каждое поле с видимым UI: identity, region/store, sale unit, pack, обе цены, stock. Требование пилота `[H]`: 100% точность обязательных полей на доступных страницах и ни одного silent wrong value.
5. Если QRATOR требует challenge или регион нельзя задать разрешённым публичным UI без cookie replay, site adapter остаётся **no-go**, а продукт использует deep link/manual/API.

**Итог:** сегодня scraping не подтверждён как production-канал ни для одной сети. Для «Дом Лента» оправдан один узкий Playwright-пилот; для Лемана ПРО — только после выяснения условий и успешного обычного browser access. Основной CJM может показывать автоматическую проверку как optional capability с честным fallback, не как гарантию актуальных цен.
