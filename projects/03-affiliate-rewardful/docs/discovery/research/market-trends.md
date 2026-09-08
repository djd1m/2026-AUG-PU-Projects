# N3 / project03: рынок, продуктовые паттерны и условные growth-гипотезы для трёх CJM

**Режим:** QUICK  
**Дата исследования:** 2026-09-08  
**Объект:** будущий самостоятельный сервис N3 — российский аналог Rewardful для SaaS и цифровых сервисов; первые потребители интеграции — `projects/01-testimonials-senja` (Proofwall) и `projects/02-review-qr-reputation`.  
**Граница результата:** это вход для трёх HTML-прототипов CJM. Выбор CJM, PRD, финальная стратегия, тариф и налоговая схема здесь не утверждаются.

## 1. Что уже существует и что нельзя проектировать как greenfield

В project01 партнёрская логика уже реализована, а не только описана:

| Возможность | Локальное подтверждение | Следствие для N3 |
|---|---|---|
| Персональный код + токен кабинета | `apps/web/src/lib/partner.ts`, `issuePartnerCode()` | В CJM интеграции показывать миграцию/подключение существующей программы, а не «создать первую партнёрку с нуля» |
| Cookie + промокод, приоритет явного промокода | `apps/web/src/lib/referral.ts`, `resolveAttribution()` | Нужен контракт импорта/сохранения правила атрибуции |
| Pending при регистрации, conversion при платеже | `createPendingAttribution()` / `convertAttributionOnPayment()` | N3 должен принимать жизненный цикл атрибуции, а не только click counter |
| Self-referral guard, audit log, идемпотентное начисление | `convertAttributionOnPayment()` и уникальность `payment_event_id` | Это baseline, который нельзя потерять при выделении standalone-сервиса |
| Когортный кабинет: signups, conversions, rate, commission | `getPartnerCohortDashboard*()` и `/partner/dashboard` | Первый прототип может переиспользовать знакомую модель данных, но расширить её до прозрачного ledger |
| Отзыв кода без удаления истории | `revokePartnerCode()` | Нужен явный статус кода и неизменяемая история начислений |

У project02 партнёрской подсистемы пока не обнаружено; он релевантен как второй пилотный merchant: локальный SMB-продукт с ЮKassa и офлайн-точками контакта. Это не доказательство спроса на N3, а удобный второй интеграционный контекст.

## 2. Три условных CJM для HTML-прототипов

### CJM-A — «Владелец запускает программу и видит первый доказанный платёж»

**Персона:** владелец/маркетолог Proofwall или project02.  
**Job:** «Подключить существующий продукт к партнёрке без отдельного проекта разработки и убедиться, что деньги считаются верно».

| Этап | Экран/действие для прототипа | Доказанный паттерн | Что измерять |
|---|---|---|---|
| 1. Оценка до регистрации | Интерактивная схема `клик → регистрация → оплата → комиссия`, демо-ledger на тестовых данных, видимые ограничения ЮKassa | Rewardful/Tolt показывают продукт и setup до покупки; Dub даёт platform tour/play demo | `proof_viewed`, переход к подключению |
| 2. Прогрессивный setup | Чеклист: продукт → источник событий → правило комиссии → тестовый платёж → первый партнёр | Rewardful: simple 5-step setup; PartnerStack: настраиваемые onboarding journeys | completion каждого шага, median time-to-verified-event |
| 3. Подключение существующего контура | Вариант «Импортировать Proofwall»: показать найденные коды, pending-attributions и историю, не предлагать создать дубли | Локальный факт project01 | число конфликтов импорта, доля подтверждённых mappings |
| 4. Проверка денег | Sandbox-событие `payment.succeeded`; повтор события показывает «уже обработано»; refund меняет статус комиссии | ЮKassa webhooks/refunds; локальная двойная идемпотентность | verified webhook rate, duplicate suppression, refund reconciliation |
| 5. Первый value moment | «Программа готова: 1 тестовая конверсия прослеживается до платежа» + CTA пригласить партнёра | Rewardful/Tolt обещают запуск за минуты; это надо проверять локально | activation = verified paid-event + issued partner link |

