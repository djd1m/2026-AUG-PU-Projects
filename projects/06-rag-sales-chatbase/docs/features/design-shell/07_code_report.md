# design-shell — отчёт о коде

**Фича:** 8 `design-shell` · **Дата:** 2026-09-26 · **Исполнитель:** Opus 5.5 (автономный режим, один исполнитель) ·
**Ревью:** не проводилось · Карта переиспользования — [`reuse-map.md`](reuse-map.md), решения — A-N6-031.

## Что сделано

Каркас интерфейса «Суфлёра» из готового N5 (коммит `90fe80a`), с первой строкой происхождения в каждом файле.

| Область | Файлы |
|---|---|
| Токены двух тем, rem-типографика, цели 44 px, поля 16 px, select, фон html, `.danger`, примитивы | `apps/web/src/app/globals.css` |
| Тема: тёмная по умолчанию, cookie `n6_theme` (всё, кроме ровно `light`, — тёмная), SSR `data-theme`, переключатель | `apps/web/src/lib/theme.ts`, `app/theme-server.ts`, `app/ThemeToggle.tsx`, `app/layout.tsx` (`generateViewport`) |
| Шрифт Onest (OFL) без сети на сборке | `layout.tsx` → `next/font/local` из `@fontsource-variable/onest@5.3.1` (зависимость `apps/web`) |
| Шапка: бренд «Суфлёр», «Тарифы», «Войти», переключатель темы | `app/SiteHeader.tsx` |
| Лендинг: герой (заголовок + ОДНО поле «Адрес вашего сайта» + «Создать бота»), затем секции FR-LOOK-012 | `app/Landing.tsx`, `app/page.tsx` — форма только разметкой (`GET /preview`, маршрута нет до `preview-flow`) |
| Тарифы: три плана канона §7, строка «Работает на Суфлёре — убрать» у «Без бейджа», таблица сравнения, FAQ «что считается ответом» | `app/pricing/Pricing.tsx`, `page.tsx` |
| Вход / регистрация (API foundation) | `app/login/AuthForm.tsx`, `page.tsx` (`?mode=register`) |
| Пустой кабинет под сессией, выход | `app/dashboard/layout.tsx` (без сессии → `/login`), `page.tsx`, `CabinetEmpty.tsx`, `LogoutButton.tsx` |
| Прибор адаптивности (R1–R9, контраст с перепроверкой WebKit, контейнер Playwright 1.60.0) | `scripts/check-responsive.sh`, `.mjs`, `scripts/responsive/{rules,input,playwright}.mjs`, `scripts/responsive/package.json` (+ lock) |
| Браузерные наборы | `tests/browser/responsive-check.test.ts` (правила на фикстурах-дефектах, N5), `tests/browser/design-shell.test.ts` (страницы N6), `tests/fixtures/responsive/*.html` (16), `vitest.browser.config.ts` |
| Юнит-страж темы и разметки (идёт в образе) | `tests/theme.test.ts`, `tests/fixtures/n5-palette.txt`; `vitest.config.ts` — jsx и исключение `tests/browser/**` |
| Мутации прибора и продукта | `scripts/test-design-shell-mutations.mjs` |

## Палитра (своя, FR-LOOK-008)

Нейтральная холодная база + один бирюзовый акцент `#5fd0d8` (тёмная) / `#0b6e76` (светлая), только для «готово/включено»
и денег; основные кнопки чёрно-белые. Совпадений значений с N5 — ноль (страж). Контраст AA — axe на всех страницах в
обеих темах, включая отказ входа, уведомление, `.danger`, акцент на подложках и `select`.

## Проверки — дословно

| Проверка | Итог |
|---|---|
| `npm run lint` | `Статические правила: ошибок нет` (код 0) |
| `npm run typecheck` (все workspace + `tests/tsconfig.json`, включая браузерные наборы) | код 0 |
| `npm run build` | код 0; маршруты `ƒ /`, `ƒ /pricing`, `ƒ /login`, `ƒ /dashboard`; два woff2 Onest в `.next/static/media` |
| Образ: `docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test` | `Test Files 32 passed (32)` · `Tests 706 passed (706)` · `exit=0` (`tests/artifacts/design-shell/image-run.txt`); стек снят `down -v` |
| Браузер: `bash scripts/check-responsive.sh --test` (контейнер `mcr.microsoft.com/playwright:v1.60.0-noble`, Chromium + WebKit) | `Test Files 2 passed (2)` · `Tests 130 passed (130)` · код 0 |
| Мутации: `node scripts/test-design-shell-mutations.mjs` | 12/12 убиты, базовая линия после восстановления 130/130, код 0 (`tests/artifacts/design-shell/mutations-run.txt`) |

Первый прогон в образе был **красным**: `1 failed | 705 passed` — страж ADR-007 `tests/ssrf.test.ts` («корень не зависит от
playwright») поймал `playwright` в корневых devDependencies (как у N5). Исправлено переносом зависимостей прибора в
отдельный пакет `scripts/responsive/` (A-N6-031 п.7); повторный прогон — 706/706.

Прибор против ЛОКАЛЬНО поднятого `web` N6 **не запускался** (стенда N6 нет; постановка разрешает). Страницы проверены
на НАСТОЯЩЕЙ разметке (`renderToStaticMarkup` тех же компонентов, что рендерят маршруты) с настоящим `globals.css`,
отдаваемой loopback-сервером внутри контейнера. Локальный стек не поднимался, портов не публиковалось.

Status: completed
