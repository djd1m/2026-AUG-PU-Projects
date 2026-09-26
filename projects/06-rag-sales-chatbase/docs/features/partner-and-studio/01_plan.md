# 01 — План: `partner-and-studio` (фича 15)

Дата: 2026-09-26 · Основа: `b9b76779` (фичи 12–14 влиты, живая оплата ЮKassa — A-N6-040) · Тир: **XL**.
`bash ../../scripts/complexity-router.sh` по списку файлов плана → **XL, код 1** (признаки: «деньги: платёжные таблицы»,
«миграция схемы»). XL — **остановка на плане у владельца**: реализации в этом шаге нет; вопросы — в конце.

FR: FR-PARTNER-001, FR-PARTNER-002, FR-PARTNER-003, FR-GROWTH-002, FR-GROWTH-004, FR-GROWTH-007. SC: SC-US-012-1, SC-US-012-2.
ADR: ADR-012, ADR-013, ADR-014 (строки reuse), ADR-017 (оплата живая с A-N6-040). Pseudocode: `ApplyPartnerCode`, `StudioInvite`.
Правила: `security-operation-order.md`, `fail-closed-defaults.md`, `honest-configuration.md`, `shared-resource-verification.md`,
`incoming-webhooks.md` (начисление — внутри транзакции уведомления ЮKassa). Зарезервировано: миграция `007_partners.sql`,
решения A-N6-043…049. carry_over (A-N6-033 (6)): перенос бота клиенту проверяет предел клиента под той же блокировкой.

**Что меняется против канона.** Канон §1 держал «выплаты партнёрам» вне недели, потому что оплата была спящей. С A-N6-040
оплата живая, и по постановке владельца («партнёрские ссылки … там всё уже есть») комиссии и выплаты берутся из N4.
До ответов владельца (ставка, холд, выплата) числа в плане — рекомендации, а не решения.

## Поток атрибуции и денег

```
/r/{code} ─► 302 на / + cookie __Host-n6_ref (HMAC SESSION_SECRET, 30 дней, код + срок) — только если код существует и не заморожен
регистрация {email, password, partner_code?}
   ├─ явный код неверен/заморожен → 422 поля partner_code, аккаунт НЕ создаётся, к cookie НЕ откатываемся (FR-PARTNER-001)
   └─ в той же транзакции, что INSERT account: ApplyPartnerCode(source = code | cookie)
приглашение студии (accept) ─► ApplyPartnerCode(source = invite, код студии) — сильнее code и cookie, пока pending

ApplyPartnerCode (одна транзакция, advisory-lock кода ДО чтения его статуса — донор N4):
   1 код не найден / frozen → explicit: ошибка поля; cookie/invite: ничего
   2 self-referral: владелец кода = аккаунт ИЛИ владелец регистрировался с того же префикса за 24 ч → attribution rejected(self_referral)
   3 анти-накрутка: > 20 применений кода с одного префикса за 10 мин → frozen = true + строка partner_audit; текущее применение НЕ засчитано
   4 attribution: INSERT … ON CONFLICT (account_id) DO UPDATE только если новый источник сильнее и статус pending

оплата ЮKassa (applyVerifiedPayment фичи 14, ТА ЖЕ транзакция, после grantPaidPlan):
   attribution pending|converted, не rejected, партнёр ≠ плательщик
     → commission_entry(accrual, payment_id, amount = floor(база × ставка / 10000), available_at = paid_at + холд)  [UNIQUE по платежу]
     → attribution converted (уже есть)
возврат ЮKassa (recordVerifiedRefund, та же транзакция) → commission_entry(clawback, −сумма начисления) [UNIQUE по платежу]
оператор: ops:partner-payout <код> --amount --key  → commission_entry(payout, −сумма) [UNIQUE (partner, payout_key)], не больше доступного
```

Баланс партнёра не хранится полем — это сумма записей (донор N4, ADR-013 N4). Суммы — целые копейки, округление вниз.

## Единицы работы

