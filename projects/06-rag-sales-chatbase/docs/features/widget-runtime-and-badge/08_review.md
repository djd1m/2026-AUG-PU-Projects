# 08 — Независимое ревью: `widget-runtime-and-badge` (фича 11)

Ревьюер: Claude Sonnet 5 (агент, независимый проход; код не менялся). Дата: 2026-09-26. Основа: `HEAD
d638b8a` + незакоммиченное дерево (см. [`07_code_report.md`](07_code_report.md), [`05_completion.md`](05_completion.md)).
Прочитано: `07_code_report.md`, `05_completion.md`, `reuse-map.md`, A-N6-034 (все 12 пунктов),
`docs/embed-contract.md`, корневые `.claude/rules/embeddable-widget.md`, `security-operation-order.md`,
`fail-closed-defaults.md`, `deployment-seams.md`; исходники `apps/web/src/server/{check-origin,widget-handler,
widget-bundle,widget-deps,widget-runtime}.ts`, `apps/web/src/lib/badge-required.ts`, `packages/db/src/widget.ts`,
`apps/widget/src/{index,api,badge,chat-window,styles,session}.ts`, `proxy/Caddyfile`; тесты
`tests/{widget-handler.unit,widget-config.integration,widget-source,badge-required}.test.ts`,
`tests/browser/{widget-harness,widget-embed.test}.ts`, `scripts/test-widget{,-browser}-mutations.mjs`.

## Вердикт: **APPROVE WITH FIXES**

Блокеров не найдено. Порядок операций, fail-closed поведение CORS/бейджа/учёта установок и изоляция
Shadow DOM реализованы так, как заявлено в квитанции, и подтверждены НАСТОЯЩИМИ прогонами (Postgres,
три браузерных движка на другом порту с реальным CSP и враждебным CSS) — не только unit-моками. Ниже —
находки уровня «улучшить», без которых фичу можно принимать.

## (1) CORS

Всё заявленное подтверждено кодом и тестами:

- **Allowlist, а не отражение.** `checkOrigin` (`apps/web/src/server/check-origin.ts:20-24`) возвращает
  origin, только если он **точно** входит в `bot.origins` (массив из БД, нормализованный при вставке
  `parseAllowedOrigin` — nижний регистр, punycode, без trailing dot: `packages/rag/src/bot-settings.ts:92-98`)
  либо равен `N6_PUBLIC_ORIGIN` при `publicEnabled`. Нет ни одного пути, где `origin` строился бы из
  необработанного заголовка без проверки includes — грепом (`tests/widget-source.test.ts:49-53`) закрыт
  и джокер `*`, и `Allow-Credentials`.
- **Ровно один ACAO.** `corsHeaders()` — единственное место, ставящее заголовок; `proxy/Caddyfile` явно
  документирует и НЕ ставит CORS (урок N1 deployment-seams назван в комментарии `Caddyfile:4-9` и в
  `check-origin.ts:1-3`). Браузерный тест видит ACAO как массив (`acao = r.headers.get(...).split(', ')`)
  и утверждает длину 1 — двойной заголовок был бы пойман.
- **`Vary: Origin`, без `credentials`, без `*`** — во всех ответах (unit `widget-handler.unit.test.ts:47-60`,
  integration на настоящем Postgres `widget-config.integration.test.ts:48-58`, браузер `widget-embed.test.ts:49-60`).
- **403 без CORS-заголовка** — `refused()`/`notFound()` вызывают `fail()` без `origin` (`widget-handler.ts:38-39`),
  и тест на чужом порту 8098 подтверждает: `config 403 без ACAO`, в документе хозяина не появляется
  ничего (`widget-embed.test.ts:62-68`).
- **Edge-кейсы Origin** — null/`'null'`/пустой/с путём/схема file:/chrome-extension:/учётные данные — все
  отклоняются (`check-origin.ts:14-17`, тест `widget-handler.unit.test.ts:33-38`); регистр и порт
  проверены явно (`SHOP.example:443` → matched; поддомен/другой порт/другая схема — нет). **Trailing dot
  и punycode explicit-тестом не покрыты** — см. находку L-1.