**Гипотеза прототипа:** доверие создаёт не обещание «за 15 минут», а видимая трасса конкретной оплаты. Это проектная гипотеза, не наблюдаемый рыночный факт.

### CJM-B — «Существующий пользователь продукта включает рефералку внутри кабинета»

**Персона:** действующий платящий пользователь Proofwall/project02.  
**Job:** «Получить ссылку и поделиться продуктом, не заводя ещё один аккаунт и не изучая PRM».

| Этап | Экран/действие для прототипа | Доказанный паттерн | Что измерять |
|---|---|---|---|
| 1. Контекстный вход | CTA появляется после ценности: у Proofwall — установленный widget; у project02 — активный QR/первая обратная связь | Локальный FR-GROWTH-001 требует share в value moment | eligible users → opened referral |
| 2. One-click enrollment | Встроенная карточка с уже созданной ссылкой/кодом | Dub в 2025 запустил in-app referral dashboard и one-click enrollment; FirstPromoter документирует embeddable dashboard | enrollment completion, time-to-link |
| 3. Share kit | Готовый Telegram-текст, короткое демо, QR/ссылка, disclosure о вознаграждении; пользователь выбирает и сам подтверждает отправку | FirstPromoter Assets; Rewardful assets/help; Wispr Flow на Dub даёт brand assets и swipe copy | copy/share action по типу материала |
| 4. Доказательство результата | Мини-ledger: переход, signup, paid, pending/available/paid; каждая строка раскрывается до source/payment/refund | FirstPromoter reports; Dub payout statuses и commission analytics | first paid referral, ledger detail opens, dispute rate |
| 5. Переход в N3 | «Управлять программой» открывает standalone N3 с SSO/tenant context | Embedded dashboard у Dub/FirstPromoter | cross-product activation, SSO errors |

**Гипотеза прототипа:** embedded entry даст меньше трения, чем отдельная регистрация в N3. Сравнивать можно только после достаточной выборки; это не установленный эффект.

### CJM-C — «Партнёр сначала понимает условия, затем делится и контролирует начисления»

**Персона:** автор Telegram-канала, консультант, агентство, существующий клиент.  
**Job:** «До публикации понять, сколько, за что и когда заплатят; после — доказать каждое начисление».

| Этап | Экран/действие для прототипа | Доказанный паттерн | Что измерять |
|---|---|---|---|
| 1. Proof before commitment | Публичная карточка программы: продукт, аудитория, ставка/срок, cookie/code, payout schedule, пример ledger, ограничения | Dub program pages/Wispr Flow публикуют terms, assets и disclosure; Tolt предлагает просмотр продукта до commitment | program card → application start |
| 2. Короткая заявка | Тип партнёра + канал + аудитория; условия доступны до submit | Dub public application + application funnel; PartnerStack marketplace/application | start, submit, approval time |
| 3. Guided first share | Чеклист `изучить демо → выбрать kit → скопировать ссылку → disclosure` | PartnerStack automated onboarding; FirstPromoter/Rewardful assets | partner activation = first intentional share |
| 4. Прозрачный ledger | Статусы `tracked → paid conversion → hold/refund window → ready → paid/canceled`, сумма и причина изменения | Dub `Pending/Processing/Processed/Sent/Completed`; FirstPromoter 18 data points, payout terms | first commission time, unresolved disputes |
| 5. Следующее действие | Подсказка не «пригласите всех», а следующий доказанный шаг по своей воронке; без авторассылки | Наблюдаемая сегментация/onboarding; запрет спам-инвайтов из локальных требований | next-action completion, opt-in evidence |

**Гипотеза прототипа:** максимально прозрачные условия до заявки повысят качество заявок и снизят споры, даже если уменьшат их количество. Проверяется через качество когорты, а не total applications.

## 3. Competitive matrix (состояние публичных страниц на 2026-09-08)

Все числа ниже — заявления самих поставщиков и текущие list prices; это не аудированные revenue/user metrics.

