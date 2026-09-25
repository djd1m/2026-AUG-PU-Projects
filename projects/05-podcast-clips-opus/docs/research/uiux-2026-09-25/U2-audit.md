# U2-audit — mobile/responsive аудит «КлипМейкер»

RUN_ID=uiux-20260925T081903Z · WORK_UNIT_ID=U2-audit · 2026-09-25
Источник кода: projects/05-podcast-clips-opus (HEAD c32d795). Стенд: https://clipmkr.ru.
Инструмент: Playwright 1.60 (chromium-1223, эмуляция isMobile/hasTouch; **не** WebKit — поведение iOS Safari (автозум, rubber-band) выведено из CSS, а не наблюдено).
Скрипт: `/tmp/claude-0/-home-dz-projects-2026-2026-AUG-PU-Projects-2026-AUG-PU-Projects/9a440204-7fe6-43fe-8d49-eaf9c30e3498/scratchpad/uiux/audit.cjs`, сырые замеры: `/tmp/claude-0/-home-dz-projects-2026-2026-AUG-PU-Projects-2026-AUG-PU-Projects/9a440204-7fe6-43fe-8d49-eaf9c30e3498/scratchpad/uiux/measure.json`, скриншоты: `/tmp/claude-0/-home-dz-projects-2026-2026-AUG-PU-Projects-2026-AUG-PU-Projects/9a440204-7fe6-43fe-8d49-eaf9c30e3498/scratchpad/uiux/shots/` (29 шт., `<device>-<page>-fold|full.png`, `<device>-upload-panel.png`, `iphone13-home-dark.png`).
Устройства: iphone13 390×844 @3x, android360 360×740 @3x, ipad768 768×1024 @2x, desktop1280 1280×800.
Одноразовый аккаунт: ui-audit-1790324453228@example.ru (случайный пароль, нигде не сохранён; ничего не загружено). Экран детали записи/ClipCard/GuestPacks/гостевая /g на живом стенде **не сняты** (нет записей у нового аккаунта) — по ним только анализ кода.

## Замеры (measure.json)

| Страница | Гориз. скролл (scrollWidth vs innerWidth) | Высота страницы | Цели <44px | Шрифт инпутов |
|---|---|---|---|---|
| `/` все 4 устройства | нет (390/390, 360/360, 768/768, 1280/1280) | 1126 (iphone), 1203 (360) | ссылка-логотип 184×34 | **14px** у email/password/partner_code |
| `/c/CTDUUG` все 4 | нет | 892 (iphone), 921 (360) | ссылка «◧ КлипМейкер» 156×21 | — |
| `/dashboard` все 4 | нет | **3360** (iphone), **3782** (360), 2383 (ipad), 2007 (desktop) | логотип 184×34, «Мои записи» **85×22** | file input 14px |
| dark mode (`colorScheme:dark`) | — | — | — | фон остаётся rgb(247,248,243) — тёмной темы нет |

Минимальный размер текста на `/` и `/dashboard` — 11px (`.eyebrow`), на `/c/` — 18px.

## Таблица проблем

