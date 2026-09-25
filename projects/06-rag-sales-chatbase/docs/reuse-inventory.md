# N6 — что взять готовым из N1–N5 вместо написания

**Дата:** 2026-09-25 · **Основание:** указание владельца «если можно не кодить, а взять готовое —
возьми: дизайн, оплата, аутентификация» · **Метод:** только чтение `projects/01…05`. Пути и число
строк (`wc -l`) проверены 2026-09-25. Число тестов — приблизительно (подсчёт `it(`/`test(`).
Живость доменов по curl НЕ проверялась: «живой» ниже — со слов документов проектов.

`P/` = `projects/`. N1 = `01-testimonials-senja` (Proofwall), N2 = `02-review-qr-reputation`,
N3 = `03-affiliate-rewardful`, N4 = `04-calorie-vision-cal-ai` (Тарелка), N5 = `05-podcast-clips-opus`
(КлипМейкер).

## Как эта карта применяется (иначе она украшение)

Правило перенято из [`N5 reuse-map.md`](../../05-podcast-clips-opus/docs/reuse-map.md):
1. Постановка КАЖДОЙ фичи N6 содержит раздел «Переиспользование» со строками этой карты.
2. Отчёт исполнителя отвечает по каждой строке: `перенесено` · `адаптировано (что изменено)` ·
   `написано заново (почему)`. Молчание о строке — незакрытая строка.
3. `написано заново` требует причины: `противоречит канону` · `нет в донорах` · `донор делает
   другое` · `зависит от стека, которого у нас нет`.
4. Перенесённый код проходит те же ворота, что написанный: тесты, стражи с внедрённым дефектом, ревью.
   Карта утверждает, что фрагмент СУЩЕСТВУЕТ и подходит, а не что он корректен.

Базовый стек-донор — **N5** (Next.js 15 + pg без ORM + Docker Compose + Caddy): он новее всех,
живёт на `clipmkr.ru` с 24.09 и единственный имеет `docs/REPRODUCE.md`. Доноры на Fastify (N4) и
чистом Node (N2, N3) переносятся логикой, а не файлами.

## Топ-5 (самое ценное)

| # | Блок | Донор | Экономия |
|---|---|---|---|
| 1 | **Виджет + бейдж + тариф решает сервер** | N1 `apps/widget/*`, `lib/tariff.ts`, `lib/widget-config.ts`, `badge.ts` | весь FR-GROWTH-003 и каркас встраивания: Shadow DOM, сборка с хэшем и потолком 30 КБ gzip, анти-тампер бейджа |
| 2 | **Вход, сессии, лимит частоты** | N5 `server/auth*.ts` + N1 `password-reset.ts`, `sso.ts` (Яндекс ID) | foundation целиком; N1 добавляет сброс пароля и вход через Яндекс |
| 3 | **ЮKassa: провайдер + вебхук + подписка** | N4 `payments/*`, `routes/payments-webhook.ts`, `subscription/*`; для Next-формы — N1 `lib/payment.ts` + `api/webhooks/payment` | весь платёжный контур, пройденный целиком на ТЕСТОВОМ магазине (478,65 ₽ партнёру) |
| 4 | **Потолки платных вызовов для анонимов** | N4 `quota/keys.ts` (сессия устройства + префикс IP + глобально) поверх N5 `packages/db/src/quota.ts` | model-cost-contract для посетителей чужих сайтов |
| 5 | **Дизайн-токены, тёмная тема, прибор адаптивности, compose + REPRODUCE** | N5 `globals.css`, `lib/theme.ts`, `scripts/check-responsive.*`, `docker-compose.yml`, `proxy/Caddyfile`, `docs/REPRODUCE.md` | оформление и развёртывание без изобретения |

