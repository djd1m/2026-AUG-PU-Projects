# Отчёт исполнителя — фича 25 `dark-theme`

Исполнитель: Claude Opus 5.5 (агент Anthropic), 2026-09-25. OpenAI/Codex не вызывались (решение владельца).
Постановка: `00_brief.md` + все 11 обязательных правок `01_validate.md`. Не выкачено, не закоммичено.

## Что сделано (файл:строка)

- `apps/web/src/lib/theme.ts` — закрытый набор `dark|light`, `themeFromCookie(header)`: `light` только при
  РОВНО ОДНОЙ паре `n5_theme=light` (регистр, пробелы, кавычки, два значения, мусор, отсутствие → `dark`);
  `themeCookie()` пишет `Path=/; Max-Age=31536000; SameSite=Lax; Secure` без `HttpOnly`; `THEME_COLOR`.
- `apps/web/src/app/theme-server.ts` — `requestTheme()` читает сырой `Cookie` через `headers()` (тот же разбор,
  что на `/c/`, `/g/`).
- `apps/web/src/app/layout.tsx` — `export const dynamic = 'force-dynamic'` (правка 1), `generateViewport()`
  вместо константы `viewport` (`colorScheme`, `themeColor` по теме), `<html data-theme>` на сервере.
- `apps/web/src/app/ThemeToggle.tsx` — клиентская кнопка 44×44 (`.theme-toggle`, globals.css:86): пишет cookie,
  меняет `data-theme`, `meta[theme-color]`, `meta[color-scheme]` без перезагрузки. Вставлена в шапку лендинга
  (`page.tsx`) и кабинета (`dashboard/layout.tsx`). CSP у страниц Next нет вовсе (01_validate §2) — тумблеру
  ничего не ослаблялось.
- `apps/web/src/app/globals.css:3-4` — ВСЕ цвета в двух блоках: `:root` (тёмная, `color-scheme:dark`) и
  `:root[data-theme=light]`. `prefers-color-scheme` не используется (A-2509-03). Добавлено: стрелка `select`
  двумя data-URI (`--select-arrow`, правка 8), `accent-color` чекбоксам/радио (:61), autofill WebKit/Chromium
  через `-webkit-box-shadow`/`-webkit-text-fill-color` (:62), `.clip-preview` → свои `--media-bg/--media-fg`
  (правка 9), `.brand span` → `--brand-bg/--brand-fg`, статусы/`.notice`/`.empty`/тень/hover/фокус — токены,
  поля — `--field-bg` (= `--surface-2` в тёмной). Шапка: `.navigation > :first-child{margin-right:auto}`,
  на <600 px `column-gap:.5rem`, на ≤359 px бренд 1.125rem (:148) — шапка кабинета на 320 px в одну строку
  (было 139 px высоты с переносом, стало 77, замер в контейнере Playwright, оба движка).
  `grep -nE '#[0-9a-fA-F]{3,8}|\bwhite\b|\bblack\b|rgba?\(|%23'` вне строк 1–4 — пусто (закреплено тестом).
- `apps/web/src/app/clips/GuestPacks.tsx:45` — инлайн `#ced6cb` → класс `.guest-pack` (globals.css:84).
- `apps/web/src/server/short-link-handler.ts:19,26,63`, `guest-page.ts:17,24,83` — `THEME_TOKENS` (дубль
  значений, правка 4 — общего модуля нет), `<html data-theme>`, `meta color-scheme`/`theme-color` по cookie
  запроса, фокус-обводка токеном. CSP не менялся; подстрока `@media(max-width:600px)` сохранена (правка 11).
  Тумблера на `/c/` и `/g/` нет: причина — единообразие двух публичных страниц зрителя, выбор делается в
  кабинете; у `/g/` скрипты с `nonce` ЕСТЬ (правка 3), у `/c/` `script-src` нет вовсе.