| # | Серьёзность | Где (код) | Что видно, на каком устройстве | Как чинить |
|---|---|---|---|---|
| 1 | **high** | `apps/web/src/app/globals.css:11` (`input { width:100%; min-height:46px; margin:6px 0 16px }`) применяется и к `type=checkbox`; `apps/web/src/app/upload/Uploader.tsx:54-60`, `apps/web/src/app/dashboard/AccountDeletion.tsx:40` | Чекбоксы становятся блоком на всю ширину, квадрат центрирован на отдельной строке, а подпись — строкой ниже; визуально чекбокс относится к предыдущему пункту. Все устройства: `iphone13-upload-panel.png`, `desktop1280-dashboard-full.png` (у «Убрать паузы» подпись склеена с кнопкой «Создать клипы» в одну строку; «Подтверждаю необратимое удаление» — с кнопкой удаления) | Сузить селектор: `input:not([type=checkbox]):not([type=radio]):not([type=file])`; для чекбоксов — `label.check{display:flex;gap:10px;align-items:center;min-height:44px}` + `accent-color:var(--green)` |
| 2 | **high** | `apps/web/src/app/globals.css:5` (`input{font:inherit}`) + `:28` (`.auth-card label{font-size:14px}`), `:35` | Поля ввода наследуют 14px от label (замер: email/password/partner_code font=14px). На iOS Safari фокус в поле <16px вызывает автозум страницы — на форме входа это первое касание пользователя. Все мобильные | `input,select,textarea{font-size:16px}` (или `max(16px,1em)`) отдельно от label |
| 3 | **high** | `apps/web/src/app/clips/ClipMusicChoice.tsx:24` — `<select>` без стилей; в `globals.css:5` `select` не входит в `button,input{font:inherit}` | select получит UA-шрифт ~13.3px → тот же автозум iOS, высота ~20px (<44). По коду; живой экран не снят (нет клипов) | добавить `select` в правило шрифта и дать `min-height:44px`, `width:100%` |
| 4 | medium | `apps/web/src/app/dashboard/page.tsx:19` — порядок: LimitsPanel → Uploader → ProInterest → PartnerPanel → VideoList → AccountDeletion | На телефоне главное действие (загрузка) начинается ниже первого экрана после трёх карточек лимитов; «Ваши записи» — на ~2/3 страницы высотой 3360–3782px. `iphone13-dashboard-full.png`, `android360-dashboard-full.png`, `iphone13-dashboard-fold.png` | Мобильный порядок: Uploader/записи первыми; лимиты — компактная строка; партнёрку и удаление аккаунта — в свёрнутые `<details>` или отдельную страницу «Настройки» |
| 5 | medium | `apps/web/src/app/globals.css:88-89` (`.partner-counters` minmax(160px) + `overflow-wrap:anywhere`) | Слова рвутся посреди: «Минут расшифровк/и», «Приглашённ/ые гости» на 390 и 360. `iphone13-dashboard-full.png` | `overflow-wrap:break-word` + `hyphens:auto` (lang=ru уже есть), или 1 колонка/горизонтальная строка «метка — число» на <420px |
| 6 | medium | `apps/web/src/app/dashboard/AccountDeletion.tsx:41` — кнопка удаления без класса; `globals.css:6` | «Удалить аккаунт навсегда» выглядит как основное зелёное действие, тем же стилем, что «Создать клипы», и стоит в конце той же ленты. `desktop1280-dashboard-full.png` | отдельный класс `.danger` (красный контур), убрать в «Настройки» |
| 7 | medium | Между секциями нет отступов: `ProInterest.tsx:14`, `PartnerPanel.tsx:29`, `VideoList.tsx:16`, `AccountDeletion.tsx:37` — `<section>` без класса/margin | Кнопка «Нужен тариф побольше» вплотную к заголовку «Кабинет партнёра»; пустой блок «Ваши записи» вплотную к «Удалить аккаунт». Все устройства, `desktop1280-dashboard-full.png` | `main > section + section{margin-top:40px}` или карточки-разделители |
| 8 | medium | `apps/web/src/app/globals.css:21,79` + `page.tsx:3-6` | На iPhone 13 кнопка «Войти →» ниже первого экрана (≈948px CSS при высоте 844), на 360×740 форма начинается ~580px; герой-заголовок 5 строк занимает весь экран. `iphone13-home-fold.png`, `android360-home-fold.png`. На iPad (768 > 600) — две колонки, заголовок формы переносится, много пустоты сверху из‑за `min-height:calc(100vh - 84px)` + `align-items:center`: `ipad768-home-fold.png` | уменьшить h1 на мобильном (`clamp(28px,8vw,36px)`), убрать `<br/>` на узких, поднять форму (или CTA «Войти» якорем в шапке); iPad — 1 колонка до ~820px |
| 9 | medium | `src/server/short-link-handler.ts:29` (`/c/[code]`) | Публичный лендинг клипа: на 360×740 CTA «Сделать свои клипы» ниже первого экрана (≈874px); превью — статичная картинка `<img>`, клип посмотреть нельзя. `android360-clip-landing-full.png`, `iphone13-clip-landing-fold.png` | на мобильном превью `max-height:50svh`, CTA sticky снизу или сразу под превью; при желании — `<video playsinline>` (CSP `media-src` сейчас `default-src 'none'` — потребует директивы) |
| 10 | medium | `apps/web/src/app/clips/ClipCard.tsx:37-40`, `globals.css:66` | Две полноширинные кнопки «Скачать»/«Скопировать ссылку» без промежутка (margin 0) — на тач-экране легко промахнуться. По коду | `.clip-body button + button{margin-top:10px}` или `display:grid;gap:10px` |
| 11 | medium | `apps/web/src/app/globals.css:61,82` | Вертикальное видео 9:16 на телефоне: в 1 колонку при ширине 358px превью было бы ~636px, ограничено `max-height:520px` → с `object-fit:contain` появятся поля, а вся карточка ≈ 520 + тело с оценкой/музыкой/2 кнопками ≈ 2 экрана на клип. По коду (`.clip-preview video` 100%×100%) | `max-height:min(70svh,520px)`, свернуть «Оценку» в `<details>`; рассмотреть горизонтальную карусель `scroll-snap` для клипов |
| 12 | low | `apps/web/src/app/dashboard/layout.tsx:119`, `globals.css:17` | Ссылка «Мои записи» 85×22 — единственная навигация кабинета, цель <44px (замер). Все устройства | `padding:11px 8px` / `min-height:44px;display:inline-flex;align-items:center` |
| 13 | low | `apps/web/src/app/globals.css:26,25` и `upload-panel` фон `#eaf0df` | Контраст `--muted #65716a` на `#eaf0df` = **4.37:1** (<4.5 AA) для 13–14px текста в панели загрузки («MP4, MOV…», атрибуция музыки); на `--paper` 4.77 — проходит. `.eyebrow` 11px. Граница инпутов `#b8c3b6` на белом = 1.82:1 (<3:1, WCAG 1.4.11) | затемнить muted до ~#56625b; eyebrow ≥12px; граница инпута ≥ #8a968c |
| 14 | low | `apps/web/src/app/upload/Uploader.tsx:56` — `<small>` inline внутри потока | Атрибуция «Komiku, HoliznaCC0…» приклеена к подписи «…финальный акцент» без пробела. `iphone13-upload-panel.png` | `small{display:block}` |
| 15 | low | `apps/web/src/app/upload/Uploader.tsx:50`, `globals.css:12` | Нативный file input «Choose File / No file chosen» на английском, 14px, мелкая кнопка внутри поля (UA-рендер). `iphone13-upload-panel.png` | скрытый input + крупная label-зона «Выбрать файл» (≥56px, drag-n-drop на десктопе) с именем файла |
| 16 | low | `apps/web/src/app/globals.css:1` (`color-scheme: light`) | Тёмной темы нет: при системной тёмной теме страница остаётся светлой (`iphone13-home-dark.png`, фон rgb(247,248,243)). Консистентно, не сломано | если нужно — токены уже на `:root`, достаточно блока `@media (prefers-color-scheme:dark)` |
| 17 | low | `apps/web/src/app/layout.tsx:94` | viewport `width=device-width, initial-scale=1` есть, `viewport-fit=cover` нет → safe-area iOS не задействована; вырезов это не ломает (контент не уходит под notch), но и `env(safe-area-inset-*)` нигде не используется — важно, если появится sticky-CTA снизу | при sticky-элементах: `padding-bottom:env(safe-area-inset-bottom)` + `viewport-fit=cover` |
| 18 | low | `apps/web/src/app/AuthForm.tsx:23-25` | Формы: email `type=email` + `autocomplete=email`, пароль new/current-password — хорошо; нет `inputmode`/`autocapitalize="none"` у кода партнёра (`autoComplete=off`, заглавные коды — iOS начнёт с заглавной, ок) ; ошибка `role=alert` без привязки `aria-describedby` к полю | `autocapitalize="characters"` у кода партнёра; `aria-invalid` на поле при ошибке |
| 19 | low | `apps/web/src/app/clips/GuestPacks.tsx:14,32,46` | Инлайн-стили (checkbox 20×20, отступы) вне дизайн-системы; сам чекбокс 20px, но обёрнут в label с padding 8px → зона клика — строка, приемлемо. Гостевая `/g` (`src/server/guest-page.ts:20-27`): 1 колонка <600px, `video playsinline` + `max-height:500px`, кнопки ≥44px (12px padding + 18px×1.6) — ок; снять вживую не удалось (нет пакета) | перенести в классы globals.css |

