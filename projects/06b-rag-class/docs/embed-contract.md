# Контракт встраиваемого виджета — N6b

**Встраиваемый виджет:** да
**Origin виджета:** https://n6b-ui.test
**Origin хозяйской страницы:** https://widget-host.test
**Учётные данные:** нет
**Разрешённые origin:** https://widget-host.test
**Проверка на чужой странице:** ВЫПОЛНЕНА
**Ограничение:** публичный стенд ещё не развёрнут; его release-gate проверка остаётся отдельно. Проверенный origin виджета: https://n6b-ui.test, хозяина: https://widget-host.test.

Заголовки описывают проверенную Docker-пару. Production deployment URL: `https://n6b.194.85.249.105.sslip.io`, его проверка не заявлена. Политика: список на бота, пустой список закрыт.

Объявление Фазы 1 (2026-09-30), решения — ADR-007 (origin), FR-n6b-8 (виджет). Проверка обязана пройти на странице ЧУЖОГО
origin (другой порт достаточен), вставляющей `w.js` по адресу, выданному развёртыванием, с ограничительным CSP и враждебным
CSS. Публичного стенда ещё нет. Классы ниже проверены на production-образе в изолированном Docker, без заявки на публичное развёртывание.

Директивы CSP, которые хозяин обязан разрешить: `script-src https://n6b.194.85.249.105.sslip.io` ·
`connect-src https://n6b.194.85.249.105.sslip.io`. Инлайновых `<script>`/`<style>` виджет не требует. Стили — только
`adoptedStyleSheets` внутри Shadow DOM, файл стилей не грузится, поэтому `style-src` для нашего origin не нужен; это
утверждение проверяется на стенде под ограничительным CSP без `style-src` для нашего origin (класс «политика-безопасности»).
До первого вопроса виджет показывает уведомление о внешней модели (OWN-06B-002).

F09 implementation-1 (2026-10-02): `/w.js` собирается TypeScript только при production build Next;
production start не импортирует TypeScript. Все запросы, включая keepalive impression/tamper,
используют `credentials: omit`. Конфиг передаёт серверное уведомление; до успешной загрузки ввод
закрыт. Для preflight и POST ключ бота передаётся в `?bot=public_id`, необязательный `body.bot`
обязан совпадать. Origin принимается как схема+хост+порт, без пути/query/fragment; публикационная
форма по-прежнему может нормализовать полный URL. Бейдж ведёт на будущий маршрут F10 `/r/b/{public_id}`.
Local build/typecheck/unit/mutation evidence: `tests/artifacts/widget/`; браузерные классы ниже
подтверждены последующим actual Docker UI2 по frozen source. Локальные unit/build сами по себе не доказывали CSP, CSS isolation или браузерный CORS.

## Классы отказа

| Класс | Статус | Признак у клиента | Лечение | Доказательство |
|---|---|---|---|---|
| перекрёстный-запрос | ПРОВЕРЕН | виджет виден, ответы не приходят, в консоли `blocked by CORS policy` | ACAO = origin хозяина из списка бота, `OPTIONS` → 204, без `credentials`, заголовок ставит только web | https://widget-host.test/ · 2026-10-02 UI2 · `tests/artifacts/widget/ui-output/report.json` |
| протечка-стилей | ПРОВЕРЕН | вёрстка виджета едет у клиента или виджет ломает страницу хозяина | Shadow DOM, `all: initial` на корне, свои единицы | https://widget-host.test/ · 2026-10-02 UI2 · `tests/artifacts/widget/ui-output/report.json` |
| политика-безопасности | ПРОВЕРЕН | виджет не появляется, в консоли `Refused to load … Content Security Policy` | бандл без инлайна, стили только через `adoptedStyleSheets`, опубликованный список директив | https://widget-host.test/ · 2026-10-02 UI2 · `tests/artifacts/widget/ui-output/report.json` |

## Квитанция F09

Source `80b4e35c4dbab99316c633fa95c6d887f0b741a2`; image `sha256:82460803f628576175aac1dc260f8df39d8938d4f6defff683034100d3ccecc2`; UI2 `2026-10-02T23:55:07.911Z`. Реальный OPTIONS204 и POST200, ACAO строго host, credentialsheader отсутствует и cookie не передана. CSP default-src none, script/connect только widgetorigin, style-src только self; adoptedStyleSheets безinline. HostileCSS не протекает;8скриншотов. Бейдж виден collapsed/afterclose, tamper восстанавливается,impressionодин; paidactiveбезбейджа. Ask использует test-only binding настоящего handler/PaidGateway/PG к FakeProvider, config/events/w.js production. Config транспорт задержан250мс; браузерные request routing/fulfill отсутствуют. Liveprovider/calibration и публичныйстенд не заявлены. UI1 failed-наблюдение OPTIONS сохранено, не переписано.