| Продукт | Публичная цена | Ядро / интеграции | Наблюдаемые сильные паттерны | Ограничение для N3/RU | Confidence |
|---|---:|---|---|---|:---:|
| Rewardful | Starter $49, Growth $99, Enterprise $149+/мес.; 14 дней | SaaS, Stripe/Paddle; coupon + link; recurring commission; 3,000+ компаний self-reported | 5-step/`<15 min` setup, self-service portal, 0% transaction fee, first/last touch, fraud detection, assets/custom portal | ЮKassa не поддерживается; managed payouts и налоговая применимость к РФ не доказаны | 5/5 по текущей публичной комплектации, 2/5 по бизнес-метрикам |
| FirstPromoter | Starter $49, Business $99, Enterprise $149+/мес.; 14 дней без карты | Subscription SaaS; Stripe/Paddle/Chargebee/API; 3,000+ компаний self-reported | embedded dashboard, links + coupons, 18-point reports, assets/share kit, payout terms, refund/chargeback tracking | Terms прямо говорят: платит клиент, FP лишь считает/report; RU payout/tax контур отсутствует | 5/5 продукт, 2/5 масштаб |
| Tolt | Basic $69, Growth $99, Pro $199; trial 14 дней | SaaS; Stripe/Paddle/Chargebee; manual или auto payouts | branded portal, resources page, simple dashboard, double-sided rewards; `Powered by` снимается на Pro | ЮKassa нет; заявленная tax-автоматизация относится к W-9/W-8/1099, не РФ | 5/5 продукт |
| Dub Partners | Business $90, Advanced $300, Enterprise custom; payout fee 5/5/3% | Links + affiliate/referral/creator platform | embedded referral dashboard (Advanced), dual incentives, real-time analytics, detailed payout states, bounties, partner referrals, public program pages, play demo | RU доступность выплат/идентификации не установлена; часть ключевых функций дороже базового тарифа | 5/5 текущий продукт, 3/5 self-reported network metrics |
| PartnerStack | Quote/demo, публичного self-serve тарифа нет | PRM + network/marketplace для B2B SaaS | marketplace, custom onboarding journeys, learning/resources, one monthly invoice, multiple partner motions | Enterprise/sales-led тяжесть для малого RU SaaS; локальные payments/tax не подтверждены | 4/5 продукт, 3/5 network data |
| **N3 (кандидат)** | **не выбрано** | Standalone service; adapters для Proofwall/project02; YooKassa events | Возможный wedge: импорт уже существующей логики + RU payment event model + прозрачный ledger + embedded entry | Нет подтверждённой цены, спроса, payout/legal model, PMF | hypothesis |

### Что рынок действительно подтверждает

- Rewardful и FirstPromoter оба публично заявляют 3,000+ компаний. Это подтверждает существование категории, но не даёт уникальных клиентов рынка, выручку или долю: базы могут пересекаться, числа не аудированы.
- PartnerStack сообщил по собственной сети $2.7B all-time GMV к январю 2026 и +52% transaction volume в 2025. Это первичные данные одной платформы, а не размер всего рынка.
- Dub сообщил о запуске Partners в августе 2025 и быстрых внутренних метриках, а в мае 2026 — 7,000+ partners, $117M driven revenue, $28M+ earned commissions. Это self-reported product telemetry, не независимый benchmark.
- Цены self-serve конкурентов сгруппированы около $49–99 на входе, но разнятся базы тарификации: affiliate revenue caps, partner payout caps и payout fees. Из этого нельзя механически вывести цену N3 в рублях.

### TAM / SAM / SOM: честный результат QUICK

| Уровень | Размер | Расчёт | Вердикт | Confidence |
|---|---:|---|---|:---:|
| TAM global | **НЕ УСТАНОВЛЕН** | Публичные market reports дают несовместимые оценки 2025: примерно $1.08B, $2.0B, $22–24B в зависимости от того, считают ли software, platforms или весь affiliate economy | Не использовать в PRD/pitch без определения категории и методологии | 1/5 |
| SAM Russia/RU-payments | **НЕ УСТАНОВЛЕН** | Нужны: число российских subscription/digital merchants, использующих подходящий billing; доля с партнёрским каналом; подтверждённый WTP | Открытых первичных данных не найдено | 1/5 |
| SOM 3 years | **НЕ РАССЧИТАН** | `eligible merchants × reachable share × annual ARPA`; все три входа неизвестны | Считать только после interviews/landing experiments | 1/5 |

