# U4-method — mobile-first responsive UI для «КлипМейкер»: методика и детерминированные проверки

RUN_ID=uiux-20260925T081903Z · WORK_UNIT_ID=U4-method · исследование 2026-09-25 · код проекта не менялся.
Все источники открыты 2026-09-25 через WebFetch/WebSearch. Если утверждение не подтверждено источником, рядом стоит пометка **не проверено**.

## 0. Что уже есть в коде (снимок чтением, без запуска)

Проект: `projects/05-podcast-clips-opus`, коммит c32d795.
- `apps/web/src/app/layout.tsx:4` — `viewport = { width:'device-width', initialScale:1 }`. Нет `viewportFit`, `themeColor`, `interactiveWidget`. Зум не запрещён (это правильно).
- `apps/web/src/app/globals.css` (90 строк):
  - `:root { color-scheme: light }` — тёмной темы нет;
  - кнопки и инпуты `min-height:46px`, это ≥44;
  - `body` 16px, инпуты наследуют `font:inherit` → 16px, поэтому iOS не зумирует при фокусе;
  - `.landing { min-height:calc(100vh - 84px) }` — **vh, а не svh/dvh**;
  - `h1 { font-size:clamp(30px,4vw,54px) }` — пиксельные границы, и максимум 54 < 2×30. Это нарушает правило MDN для clamp (см. §1.1);
  - `.clip-preview { aspect-ratio:9/16 }` + `video { object-fit:contain }` — верно;
  - медиа-точки 900/600px; `@container`, `prefers-reduced-motion`, `prefers-color-scheme` и `safe-area` не используются;
  - мелкий текст 10–13px (`.eyebrow`, `.muted`, `.badge`) — это вопрос читаемости, а не WCAG-провал.
- Публичные `/c/{code}` (`server/short-link-handler.ts`) и `/g/{code}` (`server/guest-page.ts`) — это route handlers, отдающие HTML-строку со своим `<style>` и своим `<meta viewport>`. `globals.css` к ним НЕ применяется: проверять их нужно отдельно. `<video controls playsinline preload="none" poster=…>` — верно для iOS.
- Playwright в `node_modules` проекта не установлен. Браузеры есть в `~/.cache/ms-playwright` (chromium-1223/1234), а рабочая установка Playwright есть в соседнем проекте (см. память `playwright-and-tmux-on-this-machine.md`). `axe-core` не установлен.

## 1. Принципы 2025–2026 (с источниками)

### 1.1 Fluid typography и spacing через clamp()
- MDN, `clamp()`: «maximum allowed value is a relative length unit that is no less than twice the minimum», пример `font-size: clamp(1rem, 2.5vw, 2rem)`. Смысл правила: текст должен вырастать до 200% при зуме. https://developer.mozilla.org/en-US/docs/Web/CSS/clamp
- WCAG 2.2 Understanding 1.4.4 Resize Text требует увеличения до 200%. Отказ F94 — «incorrect use of viewport units to resize text»: чистые `vw` не реагируют на зум. https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html
- **Следствие для нас (проверяется детерминированно):** в каждом `clamp()` для `font-size` границы задаются в `rem` и `max ≥ 2×min`. Если min/max в px, пользовательская настройка размера шрифта не действует (**не проверено** на нашем стенде).

### 1.2 Container queries
- MDN: `container-type: inline-size` + `@container (width …)`. Стиль зависит от ширины контейнера, а не окна. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries
- Где это нужно у нас: карточка клипа живёт в сетке 1/2/3 колонки. Внутренняя раскладка карточки (кнопки в строку или в столбик) зависит от ширины колонки, а не экрана. Для раскладки страницы хватает `@media`.
- Точную дату Baseline для container queries в источнике не нашёл — **не проверено**. По памяти это Chrome 105 / Safari 16 / Firefox 110, 2023 г., тоже **не проверено**.

### 1.3 Тач-цели
- **WCAG 2.2 SC 2.5.8 (AA):** «at least 24 by 24 CSS pixels», с исключениями Spacing / Equivalent / Inline / User Agent Control / Essential. Для важных контролов рекомендуется 2.5.5 (AAA) — 44×44. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- **Apple HIG, Accessibility:** iOS «Default control size 44x44 pt, Minimum 28x28 pt». Отступы: ~12 pt вокруг элемента с рамкой, ~24 pt — без рамки. https://developer.apple.com/design/human-interface-guidelines/accessibility (текст взят из JSON-выгрузки HIG: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/accessibility.json)
- **Android:** «touch target size, of at least 48dp×48dp». https://developer.android.com/guide/topics/ui/accessibility/apps
- **web.dev:** ~48px («about 9mm»), зазор ~8px. https://web.dev/articles/accessible-tap-targets
- Страницу Material 3 (m3.material.io) рендерит JS, и WebFetch её не прочёл. Цифру 48dp подтверждает официальный Android-источник выше.
- **Вывод:** 24px — юридический минимум, 44px — цель продукта для основных действий, 48px — рекомендация Google. Для «Скачать», «Выбрать музыку», «Загрузить», «Войти» берём ≥44, для прочих ≥24 с зазором.