- **Двойной вызов Caddy+web** — не воспроизводится: `Caddyfile` (строки 4-9, 56-63) документирует и не
  ставит ACAO вообще; единственный заголовок `Cache-Control: no-store` на `/w/v1/*` совпадает с тем, что и
  так ставит `web`, конфликта нет.
- **OPTIONS** — 204 только для origin из списка ХОТЯ БЫ одного бота (`originAllowedAnywhere`), 403 иначе,
  без ACAO (`widget-handler.ts:76-83`, тест `widget-handler.unit.test.ts:114-124`).

**Находка L-1 (low, test gap, не блокер).** `requestOrigin`/`checkOrigin` не имеют явного unit-теста на
Origin с trailing dot (`https://shop.example.`) и на punycode-домен (`https://xn--…`/кириллица). Ручная
проверка семантики `new URL()` показывает корректное fail-closed поведение (trailing dot не совпадёт с
хранимым без dot — отказ, не обход; punycode совпадает с тем, что сохранила `parseAllowedOrigin`), но
поведение не закреплено тестом → риск незамеченной регрессии при будущей правке `requestOrigin`.
**Файл:** `apps/web/src/server/check-origin.ts:10-18`; **тест:** `tests/widget-handler.unit.test.ts:33-38`.
**Рекомендация:** добавить оба случая в тот же `it`.

## (2) Бейдж fail-closed

- Сервер — единственный источник решения: `badgeRequired()` (`apps/web/src/lib/badge-required.ts:6-8`) —
  строгое равенство `'nobadge'`/`'studio'`, без `trim`/`toLowerCase`; 11 непригодных форм плана дают
  бейдж (`tests/badge-required.test.ts:13-16`); клиент не может снять бейдж параметром запроса
  (`widget-handler.unit.test.ts:83-86`). Мутация `badge-normalized` (добавление нормализации) красит
  тесты и восстанавливается — страж испытан (`scripts/test-widget-mutations.mjs:30-31`).
- Клиент **восстанавливает**, не решает: `renderBadge`/`checkAndRestore` (`apps/widget/src/badge.ts:60-80`)
  красят готовое булево от сервера; своей логики «если free» нет.
- **Доступность (заданный в задаче вопрос).** `badgeIntact()` (`badge.ts:82-86`) возвращает verdict,
  вычисленный **до** факта восстановления в том же вызове: если бейдж был скрыт/удалён, узел чинится
  синхронно (`forceVisible`/`renderBadge`), но САМ этот клик «Отправить» игнорируется — пользователь
  видит восстановленный бейдж и нажимает снова (`chat-window.ts:162-163`, доказано мутацией
  `badge-hidden-by-client` в браузере: `05_completion.md` строка 51). Это **намеренный trade-off ADR-004**
  («без видимого бейджа вопрос не уходит»), не дефект: для добросовестного посетителя, у которого бейдж
  никто не трогал, `checkAndRestore` возвращает `'ok'` с первого раза (узел рисуется синхронно при
  открытии окна, до того как форма становится интерактивной) — блокировки не происходит. Свободна от
  постоянного лока: один пропущенный клик, не более. Приемлемо, отмечаю без действия.
- Смена плана действует со следующего запроса конфигурации, а не мгновенно (документировано и
  проверено на настоящей БД: `widget-config.integration.test.ts:72-81`, SC-US-011-2) — соответствует
  заявленному в ADR-004 «Последствия».

## (3) Изоляция

- Shadow DOM открытый, `:host{all:initial !important…}` и `.n6{all:initial}` — подтверждено стражем
  исходника (`tests/widget-source.test.ts:43-48`) и в трёх реальных браузерах под враждебным CSS
  (`* {font-size:30px!important;box-sizing:content-box!important}` и т.д.) — пузырь 56×56 в 16px от угла,
  окно 360px, шрифт свой (`widget-embed.test.ts:70-92`), страница хозяина не изменена (`before === after`).
