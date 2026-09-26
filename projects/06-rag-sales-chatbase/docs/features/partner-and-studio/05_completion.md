# 05 — Квитанция: `partner-and-studio` (фича 15)

Дата: 2026-09-26 · Основа: `bc09ec70` (план XL и ответы владельца) · ADR: ADR-012/013/014 (reuse), ADR-017 (оплата живая)
· Решения: **A-N6-043…049** · Отчёты: [`07_code_report.md`](07_code_report.md), [`08_review.md`](08_review.md).

## Профиль и модели

Один исполнитель: Claude Opus 5.5 (агент в отдельном worktree; делегирования не было). Ревью — Codex CLI, модель
`gpt-6-astra`, усилие `medium` (обе строки — из журнала, `tests/artifacts/partner-and-studio/codex-review-header.txt`).
Живых платежей и вызовов моделей продукта не было. Телеметрия p-replicator: счётчики токенов и времени агента — `null`
(недоступны изнутри агента).

## Проверки и итоги (дословно)

| Проверка | Где | Итог |
|---|---|---|
| typecheck | контейнер Playwright (в тестовом образе нет типов Playwright) | `typecheck exit=0` |
| lint | там же и в образе | `Статические правила: ошибок нет` |
| полный набор, Postgres 16 + pgvector и Redis 7.4 | `docker compose -p n6-test-f15 -f compose.test.yml … run --rm --build test` | `Test Files 49 passed (49)` · `Tests 943 passed (943)` — `tests/artifacts/partner-and-studio/final-run.txt` |
| мутации | там же, `node scripts/test-partners-mutations.mjs` | **14/14** пойманы, восстановление зелёное — `final-run.txt` |
| браузер партнёрки, Chromium + WebKit | `bash scripts/check-responsive.sh --test tests/browser/partners.test.ts` | `Tests 82 passed (82)` — `browser-run.txt` |
| весь браузерный набор | `bash scripts/check-responsive.sh --test tests/browser` | `Test Files 8 passed (8)` · `Tests 513 passed (513)` — `browser-all-run.txt` |
| сборка web | стадия build образа (`next build`) | прошла (часть прогона образа) |

Наблюдение, не относящееся к фиче: `tests/probes.test.ts` (фича 2) один раз упал по таймауту `beforeAll` 20 с, когда
параллельно шёл тестовый стек фичи 16; отдельно — 3/3 зелёных. Его `beforeAll` компилирует пакет и под нагрузкой
машины не укладывается в 20 с. В итоговом прогоне — зелёный.

## Стражи, испытанные мутацией (дефект → красный; восстановлено → зелёный)

```
antifraud-off: 1 failed | 35 passed (36) → 36 passed (36)
self-referral-off: 2 failed | 34 passed (36) → 36 passed (36)
equal-source-overwrites: 1 failed | 35 passed (36) → 36 passed (36)
explicit-falls-back: 1 failed | 35 passed (36) → 36 passed (36)
fee-unknown-full-amount: 1 failed | 35 passed (36) → 36 passed (36)
money-outside-commission: 1 failed | 35 passed (36) → 36 passed (36)
no-clawback: 4 failed | 32 passed (36) → 36 passed (36)
client-limit-unchecked: 1 failed | 35 passed (36) → 36 passed (36)
payout-over-available: 2 failed | 34 passed (36) → 36 passed (36)
referral-unsigned: 1 failed | 35 passed (36) → 36 passed (36)
payer-for-update: 1 failed | 35 passed (36) → 36 passed (36)        (возврат FOR UPDATE — настоящий deadlock Postgres)
window-excludes-refunded: 1 failed | 35 passed (36) → 36 passed (36)
payout-day-next-month: 1 failed | 35 passed (36) → 36 passed (36)
invite-reusable: 3 failed | 33 passed (36) → 36 passed (36)
```

## Что доказано и чем (AC плана)

- **AC-1/2:** cookie `/r/{code}` — подпись, срок, первая ссылка сильнее, 302 для любого кода (unit); явный неверный и
  замороженный код — `invalid_code`, аккаунта нет, к cookie не откатываемся; cookie-код — атрибуция cookie (Postgres);
  поле кода и ошибка под ним — браузер.
- **AC-3:** все 9 пар силы источника; converted не перезаписывается (Postgres).
- **AC-4:** свой код и владелец с того же префикса за 24 ч → rejected(self_referral), применение не засчитано.
- **AC-5 (конкурентно):** 30 одновременных регистраций → ровно 20 засчитаны, 21-я заморозила код (1 строка аудита) и
  прошла без атрибуции, 9 — ошибка поля; добросовестный NAT: 20 старше 10 мин + 20 новых — не заморожен.
