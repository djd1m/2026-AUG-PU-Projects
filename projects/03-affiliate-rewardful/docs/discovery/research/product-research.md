# Rewardful: продуктовая разведка для проекта 03

**Дата исследования:** 2026-09-08  
**Режим:** QUICK, расширенный до продуктовой глубины  
**Объект:** Rewardful — affiliate/referral management для SaaS и подписочных бизнесов  
**Контекст применения:** гипотеза локального продукта для малых SaaS в России с ЮKassa; первый возможный пилот — Proofwall (project 01). Это рабочие гипотезы, не принятые продуктовые решения.  
**WORK_UNIT_ID:** `product-research`  
**TRACE_PATH:** `/tmp/n3-product-research.md`

## 1. Как читать доказательства

Метки:

- **[D] Documented** — поведение описано в официальной документации продукта или API. Это подтверждает заявленный контракт, но не заменяет hands-on тест.
- **[V] Vendor claim** — маркетинговое или корпоративное утверждение Rewardful; независимо не проверено.
- **[U] User report** — мнение или опыт пользователя на независимой площадке; не доказывает универсальность проблемы.
- **[H] Hypothesis** — вывод или продуктовая гипотеза для российского аналога; требует проверки.
- **НЕ НАЙДЕНО** — после QUICK-поиска не найден надёжный публичный источник; значение не подставляется догадкой.

Ручная уверенность: **5/5** — первичная документация с конкретным контрактом; **4/5** — официальный корпоративный источник или несколько согласующихся пользовательских свидетельств; **3/5** — одно атрибутированное свидетельство; **2/5** — косвенный сигнал; **1/5** — слабая гипотеза.

## 2. Результат обязательного поискового покрытия

Выполнены все типы запросов Module 1: company overview/founding, Crunchbase/funding, valuation, revenue, customers, pricing, tech stack/engineering, careers, founders/leadership, features/how it works. Выполнены все типы Module 2: Reddit reviews, App Store, Trustpilot, comparison, target audience, persona, industry trends, complaints/problems. Дополнительно проверены официальные материалы об Affiliate Finder, customer referral credits, merchant/affiliate/customer onboarding и первичная документация ЮKassa.

- **Consumer App Store:** неприменим. Rewardful — B2B web SaaS; релевантное официальное мобильное приложение Rewardful в результатах не найдено. Результаты по созвучным reward-apps отброшены.
- **Trustpilot:** профиль Rewardful с пригодной выборкой отзывов в результатах не найден; выводы по VOC на Trustpilot не строятся.
- **Capterra:** карточка продукта найдена, но текст отзывов не был доступен в извлечённом содержимом; цитаты не используются.
- **G2 и Product Hunt:** пригодны для VOC, но выборка смещена к малым бизнесам и положительным отзывам; Product Hunt содержит только 10 отзывов.

## 3. Verified Fact Sheet

### 3.1 Компания

