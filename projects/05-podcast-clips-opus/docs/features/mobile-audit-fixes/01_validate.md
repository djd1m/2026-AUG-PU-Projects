# Валидация постановки `00_brief_codex.md` — фича 24 `mobile-audit-fixes`

Валидатор: Claude (Anthropic), кросс-семейная схема. Дата: 2026-09-25. Код не менялся.
Источники сверки: `.responsive-artifacts/baseline2/report.json` (85 страниц, errors=[]),
`scripts/check-responsive.mjs`, `scripts/responsive/{rules,input}.mjs`, `tests/browser/responsive-check.test.ts`,
`tests/*.test.ts`, `scripts/test-*-mutations.mjs`, `apps/web/src/**`, навык `responsive-ui`, базовая линия.

## Вердикт: READY WITH FIXES

Постановка покрывает все классы нарушений. Но в ней три фактические ошибки: R9 задан на размерах,
которых в приборе нет; R4 отнесён не к тому блоку; фолбэк `100vh` противоречит линтеру R7. Кроме того,
есть пять мест, где буквальное исполнение ломает существующие тесты. Все правки ниже — точечные
правки текста постановки. Перепроектировать ничего не нужно.

## Группировка error-нарушений базовой линии (rule / route / селектор)

| Правило | Маршрут | Элемент | Движки/сценарии | В постановке |
|---|---|---|---|---|
| R2 | `/`, `/c/`, `/dashboard`, экран записи | `nav > a:1` (логотип) | все 17 сценариев | B1 ✅ |
| R2 | `/dashboard`, экран записи | `nav > a:2` («Мои записи») | все | B1 ✅ |
| R2 | экран записи | `main > header > a` («← Все записи») | все | B1 ✅ |
| R2 | экран записи | `details > summary` ×4 карточки | все | B2 ✅ |
| R2 | экран записи | `label > select` ×4 | все | B2 ✅ (WebKit — риск, правка 6) |
| R2 | экран записи | `section:4 form fieldset label:6 > input` (чекбокс гостя) | только ≥412 (на узких подпись переносится и даёт высоту) | B4 ⚠ — стиль ИНЛАЙНОВЫЙ, правка 5 |
| R2 | `/g/` | `main > a:1` (логотип-ссылка), `footer > a:1` | все | B1 ✅ |
| R4 serious | `/dashboard` | `section:2 > div:2 > p` и `small` = `.upload-controls p.muted` / `small.muted` на `#eaf0df` | все | D ⚠ — назван не тот блок, правка 3 |
| R5 | `/` | 3 поля `form.auth-card` (14 px) | все | C ✅ |
| R5 | экран записи | `select` ×4 (13,33 px) | только Chromium | C ✅ |
| R8 | `/`, `/c/`, `/g/` | `body`, `h1`, `p`, `label` (все выборки, ratio 1.0) | width-390, оба движка | A ✅ (риски — правки 7, 8) |

**Ответ на вопрос 1:** каждое error-нарушение покрыто хотя бы одним пунктом. Пропусков по существу
нет. Есть две неточности, из-за которых Codex исправит не то место:
- **R4:** нарушение находится в `.upload-panel`, а не в блоке лимитов. На белом `--muted` #65716a даёт
  5.09:1 и проходит. Не проходит он на `#eaf0df` — там 4.37:1.
- **R2, чекбокс гостя:** размер задаёт инлайновый `style` в `GuestPacks.tsx` (`checkboxStyle`, стиль
  подписи `padding:'8px 0'`). CSS из `globals.css` его не перекроет.

Базовая линия называет «Выйти» в шапке. Такой ссылки нет: вторая ссылка шапки — «Мои записи».

## Ответ на вопрос 2: реализуемость R9

В `scenarios()` (check-responsive.mjs:7) фактические окна такие (из `report.pages`):
- WebKit: `iPhone 13` = **390×664**, `iPhone SE` = **320×568**, width-N = N×844 (1440×900).
- Chromium: `Pixel 7` = 412×839, width-N = N×844.

Совпадает с постановкой только **390×844** (`width-390`, оба движка). **375×667 и 360×740 в приборе
нет.** Нужные дескрипторы в Playwright 1.60 при этом есть: `'iPhone SE (3rd gen)'` = 375×667 (WebKit)
и `'Galaxy S8'` = 360×740 (Chromium). Запрет «ширины прибора НЕ трогать» мешает добавить эти размеры
в `widths`, да и делать этого не нужно: `tests/responsive-check.test.ts` сравнивает `parseArgs().widths`
со списком `[320,…,1440]` через `toEqual`.

