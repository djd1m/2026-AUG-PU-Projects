# bot-cabinet — отчёт о коде

**Фича:** 10 `bot-cabinet` · **Дата:** 2026-09-26 · **Исполнитель:** Opus 5.5 (автономный режим, один исполнитель) ·
**Решения:** A-N6-033, уточнение A-N6-032 (3) · **Квитанция:** [`05_completion.md`](05_completion.md).

Собрано из готового: вход и сессии (foundation ← N5 `auth-handler.ts`, ADR-012), загрузка PDF (`source-upload-handler.ts`,
pdf-source), задача индексации (`createSourceJobTx`, `indexJobView`, фенс — index-job-core), ядро ответа (`answerQuestion`,
`loadAnswerBot`, `chargeAnswerQuota`, `searchChunks` — rag-answer/chunk-embed), CheckAddress (`@n6/rag/check-address`),
лента стадий (адаптация N5 `progress-ribbon.ts`), токены и классы (design-shell, preview-flow). Нового SQL поиска, квоты
и промпта нет; миграций нет (схема 001 уже несла `bot.contact/greeting/public_key`, `allowed_origin`).

## Файлы

| Файл | Что | Трассировка |
|---|---|---|
| `packages/rag/src/bot-settings.ts` (новый) | граница ввода: `parseCompanyName`, `parseGreeting`, `parseContact` (почта / телефон 10–15 цифр / `https://`; управляющие и невидимые символы — отказ), `readContact` (fail-closed чтение из БД), `parseAllowedOrigin` (домен → `https://домен`, явный `http://` и порт; путь/запрос/IP/localhost/без точки/учётные данные/наш origin — отказ; punycode), `installSnippet` (`contact_required` / `bundle_missing` / `ready` + три директивы CSP). Подпуть `@n6/rag/bot-settings` | FR-BOT-001/002, FR-WIDGET-003, InstallSnippet, AddAllowedOrigin п.1 |
| `packages/db/src/bots.ts` (новый) | **одно условие владения `OWNED`** для всех операций кабинета; `lockAccountBots` (`FOR UPDATE` аккаунта + счёт ботов, включая `studio_account_id`); `createBot`, `listBots`, `readBotCabinet` (настройки, домены, источники с последней задачей), `updateBotSettings`, `addAllowedOrigin` (≤ 20 под `FOR UPDATE` бота), `createSiteSource`, `retrySource` («Повторить»: тот же `index_job_id`, фенс +1; PDF — `pdf_reupload`, не failed — `not_failed`), `ownsBot`, `loadOwnedAnswerBot` | CreateBot, AddAllowedOrigin п.2, CreateSource, FR-INDEX-003 |
| `packages/db/src/previews.ts` | `claimPreviewTx` берёт предел плана через общий `lockAccountBots` (было — свой SELECT/count) | carry_over preview-flow находка 1, A-N6-033 (6) |
| `packages/db/src/ceilings.ts`, `answers.ts` | `ownerAnswerCharges` (3 scope: `bot_day_answers`, `bot_month_answers` по плану, `global_answers`); `chargeAnswerQuota` режим `owner` | A-N6-033 (1), FR-TARIFF-003 |
| `packages/rag/src/answer.ts`, `spend.ts` | режим ядра `owner` (только активный бот); вызов журнала `answer_owner` | A-N6-033 (1) |
| `apps/web/src/server/cabinet-handler.ts` (новый) | обработчики: `GET/POST /api/bots`, `PATCH /api/bots/{id}`, `POST …/origins`, `POST …/sources` (JSON — сайт), `POST /api/sources/{id}/reindex`, `POST …/ask`; порядок входа — в шапке файла | канон §5 + A-N6-033 (1) |
| `apps/web/src/server/cabinet-deps.ts`, `cabinet-runtime.ts` (новые) | боевая связка (SQL, ядро, CheckAddress, очередь) — одна для маршрутов и тестов; кеш на процесс | — |
| `apps/web/src/server/cabinet-session.ts`, `widget-bundle.ts` (новые) | `account_id` серверных страниц — только из сессии; имя бандла виджета из манифеста сборки (нет — `null`) | A-N6-033 (5) |
| `apps/web/src/app/api/bots/route.ts`, `bots/[botId]/route.ts`, `…/origins/route.ts`, `…/ask/route.ts`, `api/sources/[sourceId]/reindex/route.ts` (новые) | маршруты | канон §5 |
| `apps/web/src/app/api/bots/[botId]/sources/route.ts` | `application/json` → сайт (cabinet-handler), иначе PDF (pdf-source без изменений) | FR-SOURCE-001/003 |
| `apps/web/src/lib/source-ribbon.ts` (новый) | лента стадий Очередь → Чтение → Фрагменты; `silent` («нет ответа») не «идёт»; стадия отказа по причине канона §4 | адаптация N5 `progress-ribbon.ts` |
| `apps/web/src/lib/api-client.ts` (новый) | разбор `{ data } \| { error }` в браузере | — |
| `apps/web/src/app/dashboard/CabinetViews.tsx`, `InstallViews.tsx` (новые) | разметка без состояния: список ботов с пределом плана, форма бота, источники с лентой и «Повторить», добавление сайта/PDF, тестовый чат с развёрнутой цитатой; установка — три состояния, домены, CSP, инструкции Tilda/WordPress/HTML | FR-BOT-001/002, SC-US-005-1/2/3 |
| `apps/web/src/app/dashboard/BotListScreen.tsx`, `bots/[botId]/{page,BotScreen}.tsx`, `bots/[botId]/install/{page,InstallScreen}.tsx` (новые); `dashboard/page.tsx`, `CabinetEmpty.tsx` | контейнеры: запросы, опрос `router.refresh()` раз в 3 с при живой задаче; чужой бот — `notFound()` | long-job-contract |
| `apps/web/src/app/globals.css` | классы кабинета, только токены двух тем (страж `theme.test.ts`) | FR-LOOK-008…010, 014 |
| `vitest.config.ts` | псевдоним подпути `@n6/rag/bot-settings` | — |
| `scripts/test-bot-cabinet-mutations.mjs` (новый) | 3 мутации; мутация может править несколько файлов | testing.md «Стражи» |
| `tests/bot-cabinet.integration.test.ts` (новый, 9) | Postgres + pgvector, боевая связка + настоящие `AuthService`/`PgAuthStore` | см. квитанцию |
| `tests/bot-cabinet.unit.test.ts` (новый, 17) | граница ввода, InstallSnippet, лента, манифест, порядок входа | — |
| `tests/preview-flow.integration.test.ts` (+3) | carry_over: две конкурентные гонки claim, вопрос сразу после claim | ревью preview-flow находки 1, 3 |
| `tests/browser/bot-cabinet.test.ts` (новый, 72) | прибор адаптивности: 7 экранов × 2 темы × 2 движка, ширины 320…1440 | — |

## Порядок операций (маршруты кабинета)

лимит двери (по аккаунту) → `Origin` = наш (мутация без него — 403) → сессия → `bot_id` из адреса, `account_id` из сессии →
тело ≤ 4 КиБ, закрытый набор ключей → проверка полей → запись. Сайт: владение ДО CheckAddress (чужому боту — 404 без
DNS-запроса) → Idempotency-Key → CheckAddress ДО записи → источник и задача одной транзакцией под `FOR UPDATE` бота →
очередь после коммита → 202. Вопрос владельца: бот по сессии → ядро (квота 3 scope ДО эмбеддинга, порог ДО модели,
проверка цитат ПОСЛЕ).

## Проверки (итоги дословно — в квитанции)

typecheck — 0 · lint — «Статические правила: ошибок нет» · build — в образе (стадия `build`: `npm run build`, «Compiled
successfully», маршруты `/api/bots…`, `/dashboard/bots/[botId]`, `…/install` в списке) · образ **760/760** · мутации
bot-cabinet **3/3** · регресс мутаций quota/rag-answer/preview-flow **13/13** · браузерный прибор **266/266** ·
`check-model-cost.cjs` — 0 · `check-job-contract.cjs` — 2 (`not-deployed`, как до фичи).

Status: completed