| # | Единица | Файлы | Что делает | Донор |
|---|---|---|---|---|
| U1 | Миграция 007 | `packages/db/migrations/007_partners.sql` | `partner_code.commission_rate_bp`, `account.signup_ip_prefix`, `partner_code_use` (код, префикс, время — окно анти-накрутки), `commission_entry` (accrual/clawback/payout, частичные UNIQUE), `partner_payout_details`, `partner_audit`, индекс «одно активное приглашение на бота» | N4 `010_subscription_and_commission.sql` (commission_entry, индексы once) — адаптировать: без subscription, партнёр = владелец `partner_code` |
| U2 | Cookie реферала и `/r/{code}` | `apps/web/src/lib/partner-referral.ts`, `app/r/[code]/route.ts` | HMAC-cookie 30 дней, чтение с проверкой подписи и срока постоянным сравнением; 302 без раскрытия, существует ли код | N5 `lib/partner-referral.ts` — адаптировать (30 дней, форма кода N6 `^[A-Za-z0-9_-]{3,40}$`, без `guest_link`) |
| U3 | ApplyPartnerCode | `packages/db/src/partners.ts` | шаги 1–4 выше; порядок блокировок: код → аккаунт | N4 `partner/{apply-partner-code,anti-fraud,normalize-code}.ts` — адаптировать (порог 20/префикс/10 мин вместо 50, три источника N6); правила приоритета и «явный неверный код не откатывается» — N1 `lib/referral.ts` |
| U4 | Регистрация | `apps/web/src/server/auth-handler.ts`, `auth-store`, экран регистрации | поле `partner_code`, cookie → ApplyPartnerCode в транзакции создания аккаунта; `signup_ip_prefix` | N1 `referral.ts` `resolveAttribution` — перенести правило; вход и сессии — уже N5 |
| U5 | Приглашение студии | `packages/db/src/studio.ts`, `app/api/studio/invites/route.ts`, `app/api/invites/[token]/accept/route.ts`, `app/invite/[token]/page.tsx` | create: план studio, свой бот, токен 32 байта (в БД sha256), 7 дней, ссылку показываем студии; accept: блокировки двух аккаунтов в порядке id → `lockAccountBots(клиент)` → предел клиента → смена владельца → ApplyPartnerCode(invite); 410 истёкшее, 409 использованное | написано заново по Pseudocode `StudioInvite` (в донорах нет передачи владения); токен и хэш — форма `partner-auth.ts` N1 |
| U6 | Начисление и сторно | `packages/db/src/commission.ts`, правка `packages/db/src/payments.ts` | accrual внутри `applyVerifiedPayment`, clawback внутри `recordVerifiedRefund`; чистые функции суммы/зрелости/баланса в `packages/rag/src/commission.ts` | N4 `commission/accrue.ts` + `shared/domain/commission.ts` — перенести почти как есть (ставка в б.п., floor, `maturesAt`, `availableForPayoutMinor`) |
| U7 | Кабинет партнёра | `app/partner/page.tsx` + `PartnerScreen.tsx`, `app/api/partner/{summary,payout-details}/route.ts` | код и ссылка, когорта (регистрации, установки, конверсии), деньги: к выплате / перенесено / дата выплаты, реквизиты СБП; плательщиков не видно | N4 `routes/earnings.ts`, `payouts/payout-details.ts`, `apps/web/app/cabinet/*`, `partner/dashboard-query.ts` — адаптировать в Next по сессии (не токен N1) |
| U8 | Кабинет студии | `app/dashboard/studio/page.tsx`, `packages/db/src/studio.ts` | боты студии и переданные клиентам (только чтение сводки фичи 13), установки → ответы → конверсии по коду студии | N1 `getPartnerCohortDashboard` — адаптировать; сводка — наша фича 13 |
| U9 | Оператор | `packages/db/src/ops-partners.ts`, скрипты `ops:partner-*` в корневом `package.json` | выдать код (seed-net / seed-studio-<имя> / seed-dogfood / partner), разморозить код, записать выплату, выгрузка CSV начислений | N4 `partner/manual-unblock.ts`, `routes/exports.ts`, `export/csv.ts` — адаптировать в команды (у N6 нет админки) |
| U10 | Контракты и стражи | `tests/*`, `docs/*` | страж: деньги партнёру пишет только `commission.ts` и только внутри транзакции платежа; источник силы атрибуции — одна функция | — |

## Критерии приёмки