Route-шаблона у правила сейчас нет. `domRules/axeRule/textZoomRule` получают только `page`, а маршрут
известен лишь в цикле `main()`, причём в конкретном виде (`/c/${short_code}` из `validateFixture`).
«Конфигурации прибора» как файла не существует. Если формулировку не уточнить, Codex, вероятно,
заведёт новый CLI-аргумент, а `parseArgs` отвергает неизвестные ключи. Или заведёт JSON-файл.

Второе системное обстоятельство касается порядка. В `domRules` правила R3 и R6 делают
`scrollIntoView` страницы. Если R9 выполнить после них, «без прокрутки» будет проверяться на уже
прокрученной странице. Это даст ложные срабатывания и ложные пропуски.

## Обязательные правки постановки

1. **R9, размеры и движки (раздел «Прибор»).** Заменить «На размерах 390×844, 375×667, 360×740» на:
   > R9 выполняется в ОТДЕЛЬНЫХ сценариях первого экрана, не меняя `widths` и `scenarios()`:
   > `export const FIRST_SCREEN_VIEWPORTS = [{w:390,h:844},{w:375,h:667},{w:360,h:740}]`. Каждый
   > выполняется в ОБОИХ движках с `isMobile:true, hasTouch:true` (явный `viewport`, а не дескриптор
   > устройства, чтобы размеры совпадали в обоих движках). Имя сценария — `first-screen-<w>x<h>`.
   > В этих контекстах выполняется ТОЛЬКО R9, по маршрутам из `FIRST_SCREEN_ACTIONS`. Страница
   > попадает в `report.pages` с этим именем сценария, скриншот делается не fullPage.
   > Существующие сценарии и их правила не меняются.

2. **R9, route-шаблон и место конфигурации.** Заменить «из конфигурации прибора» на:
   > Константа в `scripts/responsive/rules.mjs`:
   > `export const FIRST_SCREEN_ACTIONS = [{ pattern: /^\/$/, selector: 'form.auth-card button:not([type=button])' }, { pattern: /^\/c\/[\w-]+$/, selector: '.cta' }]`
   > и функция `firstScreenSelector(route)`, возвращающая селектор или `null`. Маршрут без записи
   > (`/g/…`, `/dashboard…`) R9 не проверяется, и это видно из списка. Новых CLI-аргументов и файлов
   > конфигурации не заводить. Добавить unit-тест в `tests/responsive-check.test.ts` (без браузера):
   > `/`→селектор формы, `/c/abc`→`.cta`, `/c/`→null, `/g/x`→null, `/dashboard`→null.
   > Сигнатура правила: `firstScreenRule(page, selector)`.

3. **R9, порядок и видимость.** Добавить:
   > `firstScreenRule` вызывается сразу после `navigate` и `routePreconditions`, ДО любых других
   > правил и скриншота. Страницу не прокручивать. В находку записывать `scrollY`, `rect` и
   > `innerHeight`. Видимость проверяется внутри правила: `checkVisibility`, если он есть; иначе
   > `display`, `visibility`, `opacity` по предкам и `rect.width>0 && rect.height>0`. `disabled`
   > видимости НЕ отменяет. Условие: `rect.top >= 0 && rect.bottom <= innerHeight`. Если по селектору
   > несколько элементов, проверяется первый ВИДИМЫЙ. Если видимых нет, это
   > `R9 «действие не найдено»`. Все находки R9 — `severity:'error'`.

   Тесты: фикстуры `tests/fixtures/responsive/r9-below.html`, `r9-above.html`, `r9-missing.html` (имена
   проходят фильтр тестового сервера `^[a-z0-9-]+\.html$`). Прогон при 390×844 и 360×740: хелпер
   `fixture()` жёстко задаёт 390×844, поэтому нужен параметр viewport. Мутаций две, и обе строки идут
   в отчёт: (а) убрать `rect.bottom <= innerHeight` → `r9-below` красный; (б) заменить
   «не найдено → находка» на `return []` → `r9-missing` красный.