**Convergence check:** невозможен — нет двух независимых оценок с одинаковым определением рынка. Расходящиеся коммерческие отчёты не являются двумя подтверждениями.

## 4. UI/product micro-patterns: наблюдение отдельно от гипотезы

| Micro-pattern | Что реально отгружено | Источник/дата | Допустимый вывод для прототипа | Что остаётся гипотезой |
|---|---|---|---|---|
| Progressive onboarding | Rewardful описывает 5-step setup; PartnerStack показывает automated welcome sequences и action triggers; Dub публикует quickstart/tour | Rewardful guide updated 2025-12-23; PartnerStack 2025-02-21 / updated 2025-03-05 | Показывать один следующий шаг и видимый прогресс | Что именно повысит activation N3 и на сколько |
| Embedded referral program | FirstPromoter документирует embeddable dashboard; Dub запустил one-click in-app enrollment и embedded dashboard | FP docs accessed 2026-09-08; Dub 2025-04-02, product GA 2025-08-12 | CJM-B имеет прямой рыночный аналог | Что пользователи Proofwall предпочтут embedded пути |
| Share kits / enablement | FirstPromoter Assets содержит images/docs/links/text; Rewardful help предлагает assets/seed ideas; Wispr Flow/Dub отдаёт brand assets + swipe copy | FP 2024-04-10; Rewardful accessed 2026-09-08; Wispr page accessed 2026-09-08 | В прототипе дать 2–3 готовых материала и disclosure | Какие форматы работают в RU Telegram/agency cohorts |
| Transparent commission ledger | FP описывает revenue/new/recurring/refunds/earnings; Dub публикует 5 payout statuses и commission analytics | FP updated 2026; Dub terms 2026-04-06, analytics 2026-05-22 | Разделять event, commission и payout; раскрывать причину каждой коррекции | Снизит ли это support/disputes в N3 |
| Proof before paywall | Rewardful/FirstPromoter/Tolt дают 14-day trial без карты; Tolt прямо предлагает demo before committing; Dub — public tour/play demo/program pages | публичные pricing/home pages, accessed 2026-09-08 | Публичный demo-ledger и тестовый event уместны до тарифа | Лучший носитель proof: sandbox, видео или guided sample |
| Paid removal of platform branding | Tolt снимает `Powered by` на Pro; Rewardful/FirstPromoter/Dub продают branding/white-label возможности по планам | pricing pages, accessed 2026-09-08 | FR-GROWTH-003 совместим с существующей рыночной упаковкой | Конверсия badge N3 и допустимый тариф пока неизвестны |

Это не «общие тренды 2025/26». Это повторяющиеся решения, обнаруженные в конкретных shipped products; причинный эффект не доказан.

## 5. YooKassa: практическая граница интеграции

Проверено по официальной документации 2026-09-08.

| Контур | Что подтверждено | Следствие для прототипа/архитектурной гипотезы |
|---|---|---|
| Приём платежей | API, webhooks для `payment.waiting_for_capture`, `payment.succeeded`, `payment.canceled`, `refund.succeeded` | Комиссия создаётся на подтверждённом платеже; refund должен менять/сторнировать экономический статус |
| Повторные платежи | Есть сценарий сохранения способа оплаты и автоплатежей | Recurring commission возможна как реакция на каждый подтверждённый charge; N3 не должен сам инициировать charge без отдельного merchant contract |
| Надёжность | В payout examples требуется `Idempotence-Key`; входящие события отражают смену статуса объектов | Хранить provider event/object id и повторобезопасную обработку; локальный baseline project01 уже имеет двойную защиту |
| Выплаты физлицам | Отдельный продукт «Выплаты»: компания переводит физлицу на карту/ЮMoney/СБП; требуется подключение ЮBusiness/шлюза | `tracking + commission ledger` и `money movement` — отдельные capability/этапы. В prototype можно честно показать «к выплате» до автоматизации денег |
| Безопасная сделка | Описана для платформ, где частные лица продают товары/услуги друг другу, с deal balance и payout seller | Не считать её автоматически подходящей партнёрским комиссиям; требуется подтверждение ЮKassa/юриста по use case |
| 54-ФЗ | ЮKassa отдельно описывает чеки для приёма оплаты за товары/услуги | Эквайринг/чеки merchant-а не закрывают обязательства по вознаграждению партнёру |