## Сильные стороны

- Горизонтального скролла нет ни на одной снятой странице ни на одном устройстве (measure.json: scrollWidth == innerWidth везде).
- viewport meta корректна в Next (`apps/web/src/app/layout.tsx:94`) и в обеих HTML-страницах сервера (`short-link-handler.ts:22`, `guest-page.ts:18`).
- Кнопки глобально `min-height:46px` (`globals.css:6`), инпуты 46px (`:11`) — основные тач-цели проходят 44px; фокус-кольцо `:focus-visible` 3px (`:10`).
- Есть два брейкпоинта (900/600, `globals.css:75-86`), сетки на `minmax(0,1fr)`, `min-width:0`, `overflow-wrap` для длинных id — поэтому ничего не распирает.
- Заголовки на `clamp()` (`globals.css:14,22`), body 16px, на публичных страницах 18px.
- Видео `playsInline` + `preload="none"` + poster (`ClipCard.tsx:25`) — на iPhone не уходит в полноэкранный режим, не качает трафик заранее.
- Состояния загрузки/ошибки выражены: `role=status/alert`, три состояния обработки с разным видом (`VideoDetail.tsx:15-35`), `dashboard/error.tsx`, пустые состояния (`VideoList.tsx:17`).
- Контраст основного текста и кнопок хороший: зелёный на фоне 7.08:1, белый на зелёном 7.56:1.
- Форма входа: `type=email`, корректные `autocomplete`, `lang="ru"`.
- Публичная `/c/` уже адаптивна (1 колонка <600px) и выглядит опрятно (`android360-clip-landing-full.png`).

## Оценка объёма

**M** до хорошего mobile UX. Раскладка по сути: `S` — пункты 1, 2, 3, 5, 7, 10, 12, 13, 14 (правки только в `globals.css` + пара className, ~полдня; снимают все high). `M` — пункты 4, 6, 8, 9, 11, 15 (перестановка кабинета/вынос настроек, мобильный hero, кастомный выбор файла, компактная карточка клипа; 1–2 дня с проверкой на устройствах). Архитектурных препятствий нет: токены в `:root`, единый CSS-файл, серверные страницы изолированы. Остаточный риск: экран детали записи и гостевая страница проверены только по коду — после правок снять их на стенде с реальной записью; автозум iOS подтвердить в WebKit/на устройстве.

Status: completed