| AC | Утверждение | FR / SC / правило | Доказательство |
|---|---|---|---|
| AC-1 | `/r/{code}` ставит подписанную cookie 30 дней только для существующего незамороженного кода; подделанная подпись, истёкший срок, чужой формат → cookie игнорируется | FR-PARTNER-001, FR-GROWTH-002 | unit + integration |
| AC-2 | Явный неверный или замороженный код при регистрации → 422 поля, аккаунта нет, к cookie не откатываемся | FR-PARTNER-001, Gherkin FR-GROWTH-002 edge | integration + браузер |
| AC-3 | Сила источника invite > code > cookie: перезапись только более сильным и только пока pending; converted не перезаписывается | FR-PARTNER-001 | integration, все 9 пар |
| AC-4 | Self-referral (свой код; владелец регистрировался с того же префикса за 24 ч) → rejected(self_referral), счётчик партнёра не растёт, начисления нет | FR-PARTNER-003, Gherkin security | integration |
| AC-5 | 21-е применение кода с одного префикса за 10 мин замораживает код ровно один раз, само не засчитано, строка аудита; 30 одновременных регистраций → ровно 20 засчитаны | FR-PARTNER-003, FR-GROWTH-007 security | integration конкурентно |
| AC-6 | Приглашение: только план studio и свой бот; ссылка одноразовая, 7 дней; истёкшее → 410, использованное → 409; двое принимают одновременно → владелец один | FR-PARTNER-002, SC-US-012-1, Gherkin FR-GROWTH-004 | integration конкурентно + браузер |
| AC-7 | Принятие проверяет предел ботов КЛИЕНТА под той же блокировкой, что создание бота: клиент на free с ботом → отказ «предел плана», бот остаётся у студии; одновременные «создать бота» и «принять» у одного клиента → ботов не больше предела | carry_over A-N6-033 (6), shared-resource-verification | integration конкурентно |
| AC-8 | После принятия: клиент — владелец, студия видит сводку «только чтение» и не может править, атрибуция invite к коду студии | SC-US-012-2 | integration + браузер |
| AC-9 | Оплата атрибутированного клиента → ровно одно начисление = floor(база × ставка / 10000), зрелость = оплата + холд; двойная и 20 одновременных доставок → одно начисление | ADR-014 (N4), incoming-webhooks | integration конкурентно |
| AC-10 | Нет начисления: без атрибуции, rejected, партнёр = плательщик, сумма ≤ 0, платёж needs_review (несовпадение суммы, неизвестное намерение) | fail-closed | integration |
| AC-11 | Возврат → одно сторно −начисление (не пересчёт от суммы возврата), в любом порядке с оплатой; сторно уменьшает доступное сразу, даже до зрелости | N4 ADR-013, перестановка | integration, оба порядка |
| AC-12 | Выплата оператором: не больше доступного на дату; повтор с тем же ключом — одна запись; баланс = сумма записей | N4 | integration |
| AC-13 | Кабинет партнёра: код, ссылка, когорта, «к выплате / перенесено / дата»; ни почты, ни id плательщиков; реквизиты: СБП-телефон, номер карты отклоняется | N4 earnings, 152-ФЗ | integration + браузер |
| AC-14 | Кабинет студии: установки → ответы → конверсии по коду студии за 30 дней; «данных ещё нет» вместо 0 % | FR-GROWTH-004 | integration + браузер |
| AC-15 | Seed-коды групп выдаются командой; регистрация без кода — группа «без кода», не seed-net | FR-GROWTH-007 | integration |
| AC-16 | Страж: `INSERT INTO commission_entry` только в `commission.ts`; начисление вызывается только из транзакции `applyVerifiedPayment`/`recordVerifiedRefund`; испытан мутацией | cost-of-detection-ladder | страж по исходнику |

## Порядок операций

- Регистрация: лимит → Origin → тело (`email`, `password`, `partner_code?`) → bcrypt ВНЕ транзакции → транзакция: INSERT account
  → ApplyPartnerCode (блокировка кода → аккаунта) → коммит. Ошибка поля кода — откат всей транзакции (аккаунта нет).
- Принятие приглашения: сессия → токен (хэш) → транзакция: `pg_advisory_xact_lock` двух аккаунтов в порядке id (иначе deadlock
  встречных «принять» и «создать бота») → `UPDATE studio_invite … WHERE accepted_by IS NULL AND expires_at > now() RETURNING` →
  `lockAccountBots(клиент)` → предел → смена владельца → ApplyPartnerCode(invite) → событие `invite_accepted`.