**Налоговая граница:** ЮKassa — платёжная инфраструктура, а не доказательство того, кто является налоговым агентом в конкретной модели N3. Официальная ФНС указывает, что выплаты по ГПХ физлицу по общему правилу требуют НДФЛ/взносов со стороны организации/ИП; для самозанятых и иных статусов действуют иные условия, которые нужно подтверждать до payouts MVP. Нельзя обещать «ЮKassa всё решает».

**Credits:** внутренняя скидка/credit вместо денег не означает автоматически отсутствие дохода, НДФЛ, НДС, кассовых или договорных последствий. До юридического и бухгалтерского заключения credit reward должен быть отдельным типом обязательства (`non_cash_credit`) с условиями использования и без текста «налогов нет».

## 6. Revenue model и unit economics: формулы, не прогноз

Возможные revenue streams после выбора CJM: подписка merchant-а; usage tier по числу tracked paid events/active partners; отдельная плата за managed payouts; платный white-label. Одновременно включать всё в прототип не нужно.

| Метрика | Формула | Что пока неизвестно |
|---|---|---|
| MRR | `paying_merchants × monthly_ARPA` | цена и число платящих |
| Gross profit | `MRR + service_fees − payment_processing − infra − variable_support − fraud_losses` | все фактические ставки N3 |
| Gross margin | `gross_profit / recognized_revenue` | что признаётся revenue при payouts |
| Merchant CAC | `sales_and_marketing_cost / new_paying_merchants` | канал и cohort spend |
| Simple LTV | `monthly_ARPA × gross_margin / monthly_logo_churn` | ARPA, margin, churn; формула упрощена и не годится при отрицательном churn/сильной экспансии |
| CAC payback | `CAC / (monthly_ARPA × gross_margin)` | CAC/ARPA/margin |
| LTV:CAC | `LTV / CAC` | оба входа |
| Partner-program contribution | `attributed_gross_profit − commissions − payout_fees − program_ops − fraud/refund_losses` | маржа merchant-а и реальные комиссии |

**Только арифметический пример [H-EXAMPLE], не benchmark и не план:** если когда-либо наблюдаются `ARPA = 5 000 ₽/мес`, `gross margin = 80%`, `monthly churn = 5%`, `CAC = 10 000 ₽`, то simplified `LTV = 5 000 × 0.8 / 0.05 = 80 000 ₽`, `LTV:CAC = 8.0`, `payback = 10 000 / (5 000 × 0.8) = 2.5 месяца`. Ни один вход не измерен для N3; пример нельзя переносить в forecast.

Партнёрские деньги merchant-а — pass-through/обязательство, а не автоматически revenue N3. Бухгалтерская классификация зависит от договора и money-flow.

## 7. Growth loop options до выбора CJM

Мотион и петля — разные оси. Для N3 вероятный ранний мотион — **partnership-led через собственные projects01/02**, но это гипотеза. Возможные петли:

| Loop ID | Петля | Механика | Подходит CJM | Главная метрика | Риск |
|---|---|---|---|---|---|
| LOOP-A | Incentivized referral / dogfooding | N3 платит/начисляет за приведённого paying merchant; продукт обслуживает собственную программу | A, C | new paying merchants attributed to N3 partners | Нельзя оптимизировать до retention; self-referral/fraud |
| LOOP-B | Embedded B2B2P | Пользователь Proofwall/project02 получает ссылку внутри продукта; приглашённый бизнес становится merchant N3 | B | paid merchant activations from embedded surface | Может быть обычной воронкой, если invite не повторяется |
| LOOP-C | Attribution badge | Партнёрские порталы/страницы показывают `Powered by N3`; клик ведёт в proof demo | C | qualified merchant starts from badge | Branding может раздражать клиентов; эффект неизвестен |
| LOOP-D | Partner-refers-partner | Активный партнёр приводит другого партнёра, награда только после его подтверждённого результата | C | productive referred partners | Multi-level economics/legal framing требует отдельной проверки |