### 1.4 safe-area-inset (iOS)
- MDN `env()`: `env(safe-area-inset-top|right|bottom|left)`; на прямоугольных экранах значения `0px`. Пример: `padding-bottom: calc(1em + env(safe-area-inset-bottom))`. https://developer.mozilla.org/en-US/docs/Web/CSS/env
- Расширить страницу под «чёлку» позволяет `viewport-fit=cover`. MDN прямо не пишет, что без него значения нулевые, — **не проверено** на устройстве. В Next.js это поле `viewport.viewportFit`.
- Когда это нужно нам: только если появится липкая нижняя панель (sticky CTA «Скачать» на /g/, /c/). Без фиксированных элементов у краёв `cover` не нужен.

### 1.5 svh/dvh вместо vh
- MDN: `vh` сейчас ≡ `lvh` (большой viewport). Поэтому контент высотой `100vh` уходит под адресную строку, когда та показана. `dvh` «can cause the content to resize while a user is scrolling… performance hit». https://developer.mozilla.org/en-US/docs/Web/CSS/length
- web.dev: `svh/lvh/dvh` поддерживаются в Chrome 108+, Firefox 101+, Safari 15.4+; «dynamic viewport do not update at 60fps». https://web.dev/blog/viewport-units
- **Рекомендация:** для `min-height` экранов и hero — `svh`, с фолбэком на строке выше (`min-height:100vh; min-height:100svh`). `dvh` — только для модалок и полноэкранного плеера. У нас это `.landing`.
- Клавиатура на Android: мета-ключ `interactive-widget`. По умолчанию в Chrome 108+ действует `resizes-visual`, альтернативы — `resizes-content` и `overlays-content`. Работает только в Blink; на iOS не поддерживается. https://developer.chrome.com/blog/viewport-resize-behavior

### 1.6 prefers-reduced-motion
- MDN: значения `no-preference | reduce`, Baseline «since January 2020». https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- WCAG 2.3.3 (AAA): анимацию от взаимодействия можно отключить. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- Что это значит для нас: экран прогресса (стадии обработки), переходы, автоплей превью. При `reduce` не автоплеить видео-превью и убрать анимацию прогресса.

### 1.7 Тёмная тема
- Next.js `viewport.colorScheme` и `themeColor` с `media: '(prefers-color-scheme: dark)'`. https://nextjs.org/docs/app/api-reference/functions/generate-viewport
- Сейчас у нас `color-scheme: light`. Системные контролы останутся светлыми и в тёмной ОС — это консистентно, а не ошибка. Переход на тёмную тему требует проверить контраст обеих палитр (axe `color-contrast`).
- Как ведут себя Telegram/VK WebView при тёмной теме приложения для обычной ссылки (не Mini App), не нашёл — **не проверено**.