- **AC-6/8:** приглашение только studio и свой бот с контактом; 7 дней; приём → клиент владелец, `studio_account_id`
  студии, атрибуция invite; повтор 409, истёкшее 410, своё — own_invite; **10 одновременных приёмов → один владелец**.
- **AC-7 (конкурентно):** free-клиент с ботом — plan_limit, бот остаётся у студии; одновременные «создать бота» и
  «принять» — ботов ≤ 1 в 5 раундах.
- **AC-9:** начисление = floor((99 000 − 3 465) × 20 %) = 19 107 коп., зрелость ровно +30 дней; повтор события и **20
  одновременных доставок → одно начисление**.
- **AC-10:** нет начисления без атрибуции, при rejected, у seed-кода без владельца, при несовпадении суммы, при неизвестном
  удержании (строка аудита), за пределами 12 месяцев; возврат первой оплаты не сдвигает окно (ревью, находка 1).
- **AC-11:** сторно −начисление в обоих порядках; оплата и возврат одновременно → баланс 0.
- **AC-12/13:** выплата — нет реквизитов, ниже минимума, больше доступного — отказ; ключ идемпотентен, другой суммой —
  конфликт; **две одновременные выплаты → одна**; после выплаты возврат → долг 19 107, «к выплате» 0; в кабинете нет
  почты и id плательщика; телефон маской; номер карты — 422 (API, браузер).
- **AC-14/15:** когорта студии пустая — `null` («данных ещё нет»); seed-коды командой, повтор — exists, неверная группа —
  отказ; без кода — «без кода».
- **AC-16:** запись денег партнёра — только `commission.ts` во всём исходнике; вызов — только внутри колбэка транзакции
  `applyVerifiedPayment` / `recordVerifiedRefund` с `tx`.
- **Блокировки (ревью, находка 2):** взаимные партнёры, платящие одновременно (8 раундов), и приём ↔ оплата (5 раундов) —
  без deadlock.
- **Маршруты по боевой связке** `createPartnerDependencies` на Postgres: передача → приём → 409, сводки студии и партнёра,
  реквизиты.

## Что НЕ доказано

- **Живая оплата с комиссией** — магазина ЮKassa у N6 нет; начисление проверено на `applyVerifiedPayment` с «уже
  проверенным» платежом, не через настоящий вебхук с `income_amount`.
- **Стенд** — новые экраны и `/r/{code}`, `/invite/{token}` в работающем Next и через общий прокси не прогонялись.
- **Когорта студии** — смешение периодов исправлено, но отдельного теста на «оплату полгода назад» нет.
- **Отправка приглашения на почту** — нет провайдера (A-N6-046).
- **Повторное ревью исправлений** — не проводилось; валидация плана — самопроверка.
- **Ложный self-referral за NAT офиса** (студия и клиент с одного адреса за сутки) — правило спецификации, риск назван.

## Общие файлы, которые правила фича

`.claude/feature-roadmap.json` (фича 15 `done`), `docs/BACKLOG.md` (шапка и строка 15), `docs/decisions-autonomous.md`
(A-N6-043…049), `docs/canon.md` (§1, §4 — 27 сущностей, §7 — числа партнёрки), `CLAUDE.md` проекта (число сущностей),
миграция `007_partners.sql`, корневой `package.json` проекта (`ops:partner`), `vitest.config.ts` и
`vitest.browser.config.ts` (подпути `@n6/rag`), `tests/enums.test.ts` и `tests/database.integration.test.ts` (27
сущностей), `tests/public-page.unit.test.ts` (подмена `registerWithCode`), `apps/web/src/lib/payment-return.ts`
(`next` для приглашения), `packages/db/src/{bots,tariffs,payments}.ts` (`FOR NO KEY UPDATE`).

## Переменные окружения и команды оператора

Новых переменных нет (cookie реферала подписывается существующим `SESSION_SECRET`). Команды — внутри контейнера web:

```
npm run ops:partner -- issue <код> --group <seed-net|seed-studio-имя|seed-dogfood|studio|partner> [--owner <почта>] [--rate-bp 2000] --by <кто> --reason "<зачем>"
npm run ops:partner -- unfreeze <код> --by <кто> --reason "<зачем>"
npm run ops:partner -- payout <почта партнёра> --amount <рубли> --key <ключ выплаты> --by <кто> --reason "<зачем>"
npm run ops:partner -- due       # к выплате сейчас: почта, телефон СБП, банк, сумма (CSV)
npm run ops:partner -- export    # все движения денег партнёров без плательщиков (CSV)
```

Status: completed