До выбора CJM выбрать один primary loop нельзя честно. LOOP-D особенно не должен выглядеть как обещание многоуровневого заработка.

### Growth seeding: требуемые первые 20–50 распространителей пока не названы

| Seed ID | Кандидатная когорта | Почему может поделиться | Сколько реально подтверждено | Как получить подтверждение |
|---|---|---|---:|---|
| SEED-01 | Действующие пользователи/пилоты Proofwall | Уже получили value и знают продукт | 0 известных в данных исследования | список владельца + opt-in интервью |
| SEED-02 | Пилоты project02: кафе/салоны/агентства | Могут рекомендовать соседним SMB после результата | 0 | интервью после первой измеримой ценности |
| SEED-03 | Авторы/консультанты по SaaS и Telegram | Есть аудитория, нужен прозрачный offer/share kit | 0 | 10–15 outreach conversations без авторассылки |
| SEED-04 | Разработчики/интеграторы ЮKassa | Получают повторяемый implementation job | 0 | 5–10 problem interviews |

**Пробел:** требование назвать 20–50 конкретных первых sharers не закрыто. Сегменты нельзя выдавать за людей; loop остаётся не seeded.

## 8. Candidate experiment metrics

Метрики — кандидаты для instrumented prototypes; пороги задаются до теста владельцем. Проценты на `n < 30` не интерпретировать как market signal.

| Эксперимент | Primary | Diagnostic | Guardrail |
|---|---|---|---|
| CJM-A merchant quick start | activation: `verified paid event + first partner link issued` | step completion, median time-to-verified-event, import conflicts | duplicate commissions = 0; unresolved mapping blocks launch |
| CJM-B embedded | activated referrers / eligible exposed users | open → enroll → copy/share; time-to-link; paid conversions | никакой отправки без отдельного consent; self-referral blocked |
| CJM-C partner trust | approved partners with first intentional share | card → application → approval → share; time-to-first-commission | dispute/refund rate; terms version recorded |
| Proof-before-paywall A/B (только `n≥30` на вариант) | connect-start / proof viewers | sandbox completion; pricing opens | no hidden payout/tax promise |
| Ledger usability | participants who correctly explain one commission’s state and cause | time-to-answer, detail opens | no PII leakage across tenants |
| Growth loop later | `i` invites per activated merchant × invite-to-paid conversion | cycle time, source cohort | retention gates scaling; CAC payback only after cohorts mature |

North Star candidate pending CJM: **число merchant-программ, которые за период имеют хотя бы одну подтверждённую партнёрскую оплату без открытого reconciliation exception**. Это лучше total users/clicks, но ещё требует product-owner approval.

## 9. Growth Requirements Seed — условный, не Specification

| ID | Требование (ЧЕРНОВИК) | Блок-источник | Confidence из блока | Допустимость | Статус |
|---|---|---|---|---|---|
| FR-GROWTH-001 | Показывать one-click share только после зафиксированного value moment выбранного продукта и требовать явное подтверждение пользователя | A/C Retention + CJM-B | manual 4/5 (локальное требование; эффект N3 не измерен) | вопросы 3/4 требуют проверки текста согласия и disclosure; 2026-09-08 | SPECULATIVE до выбора CJM |
| FR-GROWTH-002 | Хранить атрибуцию pending до подтверждённой оплаты; повтор события не создаёт вторую комиссию; refund отражается в ledger | A Primary Loop + YooKassa | manual 5/5 для event model, 3/5 для будущей интеграции | вопрос 5 и договорный money-flow не проверены; 2026-09-08 | ЧЕРНОВИК, условно Must |
| FR-GROWTH-003 | Показывать attribution badge на бесплатном/пилотном portal; снятие доступно только в выбранном paid tier | A Primary Loop + competitive pricing | manual 4/5 как shipped pattern, 1/5 как growth effect | вопросы 4/5; branding terms не проверены; 2026-09-08 | SPECULATIVE |
| FR-GROWTH-004 | Выдавать персональную ссылку и промокод; считать по ним отдельные когорты до paid conversion | B Channels + project01 baseline | manual 5/5 механизм, 2/5 market effect | вопрос 4: disclosure обязателен; точная норма/текст не проверены; 2026-09-08 | ЧЕРНОВИК, условно Must |
| FR-GROWTH-005 | Встроить enrollment/мини-dashboard N3 в initial-client UI через tenant-safe SSO, сохраняя standalone кабинет | A Primary Loop + CJM-B | manual 4/5 shipped analogs, 2/5 local preference | вопрос 5: 152-ФЗ/data roles не проверены; 2026-09-08 | SPECULATIVE до выбора CJM-B |
| FR-GROWTH-006 | Показывать партнёру неизменяемый commission ledger с event source, суммой, причиной коррекции и отдельным payout status | C Retention + CJM-C | manual 5/5 shipped pattern, 3/5 RU semantics | payout/tax/legal statuses не проверены; 2026-09-08 | SPECULATIVE до выбора payout scope |