## 1. Аутентификация и сессии

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/05…/apps/web/src/server/auth.ts` (43), `auth-store.ts`, `auth-handler.ts`, `ip.ts`, `rate-limit.ts` (22) | bcrypt cost 10 с фиктивным хэшем (равное время), токен 32 байта хранится HMAC-хэшем, cookie `__Host-n5_session` на 7 дней, zod почта+пароль, проверка Origin, потолок тела 4 КБ, лимит Redis 30 мутаций / 120 чтений в минуту | фича `foundation` done; `tests/auth.test.ts`, `bcrypt-load.test.ts`; живо на clipmkr.ru | имя cookie и таблиц; убрать импорт `@clipmaker/shared` | нет сброса пароля и подтверждения почты; нужен Redis |
| `P/01…/apps/web/src/lib/password-reset.ts` (185), `password-change.ts`, `sso.ts` (240) + `sso-account.ts` | сброс пароля, смена с отзывом других сессий, вход через Яндекс ID (OAuth) | FR-009/010/016 done; тесты login ≈41, sso ≈51 | взять ЛОГИКУ сброса и Яндекс ID поверх N5-сессий | argon2id (а не bcrypt) — выбрать одно; в дорожной карте N1 FR-015 «planned», хотя код есть — уточнить |
| `P/01…/packages/db/src/tenant.ts` (83), `migrations/007_rls.sql` | мультиарендность через RLS: `withAccount` ставит `app.current_account_id` | `packages/db/tests/rls.test.ts` | основа изоляции «студия → клиентские боты» | модель 1 аккаунт → N проектов; иерархии «студия → клиент» НЕТ |
| `P/04…/apps/api/src/auth/verify-init-data.ts` | вход Telegram Mini App | живьём 🔴 не проверялся | не нужен в неделю | Fastify |

## 2. Оплата (ЮKassa)

**Все четыре магазина — ТЕСТОВЫЕ** (ключи с префиксом `test_`); настоящих денег не принимал никто.
Самый проверенный путь — N4: `functional-verification.md:929` «✅ пройдено целиком на ТЕСТОВОМ
магазине: платёж → вебхук → подписка → 478,65 ₽ партнёру»; `:932` «🔴 Приём НАСТОЯЩИХ денег».
В N5 оплаты нет (не входила в неделю; в jan-clone `lib/yookassa.ts` спит и перенос запрещён reuse-map).

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/04…/apps/api/src/payments/yookassa.ts` (285), `provider.ts`, `origin.ts` (CIDR ЮKassa в коде, вкл. IPv6), `cidr-match.ts`, `fake.ts`, `select-provider.ts` | абстракция провайдера; суммы в копейках строкой; подлинность = IP-источник + перезапрос платежа + сравнение объекта (уведомления ЮKassa не подписаны) | ≈34 юнит-теста + интеграционный вебхук + конкурентный | **лучший TS-источник**: перенести файлы как есть | — |
| `P/04…/apps/api/src/routes/payments-webhook.ts` (236) | сырое тело; порядок: проверка вне транзакции → захват ключа `event:objectId` → применение; перестановочный (продление `GREATEST(period_end, now)+30d`) | тестовая оплата 16–17.09 | переписать как route handler Next | стык прокси: Caddy дописывал свой IP в XFF → `foreign_ip`; исправлено в Caddyfile N4 — повторится в N6, если не перенести фикс |
| `P/04…/apps/api/src/routes/subscription.ts`, `renewals/*`, `subscription/is-pro.ts`, `migrations/010_subscription_and_commission.sql` | покупка подписки, автопродление, «про ли пользователь» | фича done | «Без бейджа» и «Студия» = подписка; `is-pro` → `badgeRequired` | автопродление только на тестовом магазине |
| `P/01…/apps/web/src/lib/payment.ts` (292), `app/api/webhooks/payment/route.ts`, `app/api/checkout/route.ts` | ТА ЖЕ логика уже в форме **Next.js**: идемпотентность по `event_id`, IP allowlist, перезапрос, `ProviderUnavailable` бросается и откатывает захват | FR-008 done; payment.test ≈31 | ближе всего к нашему стеку — взять форму маршрута отсюда, провайдер — из N4 | вырезать n3-bridge и agent-payments |
| `P/01…/docs/yookassa-setup.md`, N2 `payment.ts` | настройка магазина | — | **N6 нужен СВОЙ магазин**: у магазина один URL уведомлений, N2 свой уже занял | — |

## 3. Встраиваемый виджет