- Начисление — внутри транзакции платежа ПОСЛЕ `claimEvent` и `lockPayment`: повтор уведомления до начисления не доходит.
  Сетевых вызовов внутри нет (security-operation-order).

## Конкурентные случаи (обязательны, shared-resource-verification)

1. 30 регистраций по одному коду с одного префикса одновременно → 20 засчитаны, код заморожен один раз.
2. Два аккаунта принимают одно приглашение одновременно → один владелец, второй 409.
3. Клиент одновременно создаёт бота и принимает приглашение → ботов ≤ предела плана клиента.
4. 20 одновременных доставок одной оплаты → одно начисление; оплата и возврат одновременно → начисление + сторно, баланс 0.
5. Добросовестный NAT: 20 разных людей регистрируются по коду студии за одним префиксом за час (не за 10 мин) → код не заморожен.

## Ответ по строкам reuse

| Строка roadmap | Ответ |
|---|---|
| cookie реферала — N5 `server/partner.ts`, `lib/partner-referral.ts` | **адаптировать** (U2): 30 дней вместо 14, форма кода N6, без `guest_link`; `PartnerService` N5 не берётся — у N6 три источника и студии |
| реферал и кабинет партнёра — N1 `lib/referral.ts`, `partner.ts` | **адаптировать**: правило «явный неверный код не откатывается к cookie» и приоритет — перенести (U3, U4); `generateCode` — перенести (U9); кабинет по токену N1 **не берётся** — у N6 есть вход (сессия N5), кабинет по сессии (U7); порог 50/IP N1 заменён 20/префикс Specification FR-PARTNER-003 |
| брендинг — N1 `lib/branding.ts` | **отложено до v1** (white-label вне недели, A-N6-001) — без изменений |
| комиссии и выплаты — N4 `partner/*`, `commission/accrue.ts`, `payouts/payout-details.ts`, `routes/earnings.ts`, `apps/web/app/cabinet/*` | **перенести** арифметику (`shared/domain/commission.ts`) и `accrue.ts` почти как есть (U6); **адаптировать** `apply-partner-code` + `anti-fraud` (U3: источники N6, порог, без device_session), `earnings`/`payout-details`/cabinet (U7: Next, сессия), `exports`/`manual-unblock` (U9: команды оператора); партнёр N6 = владелец `partner_code`, отдельной таблицы `partner` нет |
| передача бота клиенту | **написано заново** (U5): в донорах нет смены владельца ресурса по приглашению; форма токена — N1 `partner-auth.ts` |

## Вопросы владельцу

1. **Ставка и база комиссии.** Рекомендую: **20 % от суммы, фактически полученной после удержания ЮKassa** (`amount − fee`),
   с каждого платежа привлечённого клиента в течение **12 месяцев** с первой оплаты. Альтернатива: 30 % пожизненно, как
   обычно у SaaS-партнёрок; у N4 по умолчанию 50 %, но там разовая подписка потребителя, а не B2B.
2. **Холд до выплаты.** Рекомендую: **начисление доступно через 30 дней после оплаты** — покрывает окно возврата разовой
   30-дневной оплаты. Альтернатива: 14 дней (быстрее для партнёра, выше риск сторно после выплаты).
3. **Минимальная сумма и способ выплаты.** Рекомендую: **выплата раз в месяц 5-го числа по СБП на телефон** (как N4),
   **минимум 1 000 ₽**, меньшая сумма переносится; выплату проводит оператор вручную и записывает командой. Альтернатива:
   без минимума или выплата по запросу партнёра.
4. **Возврат после выплаты.** Рекомендую: **сторно уводит баланс в минус и зачитывается из будущих начислений**, долг не
   взыскивается. Альтернатива: списать долг и закрыть (партнёру проще, продукт теряет сумму).
5. **Студия: комиссия или скидка.** Рекомендую: **студия получает ту же комиссию с оплат своих клиентов**, что и партнёр,
   а свой план studio оплачивает полной ценой. Альтернатива: вместо комиссии — скидка на свой план studio (например −10 % за
   каждого платящего клиента), без выплат деньгами.
