# Контракт встраиваемого виджета — N6 «Суфлёр»

Дата: 2026-09-25. Правило: [`embeddable-widget.md`](../../../.claude/rules/embeddable-widget.md).
Проверка: `node ../../.claude/hooks/check-embed-contract.cjs .` · Решение: ADR-005.

**Встраиваемый виджет:** да
**Origin виджета:** https://suffler.example
**Origin хозяйской страницы:** http://localhost:8099
**Учётные данные:** нет
**Разрешённые origin:** список `allowed_origin` каждого бота (точное совпадение origin; джокера `*` нет); для стенда — http://localhost:8099
**Проверка на чужой странице:** НЕ ВЫПОЛНЕНА
**Причина:** not-deployed

Виджет — ПРОДУКТ целиком: он живёт на сайте клиента, и все три класса отказа проявляются только там.
Кода ещё нет (Phase 1), поэтому проверка честно НЕ ВЫПОЛНЕНА. `https://suffler.example` —
заполнитель: боевой origin выдаёт развёртывание (`N6_PUBLIC_ORIGIN`), и при проверке берётся ВЫДАННЫЙ
адрес, а не известный заранее.

## Классы отказа

| Класс | Статус | Признак у клиента | Лечение | Доказательство |
|---|---|---|---|---|
| перекрёстный-запрос | НЕ ПРОВЕРЕН | окно открылось, ответа нет; в консоли клиента `blocked by CORS policy`, в нашем журнале запрос отвечен | `Access-Control-Allow-Origin` = origin хозяина из `allowed_origin` бота, `Vary: Origin`, `OPTIONS` → 204 с `Allow-Methods: GET, POST` и `Allow-Headers: Content-Type`; `credentials: 'omit'`; заголовок ставит только `web`, Caddy — нет (двойной ACAO ломал N1) | — |
| протечка-стилей | НЕ ПРОВЕРЕН | пузырь смещён или окно «разъехалось» только на сайте клиента; или наши стили задели страницу хозяина | открытый Shadow DOM, `all: initial` на корне, свои `px`, `adoptedStyleSheets`; ни одного глобального селектора | — |
| политика-безопасности | НЕ ПРОВЕРЕН | виджет не появляется вообще; `Refused to load … Content Security Policy` | нет инлайновых скриптов и style-атрибутов в документе хозяина; хозяин разрешает `script-src <origin>`, `connect-src <origin>`, `img-src <origin> data:` (публикуется на экране установки, FR-WIDGET-003) | — |

## Оснастка, которой будет закрыта проверка (Completion, шаг E2E)

Страница `host.html`, раздаваемая по HTTP на порту 8099 (другой origin), вставляет виджет по адресу,
который ВЫДАЛО развёртывание; отдаёт `Content-Security-Policy: default-src 'none'; script-src <origin>;
connect-src <origin>; img-src <origin> data:; style-src 'self'` и несёт враждебный CSS (`* { box-sizing:
content-box !important; font-size: 30px !important }`, `div { position: relative; z-index: 1 }`,
`img { width: 100% }`). Проверка — Playwright: пузырь виден, вопрос получает ответ с плашкой,
в консоли 0 ошибок CSP/CORS; отдельно — домен вне списка получает 403 без ACAO.