- `adoptedStyleSheets` — единственный путь стилей, инлайна нет (страж regexp `setAttribute('style'...)`
  и `createElement('style'/'link')`, `document.head` — все запрещены и проверены на исходнике,
  `widget-source.test.ts:25-36`). Браузерный прогон под `style-src 'self'` без `unsafe-inline` даёт 0
  событий `securitypolicyviolation` (`widget-embed.test.ts:49-60`, `94-119`) — CSP хозяина реально
  применялась (не curl), это именно то доказательство, которое требует `embeddable-widget.md`.
  **Поддержка браузеров:** `adoptStyles()` (`apps/widget/src/styles.ts:70-78`) явно фолбэкает в «ничего не
  показывать» при отсутствии `CSSStyleSheet`/`adoptedStyleSheets`/`replaceSync` (Safari < 16.4) — fail-closed,
  задокументировано как известный пробел A-N6-034(7)/05_completion, не скрыто.
- Три класса из `embed-contract.md` проверены на оснастке **другого порта** (виджет :18411, хозяин :8099,
  чужой :8098) с реальным installSnippet/CSP/hostile CSS (`tests/browser/widget-harness.ts`) — ровно то,
  что требует `.claude/rules/embeddable-widget.md` («проверка ОБЯЗАНА выполняться на странице ЧУЖОГО
  origin»); своя демо-страница как проверка не выдаётся за проверку. Честно отмечено `check-embed-contract`
  код 2 (`not-deployed`) — нет боевого стенда и `/w/v1/ask` (фича 12), не подделано под «выполнена».

## (4) Учёт установок

- Домен — только из origin, прошедшего `checkOrigin` (точное совпадение allowlist); свой origin
  (`N6_PUBLIC_ORIGIN`) — не установка (`packages/db/src/widget.ts:48`, тест `widget-config.integration.test.ts:95-101`).
- `POST /w/v1/event`: лимит частоты — дверь (30 мутаций/мин, `Caddyfile:30-37`) + `allowMutation` на уровне
  приложения (`widget-handler.ts:87-89`); валидация строгая (`isPlainObject`, `UUID`, закрытый список типов,
  `extra`-поле отклоняется — `widget-handler.ts:92-101`); подделать чужой бот нельзя: `bot` резолвится в
  `usableBot`, а origin сверяется со списком ЭТОГО бота (не любого) — событие для бота B с origin,
  разрешённым только боту A, получает 403 (интеграционный тест `widget-config.integration.test.ts:129-131`
  проверяет чужую сессию 400, а origin вне списка — 403 отдельной строкой в unit).
- Атомарность подтверждена на настоящем Postgres: 8 одновременных `first_answer` → ровно один `installed`
  и один `growth_event` (`UPDATE … WHERE first_answer_at IS NULL RETURNING`, `ON CONFLICT (type, dedup_key)
  DO NOTHING` — `packages/db/src/widget.ts:53-58`, тест `widget-config.integration.test.ts:103-116`).
- **Дефект, пойманный настоящей БД, исправлен корректно.** Смешение типов параметра `$3` (uuid и
  text в `||`) в `recordBadgeEvent` заменено отдельным параметром `$5` для `dedup_key`
  (`packages/db/src/widget.ts:83-85`) — красный/зелёный прогон в `07_code_report.md` подтверждает, что это
  не косметика, а настоящий SQL-баг, не видимый модульным тестом с подменённым хранилищем.
- **Остаточный риск, уже названный автором (не новая находка).** `Origin` — заголовок, а не
  криптографическое доказательство: небраузерный клиент может проставить `Origin` из allowlist бота и
  раздуть показы/установки. Задокументировано в A-N6-034(5) как риск метрики, не денег; для этой фичи
  это приемлемо и не требует правки здесь.

## (5) Маршрут бандла `/w/[file]`

- **Path traversal закрыт по конструкции, не по фильтру.** Запрошенное имя проверяется строгой якорной
  регулярка `WIDGET_BUNDLE_FILE = /^widget\.[0-9a-f]{8,64}\.js$/` целиком (`widget-bundle.ts:50`, требует
  полного совпадения — слеши/точки-точки не проходят); а содержимое, которое отдаётся, читается **не по
  имени из запроса**, а всегда из `manifest.json` (`bundle.file`) — запрошенное имя влияет только на выбор
  `Cache-Control` (текущее/старое), не на путь к файлу на диске. Мусорные имена (`widget.js`, `..%2Fetc`,
  `manifest.json`) — 404 (`tests/widget-handler.unit.test.ts:107-113`).