- `scripts/check-responsive.mjs:39-48,57,79-121` — измерение `theme` ВНЕШНИМ циклом вокруг обоих проходов
  (включая `first-screen-*`); `scenarios()/parseArgs/widths` не тронуты (правка 6). Светлая —
  `context.addCookies([{name:'n5_theme',value:'light',url:base}])` (правка 7). Предусловие: `/` без cookie →
  `data-theme=dark`, с cookie → `light`, иначе ошибка «Тема не применена — проверка не выполнена» → код 2;
  то же проверяется на КАЖДОЙ странице матрицы. `theme` в находках, `meta`, имени скриншота, строке summary и
  **в ключе дедупликации** R2/target-size (правка 5). Ограничение: cookie `Secure` → светлый прогон по
  `--base http://…` даст код 2, не ложный 0.
- `.claude/skills/responsive-ui/SKILL.md` («Токены и тема», строка правил прибора) и шаг 3
  `docs/plans/2026-09-25-mobile-ui.md` — под A-2509-03 (правка 10).
- Тесты: `tests/theme.test.ts` (29: разбор cookie, запись cookie, сверка токенов globals ↔ оба SSR-файла,
  отсутствие цветовых литералов вне блоков, `THEME_COLOR` = `--paper`, тема на `/c/` и `/g/`, тумблер);
  `tests/responsive-check.test.ts` (+3: тема в ключе summary, cookie по теме, предусловие);
  `tests/browser/responsive-check.test.ts` (+6 = 3×2 движка: `r4-dark` серый на чёрном → R4, `dark-clean` → 0;
  реальная палитра `globals.css` в обеих темах через axe — ноль `color-contrast`).

## Токены и контраст (WCAG, посчитано по формуле относительной яркости)

| Пара | Тёмная (по умолчанию) | : | Светлая | : |
|---|---|---|---|---|
| текст `--ink` / фон `--paper` | #eef2ec / #0e1311 | 16,56 | #202a27 / #f7f8f3 | 13,84 |
| текст / карточка `--surface` | #eef2ec / #1a211d | 14,50 | #202a27 / #ffffff | — (≥13,8) |
| второстепенный `--muted` / фон | #a9b4ac / #0e1311 | 8,76 | #56615a / #ffffff | 6,46 |
| второстепенный / `--surface-2` (поле) | #a9b4ac / #262f2a | 6,44 | — | — |
| акцент `--green` (em, eyebrow, оценка) / фон | #8fd4a4 / #0e1311 | 10,82 | #305d45 / #f7f8f3 | 7,08 |
| акцент / карточка | #8fd4a4 / #1a211d | 9,48 | — | — |
| основная кнопка `--btn-fg`/`--btn-bg` | #0f1a14 / #dcefd9 | 14,76 | #ffffff / #305d45 | 7,56 |
| заливка кнопки / карточка (рамка формы) | #dcefd9 / #1a211d | 13,60 | — | — |
| значок `.brand span` fg/bg | #0f1a14 / #8fd4a4 | 10,29 | #dcefbb / #305d45 | 6,16 |
| превью `--media-fg`/`--media-bg` | #d5ddd6 / #060807 | 14,48 | #e2e7db / #1d2822 | 12,10 |
| превью / карточка (граница кадра) | #060807 / #1a211d | 1,22 | #1d2822 / #ffffff | высокий |
| фокус `--focus` / фон | #f2b552 / #0e1311 | 10,27 | #9c5e0a / #f7f8f3 | 4,90 |
| фокус / карточка | #f2b552 / #1a211d | 9,00 | #9c5e0a / #ffffff | 5,23 |
| рамка контрола (`--muted`) / поле | #a9b4ac / #262f2a | 6,44 | #56615a / #ffffff | 6,46 |
| декоративная `--line` / карточка | #3f4b45 / #1a211d | 1,80 | #dce1d7 / #ffffff | 1,33 |
| `.danger` / карточка | #ff9f94 / #1a211d | 8,32 | #922f27 / #ffffff | 7,90 |
| `.running` fg/bg | #a9c4f0 / #18223a | 8,91 | #304e80 / #edf2fa | 7,39 |
| `.success` fg/bg | #a8d98a / #18291a | 9,45 | #365620 / #eaf4df | 7,38 |
| `.failure` fg/bg | #ffa59a / #34191a | 8,54 | #922f27 / #fae9e6 | 6,72 |
| `.silent` fg/bg | #f0cd7a / #302611 | 9,72 | #7c5919 / #fff3d9 | 5,78 |
| `.notice` текст/фон | #eef2ec / #2d2616 | 13,24 | #202a27 / #fff4da | 13,51 |
| ступени поверхностей | surface/paper 1,14 · surface-2/surface 1,19 | | | |