Реальный виджет на чужих сайтах есть только в N1. В N4 и N5 `embed-contract.md` отвечает
«Встраиваемый виджет: нет». У N1 **нет** `docs/embed-contract.md` — N6 пишет его первым
(`node .claude/hooks/check-embed-contract.cjs .`).

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/01…/apps/widget/src/index.ts` (101), `render.ts`, `styles.ts`, `api.ts`, `types.ts` | `<script data-slug async>` через `currentScript`; открытый Shadow DOM; свои стили; один запрос конфигурации | FR-006 done; тесты isolation, xss (≈35 всего) | рендер отзывов → окно чата (поле, поток ответа, плашка источника) | чат требует кросс-доменного POST/стрима — N1 этого НЕ делал; CORS только для GET |
| `P/01…/apps/widget/src/badge.ts` (205) | бейдж «Powered by» с MutationObserver против удаления; предел описан в шапке (скрытие родителя вне shadow root не ловится → ToS) | FR-GROWTH-003 done; тесты badge-integrity, badge-link | почти как есть; текст и UTM с доменом-источником | открытый shadow root по замыслу |
| `P/01…/apps/widget/scripts/build.mjs`, `check-bundle-size.mjs` | бандл `widget.<hash>.js`, сборка падает > 30 КБ gzip | собранный файл в `apps/web/public/` | окну чата может понадобиться больший бюджет — назвать число | — |
| `P/01…/apps/web/src/app/api/widget/config/route.ts`, `lib/widget-config.ts`, `widget-install.ts` (137), `badge-click/route.ts`, `lib/badge.ts`, `lib/tariff.ts` (86) | сервер один решает `badge_required` по тарифу и `paid_until`; установка определяется по Origin | ≈29 + 12 + 15 тестов | `widget-install` = **метрика недели** (внешний домен); добавить allowlist доменов на бота для POST чата | `Caddyfile` N1 предупреждает: двойной `Access-Control-Allow-Origin` молча ломает CORS ([deployment-seams](../../../.claude/rules/deployment-seams.md)) |
| `P/01…/apps/web/src/lib/branding.ts` (41) | логотип, акцент, заголовок проекта (jsonb) | branding.test | старт для знака студии (план «Студия») | не white-label: нет своего домена и скрытия нашего бренда |
| `P/01…/apps/web/src/lib/wall.ts` | публичная страница по слагу, только одобренное | done | каркас демо-страницы `/b/<slug>` (FR-GROWTH-005) | индексация — по умолчанию `noindex` |

## 4. Партнёрка

**Партнёров-студий с sub-аккаунтами и white-label нет ни в одном проекте — это новая работа N6.**

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/01…/apps/web/src/lib/referral.ts` (160), `partner.ts` (232), `partner-auth.ts`, `app/partner/*` | cookie `pw_ref`; промокод сильнее cookie; антифрод 50 регистраций / IP / 10 мин; кабинет когорты по токену; атрибуция конвертируется на оплате | FR-GROWTH-002/004 done; ≈66 тестов | Next.js — ближайший стек; FR-GROWTH-002 целиком | партнёр = владелец кода, не студия с клиентами |
| `P/04…/apps/api/src/partner/*`, `commission/accrue.ts` (107), `payouts/payout-details.ts`, `routes/earnings.ts`, `exports.ts`, `apps/web/app/cabinet/*` | полный цикл: `/r/{code}`, атрибуция, начисление с холдом и возвратом при рефанде, CSV, реквизиты, кабинет | 4 фичи done; 478,65 ₽ на тестовом платеже; реальные выплаты 🔴 | **лучший журнал комиссий** — перенести логику в Next | прогрессивный НДФЛ физлицам (research §6) |
| `P/05…/apps/web/src/server/partner.ts` (115), `lib/partner-referral.ts` | HMAC-подписанная cookie `__Host-n5_referral` 14 дней, три источника с правилами замены | done | компактно и в том же стеке | без оплаты — без комиссии |

## 5. Дизайн, тёмная тема, прибор адаптивности

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/05…/apps/web/src/app/globals.css` (165) | все цвета — токены в двух блоках (тёмный `:root`, светлый `[data-theme=light]`) + шкала отступов | фича `dark-theme` done; `tests/theme.test.ts` | заменить палитру (FR-LOOK-008: нейтральная), одна семья шрифта с кириллицей | CSS плотный, однострочный |
| `P/05…/apps/web/src/lib/theme.ts`, `ThemeToggle.tsx` | cookie темы; fail-closed: всё, кроме ровно `light`, → тёмная | там же | переименовать cookie | **виджету на чужом сайте нужна своя тема** (по хозяину), не cookie кабинета |
| `P/05…/scripts/check-responsive.sh` + `.mjs` (151), `scripts/responsive/rules.mjs`, `tests/browser/responsive-check.test.ts` | Playwright-в-Docker проверка вёрстки; код 2 при сбое инфраструктуры | фичи `responsive-check`, `mobile-audit-fixes` done | направить на маршруты N6 и на **чужую тестовую страницу с виджетом** (360 px) | нужен Docker; файл теста сейчас правится в N5 параллельно — брать после их коммита |

## 6. Потолки платных вызовов

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/05…/packages/db/src/quota.ts` (62), `apps/web/src/server/limits.ts`, `apps/worker/src/llm/spend.ts`, `llm/provider.ts` (OpenRouter); compose `x-quota-env` с `${VAR:?}` | списание в транзакции с savepoint, области «на пользователя» и «глобально за сутки (МСК)», журнал расхода по ПОПЫТКАМ; незаданный потолок валит старт | `docs/model-cost-contract.md` «ВЫПОЛНЕНА»; тесты + мутационный скрипт | области → ответы/сутки на бота, на аккаунт, глобально; эмбеддинги на индексацию | аккаунтные квоты не подходят анонимам |
| `P/04…/apps/api/src/quota/keys.ts` (52), `check-and-consume.ts`, `consume-in-transaction.ts` | ключи для анонимов: сессия устройства + префикс IP + глобально, отдельный счётчик эскалации | unit + concurrency тесты; контракт 10/польз., 3000/сутки | **модель для посетителей виджета** | Fastify — переносить логику |
| `P/05…/apps/worker/src/llm/provider.ts` | вызов модели через OpenRouter | живо | возможный маршрут эмбеддингов из РФ (открытый вопрос №1 брифа) | трансграничная передача ПДн |

