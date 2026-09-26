# design-shell — карта переиспользования

Указание владельца: «если можно не кодить, а взять готовое — возьми, это касается дизайн-наработок».
Донор — N5 «КлипМейкер», `projects/05-podcast-clips-opus`, коммит `90fe80a` (последний коммит, трогавший
файлы-доноры; незакоммиченная правка N5 `vitest.browser.config.ts` — только псевдонимы N5, не взята).
В КАЖДОМ файле N6 первой строкой стоит происхождение («из N5: … — без изменений | адаптировано: что»).

Ответы по строкам `reuse` роадмапа (ADR-012): `перенесено` · `адаптировано (что)` · `написано заново (почему)`.

## ADR-012 «токены, тёмная тема»

| Файл N6 | Донор N5 | Ответ |
|---|---|---|
| `apps/web/src/app/globals.css` | `apps/web/src/app/globals.css` | **адаптировано:** структура двух блоков токенов (`:root` тёмная, `:root[data-theme=light]`), rem-типографика, цели ≥ 44 px, поля `max(1rem,16px)`, `select` с `--select-arrow`, фон `html`, `.danger`, автозаполнение, `prefers-reduced-motion`, `overflow-wrap:anywhere` — перенесены. Заменено: палитра (своя, см. ниже), кнопки 48 px и радиусы 8/16/20/пилюля (FR-LOOK-010), вес заголовков 500 и H1 `clamp(2.5rem,5vw,4rem)` (FR-LOOK-009), брейкпоинты 400/736/1112 (FR-LOOK-014), примитивы `.stack/.cluster/.switcher/.center` из навыка `responsive-ui` N6. Классы экранов N5 (клипы, загрузка, лента стадий) не взяты — у N6 их нет |
| `apps/web/src/lib/theme.ts` | `apps/web/src/lib/theme.ts` | **адаптировано:** cookie `n6_theme`, `THEME_COLOR` = `--paper` N6; разбор cookie (закрытое множество, fail-closed) — без изменений |
| `apps/web/src/app/theme-server.ts` | `apps/web/src/app/theme-server.ts` | **перенесено** |
| `apps/web/src/app/ThemeToggle.tsx` | `apps/web/src/app/ThemeToggle.tsx` | **перенесено** (aria-pressed, одно доступное имя, мета theme-color/color-scheme) |
| `apps/web/src/app/layout.tsx` | `apps/web/src/app/layout.tsx` | **адаптировано:** `generateViewport` и `data-theme` на сервере — без изменений; добавлен Onest через `next/font/local` из `@fontsource-variable/onest@5.3.1` (OFL-1.1) |
| `tests/theme.test.ts` | `tests/theme.test.ts` | **адаптировано:** стражи cookie (18 мусорных форм + `n5_theme=light`), «цвета только в двух блоках», `THEME_COLOR` = `--paper`, переключатель ≥ 44 px — перенесены; SSR-страницы `/c/` `/g/` убраны; добавлены «палитра не повторяет N5» и разметка каркаса |
| `apps/web/src/app/SiteHeader.tsx` | шапка `.navigation` из `Landing.tsx` | **адаптировано:** вынесена в общий компонент, бренд «Суфлёр», «Тарифы», «Войти» |
| `apps/web/src/app/Landing.tsx`, `page.tsx` | `Landing.tsx`, `page.tsx` | **адаптировано:** приём «разметка отдельно от page.tsx, её же рендерит браузерный набор» перенесён; содержимое — написано заново по CJM N6 (`docs/discovery/cjm-prototype.html`, экран 1) и FR-LOOK-012 |
| `apps/web/src/app/login/AuthForm.tsx` | `AuthForm.tsx` | **адаптировано:** без кода партнёра (фича partner-and-studio) и tRPC; формат ошибки API N6 `{ error: { code, message } }` |
| `apps/web/src/app/dashboard/layout.tsx` | `dashboard/layout.tsx` | **адаптировано:** cookie `__Host-n6_session` (константа `COOKIE_NAME` foundation), без сессии → `/login`; без экрана удаления аккаунта |
| `apps/web/src/app/pricing/*`, `dashboard/CabinetEmpty.tsx`, `dashboard/LogoutButton.tsx` | — | **написано заново (почему: в N5 нет страницы тарифов с планами канона N6 и пустого кабинета ботов)**; только классы и примитивы globals.css |