Каждый продвигаемый FR позже обязан получить `@happy-path`, `@edge-case`, `@security`, владельца attribution/audit log и инструментированную метрику. Здесь Gherkin намеренно не дописан: это было бы преждевременной Specification до выбора CJM.

## 10. QUICK coverage и confidence summary

| Блок QUICK | Результат |
|---|---|
| Market size / TAM / CAGR / market share | Поиск выполнен; найденные коммерческие оценки несовместимы по определению и масштабу. Primary-source TAM/share нет → `НЕ УСТАНОВЛЕН` |
| Competitors list | Rewardful, FirstPromoter, Tolt, Dub Partners; PartnerStack как более тяжёлый adjacent/enterprise competitor |
| Competitor revenue/users/funding | Публичная выручка и аудированный funding для частных компаний не найдены; self-reported customers/network telemetry приведены с оговоркой |
| Pricing/business model | Проверено по текущим официальным pricing/terms pages |
| Unit economics benchmarks CAC/LTV/churn/margin | Надёжных category-specific primary benchmarks не найдено; чисел для N3 не выдумывали |
| Acquisition/growth | Наблюдаемые публичные программы, dogfooding, marketplaces, content/help, product releases; фактический channel mix и CAC конкурентов неизвестны |
| Russia/regulation/payment | Проверены официальные YooKassa docs и high-level FNS boundary; полного legal/tax review нет |

| Блок | Avg Confidence | Min | Комментарий |
|---|:---:|:---:|---|
| Competitive feature/pricing | 4.8/5 | 4/5 | официальные страницы, но могут меняться |
| Product/UI micro-patterns | 4.5/5 | 4/5 | факт наличия; causal effect не доказан |
| Market size/share | 1/5 | 1/5 | честно неизвестно |
| YooKassa capability | 4.5/5 | 3/5 | API подтверждён; fit payout use case и налоги не установлены |
| Unit economics | 1/5 | 1/5 | формулы известны, входы N3 отсутствуют |
| Growth loops | expert hypothesis | — | решение зависит от выбранного CJM и retention |

## 11. Primary sources и даты

Все URL проверены 2026-09-08.