## 7. Compose, Caddy, деплой

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/05…/docker-compose.yml`, `Dockerfile`, `proxy/Caddyfile`, `scripts/check-env-wiring.*`, `check-env-complete.sh`, `docs/REPRODUCE.md` (530) | семь сервисов, хранилища без `ports:`, секреты и потолки `${VAR:?}`, `trusted_proxies` | единственный REPRODUCE «собрано и проверено 24.09.2026»; живо | образ Postgres → `pgvector/pgvector:pg16` (с явным тегом); Redis/BullMQ — для краулинга как долгой задачи | проверять `bash scripts/check-port-conflicts.sh` (pgvector-образ уже в его списке) |
| `P/04…/Caddyfile`, `proxy/Dockerfile` (xcaddy + caddy-ratelimit), `ops/ai-hub-caddy-block.txt` | своя «дверь» с лимитом 30/120, XFF заменяется `{client_ip}`; вверх — общий TLS-прокси сети `talk-ai-public` | живой дефект оплаты найден и исправлен | лимит на двери для публичного чата | несовпадение `APP_ORIGIN`/DNS (эпизод NXDOMAIN 16.09) |
| `P/01…/Caddyfile` | ACME, immutable-кэш хэшированного виджета | живо по документам | правила кэша бандла виджета | двойной ACAO |

## 8. Стражи и правила (брать как есть — они общие для репозитория)

`.claude/hooks/`: `check-embed-contract.cjs`, `check-webhook-contract.cjs`, `check-model-cost.cjs`,
`check-job-contract.cjs` (краулинг и индексация — долгая задача), `check-ports.cjs`,
`check-external-deps.cjs`, `check-growth-trace.cjs`, `check-look-trace.cjs`, `check-canon.cjs`,
`check-docs-complete.cjs`. `scripts/`: `check-port-conflicts.sh`, `check-pipeline-gaps.sh`,
`complexity-router.sh`. N5: мутационные скрипты `scripts/test-*-mutations.mjs` как образец.

## 9. RAG, pgvector, краулер, PDF — донора НЕТ

Поиск `pgvector|embedding|pdf-parse|pdfjs|cheerio|readability|crawl` по всем проектам (без
node_modules) реализации не нашёл. Пишется заново: схема pgvector, краулер, разбор PDF, чанкинг,
поиск, плашка источника, порог «не знаю». Ближайшие опоры:

| Опора | Путь | Зачем |
|---|---|---|
| Факты про эмбеддинги и лимит HNSW ≤ 2000 измерений | `research/openai-footprint/02-vision-rag.md` §4–§5 (данные на 26.08.2026 — перепроверить) | размерность 1536, `halfvec` как обход |
| Очередь с фенсом попыток | `P/05…/packages/queue`, `packages/db/src/attempts.ts` | краулинг/индексация как долгая задача с идентификатором до начала работы |
| S3-адаптер | `P/05…/packages/s3` | хранение загруженных PDF |
| Загрузка файла | `P/05…/apps/web/src/server/upload-*` | загрузка PDF с квотой |

## 10. Уведомления владельцу бота

| Путь | Что делает | Готовность | Что адаптировать | Риск |
|---|---|---|---|---|
| `P/02…/services/notifier/src/worker.ts` (103), `deliver.ts`, `binder.ts`, `format.ts`, `expire.ts` | outbox-воркер: `FOR UPDATE SKIP LOCKED`, статус `sending` до вызова, 5 попыток, таймаут 8 с, 4xx/5xx раздельно; привязка через `/start <token>` | тесты binder/expire/notifier | сводка «ответил на N, не знал M» (удержание, бриф M5-D) | long-polling `getUpdates` конфликтует с вебхуком на том же токене; у владельца t.me-ссылки не открываются — давать QR/команду |

## Чего здесь нет и что НЕ переносить

- Командная работа, публикации в соцсети, BYOK, выбор модели пользователем — не входят в неделю.
- `P/01…/packages/agent-payments/*` (≈1560 строк) — избыточно для N6.
- N3a (партнёрка на Next) — заблокирован, 2 из 12 фич; брать только идеи схемы согласий.
