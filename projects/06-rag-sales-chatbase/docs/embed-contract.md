# Контракт встраиваемого виджета — N6 «Суфлёр»

Дата: 2026-09-25. Правило: [`embeddable-widget.md`](../../../.claude/rules/embeddable-widget.md).
Проверка: `node ../../.claude/hooks/check-embed-contract.cjs .` · Решение: ADR-005.

**Встраиваемый виджет:** да
**Origin виджета:** https://sufler.aicoding.space
**Origin хозяйской страницы:** http://stand.example:8099
**Учётные данные:** нет
**Разрешённые origin:** http://stand.example:8099
**Проверка на чужой странице:** ВЫПОЛНЕНА
**Причина:** —

**Квитанция стенда (27.09.2026, координатор).** Хозяйская страница — внутри контейнера Playwright по HTTP на `http://stand.example:8099`
(имя → 127.0.0.1 в контейнере, порт на хост не публикуется), тег — ровно `installSnippet` для демо-бота служебного аккаунта,
`Content-Security-Policy: default-src 'none'; script-src https://sufler.aicoding.space; connect-src https://sufler.aicoding.space;
img-src https://sufler.aicoding.space data:; style-src 'self'`, враждебный CSS (`* { font-size: 30px !important; box-sizing: content-box !important }`,
`button { width: 300px !important }` и др.). Итог в трёх движках: `config` 200, `event` 204, `ask` 200 — ACAO ровно
`http://stand.example:8099`; ответ НАСТОЯЩЕЙ модели по info.cern.ch с плашкой источника; пузырь 56×56 в 16 px от угла, шрифт поля 16 px
вопреки `30px !important`; заголовок и кнопка хозяина сохранили свои стили; в документе хозяина — только его собственный `<link>`.
Страница `http://stand.example:8098` (не в списке): `config` 403 без ACAO, виджета нет. Нарушений CSP от виджета — 0: в WebKit
нарушение `style-src-elem inline` воспроизводится ТОЛЬКО снимком экрана Playwright (он встраивает стиль скрытия курсора) — до снимка
0, после — 1, отдельно проверено; в Firefox — `favicon.ico` самой хозяйской страницы (`img-src`), не виджет.

Виджет — ПРОДУКТ целиком: он живёт на сайте клиента, и все три класса отказа проявляются только там.
Код виджета есть с фичи `widget-runtime-and-badge` (26.09), стенда — нет, поэтому проверка по ВЫДАННОМУ
развёртыванием адресу честно НЕ ВЫПОЛНЕНА (`not-deployed`); предстендовая оснастка — ниже, она не заменяет
строки таблицы. `https://suffler.example` —
заполнитель: боевой origin выдаёт развёртывание (`N6_PUBLIC_ORIGIN`), и при проверке берётся ВЫДАННЫЙ
адрес, а не известный заранее.

## Классы отказа

| Класс | Статус | Признак у клиента | Лечение | Доказательство |
|---|---|---|---|---|
| перекрёстный-запрос | ПРОВЕРЕН | окно открылось, ответа нет; в консоли клиента `blocked by CORS policy`, в нашем журнале запрос отвечен | `Access-Control-Allow-Origin` = origin хозяина из `allowed_origin` бота, `Vary: Origin`, `OPTIONS` → 204 с `Allow-Methods: GET, POST` и `Allow-Headers: Content-Type`; `credentials: 'omit'`; заголовок ставит только `web`, Caddy — нет (двойной ACAO ломал N1) | http://stand.example:8099/ → выданный адрес https://sufler.aicoding.space, 2026-09-27, Chromium + Firefox + WebKit — `tests/artifacts/embed-contract-stand/` |
| протечка-стилей | ПРОВЕРЕН | пузырь смещён или окно «разъехалось» только на сайте клиента; или наши стили задели страницу хозяина | открытый Shadow DOM, `all: initial` на корне, свои `px`, `adoptedStyleSheets`; ни одного глобального селектора | http://stand.example:8099/ → выданный адрес https://sufler.aicoding.space, 2026-09-27, Chromium + Firefox + WebKit — `tests/artifacts/embed-contract-stand/` |
| политика-безопасности | ПРОВЕРЕН | виджет не появляется вообще; `Refused to load … Content Security Policy` | нет инлайновых скриптов и style-атрибутов в документе хозяина; стили — только `adoptedStyleSheets` в теневом корне; хозяин разрешает `script-src <origin>`, `connect-src <origin>`, `img-src <origin> data:` (публикуется на экране установки, FR-WIDGET-003) | http://stand.example:8099/ → выданный адрес https://sufler.aicoding.space, 2026-09-27, Chromium + Firefox + WebKit — `tests/artifacts/embed-contract-stand/` |

