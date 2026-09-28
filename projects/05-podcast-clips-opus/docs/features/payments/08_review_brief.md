# Бриф независимого ревью — фича 30 `payments` (N5 «КлипМейкер»)

Ты — независимый ревьюер другого семейства моделей. Код писал Claude Opus 5.5. Твоя задача — найти дефекты, а не
подтвердить качество. Работай ТОЛЬКО чтением файлов (песочница read-only). Каталог — `projects/05-podcast-clips-opus`
(текущий каталог). Диф фичи: `git diff bf69e0f3 HEAD -- .` (коммит плана `bf69e0f3`).

## Что сделано (коротко)

Живая оплата ЮKassa тарифа `paid` (990 ₽ / 30 дней, разовая). Тракт перенесён из N6 (`../06-rag-sales-chatbase`).
План и решения владельца: `docs/features/payments/01_plan.md` (AC-1…AC-18), `docs/decisions-owner.md` OWN-019,
`docs/ADR.md` ADR-019. Режим `N5_PAYMENTS_MODE` off|fake|live; стенд — off (магазина нет).

## Файлы для чтения (главные)

- `packages/db/migrations/021_payments.sql`, `packages/db/src/{payments,plan,ops-set-plan,quota}.ts`
- `apps/web/src/server/billing-{handler,deps,runtime}.ts`, `apps/web/src/server/payments/*.ts`
- `apps/web/src/app/api/checkout/route.ts`, `apps/web/src/app/api/checkout/[intentId]/route.ts`,
  `apps/web/src/app/api/webhooks/yookassa/route.ts`, `apps/web/src/app/upgrade/**`, `apps/web/src/lib/payment-return.ts`
- `packages/shared/src/{tariff,config,cta}.ts`, `apps/worker/src/render/cta-overlay.ts`
- чтения плана: `apps/web/src/server/{screen,short-link,clip-file,clip-music,video-cta,guest-pack,retention,limits,watchdog,guest-page}.ts`,
  `packages/db/src/{render,selection}.ts`
- `docker-compose.yml`, `.env.example`, `scripts/stand-set-yookassa.sh`
- тесты: `tests/billing.unit.test.ts`, `tests/billing.integration.test.ts`, `tests/paid-plan.integration.test.ts`,
  `tests/payments-guards.test.ts`, `tests/browser/billing.test.ts`, `tests/run-payments-mutations.mjs`
- контракт: `docs/webhook-contract.md`

## Что проверить особенно (правила репозитория)

1. Порядок вебхука: режим → сырые байты ≤ 64 КиБ → адрес `clientIp(headers, hops)` ∈ сетям ЮKassa → перезапрос и сверка
   ВНЕ транзакции → транзакция (ключ `event:object.id` UNIQUE → advisory-блокировка → применение). Может ли подделка
   занять ключ? Может ли недоступность ЮKassa закоммитить ключ (урок: оплата не применяется никогда)?
2. Повтор и перестановка: одно событие дважды, 20 одновременных, оплата/возврат в любом порядке, две оплаты — итог
   одинаков? Есть ли гонка между `applyVerifiedPayment` и `recordVerifiedRefund`, оплатой и стиранием аккаунта,
   оплатой и `ops:set-plan`, оплатой и сторожем `expirePaidPlans`?
3. Действующий план: `effectivePlanSql` / `effectivePlan` — во ВСЕХ ли местах чтения плана (метка рендера, срок хранения,
   экран, `/c/`, гостевая, смена музыки/призыва, ретенция, минуты)? Нет ли места, где `paid` с истёкшим сроком всё ещё
   даёт клип без метки или бессрочное хранение? Правильна ли ретенция «72 ч от GREATEST(finished_at, plan_paid_until)»?
4. Потолок минут paid: `checkAndConsumeQuota` читает план `FOR SHARE` — корректно ли, нет ли взаимоблокировок с
   другими путями (порядок блокировок video → account?), нет ли обхода потолка?
5. Конфигурация (honest-configuration): пусто/неизвестно/`fake` в production/`live` без ключей — отказ старта? compose
   `${N5_PAYMENTS_MODE-off}`; `N5_LIMIT_PAID_USER_MINUTES` обязателен и ≤ суточного.
6. Оформление: намерение ДО провайдера, повтор с тем же ключом — тот же платёж; Origin обязателен; открытый редирект в
   `?next=` (`safeNextPath`, `AuthForm`), 404 чужого намерения; экран возврата — шесть состояний, дедлайн по времени.
7. Надпись призыва у paid (`CTA_FRAME_LABELS_PAID`, `prepareCta(…, watermark)`) — нет ли пути, где paid-клип получает
   «ссылка ниже»? Учтено ли, что `watermark` в рендере = действующий план?
8. Тесты: доказывают ли они заявленное (не зеленеют ли при обеих реализациях)? Мутации 18/18 — правдоподобны?
9. Честность документов: `webhook-contract.md` (код 2 проверки — честно), ADR-005 дополнение, BACKLOG, OWN-019.

## Формат ответа (строго)

Первая строка: `ОЦЕНКА: <A|B|C|D>` (A — можно сливать; B — есть medium; C — есть high; D — есть blocker).
Затем таблица находок: `| # | серьёзность (blocker/high/medium/low) | файл:строка | что не так | последствие | как чинить |`.
Затем раздел «Заявления, не подтверждённые кодом» (если есть). Не выдумывай находок: если чисто — так и напиши, но
перечисли, что именно ты проверил. Отвечай по-русски.
