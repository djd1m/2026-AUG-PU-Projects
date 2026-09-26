# design-shell — квитанция

**Фича:** 8 `design-shell` · **Дата:** 2026-09-26 · **FR:** `FR-TARIFF-002`; облик `FR-LOOK-001, 002, 006…010, 012…014` ·
**ADR:** ADR-012 · **Тир:** M (UI без схемы, денег и внешних вызовов) · **Исполнитель:** Opus 5.5 · **Ревью:** не проводилось
(другой агент Anthropic не звался — это не cross-family review и не ревью вообще) · Код — [`07_code_report.md`](07_code_report.md),
переиспользование — [`reuse-map.md`](reuse-map.md), решения — A-N6-031.

## Строки reuse (ADR-012)

| Блок | Ответ |
|---|---|
| токены, тёмная тема (`globals.css`, `theme.ts`, `ThemeToggle.tsx`) | **адаптировано:** структура токенов, rem-типографика, цели 44 px, поля 16 px, select, фон html, `.danger`, cookie-разбор fail-closed, SSR-тема и `generateViewport` — из N5; палитра своя, Onest, кнопки 48 px, брейкпоинты 400/736/1112, cookie `n6_theme` |
| прибор адаптивности (`check-responsive.sh/.mjs`, `rules.mjs`, `responsive-check.test.ts`) | **адаптировано:** правила R1–R9 и перепроверка контраста — без изменений; маршруты N6, R9 `/` → поле адреса и «Создать бота»; зависимости прибора — отдельным пакетом (ADR-007) |

## Проверено — и ЧЕМ

| Утверждение | Чем доказано | Слой |
|---|---|---|
| Тема тёмная по умолчанию; светлая только при ровно одной паре `n6_theme=light`; 18 мусорных форм (включая `n5_theme=light`) → тёмная | `tests/theme.test.ts` (в образе) | 1 |
| Цвета — только в двух блоках токенов; обе темы с одним набором токенов; `THEME_COLOR` = `--paper` | `tests/theme.test.ts`; мутация «цвет вне блока» → 1 failed (ручная, до раннера) | 1 |
| Палитра не повторяет N5 | `tests/theme.test.ts` по снимку `tests/fixtures/n5-palette.txt`; мутация «акцент = зелёный N5» → 1 failed (ручная) | 1 |
| Лендинг: в герое ровно одно поле и одна кнопка; порядок секций FR-LOOK-012; ссылка на тарифы с лендинга | `tests/theme.test.ts` по `renderToStaticMarkup(Landing)` | 1 |
| Тарифы: планы/цены канона §7, строка снятия бейджа — ровно одна и у «Без бейджа», FAQ «что считается ответом», таблица | `tests/theme.test.ts` | 1 |
| Поле адреса и «Создать бота» — в первом экране 390×844, 375×667, 360×740, обе темы, Chromium и WebKit; кнопка и поле ≥ 48 px | `design-shell.test.ts` (R9 до прокрутки, скриншоты + геометрия в `tests/artifacts/design-shell/browser/`) | 1 |
| Лендинг, тарифы, вход, кабинет, состояния: R1/R2/R5, axe WCAG 2.2 AA (R4 контраст), R8 (200 %) — без отказов, обе темы, оба движка | `design-shell.test.ts` | 1 |
| Нет горизонтального скролла и мелких целей на 320/360/414/768/1024/1440; таблица тарифов на 320 прокручивается в своём контейнере | `design-shell.test.ts` | 1 |
| Прибор ловит дефект: правило выключено → набор красный | мутации ниже | 1 |
| Прибор ловит дефект продукта в настоящем `globals.css` | мутации `css-*` ниже | 1 |
| Регресс | образ **706/706** (было 677 + 29 новых) | 1 |

## Прогон в образе — дословно

`docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test`
(`tests/artifacts/design-shell/image-run.txt`):

