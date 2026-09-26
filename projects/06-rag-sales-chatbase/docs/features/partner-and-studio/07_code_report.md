# 07 — Отчёт о коде: `partner-and-studio` (фича 15)

Дата: 2026-09-26 · Исполнитель: Claude Opus 5.5 (агент, отдельный worktree, один исполнитель) · Основа: `bc09ec70` (план)
· Коммиты: `e2e6d545` (реализация), `d1475550` (тесты и мутации), затем исправления по ревью · FR: FR-PARTNER-001…003,
FR-GROWTH-002/004/007 · SC: SC-US-012-1/2 · ADR: ADR-012/013/014 (строки reuse), ADR-017 (оплата живая) · Решения:
**A-N6-043…049**.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| U1 миграция 007 | `packages/db/migrations/007_partners.sql` | ставка на коде (2000 б.п.), заморозка с причиной, `account.signup_ip_prefix`, `partner_code_use`, `commission_entry` (частичные UNIQUE: начисление и сторно — раз на платёж, выплата — раз на ключ), `partner_payout_details`, `partner_audit` |
| U2 cookie и `/r/{code}` | `apps/web/src/lib/partner-referral.ts`, `server/referral-handler.ts`, `app/r/[code]/route.ts` | HMAC-cookie `__Host-n6_ref` 30 дней, подпись постоянным сравнением, первая ссылка сильнее, 302 на лендинг для любого кода |
| U3 ApplyPartnerCode | `packages/db/src/partners.ts` | advisory-блокировка кода ДО статуса; self-referral (свой код; владелец с того же префикса за 24 ч); анти-накрутка 20/префикс/10 мин с коммитом заморозки; сила invite > code > cookie, только пока pending |
| U4 регистрация | `partners.ts` `registerAccount`, `server/{auth,auth-store,auth-handler,route}.ts`, `app/login/AuthForm.tsx` | явный код проверяется ДО вставки и независимо от занятости почты; одна транзакция аккаунт → сессия → ApplyPartnerCode; неверный явный — 422 поля без отката к cookie; `registerWithCode` рядом с прежним `register` |
| U5 приглашение | `packages/db/src/studio.ts`, `app/api/bots/[botId]/invite`, `app/api/invites/[token]/accept`, `app/invite/[token]/*` | только studio и свой бот с контактом; токен 32 байта (в БД sha256), 7 дней; приём запирает два аккаунта по id, предел КЛИЕНТА под той же блокировкой, что CreateBot; 409 / 410 / own_invite |
| U6 начисление и сторно | `packages/db/src/commission.ts`, правка `payments.ts`, `packages/rag/src/commission.ts` | внутри транзакции оплаты / возврата фичи 14; база = сумма − удержание; окно 12 мес с первой оплаты; зрелость +30 дн; сторно = −начисление |
| U7 кабинет партнёра | `app/dashboard/partner/*`, `app/api/partner/{summary,payout-details}`, `packages/rag/src/payout-details.ts` | коды и ссылки, когорта, «к выплате 5-го / перенесено / долг», последние 20 движений, реквизиты СБП (номер карты — отказ) |
| U8 кабинет студии | `app/dashboard/studio/*`, `app/api/studio/summary` | свои боты с «Передать клиенту», переданные — только числа, когорта за 30 дней или «данных ещё нет» |
| U9 оператор | `packages/db/src/ops-partners.ts`, `npm run ops:partner` | `issue`, `unfreeze`, `payout`, `due`, `export` (CSV `;` + BOM, защита от формул) |
| U10 стражи | `tests/partners.unit.test.ts` | AC-16: запись денег партнёра — только `commission.ts`, вызов — только внутри колбэка транзакции платежа |

## Ответ по строкам reuse

| Строка | Ответ |
|---|---|
| cookie реферала — N5 `lib/partner-referral.ts` | **адаптировано**: 30 дней, форма кода N6, без `guest_link` |
| реферал N1 `lib/referral.ts`, `partner.ts` | **перенесено** правило «явный неверный код не откатывается к cookie»; кабинет по токену N1 **не взят** (есть вход по сессии); порог 50/IP → 20/префикс (FR-PARTNER-003) |
| брендинг N1 `lib/branding.ts` | **отложено до v1** (white-label вне недели) |
| комиссии и выплаты N4 | **перенесено** `shared/domain/commission.ts` (floor, б.п., зрелость, долг сразу, 5-е по Москве) и `accrue.ts` (запись в транзакции, сторно от начисления, UNIQUE); **адаптировано** `apply-partner-code` + `anti-fraud` (три источника, порог, без device_session), `payout-details` (только СБП), `earnings` (Next, сессия, суммы в SQL — у донора по последним 200 записям), `exports` + `manual-unblock` → команды `ops:partner` |
| передача бота клиенту | **написано заново**: в донорах смены владельца нет; форма токена — N1 `partner-auth.ts` |

## Дефекты, пойманные по ходу

- **Сборка Next отвергла лишний экспорт** `NotPartner` из `page.tsx` — перенесён в `PartnerScreen.tsx`.
- **Контракт `auth.register`** стал `string | null` и сломал типы трёх наборов — добавлен отдельный `registerWithCode`, `register` прежний.
- **Страж канона §4** краснел: 27 таблиц против 23 — канон и два стража обновлены (законный отказ).
- **Прибор нашёл недоступную с клавиатуры** прокручиваемую таблицу движений — регион с `tabIndex`.
- **Псевдонимы vitest** не знали подпутей `@n6/rag/{commission,payout-details}`: в копии для мутаций модульный набор не загружался, зелёный прогон давал код 1 при «14 passed» — псевдонимы добавлены.
- **Первая версия одной мутации** (`explicit-falls-back`) не могла покраснеть: проверка кода дублировалась в транзакции — мутация переписана.

## Отклонения от плана

- Индекс «одно активное приглашение на бота» заменён гашением прежнего неиспользованного при создании нового (срок в индексе
  выразить нельзя).
- `apps/web/app/partner/*` → `apps/web/src/app/dashboard/partner/*` (кабинет под общим layout входа).
- Почтовая отправка приглашения — нет провайдера; ссылка возвращается студии (A-N6-046).

Status: completed