### 1.8 Формы: inputmode / autocomplete / зум iOS
- MDN `inputmode`: подсказка клавиатуре, не валидация. Лучше правильный `type` (`email`, `tel`, `url`). https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
- iOS Safari зумирует инпут при фокусе, если вычисленный font-size < 16px. Лечение — ≥16px на самом инпуте, а не `maximum-scale=1`/`user-scalable=no`: это ломает доступность. https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/ , https://defensivecss.dev/tip/input-zoom-safari/ . Документа Apple с порогом 16px не нашёл: это поведение описано сообществом, **официально не проверено**.
- **Ловушка:** пример в документации Next.js (`maximumScale:1, userScalable:false`, https://nextjs.org/docs/app/api-reference/functions/generate-viewport) нарушает axe `meta-viewport`. Правило проверяет, что нет `user-scalable=no` и `maximum-scale` не меньше 2; включено по умолчанию, тег wcag2aa / 1.4.4. https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- `autocomplete` (`email`, `current-password`, `new-password`) — это WCAG 1.3.5 Identify Input Purpose. Страницу 1.3.5 отдельно не открывал — **не проверено** в этом прогоне.

### 1.9 Видео 9:16 на узком экране и на десктопе
- Уже верно: `aspect-ratio:9/16` + `object-fit:contain` (MDN `aspect-ratio`/`object-fit` отдельно не открывал — **не проверено**, свойства общеизвестны).
- Риск на десктопе: карточка 9:16 во всю ширину колонки даёт высоту больше экрана. Нужен предел высоты: `max-height: 80svh; width:auto; margin-inline:auto` или `max-inline-size: calc(80svh * 9/16)`. Это инженерное решение — **не проверено** на стенде.
- iOS: `playsinline` обязателен для инлайн-воспроизведения на iPhone. Автоплей разрешён только `muted` (или без аудиодорожки), и видео играет только в зоне видимости. https://webkit.org/blog/6784/new-video-policies-for-ios/ — в `/g/` `playsinline` уже есть.
- WCAG 1.4.10 Reflow: 320 CSS px без двумерной прокрутки. Видео входит в исключения, но только само видео, а не страница. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html

### 1.10 Telegram / VK WebView — что достоверно
- Telegram: встроенный браузер есть во «all mobile and native desktop apps», вкладки можно сворачивать. https://telegram.org/blog/w3-browser-mini-app-store (дату поста на странице не проверял; по alternativeto это август 2024: https://alternativeto.net/news/2024/8/telegram-enhances-its-in-app-browser-adds-mini-app-store--improves-stories-and-more ).
- Переменные `--tg-safe-area-inset-*` и `--tg-viewport-stable-height` (Bot API 8.0) есть **только у Mini Apps**. Для обычных ссылок документации нет. https://core.telegram.org/bots/webapps — нам они НЕ доступны, полагаться на них нельзя.
- На каком движке встроенный браузер Telegram (WKWebView / SFSafariViewController на iOS, WebView / Custom Tabs на Android) — источники косвенные: issue TelegramMessenger/Telegram-iOS#1670, peter-iakovlev/Telegram#203. **Не проверено.**
- VK: официальной документации о встроенном браузере для внешних ссылок (UA, автоплей, скачивание файлов) не нашёл — **не проверено**.
- Практический вывод, без источника, это суждение: во встроенных браузерах типичные риски — скачивание файла (атрибут `download`, `Content-Disposition`) и изоляция cookies от основного браузера. Для нас это значит: гостевая `/g/` работает без входа, и это правильно. Проверять скачивание mp4 **руками на реальных Telegram iOS/Android и VK** — это слой 4.

## 2. Как проверять детерминированно (слой 1)

### 2.1 Инструменты: что можно и чего нельзя
| Инструмент | Что даёт | Ограничение (источник) |
|---|---|---|
| Playwright, эмуляция устройств | viewport, deviceScaleFactor, isMobile, hasTouch, UA, colorScheme, reducedMotion | «Mobile Safari» — это сборка WebKit Playwright, а не Safari Apple (https://playwright.dev/docs/emulation). Telegram/VK WebView не эмулируются вовсе |
| `@axe-core/playwright` | правила WCAG по тегам (`withTags`) | «many accessibility problems can only be discovered through manual testing» (https://playwright.dev/docs/accessibility-testing). **`target-size` (wcag22aa) по умолчанию ВЫКЛЮЧЕНО** — включать тегом `wcag22aa` явно (axe rule-descriptions) |
| Lighthouse CI | `categories:performance` minScore, `largest-contentful-paint` / `cumulative-layout-shift` maxNumericValue, `numberOfRuns`, агрегирование median / pessimistic (https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md) | throttling симулированный: Slow 4G = 150 мс RTT, 1,6 Мбит/с, CPU ×4; «suffers from edge cases» (https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md). Лабораторный LCP ≠ полевой p75 |
| Визуальная регрессия (`toHaveScreenshot`) | ловит «поехало» | «rendering can vary based on the host OS, version, settings, hardware, power source… headless mode» — эталон снимать в той же среде; нужны `maxDiffPixels` и маскирование динамики (https://playwright.dev/docs/test-snapshots) |

**Решение по визуальной регрессии для нас:** в ворота НЕ ставить. Постеры видео, счётчики, даты и шрифты системы делают её нестабильной, а среда на VPS не совпадает с CI. Скриншоты 320/390/768/1440 снимать как АРТЕФАКТ для глаза человека (слой 4) — без сравнения и без права валить сборку.

### 2.2 Предлагаемый набор проверок (7 правил)
Один скрипт `scripts/check-responsive.mjs` (Node + Playwright из соседней установки или `npx playwright`, Chromium + WebKit). axe подключается как `axe.min.js` через `page.addScriptTag`: пакет `axe-core` не имеет зависимостей, и это единственная новая dev-зависимость.

Запуск: `node scripts/check-responsive.mjs <BASE_URL выданный стендом> <code клипа> <guest_code>`. Маршруты: `/`, `/dashboard` (с тестовой сессией), `/dashboard/videos/{id}`, `/c/{code}`, `/g/{guest_code}`.
Ширины: **320, 360, 390, 414, 768, 1024, 1440**. Высота 640–900; isMobile+hasTouch для ≤414.
Коды возврата по правилу `guard-must-be-able-to-fail`:
- `0` — всё проверено;
- `1` — нарушение доказано, в выводе маршрут, ширина и селектор;
- `2` — проверка НЕ ВЫПОЛНЕНА (страница не 200, браузер не стартовал, пустой список целей, адрес не выдан стендом).

| # | Правило | Как измерить (детерминированно) | Порог | Источник порога |
|---|---|---|---|---|
| R1 | Нет горизонтального скролла | `document.documentElement.scrollWidth <= innerWidth` (MDN scrollWidth, https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollWidth); плюс поиск виновника: элементы с `getBoundingClientRect().right > innerWidth+1` | 0 px на всех 7 ширинах × 5 маршрутов | WCAG 1.4.10 (320 px) |
| R2 | Размер тач-целей | для видимых `a[href],button,input:not([type=hidden]),select,textarea,[role=button],summary,video[controls]`: `getBoundingClientRect()`. Инлайновые ссылки внутри `p` исключаются по правилу Inline | основные (`[data-primary]` или список селекторов) ≥44×44; прочие ≥24×24 либо зазор (круг 24px не пересекает соседа) | WCAG 2.5.8 / 2.5.5; Apple 44 pt |
| R3 | Нет перекрытий целей | попарное пересечение прямоугольников интерактивных элементов плюс `document.elementFromPoint(центр)` === сам элемент или его потомок | 0 пересечений; 0 перекрытых центров | суждение (**не проверено** источником как стандарт); это прямое следствие 2.5.8 Spacing |
| R4 | axe без нарушений | `axe.run` с `runOnly: tags ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']` на 390 и 1440; в светлой и тёмной схеме, если тема появится | 0 violations с impact serious/critical; moderate — список, но на первой итерации не валит (решение владельца) | axe; `meta-viewport` ловит запрет зума |
| R5 | iOS-зум и масштаб | computed `font-size` каждого `input,select,textarea` ≥16px; `<meta viewport>` без `user-scalable=no` и `maximum-scale<2`; у `<video>` есть `playsinline` | 100% элементов | css-tricks / defensivecss; axe meta-viewport; WebKit video policy |
| R6 | Видео 9:16 влезает | для каждого `video`/`.clip-preview`: `height <= innerHeight` на 1440×900 и 390×844; `abs(w/h − 9/16) < 0.01`; `object-fit` ∈ {contain, cover} | 100% | суждение по §1.9 |
| R7 | Статический линт CSS (без браузера) | grep по `globals.css`, `guest-page.ts`, `short-link-handler.ts`: (a) `\b100vh\b` без соседнего `svh/dvh` → нарушение; (b) `clamp(` в `font-size` с `px`-границами или max<2×min → нарушение; (c) `user-scalable=no|maximum-scale=1` → нарушение | 0 | MDN clamp, MDN length, axe |

Плюс **перф-ворота на Lighthouse CI**, отдельный шаг, потому что Lighthouse тяжёлый (~Chrome + lhci):
- мобильный пресет, `numberOfRuns: 3`, агрегирование `median`;
- `largest-contentful-paint` maxNumericValue 2500, `cumulative-layout-shift` max 0.1, `total-blocking-time` max 200 (TBT — лабораторная замена INP; порог 200 — **не проверено** как официальный);
- маршруты `/c/{code}` и `/g/{code}` — это первый экран пришедших из Telegram.
Если lhci ставить не хотим: CLS и LCP можно снять в том же Playwright через `PerformanceObserver` (`largest-contentful-paint`, `layout-shift`) с `page.route`-троттлингом. Это легче, но хуже откалибровано — **не проверено**.

**Испытание стражей на способность падать** (обязательно по `guard-must-be-able-to-fail`), по одному внедрённому дефекту на правило:
- R1: вставить `<div style="width:400px">` на 320 → должен быть `1`;
- R2: `button{min-height:0;padding:2px}` → `1`;
- R5: `input{font-size:14px}` → `1`;
- R7: вернуть `100vh` → `1`;
- пустой список маршрутов или 404 → `2`.

### 2.3 Что остаётся суждением (слой 3–4)
- Основной путь проходится одной рукой: зона большого пальца, порядок действий. Эмулятор не измеряет хват, это прогон человеком на телефоне.
- Реальные Telegram iOS/Android и VK WebView: открытие `/c/`, воспроизведение, **скачивание mp4**, возврат назад, тёмная тема приложения. Эмуляции нет вовсе (§2.1).
- Настоящий Safari на iPhone: адресная строка, `svh`, клавиатура, чёлка. Эмуляция WebKit ≠ Safari.
- Качество иерархии и читаемость мелкого текста 10–13px; «не выглядит ли кабинет как десктоп, сжатый в телефон».
- Полевые Core Web Vitals (p75 реальных пользователей). Лаборатория даёт только оценку.
- Осмысленность текстов ошибок и состояний (выполняется / успех / отказ) на узком экране.

## 3. Критерии готовности «mobile-friendly, very responsive» (измеримые)

| # | Критерий | Порог | Чем доказывается | Слой |
|---|---|---|---|---|
| G1 | Нет горизонтального скролла | 0 px на 320, 360, 390, 414, 768, 1024, 1440 × все 5 маршрутов | R1 | 1 |
| G2 | Тач-цели | основные действия ≥44×44 CSS px; все цели ≥24×24 или с зазором по 2.5.8 | R2+R3 | 1 |
| G3 | Доступность | axe (wcag2a…wcag22aa, `target-size` включён явно): 0 serious/critical | R4 | 1 |
| G4 | Нет зума-ловушки, зум не запрещён | инпуты ≥16px; meta-viewport проходит axe; `playsinline` у всех video | R5 | 1 |
| G5 | Видео 9:16 целиком в экране | высота ≤ innerHeight на 390×844 и 1440×900 | R6 | 1 |
| G6 | Высота экранов без vh-ловушки, текст масштабируется | 0 `100vh` без svh/dvh; все clamp в rem и max≥2×min | R7 | 1 |
| G7 | Скорость первого экрана `/c/`, `/g/` | лаборатория, Lighthouse mobile Slow 4G, медиана 3 прогонов: LCP ≤2500 мс, CLS ≤0,1, TBT ≤200 мс. Пороги LCP/CLS/INP web.dev «good» — p75, одинаковые для mobile/desktop (https://web.dev/articles/defining-core-web-vitals-thresholds) | lhci | 1 (лаб.), поле — 4 |
| G8 | reduced-motion | при `reducedMotion:'reduce'` нет автоплея превью и `animation-duration` > 0.01s у элементов прогресса | Playwright emulateMedia | 1 |
| G9 | Одна рука | основной путь (открыть ссылку из TG → посмотреть → скачать; в кабинете: загрузить → дождаться → выбрать музыку → скачать) проходится большим пальцем без перехвата, ≤N тапов (N фиксирует владелец) | ручной прогон на 1 iPhone + 1 Android, запись в квитанцию | 4 |
| G10 | Встроенные браузеры | /c/ и /g/ открываются, видео играет, mp4 скачивается (или есть видимый фолбэк «Открыть в браузере») в Telegram iOS, Telegram Android, VK Android | ручной прогон, скриншоты | 4 |

Квитанция: одна таблица, по строке на критерий — ширина / маршрут / результат / адрес стенда / коммит. Адрес стенда берётся ВЫДАННЫЙ развёртыванием, не localhost (`deployment-seams.md`).

## 4. Что уже видно как кандидаты в правки (не выполнено, код не трогался)
1. `.landing min-height: calc(100vh - 84px)` → `100svh` с фолбэком (G6).
2. `h1 clamp(30px,4vw,54px)`, `.landing h1 clamp(36px,4.5vw,62px)`, на /c/ `clamp(28px,5vw,44px)`, на /g/ `clamp(26px,5vw,42px)` — px-границы, max < 2×min (G6). Предложение: `clamp(1.75rem, 1.2rem + 3vw, 3.5rem)`.
3. На /g/ и /c/ ограничить высоту 9:16-превью на десктопе (G5) — проверить R6 на стенде.
4. Тёмная тема и safe-area — только если появится решение владельца / sticky CTA.

## Ограничения этого исследования
- Страница Material 3 (JS) и отдельные страницы MDN для `aspect-ratio`/`object-fit`, WCAG 1.3.5 не прочитаны. Движки Telegram/VK WebView — **не проверено**.
- Скрипт R1–R7 не написан и не запускался: пороги — предложение, их поведение на стенде не измерено.

Status: completed