Отступления от «светлая — текущая палитра», все вынужденные:
1. **Светлый фокус `#ce8b25` → `#9c5e0a`**: старый давал 2,68:1 к фону — ниже 3:1 (WCAG 1.4.11).
2. **`/c/` и `/g/` в светлой теме** перешли с собственных `#f8f9f4/#21382a/#355e2a` на токены `globals.css`
   (`#f7f8f3/#202a27/#305d45`) — постановка требует совпадения значений; визуально разница малозаметна.
3. Рамка пакета гостя `#ced6cb` → `--line` (`#dce1d7`), декоративная.
Декоративные `--line` (1,80 / 1,33) — разделители и рамки карточек, не контролы; рамки контролов — `--muted`.
Ступени поверхностей 1,14/1,19 различимы на снимке (проверено глазом), но это не «контрастная» пара.

## Проверки (дословные строки итогов)

1. `npm run typecheck` — код 0; `npm run lint` — `Статические правила: ошибок нет`, код 0; `npm run build` —
   код 0, `ƒ /` (Dynamic; было `○` Static — ожидаемая цена SSR-темы, правка 2; тестов на статику нет).
   Предупреждение сборки `Can't resolve '@valkey/valkey-glide'` (bullmq) — существовало до фичи.
2. Набор в образе (`docker compose … --profile test run --rm --build test`, код 0): `Test Files  100 passed (100)` / `Tests  841 passed (841)` (было 809; +29 `theme.test.ts`, +3 `responsive-check.test.ts`).
3. `bash scripts/check-responsive.sh --test`: `Test Files  1 passed (1)` / `Tests  50 passed (50)` (было 44).
4. Мутации:
   - `themeFromCookie` возвращает `light` на мусоре (`values[0] === 'dark' ? 'dark' : 'light'`):
     `Tests  16 failed | 13 passed (29)` → восстановлено: `Tests  29 passed (29)`.
   - браузерный тест палитры: тёмный `--muted:#4a524d` →
     `Tests  2 failed | 2 passed | 46 skipped (50)` (оба движка, тёмная) → восстановлено:
     `Tests  4 passed | 46 skipped (50)`.

## Что НЕ сделано / не доказано

- Прибор `check-responsive.mjs` по стенду в обеих темах НЕ запускался — это делает координатор (нужен https
  `--base`, иначе светлая даст код 2 по дизайну). Композицию `width-1440`/`first-screen` на реальных
  страницах в тёмной теме глазом не смотрел; смотрел только фикстуру с `globals.css` (320/390/1440).
- Тумблер в живом браузере (запись cookie, смена без перезагрузки) проверен только рендером разметки и
  типами; e2e по стенду — у координатора.
- Имя кнопки: одно постоянное `aria-label="Светлая тема"`, состояние — `aria-pressed` (правило WAI-ARIA для
  кнопки-переключателя: имя не меняется со состоянием). Постановка допускала читать «Светлая тема / Тёмная
  тема» как смену имени — выбрал вариант, при котором `aria-pressed` не противоречит имени. Смена — одна строка.
- Страница ошибки/`not-found` отдельного тумблера не имеют (тема применяется, т. к. корневой layout общий).
- Встроенные браузеры Telegram/VK могут игнорировать `theme-color` — не проверялось.

Status: completed
