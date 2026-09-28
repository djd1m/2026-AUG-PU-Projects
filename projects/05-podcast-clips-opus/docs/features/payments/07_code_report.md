# 07 — Отчёт исполнителя: фича 30 `payments`

Дата: 2026-09-28 · Исполнитель: Claude Opus 5.5 (код) · Ревью: Codex `gpt-6-astra`, medium (`08_review.md`) · Тир XL.
План `01_plan.md`, самопроверка `02_validation.md`, решения владельца OWN-019, решение ADR-019. Ветка — worktree
`worktree-agent-a02dd597959d8688a`, от `bf69e0f3`; коммиты `838087c0` (реализация) · `81916d0a` · `9969cace` ·
`0ed619a9` (исправления по ревью).

## Отклонения от плана (названы, а не замолчаны)

1. **`N5_LIMIT_PAID_USER_MINUTES` обязателен ВСЕГДА, а не «при fake|live»** (план U4/AC-15). Причина: минуты списывает
   `worker-stt`, который режима оплаты не знает, а тариф `paid` бывает и от оператора при `off`. Необязательная переменная
   с откатом к free-потолку — тихий запасной путь; обязательная — громкий отказ старта. Цена: перед выкладкой кода на стенд
   в `.env.n5-demo` нужна строка `N5_LIMIT_PAID_USER_MINUTES=270` (`check-env-complete.sh` это ловит — код 1).
2. **При `off` `/api/checkout` отвечает 404, а не 409 `payments_off` как у N6** — по AC-1 плана («маршруты → 404»).
3. **Экран интереса не переносился из N6** — у N5 свой tRPC `interest.create`, он остался при `off` без изменений.
4. **Специфика не правилась** (заморожена sha `3ac09f3d…`): оплата описана в `docs/Specification-addendum.md`.
5. **Атрибуция и комиссии не тронуты** (план §6): оплата не меняет `attribution`.
6. **Сеть ЮKassa проверяется в обработчике для любого провайдера** (у N6 — только в адаптере ЮKassa): фейк иначе принимал
   бы уведомления с любого адреса в режиме `fake`.

## Переиспользование: ответ по каждой единице (U1–U10 плана)

| # | Единица | Ответ | Что изменено и почему |
|---|---|---|---|
| U1 | Миграция `021_payments.sql` | **адаптировано** из N6 `006_tariffs_payments.sql` | без колонки `plan` у намерения и платежа (тариф один); `review_reason` + `account_erasing`; `operator_action.plan_*` — закрытый набор `free|paid`; `pro_interest` не тронута |
| U2 | Провайдер `payments/{provider,yookassa,fake,origin,cidr-match}.ts` | **перенесено** без изменений логики (первая строка файла — «из N6: …») | — |
| U2 | `payments/config.ts` | **адаптировано** | проверка окружения — в `@clipmaker/shared/tariff` (`loadPaymentsConfig`), вызывается из `loadWebConfig` ⇒ и из preflight до Next; здесь только выбор провайдера |
| U3 | `packages/db/src/payments.ts` | **адаптировано** | убраны комиссии и `attribution … converted`, ранги планов; порядок блокировок account → payment_intent (ревью, круг 2); `account_inactive` при оформлении стирающимся аккаунтом |
| U4 | Цена и пределы (`shared/tariff.ts`, `config.ts`, `quota.ts`, `limits.ts`) | **написано заново** — «нет в клоне/доноре» | числа N5 (990 ₽, 30 дней, 270 мин); `effectivePlan`, `clipExpiry`; потолок минут `paid` в `checkAndConsumeQuota` (план читается из базы без блокировки строки — ревью, круг 1) |
| U5 | `billing-{handler,deps,runtime}.ts`, `api/checkout/*`, `api/webhooks/yookassa` | **адаптировано** | тело `{idempotency_key}`; `clientIp(headers, hops)` N5 вместо «ровно один XFF»; Origin обязателен; `allowRead` на опрос; 404 при off; журнал «на разбор оператору» |
| U6 | Действующий план в чтениях | **написано заново** (N5-специфично) | `effectivePlanSql`/`retentionFromSql` (`packages/db/src/plan.ts`) в `render.ts`, `selection.ts`, `screen.ts`, `short-link.ts`, `clip-file.ts`, `clip-music.ts`, `video-cta.ts`, `guest-pack.ts`, `retention.ts`, `limits.ts`, `quota.ts` |
| U7 | Экраны `upgrade/*`, `lib/payment-return.ts`, `ProInterest`, `ClipCard`, `VideoDetail`, гостевая, `AuthForm` | **адаптировано** | тексты и классы N5; `from` вместо `plan`; `next` — `/upgrade?from=…` и `/upgrade/return?intent=<uuid>`; при off — прежний экран интереса |
| U8 | Оператор `ops-set-plan.ts`, сторож | **адаптировано** из N6 `tariffs.ts` | `free|paid`; снятие стирает остаток срока; `expirePaidPlans` — шаг `watchdogTick`, срок (`plan_paid_until`) сохраняется для ретенции |
| U9 | compose, `.env.example`, `check-env-*`, `scripts/stand-set-yookassa.sh` | **адаптировано** | `${N5_PAYMENTS_MODE-off}`; `YOOKASSA_*` только у web; скрипт: env `.env.n5-demo`, требует `N5_LIMIT_PAID_USER_MINUTES`, проверяет пересоздание, здоровье, режим и откат (ревью, круги 1–3) |
| U10 | Контракт и стражи | **адаптировано** | `webhook-contract.md` — три класса, код 2 честно; страж ADR-005 заменён AC-16; тесты разделены на `billing.unit`, `billing.integration`, `paid-plan.integration`, `payments-guards`, браузерный `billing`; фикстура `fake-yookassa-server.ts` — **перенесено** |