```
 Test Files  32 passed (32)
      Tests  706 passed (706)
   Start at  06:49:34
   Duration  84.98s (transform 1.17s, setup 0ms, collect 4.10s, tests 71.25s, environment 10ms, prepare 3.27s)

exit=0
```

Предыдущий прогон той же фичи — `Tests 1 failed | 705 passed (706)`, `exit=1`: страж ADR-007 поймал `playwright` в
корневом манифесте; причина устранена (A-N6-031 п.7), не страж ослаблен.

## Браузерный набор — дословно

`bash scripts/check-responsive.sh --test` (контейнер `mcr.microsoft.com/playwright:v1.60.0-noble`):

```
 Test Files  2 passed (2)
      Tests  130 passed (130)
exit=0
```

## Мутации — дословно

`node scripts/test-design-shell-mutations.mjs` (`tests/artifacts/design-shell/mutations-run.txt`, красные тесты каждой —
`tests/artifacts/design-shell/mutations/<id>.txt`). Правило выключено в `rules.mjs` → набор правил; дефект в настоящем
`globals.css` → набор страниц N6. Вердикт «УБИТА» требует ненулевого кода И красного теста с ожидаемым именем.

```
R1-rule: УБИТА; код 1; Tests  2 failed | 44 passed (46)
R2-rule: УБИТА; код 1; Tests  6 failed | 40 passed (46)
R4-rule: УБИТА; код 1; Tests  4 failed | 42 passed (46)
R5-rule: УБИТА; код 1; Tests  6 failed | 40 passed (46)
R8-rule: УБИТА; код 1; Tests  2 failed | 44 passed (46)
R9-rule: УБИТА; код 1; Tests  8 failed | 38 passed (46)
css-R1-url-form: УБИТА; код 1; Tests  10 failed | 74 passed (84)
css-R2-toggle: УБИТА; код 1; Tests  68 failed | 16 passed (84)
css-R4-muted: УБИТА; код 1; Tests  8 failed | 76 passed (84)
css-R5-field: УБИТА; код 1; Tests  12 failed | 72 passed (84)
css-R8-h1-px: УБИТА; код 1; Tests  12 failed | 72 passed (84)
css-R9-hero: УБИТА; код 1; Tests  12 failed | 72 passed (84)
baseline после восстановления: код 0; Tests  130 passed (130)
exit=0
```

Прочие проверки: `npm run lint` 0 · `npm run typecheck` 0 · `npm run build` 0.

## Чего НЕ доказывает

- **Прибор не запускался против живого `web` N6** (стенда нет): не проверены настоящие ответы маршрутов, редирект
  `/dashboard` → `/login` без сессии, вход через форму в браузере, гидратация переключателя темы (клик → cookie) и
  загрузка Onest. Страницы проверены на той же разметке, что рендерят маршруты, но без Next и без шрифта (системный стек).
- **Отправка формы лендинга ведёт на `/preview` — 404 до фичи `preview-flow`.** Кнопка «Оставить заявку» ведёт на
  `/login?plan=…`; экран интереса — `tariffs-and-interest`.
- **Кабинет — пустое состояние всегда**: списка ботов нет до `bot-cabinet`.
- **Композиция десктопа** — не ассерт (навык responsive-ui): скриншоты `width-1440` и `first-screen-375x667` просмотрены
  глазом, не сравниваются.
- Отступления от FR-LOOK (A-N6-031): H1 на телефоне 2.5 × body (не ≈ 3 ×), переключателя «месяц/год» нет, секция доверия
  не утверждает «данные в РФ» (вопрос уходит модели — открытый вопрос 152-ФЗ №1 владельца).
- Страница-хозяин с виджетом на `http://localhost:8099` в прибор ещё не добавлена — придёт с `widget-runtime-and-badge`.
- Сборочный кэш Docker после двух `--build` вырос; диск машины 95 %. Образов и томов фича не оставила (`n6-sufler-test:foundation`
  перезаписан тем же тегом, `down -v` выполнен), кэш сборки не чистился — общий для всех проектов, решение владельца.

Status: completed