| Параметр | Что найдено | Статус | Источник | Confidence |
|---|---|---|---|---:|
| Основание | Rewardful пишет, что Kyle Fox и Brady Cassidy начали bootstrapped-проект в 2017 году | [V] | [Rewardful About](https://www.rewardful.com/about), [announcement 2021](https://www.rewardful.com/articles/rewardful-joins-forces-with-saas-group) | 4/5 |
| Публичный запуск | Product Hunt указывает запуск в 2018 году | [U/platform metadata] | [Product Hunt](https://www.producthunt.com/products/rewardful/reviews) | 4/5 |
| Основатели | Kyle Fox, Brady Cassidy | [V] | [Rewardful About](https://www.rewardful.com/about) | 4/5 |
| Владение | 16 ноября 2021 Rewardful объявил о присоединении к SaaS.group; продукт должен был остаться самостоятельно управляемым основателями | [V] | [Rewardful announcement](https://www.rewardful.com/articles/rewardful-joins-forces-with-saas-group) | 4/5 |
| Сотрудники | 13 сотрудников в 9 странах | [V], текущая цифра сайта | [Rewardful About](https://www.rewardful.com/about) | 3/5 |
| Масштаб | 3,000+ SaaS/AI-бизнесов, 110+ стран, 200k+ affiliates | [V], текущие счётчики сайта | [Rewardful About](https://www.rewardful.com/about) | 3/5 |
| Миссия | Сделать affiliate marketing доступным, понятным и недорогим | [V] | [Rewardful About](https://www.rewardful.com/about) | 4/5 |
| CEO / текущая оргструктура | **НЕ НАЙДЕНО** в надёжном актуальном первичном источнике | — | — | 1/5 |
| Штаб-квартира | **НЕ НАЙДЕНО** в просмотренных первичных источниках | — | — | 1/5 |

### 3.2 Финансирование и экономика

| Параметр | Результат | Confidence |
|---|---|---:|
| Венчурные раунды | **НЕ НАЙДЕНО.** Официальная история говорит, что компания была bootstrapped и рассматривала VC перед сделкой с SaaS.group, но не раскрывает закрытых раундов | 2/5 |
| Цена сделки с SaaS.group | **НЕ НАЙДЕНО** | 1/5 |
| Valuation 2024/2025 | **НЕ НАЙДЕНО** | 1/5 |
| Revenue / ARR | **НЕ НАЙДЕНО** | 1/5 |
| TAM / доля рынка | Не рассчитывались: надёжной базы в рамках текущего этапа нет; выдумывать значения нельзя | — |

Источник корпоративной истории: [Rewardful joins SaaS.group](https://www.rewardful.com/articles/rewardful-joins-forces-with-saas-group). Утверждение «некоторые клиенты получают 30%+ выручки через affiliate/referral» на этой странице является **[V]**, а не доказанной типовой метрикой.

### 3.3 Текущий pricing (проверено 2026-09-08)

| План | Цена | Лимит affiliate-generated revenue | Существенные границы | Статус |
|---|---:|---:|---|---|
| Starter | $49/мес | до $7,500/мес | 1 campaign, unlimited affiliates/visitors, до 2 team members, API, массовые выплаты PayPal/Wise, multiple currencies, double-sided incentives | [D/V] 5/5 |
| Growth | $99/мес | до $15,000/мес | unlimited campaigns/team, branded portal, custom domain, private campaigns, custom rewards/scripts | [D/V] 5/5 |
| Enterprise | $149+/мес | свыше $15,000/мес | всё Growth, phone support, one-click PayPal payouts | [D/V] 5/5 |

Все планы рекламируются с 14-дневным trial и 0% transaction fee; месячный план можно отменить из dashboard. Источник: [официальный pricing](https://www.rewardful.com/pricing).

**Наблюдение для российского small SaaS [H]:** фиксированные $49 до первой affiliate-выручки воспринимаются частью ранних команд как высокий порог. В G2 есть повторяющиеся замечания о цене для low-volume/new program. Локальный пилот стоит тестировать с free/low fixed tier или оплатой после первой подтверждённой продажи, но экономика такого тарифа пока не рассчитана.

### 3.4 Технологии Rewardful

В AMA от 9 сентября 2025 человек, представившийся Head of Engineering Rewardful, назвал Ruby on Rails, PostgreSQL, Redis и Heroku. Это **[U/self-attributed employee]**, а не официальный engineering disclosure; confidence 3/5. Источник: [Reddit AMA](https://www.reddit.com/r/b2bmarketing/comments/1nch6l6/ama_im_the_head_of_engineering_at_a_b2b_saas/).

Frontend, observability, мобильный стек, AI/ML и полный cloud topology — **НЕ НАЙДЕНО**. Карьерная страница ведёт на SaaS.group, но подходящих актуальных вакансий с полным стеком в QUICK-поиске не найдено.

## 4. Что продукт продаёт на самом деле

### One-liner Rewardful

> Rewardful — это affiliate/referral back office для SaaS-подписок: атрибуция партнёра + расчёт комиссии по реальным billing events + кабинет партнёра и payout workflow.

Это синтез документированных функций, не официальный слоган. Официальное ядро: подключить Stripe/Paddle, настроить campaign, установить tracking; затем система связывает affiliate click с customer и создаёт commission при оплате invoice/charge. [Официальный обзор](https://help.rewardful.com/en/articles/2044650-what-is-rewardful).

### Core job

**Когда** SaaS уже умеет продавать и хочет расти через рекомендации, **помоги** запустить правила партнёрства и без споров связать конкретную оплату с конкретным партнёром, **чтобы** платить только за измеримый результат и не вести рекуррентные комиссии вручную.

Эмоциональная работа: чувствовать, что цифрам можно доверять и партнёров не придётся «успокаивать вручную». Социальная работа: выглядеть перед партнёрами как профессиональный и честный оператор программы.

### Before / after

| Измерение | До | С продуктом | Evidence |
|---|---|---|---|
| Атрибуция | ссылки/UTM/таблица и спор о том, кто привёл клиента | first-party cookie или promo code связывает referral с affiliate | [D] [cookies](https://help.rewardful.com/en/articles/9094146-does-rewardful-use-third-party-cookies), [promo codes](https://help.rewardful.com/en/articles/9336630-how-to-use-promotion-codes-for-referral-tracking) |
| Подписка | ручной пересчёт комиссий при renewal, upgrade, downgrade, refund | комиссия рассчитывается по фактически оплаченному invoice и корректируется по billing events | [D] [product overview](https://help.rewardful.com/en/articles/2044650-what-is-rewardful) |
| Прозрачность | партнёр запрашивает клики, лиды, продажи и баланс | self-serve affiliate dashboard со ссылками, статистикой и комиссиями | [D] [pricing/how it works](https://www.rewardful.com/pricing) |
| Выплата | сбор реквизитов, CSV/ручные переводы, отметки | ручной CSV/PayPal/Wise или Managed Payouts; автоматизация зависит от плана/режима | [D] [manual payouts](https://help.rewardful.com/en/articles/2773351-how-do-i-pay-commissions), [Managed Payouts](https://help.rewardful.com/en/articles/11930744-merchants-faq-managed-payouts) |
| Набор партнёров | ручной поиск в соцсетях/каталогах | Affiliate Finder ищет кандидатов по web query и списывает credit при раскрытии результата | [V/D contract] [pricing](https://www.rewardful.com/pricing), [use-case FAQ](https://www.rewardful.com/use-cases/health-and-wellness) |

**10x claim:** достоверной универсальной метрики «в 10 раз быстрее/дешевле» не найдено. Rewardful заявляет среднюю установку 15–20 минут, а отдельная инструкция — 10–15 минут при наличии базовых навыков или интеграции. Это vendor-observed time, не независимый benchmark: [pricing FAQ](https://www.rewardful.com/pricing), [install guide](https://help.rewardful.com/en/articles/2051896-install-rewardful-on-your-website).

## 5. Механика продукта, без маркетинговых сокращений

### 5.1 Onboarding merchant

Документированный путь:

1. Создать аккаунт/trial.
2. Подключить Stripe или Paddle. В Stripe merchant проходит OAuth grant и возвращается в Rewardful. [Connect Stripe](https://help.rewardful.com/en/articles/2051884-connect-your-stripe-account).
3. Создать campaign: имя, website URL, процент или фиксированная комиссия, recurring duration/maximum payments, payout threshold, cookie window, attribution и privacy. [Create campaign](https://help.rewardful.com/en/articles/2051885-create-your-first-campaign), [campaign settings](https://help.rewardful.com/en/articles/14148863-campaign-settings-overview).
4. Установить JS tracking и conversion integration либо готовую интеграцию; подтвердить установку. [Install guide](https://help.rewardful.com/en/articles/2051896-install-rewardful-on-your-website).
5. Получить public signup/invite link; пригласить партнёров bulk email, вручную или API. [Pricing FAQ](https://www.rewardful.com/pricing).
6. Наблюдать Visitors → Leads → Conversions, commissions pending/due/paid/voided; разбирать fraud flags и возвраты.
7. Выплачивать вручную через export + PayPal/Wise/other или подключить Managed Payouts/Enterprise PayPal flow. [Payout guide](https://help.rewardful.com/en/articles/2773351-how-do-i-pay-commissions).

Критическая UX-идея: первым «Aha» является не созданная campaign, а **проверенный тестовый referral, который связался с тестовой оплатой и показал ожидаемую комиссию**. [H]

### 5.2 Onboarding affiliate

Документированный путь:

1. Affiliate получает public signup link или invite; private campaign отключает публичную форму.
2. Регистрируется; видит welcome text и условия campaign.
3. Получает персональный link/token; может создавать ссылки на страницы, а при включении — promo code.
4. В dashboard видит клики/рефералов/комиссии и доступные merchant assets.
5. При Managed Payouts настраивает 2FA, выбирает bank/SEPA, wire, PayPal или check, при необходимости проходит identity/tax verification.
6. После funding merchant’ом получает уведомление и сам инициирует withdrawal; payout details вводятся один раз, но вход для вывода нужен каждый месяц.

Источники: [campaign settings](https://help.rewardful.com/en/articles/14148863-campaign-settings-overview), [affiliate portal personalization](https://help.rewardful.com/en/articles/5343065-personalize-the-affiliate-portal), [Managed Payouts affiliate onboarding](https://help.rewardful.com/en/articles/11123205-getting-started-with-managed-payouts-for-affiliates), [assets](https://help.rewardful.com/en/articles/15188892-adding-marketing-assets-for-your-affiliates).

### 5.3 Journey referred customer

1. Клиент видит рекомендацию партнёра.
2. Переходит по clean URL вида `merchant.ru?via=partner` или использует promo code.
3. First-party cookie сохраняет referral; default window 60 дней, campaign может изменить срок. [Cookie guide](https://help.rewardful.com/en/articles/2155812-how-long-are-referral-cookies-valid).
4. Клиент регистрируется/покупает; payment provider создаёт customer/invoice/charge, integration передаёт referral metadata.
5. После фактической оплаты Rewardful создаёт commission; discount уменьшает базу комиссии до net paid amount.
6. Renewal создаёт следующие commissions; refund/cancel/upgrade/downgrade меняют расчёт.
7. Customer обычно не видит Rewardful. При double-sided incentive получает discount; при customer-credit program интерфейс и отображение credit должен предоставить merchant.

Источники: [What is Rewardful](https://help.rewardful.com/en/articles/2044650-what-is-rewardful), [campaign calculation](https://help.rewardful.com/en/articles/2051885-create-your-first-campaign), [promotion codes](https://help.rewardful.com/en/articles/9336630-how-to-use-promotion-codes-for-referral-tracking).

### 5.4 Affiliate Finder — функция есть, качество не доказано

Официальный FAQ описывает встроенный поисковик: запрос не расходует credit, раскрытие конкретного результата расходует один; credits сбрасываются каждый billing cycle и не переносятся. Rewardful утверждает, что Finder crawls the web, а не ищет только в affiliate database. [Use-case FAQ](https://www.rewardful.com/use-cases/health-and-wellness).

На текущих use-case pricing-блоках показаны 10 credits Starter, 30 Growth и 100 Enterprise. Это **[V/D]**; результативность, географическое покрытие, качество контактов и наличие русскоязычных creators независимо не проверены.

Независимый сигнал против чрезмерного обещания: G2 reviewer 27 апреля 2026 пишет, что находить лучших новых affiliates через Rewardful было сложнее, чем через PartnerStack. Это одно свидетельство и не доказывает, что Finder бесполезен. [G2 reviews](https://www.g2.com/products/rewardful/reviews).

### 5.5 Customer referral credits — функция есть, но это не turnkey UI

Официальная инструкция прямо подтверждает custom non-monetary rewards и refer-a-friend. Однако merchant должен:

1. создать customer и affiliate через Rewardful API, передав `stripe_customer_id`;
2. показать referral link и stats в собственном app dashboard;
3. слушать Rewardful webhook `payout.due`;
4. по amount и `stripe_customer_id` самостоятельно начислить credit на Stripe customer balance.

Affiliate portal Rewardful отображает денежные комиссии, поэтому custom reward UX нужно хостить в продукте merchant’а. Источник: [How to Setup Custom Rewards / Customer Referral Programs](https://help.rewardful.com/en/articles/7358365-how-to-setup-rewardful-for-custom-rewards-customer-referral-programs).

Вывод: прежняя формулировка «Rewardful не умеет customer credits» неверна. Точная формулировка: **Rewardful даёт tracking/API/webhook primitives для customer credits, но merchant реализует интерфейс и фактическое начисление credit**.

## 6. Voice of Customer

### 6.1 Что любят

Короткие реальные фрагменты; орфография сохранена. G2 на момент поиска показывает 4.4/5 и 73 reviews, но рейтинг и темы могут меняться.

| Цитата | Кто/контекст | Что означает | Confidence |
|---|---|---|---:|
| “Rewardful is incredibly easy to use and quick to set up.” | G2, small business, 2025 | простота merchant onboarding | 4/5 |
| “It works well and is very easy to set up.” | G2, small business, 2026 | надёжность + низкий порог | 4/5 |
| “Signups are super easy, tracking is clear, UI is great” | G2, CEO, 2025 | affiliate signup и прозрачность | 4/5 |
| “The dashboard is straightforward with sane defaults” | G2, CTO/co-owner, 2024 | важность default settings | 4/5 |
| “Setting up Rewardful was incredibly smooth.” | Product Hunt reviewer, 2023 | согласующийся сигнал простоты | 3/5 |
| “Rewardful makes affiliate management super easy” | Product Hunt, builder review, 2024 | end-to-end management | 3/5 |

Источники: [G2 review page](https://www.g2.com/products/rewardful/reviews?page=2&qs=pros-and-cons), [Product Hunt reviews](https://www.producthunt.com/products/rewardful/reviews).

### 6.2 Что раздражает

| Цитата | Тема | Caveat | Confidence |
|---|---|---|---:|
| “It is quite expensive for low volume.” | цена до traction | повторяется в нескольких small-business reviews | 4/5 |
| “Automatic payout would be very useful!” | ручной payout | Managed Payouts теперь существует, но доступность/география требуют проверки | 4/5 |
| “The pricing plans aren’t very clear” | непонятные plan limits | одна атрибутированная жалоба | 3/5 |
| “Documentation to integrate with Stripe/Javascript could be improved.” | developer onboarding | одна жалоба, но рядом есть похожая про webhook timing | 3/5 |
| “Only payout options are Wise and Paypal.” | payout coverage | относится к прежнему/manual workflow; Managed Payouts расширил варианты | 3/5 |
| “more advanced reporting or customization options would be nice” | power-user analytics | тема агрегирована G2 как limited functionality/customization | 4/5 |
| “doesn't support different commissions for different products” | multi-product economics | один текущий пользователь, 2026 | 3/5 |
| “Would be cool if they offered some kind of affiliate marketplace” | recruitment | Finder не равен marketplace; пожелание остаётся содержательным | 3/5 |

Источник: [G2 Rewardful reviews](https://www.g2.com/products/rewardful/reviews), [G2 pros/cons page 2](https://www.g2.com/products/rewardful/reviews?page=2&qs=pros-and-cons).

Product Hunt содержит один резкий отзыв с обвинением в списаниях без согласия. Это **неподтверждённая единичная жалоба**, противоположная остальной малой выборке; её нельзя превращать в факт о billing practice. [Product Hunt reviews](https://www.producthunt.com/products/rewardful/reviews).

### 6.3 Повторяющиеся паттерны

- Положительный: easy setup / ease of use / понятный dashboard — повторяется на G2 и Product Hunt. Confidence 4/5.
- Положительный: глубокая Stripe/Paddle связь снимает ручной расчёт recurring commissions. Документировано и подтверждается отзывами. Confidence 5/5 для контракта, 4/5 для качества.
- Отрицательный: $49 кажется дорогим до появления affiliate revenue. Несколько small-business отзывов + Reddit-обсуждение. Confidence 4/5.
- Отрицательный: payouts исторически требовали manual step; новые Managed Payouts и Enterprise PayPal частично закрывают тему. Нельзя повторять старые жалобы как текущую универсальную правду. Confidence 4/5.
- Отрицательный: advanced reporting, customization, event docs и multi-product rules ограничены для сложных программ. Confidence 3/5.
- Отрицательный: recruitment остаётся отдельной работой; Affiliate Finder существует, но не является marketplace и его качество для РФ неизвестно. Confidence 3/5.

## 7. Три кандидатных сегмента для российского аналога

Размеры и доли сегментов **НЕ НАЙДЕНЫ** и не оцениваются без market module.

### Segment A — founder-led micro SaaS с первыми продажами

| Поле | Гипотеза |
|---|---|
| Кто | Founder/небольшая команда, продукт уже продаётся, но отдельного partner manager нет; платежи через ЮKassa |
| Functional JTBD | «Запусти мне работающую партнёрку за вечер и докажи на тестовой оплате, что всё считается» |
| Emotional JTBD | не бояться скрытой интеграционной сложности и ошибочных выплат |
| Social JTBD | выглядеть перед первыми 10 партнёрами как серьёзный SaaS |
| Текущая альтернатива | таблица + UTM + ручная сверка ЮKassa; промокоды без recurring attribution |
| Trigger | есть 10–50 платящих клиентов и знакомые creators/агентства, готовые рекомендовать |
| Барьер | цена до результата, техническая установка, неясность налогов/выплат |
| Must-have | guided setup, тестовый referral/payment, RUB, ЮKassa webhooks, простой реестр выплат |
| Anti-segment | pre-revenue founder без работающего funnel: даже пользователь Reddit советует сначала получить продажи |

### Segment B — малый SaaS с ручной партнёркой

| Поле | Гипотеза |
|---|---|
| Кто | 5–30 человек, несколько тарифов/подписок, 20–200 партнёров, комиссии сейчас считают вручную |
| Functional JTBD | «Свяжи платежи, возвраты и renewals с партнёрами и закрой месяц без расхождений» |
| Emotional JTBD | уверенность в цифрах и отсутствие страха публичного конфликта с affiliate |
| Social JTBD | быть прозрачным и надёжным заказчиком для агентств/экспертов |
| Trigger | spreadsheet перестала сходиться; появился первый возврат/upgrade/несколько продуктов |
| Барьер | миграция истории, доверие к атрибуции, сложные commission rules, доступы к платежным данным |
| Must-have | idempotent webhook ledger, adjustments, audit trail, imports, роли, product-specific rules, payout approval |
| Opportunity vs Rewardful | локальный payment rail и product-level rules; Rewardful reviewer прямо отмечает ограничение разных комиссий по продуктам |

### Segment C — customer-led referral SaaS (пилот Proofwall)

| Поле | Гипотеза |
|---|---|
| Кто | SaaS с довольными активными пользователями, где рекомендация естественна; Proofwall подходит как кандидат, потому что его пользователь уже делится social proof |
| Functional JTBD | «Дай каждому клиенту ссылку; за оплаченного друга начисли понятный credit на будущую подписку» |
| Emotional JTBD | клиенту приятно получать честную награду без статуса профессионального affiliate |
| Social JTBD | рекомендовать полезный продукт без ощущения навязчивой рекламы |
| Trigger | после первого опубликованного результата/Aha в основном продукте |
| Барьер | customer не хочет KYC/платёжные реквизиты; бизнесу нужна защита от self-referral |
| Must-have | embedded referral card, share link, progress, double-sided benefit, account-credit ledger, anti-fraud |
| Rewardful lesson | custom credits поддерживаются primitives, но Rewardful требует merchant-built UI; здесь локальный продукт может сделать их first-class |

> Примечание интеграции 2026-09-08: буквы A/B/C в следующем исследовательском разделе — ранние локальные обозначения, не ссылки на итоговые HTML. Финальное соответствие: HTML A = merchant launch + реестр; HTML B = customer credits; HTML C = external partner. Приоритет у product-discovery-brief.md и интерфейса.


> Интеграция: списки обязательных кликов ниже — предложения исследователя для будущей проверки, не отчёт о реализованной приёмке. Delayed webhook, self-referral и выбор attribution-mode в текущих HTML не реализованы; production API не проверялось. Актуальный scope и результаты — product-discovery-brief.md и prototypes/cjm/tests.

## 8. Три CJM-кандидата для HTML-прототипов

Это исследовательские journey-гипотезы. Они специально различаются по entry point, Aha и monetization moment, чтобы пользователь мог сравнить, а не выбрать три вариации одного экрана.

### CJM A — «Запустить партнёрку за 15 минут» (merchant-first)

**Сегмент:** A.  
**Entry:** лендинг/калькулятор → «Подключить ЮKassa».  
**Aha:** тестовая ссылка приводит тестовую оплату, merchant видит `Оплата 990 ₽ → комиссия 198 ₽`.  
**Paywall hypothesis:** после успешного sandbox test, до production activation.

Экраны:

1. Outcome landing: «Платите партнёрам только за реальные оплаты»; CTA «Проверить на тестовом магазине ЮKassa».
2. Connect: OAuth/API credentials, список минимальных permissions, индикатор sandbox/live.
3. Program recipe: один экран с sane defaults — 20% recurring, 30-day hold, 60-day attribution, prohibit self-referral.
4. Install: JS snippet + server webhook; framework tabs; live event checklist.
5. Test journey: сгенерировать ссылку → открыть incognito → сделать sandbox payment.
6. Aha receipt: timeline click → signup → payment → commission, сумма и formula.
7. Invite 10 partners: CSV/email/manual link; готовый русский invite copy.
8. Operations dashboard: pending/due/paid, refunds, warnings.

Ключевой trust copy: «Ни регистрация, ни клик не создают долг. Комиссия появляется после `payment.succeeded`.»

### CJM B — «Закрыть выплаты без Excel» (operations-first)

**Сегмент:** B.  
**Entry:** импорт текущих affiliates и payment history.  
**Aha:** reconcile показывает 100% сопоставленных платежей и объясняет каждую корректировку.  
**Paywall hypothesis:** после бесплатного read-only audit, до включения ongoing tracking.

Экраны:

1. Problem landing: «Загрузите таблицу — покажем расхождения до подключения».
2. Import mapper: колонки partner/customer/payment/product; dry-run и ошибки.
3. ЮKassa connect + webhook health.
4. Rules builder: commission per product/tier, recurring duration, hold, refunds.
5. Reconciliation: payment, referral, rule version, commission, reason; фильтр «не сопоставлено».
6. Aha report: «1 248 платежей, 17 корректировок, 0 необъяснённых»; export audit.
7. Payout approval: batch, реквизиты, налоговый/договорный status placeholder, maker-checker.
8. Affiliate view preview: что увидит партнёр и какие customer data скрыты.

Ключевой trust copy: «У каждой суммы есть событие, правило и история изменения.»

### CJM C — «Клиент приводит клиента за кредит» (customer-first, Proofwall pilot)

**Сегмент:** C.  
**Entry:** embedded card после основного Aha Proofwall — например, после публикации первой Wall of Love.  
**Aha:** друг оплачивает; у referrer появляется account credit, а в timeline видно основание.  
**Paywall hypothesis:** функция включена в paid merchant plan; customer не платит и не проходит affiliate KYC, пока награда только account credit.

Экраны:

1. In-product celebration: «Стена опубликована. Подарить другу скидку?»
2. Offer card: «Другу 20%, вам 500 ₽ на следующую подписку»; условия простым языком.
3. Share composer: Telegram/VK/email/copy link, preview сообщения.
4. Referred visitor landing: benefit + автор рекомендации + disclosure; promo auto-applied.
5. Checkout ЮKassa: customer видит скидку; attribution survives return.
6. Referrer timeline: clicked → signed up → paid → hold → credit available.
7. Aha credit: баланс и автоматическое применение к следующему счёту/внутреннему тарифу.
8. Fraud/exception states: self-referral rejected, refund reverses pending credit, support appeal.

Ключевой trust copy: «Кредит станет доступен после оплаты друга и окончания срока возврата.»

### Что должно быть кликабельным во всех трёх прототипах

- переключение happy path / refund / self-referral / webhook delayed;
- tooltip с формулой комиссии;
- просмотр merchant и affiliate/customer perspectives;
- choice first-touch / last-touch с визуальным примером;
- sandbox/live badge;
- source/evidence drawer: documented / vendor claim / hypothesis;
- явная кнопка «Это гипотеза — отметить для интервью», без притворной аналитики.

## 9. Локальная возможность: ЮKassa

Rewardful официально отвечает: если merchant не использует Stripe или Paddle, продукт сейчас не подходит. [Pricing FAQ](https://www.rewardful.com/pricing). Это прямой локальный gap, а не доказательство рыночного спроса.

ЮKassa документирует необходимые payment primitives:

- webhook events `payment.succeeded`, `payment.canceled`, `refund.succeeded`; [incoming notifications](https://yookassa.ru/developers/using-api/webhooks);
- автоматические повторные списания через сохранённый `payment_method_id`, при этом периодичность и отключение merchant реализует сам; [recurring payments](https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/basics);
- полные и частичные refunds; [refunds](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds).

**[H] Минимальный attribution/commission pipeline для пилота:**

`affiliate link/promo → first-party referral id → signup mapping → YooKassa payment metadata/order mapping → verified payment.succeeded → immutable commission entry → refund.succeeded adjustment → hold → payout/credit`.

Нельзя считать это готовой интеграцией: нужно проверить webhook authenticity/retries, event ordering, idempotency, metadata availability, recurring-payment identifiers, partial refunds, currencies, sandbox parity и правила доступа merchant OAuth/API. ЮKassa также требует, чтобы merchant самостоятельно реализовал условия, периодичность и отключение автоплатежей.

## 10. Риски и неизвестные

### Product risks

1. **Cold-start партнёров.** Tracking не создаёт distribution. Affiliate Finder у Rewardful есть, но качество в РФ неизвестно. Pilot должен начинаться с уже известных Proofwall partners, а не обещать marketplace. [H]
2. **Доход до цены.** Ранний SaaS может месяцами платить fixed fee без affiliate revenue; это повторяющаяся complaint theme.
3. **Attribution disputes.** First/last touch, promo vs link, cross-domain и organic/search traffic должны быть объяснимы пользователю.
4. **Refund and event ordering.** Финансовый ledger обязан быть idempotent и reversible через adjustment, иначе «простота» быстро превращается в спор.
5. **Payout is a separate product.** Tracking/commission и фактическая выплата юридически и технически разные контуры. Для MVP можно дать реестр/approval/export, но нельзя называть это automated payout. [H]
6. **Customer credits are not cash payouts.** Нужны отдельные правила expiration, partial use, cancellation и отрицательного баланса.
7. **Privacy.** Rewardful позволяет скрывать customer name и никогда не показывает affiliate email адрес клиента. Российский аналог должен определить минимальный disclosure и retention; юридическое заключение не проводилось.
8. **Multi-product rules.** Пользовательские жалобы показывают реальную потребность; MVP scope надо проверить на Proofwall, прежде чем строить универсальный rule engine.

### Legal/operational unknowns — не выдавать за решённые

- договорная модель с физлицами, самозанятыми, ИП и юрлицами;
- налоговые удержания/чеки/акты и кто является плательщиком;
- требования к маркировке рекламы и роли merchant/affiliate/platform;
- обработка персональных данных, трансграничные передачи и consent для tracking;
- допустимые payout rails в РФ и ограничения конкретных банков/кошельков;
- accounting treatment account credits и customer discounts.

Ни один из этих пунктов не исследован достаточно для финального решения. Нужен отдельный legal/ops pass по первичным российским источникам.

### Research unknowns

- нет independently verified customer count, affiliate count, revenue, funding, valuation или acquisition price;
- нет hands-on записи текущего Rewardful onboarding и Affiliate Finder results;
- не проверены plan entitlements Managed Payouts по странам и дополнительные fees;
- не проверено русскоязычное покрытие Affiliate Finder;
- не проведены интервью с российскими SaaS founders, affiliates или бухгалтерией;
- не измерены willingness-to-pay и реальная частота refund/renewal edge cases;
- не проверены production webhooks ЮKassa на Proofwall;
- не решено, считать ли Proofwall первым pilot tenant; это только предложенный кандидат.

## 11. Гипотезы для customer development

1. **H1:** small SaaS с первыми продажами купит продукт только после бесплатного sandbox Aha, а не после создания campaign.
2. **H2:** главный willingness-to-pay возникает после первого спорного renewal/refund, а не при первом affiliate click.
3. **H3:** для России «нативно с ЮKassa + RUB + понятный payout register» важнее общего числа integrations.
4. **H4:** founders сначала приводят партнёров вручную; Finder полезен позже и не должен быть hero promise MVP.
5. **H5:** customer credits конвертят лучше cash affiliate onboarding для Proofwall, потому что не требуют payout/KYC journey от обычного клиента.
6. **H6:** прозрачная timeline «событие → правило → сумма» снижает support/disputes сильнее, чем расширенная chart analytics.
7. **H7:** тариф с низким fixed fee и usage после подтверждённых conversions выиграет у $49 fixed на раннем этапе, но может создать плохую unit economics.

Минимум интервью до PRD: 5 founders segment A, 5 operators segment B, 5 активных Proofwall-подобных customers, 5 потенциальных affiliates/creators. Это предложение выборки, а не проведённые интервью.

## 12. Source register

Все источники открыты/проверены 2026-09-08. Даты публикации указаны там, где страница их показывает.

| # | Источник | Тип | Дата источника | Для чего использован |
|---:|---|---|---|---|
| 1 | [Rewardful About](https://www.rewardful.com/about) | official/vendor | current page | founding, founders, team/customer/affiliate counts, mission |
| 2 | [Rewardful joins SaaS.group](https://www.rewardful.com/articles/rewardful-joins-forces-with-saas-group) | official announcement | 2021-11-16; updated 2023-08-09 | bootstrapped history, acquisition/ownership context |
| 3 | [Rewardful Pricing](https://www.rewardful.com/pricing) | official product page | current page | plans, limits, trial, core features, only Stripe/Paddle, invite flow, Finder |
| 4 | [What is Rewardful?](https://help.rewardful.com/en/articles/2044650-what-is-rewardful) | official docs | 2023-12-22 | lifecycle, commission states, target users |
| 5 | [Connect Stripe](https://help.rewardful.com/en/articles/2051884-connect-your-stripe-account) | official docs | 2025-06-25 | merchant onboarding and permissions |
| 6 | [Create first campaign](https://help.rewardful.com/en/articles/2051885-create-your-first-campaign) | official docs | 2024-01-25 | commission types and calculation |
| 7 | [Install Rewardful](https://help.rewardful.com/en/articles/2051896-install-rewardful-on-your-website) | official docs | 2020-10-12 | 10–15 min vendor installation claim |
| 8 | [Campaign settings](https://help.rewardful.com/en/articles/14148863-campaign-settings-overview) | official docs | 2026-03-21 | attribution, privacy, portal, campaign rules |
| 9 | [First-party cookies](https://help.rewardful.com/en/articles/9094146-does-rewardful-use-third-party-cookies) | official docs | 2024-04-08 | tracking mechanism |
| 10 | [Cookie window](https://help.rewardful.com/en/articles/2155812-how-long-are-referral-cookies-valid) | official docs | 2024-10-09 | default 60-day window |
| 11 | [Promotion code tracking](https://help.rewardful.com/en/articles/9336630-how-to-use-promotion-codes-for-referral-tracking) | official docs | 2026-07-08 | coupon attribution/double-sided incentive |
| 12 | [Custom Rewards / Customer Referral Programs](https://help.rewardful.com/en/articles/7358365-how-to-setup-rewardful-for-custom-rewards-customer-referral-programs) | official docs | 2023-11-27 | customer credits, required merchant implementation |
| 13 | [Affiliate Finder FAQ](https://www.rewardful.com/use-cases/health-and-wellness) | official/vendor | current page | Finder behavior and credits |
| 14 | [Manual payouts](https://help.rewardful.com/en/articles/2773351-how-do-i-pay-commissions) | official docs | 2026-02-03 | CSV/PayPal/Wise workflow |
| 15 | [Managed Payouts merchant FAQ](https://help.rewardful.com/en/articles/11930744-merchants-faq-managed-payouts) | official docs | current page | funded single invoice and affiliate withdrawal |
| 16 | [Managed Payouts affiliate onboarding](https://help.rewardful.com/en/articles/11123205-getting-started-with-managed-payouts-for-affiliates) | official docs | 2025-08-04 | 2FA/KYC/payment details/withdrawal |
| 17 | [Affiliate portal personalization](https://help.rewardful.com/en/articles/5343065-personalize-the-affiliate-portal) | official docs | 2024-12-12 | affiliate dashboard contents |
| 18 | [Marketing assets](https://help.rewardful.com/en/articles/15188892-adding-marketing-assets-for-your-affiliates) | official docs | 2026-06-12 | affiliate enablement |
| 19 | [G2 Rewardful reviews](https://www.g2.com/products/rewardful/reviews) | independent review platform | current; individual dates 2025–2026 | positive/negative VOC, rating/sample |
| 20 | [G2 pros/cons page 2](https://www.g2.com/products/rewardful/reviews?page=2&qs=pros-and-cons) | independent review platform | individual dates 2024–2026 | pricing, payout, docs, customization complaints |
| 21 | [Product Hunt reviews](https://www.producthunt.com/products/rewardful/reviews) | community review platform | current; 10 reviews | secondary VOC and launch year |
| 22 | [Reddit Head of Engineering AMA](https://www.reddit.com/r/b2bmarketing/comments/1nch6l6/ama_im_the_head_of_engineering_at_a_b2b_saas/) | self-attributed employee post | 2025-09-09 | partial tech stack |
| 23 | [Reddit micro-SaaS discussion](https://www.reddit.com/r/microsaas/comments/1u3nh3b/any_one_using_still_using_rewardful_or_tolt_for/) | community discussion | 2026 | timing: sales/funnel before affiliate program |
| 24 | [ЮKassa incoming notifications](https://yookassa.ru/developers/using-api/webhooks) | primary API docs | current | payment/refund event availability |
| 25 | [ЮKassa recurring payments](https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/basics) | primary API docs | current | saved method/autopay lifecycle and merchant duties |
| 26 | [ЮKassa refunds](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds) | primary API docs | current | full/partial refund behavior |

## 13. Confidence summary

| Блок | Confidence | Причина |
|---|---:|---|
| Company/history | 3.5/5 | в основном vendor sources; financial values absent |
| Pricing/product contract | 4.8/5 | current official docs, но без hands-on test |
| Merchant/affiliate/customer journeys | 4.5/5 | собраны из пошаговых official docs |
| Affiliate Finder | 3.2/5 | существование/contract documented; качество и РФ coverage не проверены |
| Customer referral credits | 4.7/5 | официальный пошаговый API/webhook guide; не turnkey |
| Voice of Customer | 3.7/5 | 2 platforms, G2 sample 73, темы повторяются; selection bias остаётся |
| Российские сегменты/JTBD | 2.5/5 | evidence-informed hypotheses без интервью |
| ЮKassa feasibility | 4.0/5 для primitives; 2.5/5 для полной интеграции | primary API docs, production pilot не сделан |
| **Итого** | **3.8/5** | сильная продуктовая документация, слабая независимая/локальная validation |

## 14. Gate перед PRD

Исследование поддерживает создание трёх кликабельных CJM-прототипов, но **не поддерживает переход к PRD без выбора journey и проверки хотя бы критических предпосылок**: ЮKassa sandbox event mapping, willingness-to-pay двух merchant segments и предпочтение Proofwall users между cash reward и account credit.

В рамках текущего задания PRD не создавался, репозиторий не изменялся, продукт не реализовывался.

Status: completed