## Находка 1 ревью фич 25–29 (в объёме фичи)

`packages/shared/src/cta.ts` — `CTA_FRAME_LABELS_PAID` («Смотрите полный выпуск», «Подписывайтесь на автора»; «Перейти
по ссылке» у `paid` не рисуется, причина `paid_no_link`); `prepareCta(…, watermark)` — параметр обязательный, передаётся
действующий план рендера. Тест пары «paid + призыв» — `tests/billing.unit.test.ts`; мутация `paid-cta-link-text`.

## Мутации — `tests/run-payments-mutations.mjs`, 22/22 убиты (`tests/artifacts/payments/mutations/`)

| id | Дефект | Страж |
|---|---|---|
| no-requery | принять заявленный объект вместо перезапроса | AC-5 (integration) |
| key-before-auth | запись через `applyPayment` до проверки подлинности | порядок вебхука (guard) |
| unavailable-as-value | недоступность ЮKassa → 200 значением | AC-6 (integration) |
| no-advisory-lock | без блокировки платежа | AC-7 блокировка (integration) |
| now-plus-30 | срок от `now()` вместо `GREATEST` | AC-7 перестановка |
| fake-in-production | фейк разрешён в production | unit |
| compose-colon-off | `${…:-off}` | guard |
| no-poll-deadline | без предела по времени | unit |
| fourth-plan-writer | четвёртый путь смены плана | AC-16 guard |
| no-origin-check | без сети ЮKassa в обработчике | unit |
| plan-ignores-expiry | действующий план без срока | AC-3/AC-11 рендер |
| retention-from-finish | ретенция от готовности, не от конца оплаты | AC-12 |
| paid-cta-link-text | paid получает «ссылка ниже» | unit |
| paid-minutes-ignored | paid на free-потолке | AC-15 |
| paid-above-global | персональный потолок выше суточного | unit |
| operator-keeps-remainder | снятие плана не стирает срок | AC-13 |
| erasing-gets-plan | тариф стирающемуся аккаунту | AC-9 |
| amount-mismatch-grants | тариф при неверной сумме | AC-8 |
| guest-download-all-offer | «Скачать все» захватывает ссылку тарифа | guard (ревью 1·1) |
| quota-plan-lock | `FOR SHARE` при списании минут | guard (ревью 1·2) |
| return-next-lost | вход теряет экран возврата | unit (ревью 1·3) |
| intent-before-account | намерение раньше аккаунта | AC-9 гонка (ревью 2·1) — красное = 503 жертвы взаимоблокировки |

Каждая строка — «дефект возвращён → красный (exit 1, failed ≥ 1), восстановлен → зелёный (exit 0, failed 0)»; журналы и
JSON по каждой фазе — `tests/artifacts/payments/mutations/<id>-{red,green}.{log,json}`.

## Проверки (итог после круга 3)

| Проверка | Результат | Файл |
|---|---|---|
| `npm run typecheck` | код 0 | `tests/artifacts/payments/typecheck.txt` |
| `npm run lint` | «Статические правила: ошибок нет» | `tests/artifacts/payments/lint.txt` |
| Полный набор в Docker (`-p n5-test-pay`, PostgreSQL 16, Redis 7, MinIO) | `Test Files 113 passed (113)`, `Tests 1034 passed (1034)` | `tests/artifacts/payments/full-suite-final.txt` |
| Браузерный набор в `mcr.microsoft.com/playwright:v1.60.0-noble` | `Test Files 3 passed (3)`, `Tests 182 passed (182)` (из них 48 — экраны оплаты) | `tests/artifacts/payments/browser-full-final.txt` |
| Мутации | 22/22 killed | `tests/artifacts/payments/mutations-final.txt` |
| `check-webhook-contract.cjs` | код 2, `no-provider` — честно (подписи у ЮKassa нет, магазина нет) | `tests/artifacts/payments/webhook-contract-check.txt` |
| `check-model-cost.cjs` | код 0, 3 вызова | `tests/artifacts/payments/model-cost-check.txt` |
| `check-env-wiring.mjs` (compose стенда) | «Потерь нет» | `tests/artifacts/payments/env-wiring.txt` |
| `check-env-complete.sh .env.n5-demo` | код 1: нет `N5_LIMIT_PAID_USER_MINUTES` — **ожидаемо, шаг владельца перед выкладкой** | `tests/artifacts/payments/env-complete-stand.txt` |
| `stand-set-yookassa.sh` | 5 исходов ввода на копии `.env.example`; 8 веток перезапуска/отката на подменном docker | `stand-script-check.txt`, `stand-script-restart-check.txt` |