## Оснастка, которой будет закрыта проверка (Completion, шаг E2E)

Страница `host.html`, раздаваемая по HTTP на порту 8099 (другой origin), вставляет виджет по адресу,
который ВЫДАЛО развёртывание; отдаёт `Content-Security-Policy: default-src 'none'; script-src <origin>;
connect-src <origin>; img-src <origin> data:; style-src 'self'` и несёт враждебный CSS (`* { box-sizing:
content-box !important; font-size: 30px !important }`, `div { position: relative; z-index: 1 }`,
`img { width: 100% }`). Проверка — Playwright: пузырь виден, вопрос получает ответ с плашкой,
в консоли 0 ошибок CSP/CORS; отдельно — домен вне списка получает 403 без ACAO.

## Предстендовая оснастка (фича `widget-runtime-and-badge`, 26.09.2026) — НЕ квитанция стенда

Что это доказывает и чего нет. Настоящий собранный бандл и НАСТОЯЩИЕ обработчики `/w/v1/config`,
`/w/v1/event`, `OPTIONS` и `GET /w/[file]` (хранилище подменено словарём; SQL — `tests/widget-config.integration.test.ts`
на настоящем Postgres) подняты на `http://127.0.0.1:18411` ВНУТРИ контейнера Playwright; хозяйская страница —
`http://127.0.0.1:8099/host.html` (в списке бота) и `http://127.0.0.1:8098/host.html` (НЕ в списке), тег —
ровно выданный `installSnippet`, CSP — ровно опубликованные `cspDirectives` + `'self'` для скрипта хозяина,
`default-src 'none'; style-src 'self'`; враждебный CSS (`* { font-size: 30px !important; box-sizing: content-box
!important }`, `button { width: 300px !important }`, `[hidden] { display: block !important }` и др.). С фичи
`visitor-ask-and-limits` (26.09) `/w/v1/ask` в оснастке — НАСТОЯЩИЙ обработчик `createWidgetAskHandler` и НАСТОЯЩЕЕ
ядро `answerQuestion` с настоящим клиентом OpenRouter поверх подменного fetch (фейковая модель; живая модель не
вызывается): вопрос из окна виджета на :8099 получает ответ с плашкой источника, предел сессии — 429 с контактом,
бот без отметки «проверено» — «Бот ещё настраивается» без вызова модели, POST со страницы :8098 — 403 без ACAO.
Оснастка: `tests/browser/widget-harness.ts`, набор: `tests/browser/widget-embed.test.ts`,
запуск `bash scripts/check-responsive.sh --test tests/browser/widget-embed.test.ts`.

| Класс (не строка контракта) | Результат оснастки (Chromium, Firefox, WebKit) | Доказательство |
|---|---|---|
| перекрёстный-запрос (оснастка) | `config` 200 с ACAO ровно `http://127.0.0.1:8099`, `event` через предполётный — 204 с тем же ACAO; страница 8098 — `config` 403 без ACAO, в документе хозяина ничего | http://127.0.0.1:8099/host.html, http://127.0.0.1:8098/host.html — `tests/artifacts/widget-runtime-and-badge/browser-run.txt` |
| протечка-стилей (оснастка) | пузырь 56×56 в 16 px от угла, окно 360 px, шрифт 16/15 px вопреки `30px !important`; стиль заголовка и кнопки хозяина не изменились; ни одного `<style>`/`<link>` в документе хозяина | скриншоты `tests/artifacts/widget-runtime-and-badge/browser/*-hostile-open.png` |
| политика-безопасности (оснастка) | 0 событий `securitypolicyviolation`, 0 ошибок консоли под CSP без `unsafe-inline`; мутация «style-атрибут на узле хозяина» краснеет набор | `tests/artifacts/widget-runtime-and-badge/browser-mutations/` |

Для закрытия строк таблицы выше: та же страница `host.html` на :8099, но тег и директивы — по адресу, который
ВЫДАЛО развёртывание (`N6_PUBLIC_ORIGIN` стенда), и вопрос с ответом через `POST /w/v1/ask` РАЗВЁРНУТОГО `web` за
`proxy`. Фича `visitor-ask-and-limits` маршрут написала и проверила оснасткой, но стенд НЕ поднимала: старт `web`
делает пробный вызов настоящей модели (`answerProbe`), а в этом прогоне продуктовые модели — только фейки. Поэтому
статус остаётся `НЕ ВЫПОЛНЕНА / not-deployed` — строки таблицы закрывает первый выпуск на стенд.