1. Rewardful pricing — https://www.rewardful.com/pricing (текущая страница; accessed 2026-09-08).
2. Rewardful homepage/features — https://www.rewardful.com/ (текущая страница; accessed 2026-09-08).
3. Rewardful launch guide — https://www.rewardful.com/articles/how-to-launch-affiliate-program-with-rewardful (published 2024-03-27, updated 2025-12-23).
4. Rewardful campaign settings — https://help.rewardful.com/en/articles/14148863-campaign-settings-overview (2026-03-21).
5. Rewardful getting started/assets collection — https://help.rewardful.com/en/collections/1092740-getting-started (accessed 2026-09-08).
6. FirstPromoter pricing — https://firstpromoter.com/pricing (accessed 2026-09-08).
7. FirstPromoter docs introduction — https://docs.firstpromoter.com/introduction (accessed 2026-09-08).
8. FirstPromoter reports overview — https://help.firstpromoter.com/en/articles/9071216-reports-overview (2025-03-20).
9. FirstPromoter report fields — https://help.firstpromoter.com/en/articles/9071229-reports-fields-explained (updated week of access).
10. FirstPromoter Assets — https://help.firstpromoter.com/en/articles/8974753-assets (2024-04-10).
11. FirstPromoter payout model — https://help.firstpromoter.com/en/articles/9019492-how-payouts-work-in-firstpromoter (2026-06-05).
12. FirstPromoter terms — https://firstpromoter.com/terms (current; accessed 2026-09-08).
13. FirstPromoter about — https://firstpromoter.com/about-us (current; accessed 2026-09-08).
14. Tolt pricing — https://tolt.com/pricing (accessed 2026-09-08).
15. Tolt product page — https://tolt.com/ (accessed 2026-09-08).
16. Tolt Help Center — https://help.tolt.com/en/ (accessed 2026-09-08).
17. Dub Partners pricing — https://dub.co/pricing/partners (accessed 2026-09-08).
18. Dub Partners overview — https://dub.co/help/article/dub-partners (accessed 2026-09-08).
19. Dub in-app affiliate launch — https://dub.co/blog/dub-affiliate-program (2025-04-02).
20. Dub bounties — https://dub.co/blog/introducing-bounties (2025-09-11).
21. Dub commission analytics — https://dub.co/blog/introducing-commission-analytics (2026-05-22).
22. Dub partner referrals — https://dub.co/blog/introducing-partner-referrals (2026-05-22 on page; release listing 2026-05-18).
23. Dub payout states / partner terms — https://dub.co/legal/partners (last updated 2026-04-06).
24. Dub external payouts — https://dub.co/docs/partners/external-payouts (accessed 2026-09-08).
25. Wispr Flow public partner page/share kit — https://partners.dub.co/flow (accessed 2026-09-08).
26. PartnerStack platform — https://partnerstack.com/platform (accessed 2026-09-08).
27. PartnerStack automated onboarding — https://partnerstack.com/resources/partner-playbook/plays/start-strong-with-automated-partner-onboarding (published 2025-02-21, updated 2025-03-05).
28. PartnerStack 2026 network report — https://partnerstack.com/resources/research-lab/report-partnerstack-is-scaling-revenue-precision-in-2026 (2026-02-02; source data January 2026).
29. YooKassa API/webhooks — https://yookassa.ru/developers/using-api/webhooks (accessed 2026-09-08).
30. YooKassa refunds — https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds (accessed 2026-09-08).
31. YooKassa payouts overview — https://yookassa.ru/developers/payouts/overview (accessed 2026-09-08).
32. YooKassa payout types/limits — https://yookassa.ru/developers/payouts/getting-started/payout-types-and-limits (accessed 2026-09-08).
33. YooKassa Safe Deal — https://yookassa.ru/developers/solutions-for-platforms/safe-deal/basics (accessed 2026-09-08).
34. YooKassa 54-FZ overview — https://yookassa.ru/developers/payment-acceptance/receipts/54fz/basics (accessed 2026-09-08).
35. ФНС: выплаты по ГПХ физлицу — https://www.nalog.gov.ru/rn14/news/tax_doc_news/13162683/ (published 2023; checked 2026-09-08; использовать только как high-level boundary, актуальность конкретных ставок проверять отдельно).

## 12. Решение, которое нужно от пользователя после просмотра HTML

Выбрать один главный вход в продукт:

- **A — merchant-first / verified money path**;
- **B — embedded referral для существующих клиентов**;
- **C — partner-first / trust and transparent ledger**.

После выбора можно фиксировать primary loop, North Star, MVP boundary, тарифную гипотезу и переводить принятые growth seeds в PRD/Specification. До выбора эти анализы условны.

## Execution receipt

- Scope: read-only primary-source collection + preliminary, conditional hypotheses; consequential synthesis is outside this work unit.
- Requested model for this work unit: Sol, medium.
- Actual model: unknown — execution metadata available to this worker does not independently attest the served model; textual routing is not proof of a switch.
- Delegation: none; ruvnet-brain not used.
- Repository modifications by this work unit: none. The only artifact created here is this `/tmp` report; unrelated/shared-worktree discovery files already exist under project03.

Status: completed
TRACE_PATH=/tmp/n3-market-trends.md
WORK_UNIT_ID=market-trends