4. **D, контраст — переписать адрес дефекта.** Заменить первое предложение D на:
   > Нарушение R4 serious — это `.upload-controls p.muted` и `small.muted` на фоне `.upload-panel`
   > (`#eaf0df`): 4.37:1. На белом тот же цвет даёт 5.09:1 и проходит. Задать `--muted: #56615a`
   > (5.54 на `#eaf0df`, 6.05 на `--paper`, 6.46 на белом). Разметку `<small className="muted">` не
   > менять: `tests/pack-shot-uploader.test.ts` ищет ровно `<small class="muted">`.

5. **B4, чекбоксы — назвать инлайновые стили.** Добавить:
   > В `apps/web/src/app/clips/GuestPacks.tsx` удалить `checkboxStyle` (`width:20, minHeight:20, margin…`)
   > и инлайновые `style` у `label` с чекбоксом (`display:block; padding:'8px 0'` и `margin:'16px 0'`).
   > Вместо них — класс (например `.check`) из `globals.css`: `display:flex; gap:.75rem;
   > align-items:center; min-height:2.75rem`. Инлайновый `style` перекрывает любой CSS-файл.
   > Ограничение по селектору (`input:not([type=checkbox]):not([type=radio]):not([type=file])`)
   > распространить на ВСЁ правило `input{…}` (`min-height:46px`, `padding`, `margin`, `border`), а не
   > только на `width`. Иначе чекбокс останется высотой 46 px с полями.
   > Число чекбоксов в `Uploader.tsx` должно остаться 3 (`tests/pack-shot-uploader.test.ts`).

6. **B2, `select` в WebKit.** Добавить:
   > WebKit у `select` с нативным оформлением игнорирует `min-height/height`. Задать `select`
   > `appearance:none; -webkit-appearance:none; min-height:2.75rem; padding-inline-end:2rem` и
   > стрелку (например `label::after` или `background-image` с data-URI SVG). CSP у Next-страниц
   > нет, data-URI допустим. В отчёте нужен результат R2 для `select` в WebKit, а не только в Chromium.

7. **A3, `100vh` — убрать фолбэк.** Заменить «`min-height: 100svh` (с фолбэком `100vh` строкой выше)» на:
   > `min-height: calc(100svh - <высота шапки в rem>)` без строки с `100vh`. `lintCSS` ищет `\b100vh\b`
   > в любом месте, поэтому фолбэк оставит предупреждение R7. `svh` поддерживается в Safari 15.4+ и
   > Chrome 108+ — это достаточно.

8. **A1, `clamp` и R8 — дать проверяемую формулу.** Добавить:
   > R8 измеряется при ширине 390, и vw-часть при увеличении корня не растёт. Для
   > `clamp(MIN rem, A rem + B vw, MAX rem)` при 390 px нужно одно из двух: предпочтительное значение
   > ≤ MIN (срабатывает rem-минимум), либо `B·3.9 ≤ 0.25·A·16`. Иначе отношение станет < 1.8 (пример:
   > `1rem + 5vw` → 35.5→51.5 px = 1.45). Все `font-size` в `rem`/`em`, включая `.auth-card label`,
   > `.muted`, `.eyebrow`, `.intro`, `.text-button`, `.upload-controls label`, `.video-id`,
   > `.navigation`. В SSR `body{font:1.125rem/1.6 …}`.
   > После перевода проверка «Скролл при 200%» (тоже R8, error) станет достижимой: на `/` слово
   > «заслуживает» при 72 px не уместится в 358 px. Заголовкам лендинга и `.intro` нужны
   > `overflow-wrap:anywhere; hyphens:auto` (`lang="ru"` уже есть), а `h1` — минимум не больше `2rem`.

9. **C, порядок каскада `font`.** Добавить:
   > Одно правило: `input, select, textarea { font: inherit; font-size: max(1rem, 16px); }`, в этом
   > порядке и в одном блоке. Шорткат `font:inherit` в отдельном правиле ниже сбросит `font-size`
   > обратно к подписи (14 px). В существующем `button,input{font:inherit}` нет `select`, отсюда
   > 13.33 px.

