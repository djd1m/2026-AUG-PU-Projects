# 07 — Отчёт о коде: `public-page-and-summary` (фича 13)

Дата: 2026-09-26 · Исполнитель: Claude Opus 5.5 (агент-форк координатора, отдельный git worktree, один исполнитель) ·
Основа: `331d40f0` · План: [`01_plan.md`](01_plan.md) · Валидация: [`02_validation.md`](02_validation.md) · Решения: **A-N6-038**.
FR: FR-GROWTH-005, FR-GROWTH-006, FR-BOT-004, хвост FR-GROWTH-001 (preview-flow) и FR-GROWTH-003 (лендинг по бейджу).
SC: SC-US-013-1/2/3, SC-US-010-1/2. ADR: **ADR-013** (строка reuse), ADR-004, ADR-005.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| U1 миграция 005 | `packages/db/migrations/005_public_page.sql` | `account.came_from` с CHECK формы; индексы `growth_event (type, created_at)`, `visitor_session (created_at)`, `question_log (visitor_session_id)` |
| U2 публикация и страница | `packages/db/src/public-page.ts` | `publishPublicPage` (OWNED под `FOR UPDATE`, без контакта — `contact_required`, слаг сохраняется, коллизия — до 3 попыток), `loadPublicPage` (публикация + бот и владелец `active` + годный контакт), `recordPublicPageView` (бот, /24, сутки) |
| U3 сводка | `packages/db/src/summary.ts` | 7 суток по часам БД, только `visitor_session_id IS NOT NULL`, answered / unknown / refused_limit, последние 20 «не знаю» с текстом |
| U4 рост | `packages/db/src/growth.ts`, `growth-report.ts` | `recordShareCtaClick` (только после показа CTA), `recordArrival` (один раз), `growthMetrics` (i и conv% — null при нулевом знаменателе), отчёт оператора |
| U5 уборка | `packages/db/src/visitor.ts` (`sweepIdleVisitorSessions`), `apps/worker/src/watchdog.ts` | пустые сессии старше суток; с журналом, событием, историей — остаются |
| U6 маршруты | `cabinet-handler.ts` (`createBotPublishHandler`, `createBotSummaryHandler`), `cabinet-deps.ts`, `api/bots/[botId]/{publish,summary}/route.ts`, `preview-handler.ts` (`createPreviewShareHandler`) + `api/preview/[id]/share/route.ts`, `auth-handler.ts` + `route.ts` (`createArrivalRecorder`) | порядок входа как у кабинета и предпросмотра; значения публикации строго boolean |
| U7 экраны | `app/b/[slug]/{page,PublicPageView}.tsx`, `middleware.ts`, `lib/arrival.ts`, `page.tsx`, `Landing.tsx`, `dashboard/bots/[botId]/{BotScreen,BotExtrasViews,page}.tsx`, `preview/{PreviewViews,[jobId]/PreviewScreen}.tsx`, `globals.css`, виджет `index.ts`/`chat-window.ts` (`data-open`), `lib/badge-required.ts`, `widget.ts` (`publicSlug`), `check-origin.ts` | демо-страница SSR с виджетом, открытым сразу; `noindex` по флагу; лендинг «Бот как на …» и cookie прихода; блоки кабинета «Вопросы посетителей за 7 дней» и «Демо-страница бота»; отметка и баннер вынесены в чистые компоненты; вторая кнопка CTA предпросмотра |
| U8 проверки | `tests/public-page.{unit,integration}.test.ts`, дополнения `tests/{bot-cabinet.unit,preview-flow.unit,visitor-ask.integration}.test.ts`, `tests/browser/public-page.test.ts`, дополнения `tests/browser/{bot-cabinet,design-shell,preview-flow}.test.ts` и `widget-harness.ts`, `scripts/test-public-page-mutations.mjs`, `scripts/test-widget-browser-mutations.mjs` (+ поле `test`, 2 мутации) | см. `05_completion.md` |

## Дефекты, пойманные по ходу

- **Чат на демо-странице не появлялся бы в настоящих браузерах.** Браузер не шлёт `Origin` на GET к своему же origin, а
  `CheckOrigin` без `Origin` отказывал: `GET /w/v1/config` с `/b/{slug}` получал бы 403. Серверные тесты фич 11–12
  подставляли `Origin` руками и этого не видели; поймал браузерный набор на «нашем» origin оснастки. Исправление — A-N6-038 (6);
  мутация «снять запасной путь» → 17 красных в трёх движках.
- **Окно чата перекрывало текст демо-страницы на ≥ 1024 px** — видно только на скриншоте 1440 (прибор R1/R2 такое не
  ловит); справа зарезервировано место под окно.
- **Типы Next ломали проверку типов тестов:** импорт `next/server` (и даже `import type { Metadata } from 'next'`) в модуль,
  который читает тест, подмешивает в программу тестов глобальный `ProcessEnv` с обязательным `NODE_ENV` — и падала проверка
  чужого `apps/worker/src/pdf/extract-pdf.ts`. Решение middleware вынесено в чистую `arrivalSetCookie`, метаданные — в
  структурный тип.
- **Сводка потеряла бы ответы при уборке сессий:** `question_log.visitor_session_id` — `ON DELETE SET NULL`, а сводка считает
  только вопросы с сессией; уборка не трогает сессии с записями журнала (мутация `sweep-drops-logged` → красный).

## Отклонения от постановки и почему

- **`X-Robots-Tag` приложением не ставится** — только мета-тег (A-N6-038 (2)); на стенде заголовок ставит общий прокси.
- **`apps/web/src/server/growth-event.ts` из `expected_files` не создан:** события роста живут в `packages/db/src/growth.ts`
  рядом с остальными SQL-модулями (как `recordBadgeEvent` в `widget.ts`); отдельный модуль в `web` дублировал бы их.
- **`tests/summary.test.ts` не создан:** сводка проверяется в `tests/public-page.integration.test.ts` (настоящий Postgres),
  маршрут — в `tests/bot-cabinet.unit.test.ts`.
- **Сводка на экране читается серверным рендером** (`readBotSummary` в `page.tsx`), маршрут `GET …/summary` — контракт API.
- **CTA в чате кабинета не выведен** (FR-GROWTH-001 «или в кабинете») — перенос: у кабинета есть блок публикации.

Status: completed