### Палитра «Суфлёра» (своя, FR-LOOK-008)

Холодная нейтральная база (серо-графитовая, как в `docs/discovery/cjm-prototype.html`) + **один бирюзовый акцент**
(`#5fd0d8` тёмная / `#0b6e76` светлая) — только «готово/включено» и деньги (`.accent-text`, строка снятия бейджа).
Основные кнопки — чёрно-белые (`--btn-bg` = цвет текста). Не зелёный N5 (`#8fd4a4`/`#305d45`), не синий/фиолетовый и не
зелёный тумблер Chatbase (source-product-profile, «Акцент»); зелёный акцент CJM-прототипа (`#7fd8a6`) тоже не взят — он
неотличим от N5. Совпадений значений с N5 — ноль (страж `tests/theme.test.ts` по снимку `tests/fixtures/n5-palette.txt`).
Контраст AA обеих тем — axe на настоящей разметке всех страниц (R4), включая состояния отказа, уведомления и акцента.

## ADR-012 «прибор адаптивности»

| Файл N6 | Донор N5 | Ответ |
|---|---|---|
| `scripts/check-responsive.sh` | `scripts/check-responsive.sh` | **перенесено** (контейнер `mcr.microsoft.com/playwright:v1.60.0-noble`, код ≥ 125 → 2) |
| `scripts/responsive/rules.mjs` | `scripts/responsive/rules.mjs` | **адаптировано:** R1–R9, перепроверка контраста WebKit — без изменений; `FIRST_SCREEN_ACTIONS` = `/` → `#site-url` и `.url-form button[type=submit]` |
| `scripts/responsive/input.mjs` | `scripts/responsive/input.mjs` | **адаптировано:** фикстура N6 — почта и пароль; маршруты `/`, `/pricing`, `/login`, `/dashboard` |
| `scripts/check-responsive.mjs` | `scripts/check-responsive.mjs` | **адаптировано:** вход через `/login`, cookie темы `n6_theme`, без предусловий клипов, CSS-линт только `globals.css` |
| `tests/browser/responsive-check.test.ts` | `tests/browser/responsive-check.test.ts` | **адаптировано:** тесты правил на фикстурах с внедрённым дефектом — без изменений; разделы N5 (`/c/`, лендинг клипов, палитра N5) убраны |
| `tests/browser/design-shell.test.ts` | разделы «landing-demo» и «палитра» того же файла N5 | **адаптировано:** тот же приём (настоящая разметка + настоящий CSS, обе темы, R9 по `firstScreenSelectors`) на страницах N6 |
| `tests/fixtures/responsive/*.html` (16) | `tests/fixtures/responsive/*.html` | **перенесено** (строка происхождения — комментарием после `<!doctype html>`); фикстуры `/c/` N5 не взяты |
| `vitest.browser.config.ts` | `vitest.browser.config.ts` | **адаптировано:** без псевдонимов `@clipmaker/*`; псевдоним `playwright` → пакет прибора |
| `scripts/responsive/package.json`, `playwright.mjs` | корневые devDependencies N5 | **адаптировано (почему иначе: ADR-007):** у N5 playwright и axe — в корне; у N6 страж `tests/ssrf.test.ts` это запрещает, поэтому отдельный пакет прибора, те же версии 1.60.0 / 4.11.0 |
| `scripts/test-design-shell-mutations.mjs` | образец `scripts/test-*-mutations.mjs` N5/N6 | **написано заново (почему: у N5 мутации прибора — фикстуры внутри набора, а не раннер, выключающий само правило)** |
| навык `.claude/skills/responsive-ui/SKILL.md` | навык N5 | уже адаптирован в Phase 3 N6 — не менялся |

## Не взято и почему

- **Страница-хозяин с виджетом на `http://localhost:8099`** и маршруты `/b/{slug}`, предпросмотр — появятся с фичами
  `widget-runtime-and-badge`, `public-page-and-summary`, `preview-flow`; тогда же строка в `FIRST_SCREEN_ACTIONS` и в
  `ROUTES` фикстуры прибора.
- **Переключатель «месяц/год»** (FR-LOOK-013) — годовых цен в каноне §7 нет; выдумывать число нельзя (A-N6-031).
