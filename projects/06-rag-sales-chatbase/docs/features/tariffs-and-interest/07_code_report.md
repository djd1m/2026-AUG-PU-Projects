# 07 — Отчёт о коде: `tariffs-and-interest` (фича 14)

Дата: 2026-09-26 · Исполнитель: Claude Opus 5.5 (fork координатора, изолированный worktree, один исполнитель) · Основа:
`9b3b32db` (план) → `c2dbabb4` (реализация) → исправления по ревью. Тир XL (деньги), чекпойнт плана — у владельца.
FR-TARIFF-002/003, SC-US-011-1/2; ADR-017 (дополнен), ADR-014 (строки reuse), ADR-004. Решения: A-N6-040 (владелец), A-N6-041.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| U1 миграция | `packages/db/migrations/006_tariffs_payments.sql` | `payment_intent`, `payment_event` (UNIQUE provider+event), `payment` (UNIQUE provider+payment, needs_review), `operator_action`, `account.plan_source/plan_paid_until`, закрытый `pro_interest.origin_screen` |
| U2 провайдер | `apps/web/src/server/payments/{provider,yookassa,origin,cidr-match,fake,config}.ts` | ПЕРЕНЕСЕНО из N4 без изменений логики (+ `apiBase` для подменного сервера); `config.ts` — адаптация `select-provider`: off/fake/live |
| U3 цены и пределы | `packages/rag/src/constants.ts`, `apps/worker/src/crawl/limits.ts` | `PLAN_PRICE_MINOR`, `PAID_PLAN_DAYS`, `PLAN_RANK`, `formatRubles`; `PAGES_BY_PLAN` переехал в `@n6/rag` (воркер реэкспортирует) |
| U4 деньги в БД | `packages/db/src/{payments,tariffs}.ts` | намерение, применение оплаты (ключ → блокировка платежа → намерение → план → платёж → атрибуция), возврат, истечение, интерес, SetPlanByOperator |
| U5 маршруты | `apps/web/src/server/billing-{handler,deps,runtime}.ts`, `app/api/{checkout,checkout/[intentId],interest,webhooks/yookassa}/route.ts` | порядок входа кабинета (экспортированы `guardMutation`/`body`); вебхук — адрес → перезапрос/сверка ВНЕ транзакции → ключ → применение |
| U6 экраны | `app/pricing/*`, `app/upgrade/{page,UpgradeScreen}.tsx`, `app/upgrade/return/{page,ReturnScreen}.tsx`, `lib/payment-return.ts`, `login/*`, `InstallViews.tsx`, `globals.css` | тарифы из кода с «цена предварительная»; оплата или интерес; шесть состояний возврата; `next` с белым списком; «Убрать бейдж» на установке |
| U7 оператор и сторож | `packages/db/src/ops-set-plan.ts`, корневой `package.json` (`ops:set-plan`), `apps/worker/src/watchdog.ts` | команда с журналом; истёкший оплаченный план → free |
| U8 конфигурация | `apps/web/src/server/{environment,runtime}.ts`, `preflight.ts`, `docker-compose.yml`, `.env.example` | режим проверяется в preflight до `next start`; секрет магазина — только web |
| U9 контракт и стражи | `docs/webhook-contract.md`, `tests/billing.{unit,integration}.test.ts`, `tests/browser/billing.test.ts`, `tests/fixtures/fake-yookassa-server.ts`, `scripts/test-tariffs-mutations.mjs` | три класса вебхука; страж «три писателя плана», «один вебхук»; 14 мутаций |

## Дефекты, пойманные по ходу

- **Браузер поймал два дефекта экрана оформления** до ревью: после ответа `payments_off` кнопка «Сообщите мне» оставалась
  заблокированной (ветка выходила до снятия `busy`) — интерактивный тест упал по таймауту 30 с; ссылка «Все тарифы» меньше
  цели 44×44 (R2). Оба исправлены, тест зелёный в Chromium и WebKit.
- **Ревью Codex — 3 high, 4 medium**, все исправлены (08_review.md).
- Ограничение «платный план обязан иметь источник» сломало бы существующие наборы, создающие аккаунты сразу с планом —
  снято; вместо него `plan_source none` бессрочен (A-N6-041 п.3).

## Отклонения от плана и почему

- **Провайдер не в новом пакете `packages/payments`, а в `apps/web/src/server/payments/`** — новый workspace требовал бы
  перегенерации lockfile; провайдера зовёт только web (A-N6-041 п.1).
- **Состояний возврата шесть, а не четыре**: добавлены «не найдено» и (по ревью) «оплата прошла, план не действует».
- **`check-webhook-contract.cjs` — код 2, а не 0**: вендорная проверка описывает только подписанные вебхуки, ЮKassa не
  подписывает; честный ответ `НЕ ВЫПОЛНЕНА / no-provider`, как в N3. Вендорный файл не правился.
- **Specification FR-TARIFF-002 переписан на месте тем же числом строк** (609): ссылки `Specification.md:N` в
  `test-scenarios.md` не сдвинулись; новая ревизия `sha256:e5ea4c9a…`.
- **Канон**: сущностей 23 (19 + 4), маршруты `checkout` и `webhooks/yookassa`, перечисления `plan_source`, `payment_intent.status`.

Status: completed