- Кэш: текущий хэш — `immutable` на год, любой другой валидный `widget.<hex>.js` — текущий бандл с
  `max-age=300` (не 404) — верно решает проблему «выпуск снимает виджет со старых сайтов» (A-N6-034(2)).
  `Content-Type: text/javascript; charset=utf-8`, `Cross-Origin-Resource-Policy: cross-origin` — корректно
  для COEP-хозяев.
- Живой `GET` к собранному Next (реальный HTTP-запрос к поднятому `next start`) не проверялся — честно
  отмечено в `05_completion.md` («не доказано»); проверено только модулем обработчика. Не блокер (canon
  §5 маршрут детерминирован и не зависит от Next-специфики роутинга для одного динамического сегмента),
  но стоит закрыть перед стендовым E2E фичи 12.

## (6) XSS в имени/приветствии бота

- `company_name`/`greeting`/`contact` из конфигурации — везде через `textContent`/третий параметр `el()`
  (`chat-window.ts:44-49, 79, 113, 125`), никогда через `innerHTML`. Кавычки в названии («Пекарня «Колос»»)
  корректно не ломают разметку — это текстовый узел, не парсится как HTML.
- Ответ модели и источник (`renderReply`) — тоже только `textContent`/`createElement`, ссылка проходит
  `safeHref` (только http/https, `api.ts:30-36`) до присвоения `a.href`. Браузерный тест явно засылает
  `<img onerror>`+`<script>` и `javascript:` в текст, заголовок источника и ссылку — 0 исполнений
  (`window.__xss` не устанавливается), ссылка отброшена, разметка видна как текст (`widget-embed.test.ts:130-157`).
- Аттрибуты (`aria-label` с именем компании) ставятся через `setAttribute`, не через шаблон HTML — не
  инъекция даже теоретически.

## (7) Оснастка чужого origin

Реальна, а не подделана под «своя страница = проверка»: `WIDGET` (:18411), `HOST` (:8099, в allowlist),
`STRANGER` (:8098, не в allowlist) — три отдельных HTTP-сервера на разных портах
(`tests/browser/widget-harness.ts:20-23, 131-134`); хозяйская страница отдаёт **настоящий**
`Content-Security-Policy` заголовком (не мета-тегом, который слабее) с ровно опубликованными
директивами + `'self'` для своего скрипта (`hostPage`, `widget-harness.ts:50-61`) и подгружает
враждебный CSS **по сети** через `<link rel=stylesheet>` (не инлайном — так CSP реально участвует),
а не только заявляет о проверке. Тег виджета — ровно тот, что выдаёт `installSnippet` (тот же код, что
увидит настоящий клиент в кабинете), не упрощённый мок. Три движка (Chromium/Firefox/WebKit). Это
соответствует букве `.claude/rules/embeddable-widget.md` («другого порта достаточно… отвечает CSP…
несёт враждебный CSS»). `check-embed-contract.cjs` код 2 с причиной `not-deployed` — честная и
единственно верная оценка на этой стадии (боевого стенда и `/w/v1/ask` нет), не выдана за «выполнена».

## Итог

Находок уровня blocker/high нет. Одна находка low (L-1, недостающий явный тест на trailing dot/punycode
в Origin — поведение корректно, но не закреплено тестом). Один пункт отмечен как намеренный trade-off,
не дефект (badge gate «проглатывает» один клик при восстановлении — вопрос из задания, ответ: не ломает
доступность добросовестного посетителя). Оставшиеся пробелы (`/w/v1/ask` от фичи 12, живой `next start`,
Safari < 16.4, calibration NFR-PERF-003) — уже честно названы автором в `05_completion.md` и не
скрываются под зелёным статусом; для ЭТОЙ фичи это не блокирует приём.

Status: completed