10. **Границы — список несущих литералов тестов (раздел «Границы»).** Заменить общий `grep -rn` на явный
    перечень. Постановка его не даёт, а каждый пункт ниже ломается буквальным исполнением D/F/A:
    - `tests/retention.test.ts:83` ждёт `<button disabled=""`. Класс `.danger` ставить в JSX ПОСЛЕ
      `disabled` (`<button disabled={…} className="danger">`). Иначе рендер даст
      `<button class="danger" disabled="">`, и тест упадёт.
    - `tests/limits.test.ts:48`: HTML `LimitsPanel` не должен содержать `600`. Никаких инлайновых
      `font-weight:600`, только классы.
    - `tests/limits.test.ts:61`: HTML `ProInterest` не должен совпадать с `\d{1,2}[./]\d{1,2}` и
      `<form|<input`. Инлайновый `style` с `1.5rem` роняет тест, поэтому в `ProInterest.tsx` нельзя
      добавлять инлайновые стили.
    - `tests/short-link.test.ts:21` и `tests/guest-pack.test.ts:79` ищут литерал
      `@media(max-width:600px)` — без пробела и в px. Этот медиазапрос в SSR сохранить дословно.
    - `tests/short-link.test.ts:28` ждёт, что на `/c/` нет `<script>`. R9-фикс для `/c/` делать только
      разметкой и CSS.
    - Якоря мутаций: `guest-page.ts` — строка `<meta name="robots" content="noindex, nofollow">`;
      `AccountDeletion.tsx` — `Удаление необратимо:`. Текст внутри не менять.
    - `tests/clip-music-choice.test.ts` ждёт `<select[^>]*disabled` и ровно 9 `aria-label="Послушать `.
    - `tests/limits.test.ts:47` ждёт строку «Осталось на сегодня». При компактном виде (F2) заголовок
      оставить.

11. **CSP (вопрос 3) — уточнить запрет.** Заменить «CSP не ослаблять» на:
    > Заголовки `Content-Security-Policy` в `short-link-handler.ts:40` и `guest-page.ts:74` не менять
    > ни одним символом. CSS остаётся во встроенном `<style>`: внешние таблицы стилей там блокирует
    > `default-src 'none'`. В `<style>` не добавлять `nonce`, в `style-src` не добавлять `nonce-…`:
    > появление nonce отключает `'unsafe-inline'`. В `<meta name=viewport>` можно дописать только
    > `viewport-fit=cover`, никаких `maximum-scale` и `user-scalable` (это R5).

12. **G — место и согласование.** Заменить «`packages/shared` (или `apps/web/src/lib`)» на
    `apps/web/src/lib/plural-ru.ts`. `@clipmaker/shared` резолвится через `dist/` и требует сборки
    пакета. Юнит-тест — `tests/plural-ru.test.ts`. Согласование задать правилом:
    > Притяжательное «ваш» при `n%10==1 && n%100!=11`, иначе «ваши» (ваш 1/21/101 момент, ваши
    > 2/5/11/111 …). Имя гостя по-прежнему идёт через `escapeHtml`.

    Шаблон grep в G ловит только `${…}` и пропускает JSX `{n} слово`. Проверить JSX вручную (найдено
    только `{remaining} ч.` — сокращение, склонение не нужно).

## Необязательные правки

1. Для прибора R9 на 390×844 слабее реальности: у Safari iPhone 13 видимое окно 390×664 (дескриптор
   `iPhone 13`). Можно дополнительно выводить R9 как `warning` на существующем сценарии `iPhone 13`,
   чтобы видеть реальный запас. Решение за координатором.
2. `/c/` для E2: предпочесть порядок в DOM (заголовок → `.cta` → превью, либо превью `max-height:
   min(40svh, …)`) порядку через `order` в сетке. Для скринридера и Tab порядок в DOM должен совпадать
   с визуальным. То же для формы на `/`.
3. `#interest-login` на `/g/` (сейчас `hidden`) при показе станет целью R2. Включить его в B1:
   все `a` вне `p` на `/g/` → `min-height:2.75rem; display:inline-flex`.
4. Предупреждение R4 (контраст `nav .brand span` #dcefbb на #305d45) — это `incomplete`: реальное
   отношение 6.16:1. Не трогать.
5. В 07_code_report попросить таблицу «правило/маршрут/селектор → файл:строка правки», повторяющую
   таблицу выше. Координатору так проще сверить повторный прогон прибора с базовой линией.
6. В базовой линии (`docs/measurements/2026-09-25-responsive-baseline.md`) исправить «блок лимитов» →
   `.upload-panel` и «Выйти» → «Мои записи». Документ править координатору, не Codex.

Status: completed
