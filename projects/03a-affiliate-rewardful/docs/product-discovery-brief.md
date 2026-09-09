# N3a — product discovery input к выбору CJM

- **Checkpoint:** исследование и три варианта CJM; PRD и реализация начинаются только после выбора владельца
- **RUN_ID:** `20260909T170111Z-discovery-958f`
- **WORK_UNIT_ID:** `product-discovery`
- **TRACE_PATH:** `/tmp/n3a-product-discovery/projects/03a-affiliate-rewardful/docs/discovery/product-discovery-input.md`
- **Baseline:** `89dc14a5b41c8b21e589a331a1bed4b6a8870ff1`
- **Режим:** QUICK, bounded synthesis
**Дата:** 2026-09-09

## Как читать документ

- `[D]` — подтверждено официальной документацией или исходниками baseline.
- `[O]` — решение владельца, принятое в утверждённом плане N3a.
- `[H]` — продуктовая гипотеза; требует наблюдения или выбора владельца.
- `НЕ УСТАНОВЛЕНО` — данных для вывода нет. Значение не заменено benchmark или оценкой.
- Официальная документация поставщика подтверждает заявленный контракт, но не результат для N3a.

## PD-001. Продуктовая рамка

**Рабочий one-liner:** N3a — кабинет партнёрской программы для малого SaaS: он связывает рекомендацию с подтверждённой оплатой в ЮKassa, считает комиссию, объясняет корректировки и готовит ручную выплату.

**Core job:** когда SaaS уже получает оплаты и хочет расти через рекомендации, помочь владельцу и партнёру одинаково понимать, кто привёл клиента, какая подтверждённая оплата создала начисление и что войдёт в ближайшую ручную выплату.

**Эмоциональная работа:** владелец не боится переплаты и споров; партнёр не боится непрозрачного расчёта.

**Социальная работа:** владелец выглядит надёжным оператором программы, а партнёр — рекомендателем продукта, которым действительно пользуется или который понимает.

**Первая интеграция:** N1 Proofwall (`projects/01-testimonials-senja`). N2 — только донор подходящих примитивов; он не является первым клиентом, вторым runtime и доказательством готовности N3a. `[O]`

### В scope общего продукта

- одна программа Proofwall: правила, статус и версия условий;
- owner view и персональный partner view внутри одного продукта;
- добровольное подключение партнёра, персональная ссылка и промокод;
- pending attribution до подтверждённой оплаты N1 в ЮKassa;
- начисления по каждой применимой подтверждённой оплате, включая повторные оплаты после первого заказа;
- корректировки при подтверждённых полных и частичных возвратах;
- реестр начислений предыдущего календарного месяца и ручная выплата каждого 5-го числа;
- раздельные состояния начисления и выплаты, источник каждого события и продуктовые метрики;
- один entry/loop, выбранный владельцем после просмотра трёх HTML-альтернатив; альтернативы не означают реализацию всех трёх.

### Вне scope этого checkpoint и первого продукта

- автоматические выплаты и любое фактическое движение денег из N3a;
- hold 30–45 дней на каждое начисление;
- публичный developer API, MCP/A2A или другой агентный интерфейс;
- четыре самостоятельных приложения A–D и перенос их прежнего scope;
- Affiliate Finder, marketplace, многоуровневые партнёрские награды и авторассылки;
- изменение или распространение через testimonial widgets/Wall of Love badges N1;
- одновременная реализация двух CJM-альтернатив, не выбранных владельцем;
- интеграция N2 как клиента, другие платёжные провайдеры и production rollout;
- тариф, прогноз выручки, TAM/SAM/SOM, unit economics, PRD и архитектурное решение.

## PD-002. M2 — продукт, сегменты и JTBD

| Сегмент / роль | Functional job | Emotional / social job | Trigger | Барьер | Confidence |
|---|---|---|---|---|---:|
| Владелец Proofwall / оператор программы | Запустить одну понятную программу и платить только по подтверждённым оплатам | Доверять реестру; выглядеть честным перед партнёрами | Есть первые платящие клиенты и желание масштабировать рекомендации | Неясные правила возвратов, recurring и выплаты | 4/5 для контекста N1; эффект `[H]` |
| Довольный пользователь Proofwall | После полученного результата быстро рекомендовать Proofwall и видеть личный результат | Делиться без ощущения спама; понимать, за что начислили | Опубликована Wall of Love или установлен первый widget | Недоверие к условиям, лишняя регистрация, нет подходящего контакта | 3/5 `[H]` |
| Автор, агентство или интегратор | Получить ссылку/код, готовый материал и прозрачный персональный ledger | Выглядеть компетентным рекомендателем; не выпрашивать статус | У него уже есть релевантная SaaS-аудитория или повторяемая работа с Proofwall | Время на onboarding, слабый offer, ручная сверка | 3/5 `[H]` |
| Приглашённый владелец малого SaaS | Понять Proofwall, зарегистрироваться и оплатить без потери атрибуции | Чувствовать, что рекомендация уместна и условия прозрачны | Рекомендация от знакомого, автора или видимого Proofwall-артефакта | Незнакомый продукт, непонятный промокод или скрытая мотивация рекомендателя | 3/5 `[H]` |

Размеры и доли сегментов, число доступных партнёров и willingness-to-pay `НЕ УСТАНОВЛЕНЫ`. Сегменты — набор интервьюируемых ролей, а не оценка рынка.

### Before / after

| До | После | Что должно доказать изменение |
|---|---|---|
| Ссылки, коды, оплаты и выплаты сводятся вручную | Одна временная шкала referral → signup → verified payment → commission → payout | Пользователь правильно объясняет источник и статус выбранного начисления |
| Партнёр спрашивает владельца о кликах, продажах и долге | Партнёр видит только свои показатели и причины корректировок | Меньше ручных запросов — измерять, не обещать |
| Владелец может начислить за signup или повтор события | Начисление возникает только из применимой подтверждённой оплаты | Нулевые дубликаты и явные reconciliation exceptions |
| Месячная выплата собирается из разрозненных записей | 5-го формируется/исполняется ручной реестр за прошлый месяц | Сумма реестра воспроизводится из ledger без скрытого hold |

### Aha moments общего core

- **Владелец:** тестовая или реальная цепочка показывает `источник → клиент → подтверждённая оплата → формула комиссии` без необъяснённого расхождения. `[H]`
- **Партнёр:** первая подтверждённая оплата появляется как начисление с суммой, основанием и ожидаемой датой ручной выплаты. `[H]`
- Создание программы, копирование ссылки и signup сами по себе не считаются Aha.

## PD-003. Пилот N1 Proofwall

N1 уже определяет свой value moment через установленный widget и событие `widget_installed`. Это полезный контекст о Proofwall, но ни один текущий вариант не меняет и не распространяется через этот widget; badge варианта B живёт только на публичной странице партнёрской программы Proofwall. `[D]` Источник: `projects/01-testimonials-senja/CLAUDE.md`.

Текущий N1 checkout продаёт 30 дней доступа за 990 ₽ и продлевает срок при каждой вручную начатой оплате; это не автоматическая подписка. В текущем N1 нет доступного partner MRR и нет обработки refund для партнёрского начисления. `[D]` Поэтому 990 ₽ можно использовать в HTML только как текущую цену N1, а ставка 20% и производная комиссия — явно иллюстративные demo values, не условия N3a.

### Пилотная цепочка

1. Владелец Proofwall задаёт одну программу: кто может участвовать, ставка/длительность комиссии, attribution rule и версия условий.
2. N3a использует ровно один entry, выбранный после HTML checkpoint: incentivized launch, badge на публичной странице программы Proofwall или assisted launch.
3. Партнёр осознанно подключается и получает персональные ссылку и промокод.
4. Приглашённый пользователь приходит в N1; источник сохраняется до регистрации и оплаты по выбранному правилу.
5. N1 подтверждает оплату через канонический YooKassa event/status; только затем N3a создаёт начисление.
6. Каждая следующая применимая подтверждённая оплата того же клиента может создать отдельное начисление; точная длительность комиссии пока не выбрана.
7. Подтверждённый возврат корректирует ledger. Повтор одного provider event не создаёт новую сумму.
8. Каждый 5-й день месяца оператор обрабатывает реестр начислений прошлого календарного месяца и вручную переводит деньги вне N3a.
9. Оператор вручную отмечает отправку с датой/основанием; N3a не приравнивает эту отметку к зачислению получателю.

### Что пилот должен узнать

- доходит ли выбранная петля до **первого подтверждённого партнёрского начисления**, а не останавливается на просмотрах, signup или demo events;
- понимают ли владелец и партнёр одну и ту же формулу и payout status;
- достаточно ли ссылки и промокода для реального поведения N1-аудитории;
- сколько ручной работы требуют onboarding, reconciliation и выплата;
- какие recurring/refund случаи N1 реально производит в YooKassa и как их идентифицировать.

**Цель пилота:** одна программа N1 Proofwall хотя бы с одним реальным первым начислением из канонической подтверждённой оплаты YooKassa. Test, fixture и HTML demo events не засчитываются. Более широкий conversion threshold и размер когорты не установлены.

## PD-004. M3 — компактная рыночная рамка

Rewardful публично описывает campaign как набор правил tracking/reward; поддерживает percentage/fixed commissions, referral links/coupons, cookie window, affiliate portal и recurring limits. `[D]` Его текущая pricing page говорит, что продукт работает только со Stripe или Paddle и даёт merchant/affiliate dashboards. Это подтверждает категорию продукта, но не спрос на локальный аналог.

Rewardful документирует first-party cookie tracking и coupon attribution; его merchant payout guide показывает сводку долга и ручную выплату выбранным внешним способом. `[D]` Rewardful также документирует пересчёт комиссии после полного или частичного refund в Stripe. Эти паттерны поддерживают прозрачный ledger и ручной payout workflow, но N3a должен опираться на события YooKassa/N1.

**Позиционирование `[H]`:** «партнёрская программа для малого SaaS на ЮKassa, начинающая с Proofwall и прозрачного месячного реестра». Доказанного преимущества, market share, TAM/SAM/SOM, российского category benchmark и текущего CAC конкурентов `НЕ НАЙДЕНО`; численные рыночные выводы не входят в этот checkpoint.

**Конкурентная развилка для CJM:** Rewardful продаёт общую простоту установки; N3a может показать более конкретный proof — одну проверенную оплату N1 и понятную дату ручной выплаты. Причинный эффект такого Aha остаётся `[H]`.

## PD-005. M4 — бизнес и деньги без выдуманных значений

| Элемент | Текущая позиция | Что неизвестно |
|---|---|---|
| Плательщик N3a | `[H]` merchant / владелец SaaS | Цена, free/trial, billing unit, willingness-to-pay |
| Возможная модель | `[H]` подписка за программу и ledger | ARPA, churn, CAC, margin, support cost |
| Комиссия партнёра | Обязательство merchant перед партнёром; не считать выручкой N3a | Ставка, срок recurring, minimum payout, документы |
| Payment intake | N1 принимает RUB через ЮKassa | Точный контракт передачи канонических событий N1 → N3a |
| Payout | Вручную каждого 5-го за предыдущий месяц `[O]` | Часовой пояс, cutoff, выходной день, доказательство получения |
| Hold | Per-payment hold 30–45 дней отсутствует `[O]` | Обработка позднего refund после отправленной выплаты |

P&L, break-even, LTV:CAC и прогноз финансирования не рассчитаны: для N3a нет измеренных входов. Экономическую модель после выбора CJM следует строить из наблюдённых затрат пилота и выбранного тарифа, не из примера старого N3.

## PD-006. Общий продукт под выбранный CJM

Три HTML-варианта сравнивают entry и growth loop. После выбора владельца только один entry использует следующий общий core; два других остаются исследовательскими альтернативами:

1. **Program:** merchant, условия, версия, ставка, recurring limit, attribution window/model, status.
2. **Partner:** eligibility, acceptance timestamp, personal link, promo code, personal scope.
3. **Referral:** source variant/campaign, visit, signup, pending/converted/rejected attribution.
4. **Ledger:** canonical payment/refund identity, gross amount, formula/version, commission delta, reason.
5. **Payout register:** calendar month, eligible deltas, exceptions, prepared/sent state and operator evidence.
6. **Measurement:** exposure/source cohort, deliberate enrollment/share, paid conversion and reconciliation state.

В HTML каждый экран обязан явно называть актера: `владелец Proofwall`, `партнёр` или `приглашённый клиент`. Переход между ролями должен быть подписан.

## PD-007. CJM A — «Через вознаграждение»

**Growth loop:** односторонняя incentivized referral с platform dogfooding. Владелец запускает программу Proofwall, партнёр приводит платящего клиента N1, а при первом подтверждённом начислении N3a предлагает явный share собственной партнёрской программы. Платформа использует продаваемую механику, чтобы привести следующего merchant или партнёра.

**Статус:** рекомендованный вариант для сравнения, но не выбранный за владельца.

**Entry hook:** владелец запускает программу Proofwall и приглашает первого известного партнёра с конкретным reward offer.

**Aha:** первая подтверждённая оплата превращается в объяснимое начисление с датой ближайшего ручного payout.

**Главная гипотеза:** вознаграждение и proof первого начисления дают участнику достаточную причину осознанно рекомендовать саму N3a.

| Экран | Актор | Конкретное состояние / действие |
|---|---|---|
| A1. Настройка | Владелец Proofwall | Одна программа: demo-ставка с маркировкой, recurring rule, attribution, payout date; preview формулы и test route |
| A2. Приглашение | Будущий партнёр | Персональное приглашение, версия условий и явное принятие; после него выдаются ссылка и промокод |
| A3. Продажа N1 | Новый клиент N1 | Referral link/code → Proofwall landing/signup → текущий checkout 990 ₽; attribution state видим, 20% остаётся demo value |
| A4. Partner ledger | Партнёр | YooKassa payment confirmed → формула → комиссия; duplicate не добавляет строку, будущий refund показан как отдельная ещё не реализованная коррекция |
| A5. Ручная выплата | Партнёр + owner view | `Начисления сентября` → `к ручной выплате 5 октября` → owner `Отметить отправленной`; status не означает зачисление |
| A6. Platform dogfooding | Участник в момент первого начисления | N3a показывает share собственной партнёрской программы при первом подтверждённом начислении; осознанный share может привести следующего merchant/партнёра, без автоматической отправки |

**Вариантные метрики:** `program_configured → partner_invited → partner_terms_accepted → referred_payment_confirmed → first_commission_accrued → platform_share_confirmed`; time-to-first-commission; следующий merchant/партнёр из этого share.

**Риски:** награда привлечёт self-referral/низкое качество; после начисления у участника может не быть релевантного получателя share; один успешный круг не доказывает повторяемость.

## PD-008. CJM B — «Через видимый бренд»

**Growth loop:** badge-led distribution с публичной страницы партнёрской программы Proofwall. Партнёр подключается и получает начисление; та же program page несёт badge N3a, по которому релевантный посетитель может узнать о платформе и запустить следующую merchant program.

**Entry hook:** публичная страница программы Proofwall ясно показывает offer; badge N3a на этой странице ведёт к product proof N3a.

**Aha:** партнёр видит первое подтверждённое начисление из public-program path; platform-level proof появляется, когда посетитель осознанно кликает badge N3a на program page.

**Главная гипотеза:** публичная партнёрская программа — достаточно релевантное место для бренда N3a, чтобы создавать qualified discovery.

| Экран | Актор | Конкретное состояние / действие |
|---|---|---|
| B1. Public program | Посетитель | Публичная Proofwall partner page: продукт, условия, примеры без обещания дохода, `Стать партнёром` |
| B2. Join | Будущий партнёр | Добровольная регистрация/вход, принятие версии условий, выдача ссылки и промокода |
| B3. Продажа N1 | Новый клиент N1 | Link/code → signup → текущий checkout 990 ₽; source badge/program сохраняется до confirmed payment |
| B4. Ledger | Партнёр | Payment timeline и иллюстративная формула; фактического partner MRR/refund support в N1 пока нет |
| B5. Payout | Партнёр + owner view | Реестр прошлого месяца и ручная отметка отправки 5-го, без claim об автоматическом переводе |
| B6. Badge discovery | Посетитель public program page | Badge N3a в footer страницы программы ведёт к product proof N3a; impression и deliberate click замыкают loop без изменений N1 widgets/Wall |

**Вариантные метрики:** `public_program_viewed → partner_joined → referred_payment_confirmed → commission_accrued → program_page_badge_impression → program_page_badge_click`; badge-to-N3a qualified start.

**Риски:** у public program page недостаточно трафика; N3a branding бесплатного плана раздражает merchant-а; impression не означает intent. Трафик N1 widgets не входит в вариант.

## PD-009. CJM C — «Через сопровождение»

**Motion и loop:** sales-led assisted onboarding + вручную пополняемая proof loop. Владелец и оператор N3a запускают один маршрут Proofwall, сверяют первую продажу и с разрешения используют результат как proof для следующего assisted launch. Candidate CRM отсутствует.

**Entry hook:** владелец Proofwall просит сопровождение настройки программы и первого партнёрского маршрута.

**Aha:** партнёр вместе с оператором проводит test click, затем видит первую подтверждённую оплату и комиссию; владелец видит путь без reconciliation exception.

**Главная гипотеза:** человеческая проверка маршрута и первая reconciliation повышают вероятность первого успешного начисления.

| Экран | Актор | Конкретное состояние / действие |
|---|---|---|
| C1. Assisted intro | Владелец Proofwall + оператор | Guided start одной программы и одного уже известного первого партнёра; без candidate database, scoring и outreach queue |
| C2. Route verification | Владелец Proofwall + оператор | Проверка landing/deep link, promo, test click и ожидаемой attribution до приглашения партнёра |
| C3. Invite & checklist | Партнёр + оператор | Версия условий, явное принятие, 3 шага первого размещения и следующий human action |
| C4. Sale reconciliation | Партнёр + оператор | Share → visit → signup → confirmed YooKassa payment → иллюстративная commission formula; exception разбирается по строке |
| C5. Manual payout | Партнёр + owner view | Реестр прошлого месяца, исключения и ручная отметка отправки 5-го |
| C6. Case share | Владелец Proofwall | Подтверждённый результат становится permissioned case; он поддерживает следующий вручную начатый assisted launch без создания CRM |

**Вариантные метрики:** `assisted_launch_started → attribution_route_verified → partner_invited → terms_accepted → referred_payment_confirmed → first_sale_reconciled → case_share_confirmed`; operator minutes до первого reconciled commission.

**Риски:** высокая ручная нагрузка, selection bias и линейный рост; личное приглашение может не масштабироваться; результат одного партнёра не доказывает повторяемость.

## PD-010. Сравнение для HTML checkpoint

| Развилка | A — incentivized referral | B — badge-led | C — sales-led assisted |
|---|---|---|---|
| Первый актор | Владелец Proofwall | Посетитель public affiliate program page Proofwall | Владелец/оператор Proofwall |
| Growth source | Первое вознаграждение и platform dogfooding N3a | Badge N3a на публичной program page | Assisted launch и permissioned result |
| Повторение | При первом начислении участник осознанно делится offer N3a | Следующий посетитель program page кликает badge N3a | Результат поддерживает следующий assisted launch |
| Первый proof | Первая confirmed commission после value moment | Первый confirmed payment из badge cohort | Первый confirmed payment после assisted launch |
| Human touch | Низкий | Низкий после setup | Высокий и измеряемый |
| Главный вопрос | Вызывает ли proof первого начисления intentional platform share? | Даёт ли badge на program page релевантный intent? | Окупается ли ручное время первым reconciled commission? |
| Общие деньги | Ledger + refund adjustment + ручная выплата 5-го | Те же | Те же |

Владелец выбирает A, B или C после HTML. Рекомендация A означает порядок показа вариантов, а не автоматическое решение.

## PD-011. M5 — Growth Requirements Seed

Правовые и регуляторные аспекты находились вне границ исследования и остаются неизвестными. Документ не устанавливает допустимость; он сохраняет обязательные продуктовые seeds для последующей спецификации.

| ID | Требование (ЧЕРНОВИК) | Блок-источник | Confidence | Неизвестно | Статус |
|---|---|---|---|---|---|
| FR-GROWTH-001 | В момент **первого подтверждённого начисления** показывать явный one-click share собственной referral-программы N3a; считать offer, open и intentional share раздельно и никогда не отправлять автоматически | PD-007 / platform dogfooding | manual 4/5 requirement; growth effect `[H]` | share copy и recipient channel | REQUIRED SEED; не Specification |
| FR-GROWTH-002 | Проводить и cookie-, и promo-code attribution до paid conversion; хранить source/conflict rule, не начислять до confirmed payment и повторобезопасно учитывать payment/refund events | PD-006 / attribution backbone; N1 donor | manual 5/5 механизм, 3/5 N1 contract | attribution window и conflict policy | REQUIRED SEED; не Specification |
| FR-GROWTH-003 | Показывать **badge N3a на бесплатной публичной странице программы** и разрешать снятие на платном плане; считать impression/click и не менять N1 testimonial widgets/Wall | PD-008 / badge loop | manual 4/5 requirement; effect/pricing `[H]` | paid tier и badge copy/placement | REQUIRED SEED; не Specification |
| FR-GROWTH-004 | Выдавать персональные referral/promo codes **партнёрам** и вести cohort каждого кода до confirmed paid conversion; не выдавать partner codes аудитории приглашённых клиентов по умолчанию | PD-006 / partner assets | manual 5/5 механизм, 3/5 audience effect | code collision и lifecycle rules | REQUIRED SEED; не Specification |

## PD-012. Event model и метрики

### Минимальный словарь событий

| Event | Обязательные поля кроме event id/time | Что решает |
|---|---|---|
| `growth_entry_viewed` | `variant`, `surface`, `n1_account_id?`, `program_page_id?` | denominator выбранного entry |
| `growth_entry_opened` | `variant`, `source_id` | intent после exposure |
| `partner_terms_accepted` | `partner_id`, `program_id`, `terms_version`, `variant` | осознанный enrollment |
| `referral_asset_issued` | `partner_id`, `asset_type=link|promo`, `token_id` | time-to-ready |
| `share_confirmed` | `partner_id`, `asset_type`, `channel?` | deliberate amplification; copy ≠ delivery |
| `referral_visit_recorded` | `token_id`, `source_variant`, `visitor_id` | top of attributed funnel |
| `referred_signup_recorded` | `n1_account_id`, `attribution_id`, `source_type` | pending attribution |
| `provider_payment_confirmed` | `provider`, `payment_id`, `n1_account_id`, `amount_minor`, `currency` | canonical money trigger |
| `commission_accrued` | `commission_id`, `payment_id`, `partner_id`, `rate_version`, `delta_minor` | earned amount and formula |
| `first_commission_share_offered` | `program_id`, `partner_id`, `commission_id` | value-moment exposure FR-GROWTH-001 |
| `platform_share_confirmed` | `partner_id`, `commission_id`, `channel?` | deliberate dogfooding share N3a |
| `program_page_badge_clicked` | `program_page_id`, `source_id` | badge loop FR-GROWTH-003 |
| `assisted_route_verified` | `program_id`, `operator_id`, `route_id` | readiness варианта C без CRM |
| `provider_refund_confirmed` | `refund_id`, `payment_id`, `amount_minor` | canonical correction trigger |
| `commission_adjusted` | `commission_id`, `refund_id`, `delta_minor`, `reason` | visible refund effect |
| `payout_register_prepared` | `period`, `timezone`, `register_id`, `exception_count` | monthly close/reconciliation |
| `payout_marked_sent` | `register_id`, `partner_id`, `amount_minor`, `operator_id`, `evidence_ref` | manual action; not receipt by beneficiary |

All monetary values use integer minor units; event replay must not change aggregate twice. This is a required product invariant, not evidence that implementation exists.

### Derived metrics without invented targets

- **Pilot outcome:** одна программа N1 с реальным `provider_payment_confirmed`, связанным с первым `commission_accrued`, и без открытого reconciliation exception; demo/test events исключаются.
- **Paid conversion:** unique referred accounts with confirmed payment / unique referred signups, shown by variant/source cohort.
- **Productive partner rate:** partners with at least one confirmed referred payment / accepted partners.
- **Time to proof:** terms accepted → first confirmed referred payment.
- **Ledger integrity:** duplicate monetary effects, unexplained deltas, payments/refunds awaiting reconciliation.
- **Payout operations:** partners/amount in register, exceptions, operator time, prepared→sent duration; do not infer beneficiary receipt.
- **Loop health:** A повторяется только после intentional share N3a при первом начислении; B — только через badge N3a на public program page; C — только когда permissioned result поддерживает новый assisted launch.

Guardrails: self-referral rejection, no commission on signup/pending/canceled payment, no duplicate delta, tenant/personal scope, terms version present, refund visible, no automatic message or payout.

## PD-013. Confirmed and unknown dependencies

### Confirmed

- `[D]` N1 has `payment.ts` for YooKassa payment creation/status fetch, provider event claim and caller-supplied idempotence key; it is tied to Proofwall tariff/session semantics and is a donor, not a drop-in N3a contract.
- `[D]` N1 has `referral.ts`: promo code precedes cookie, signup attribution is pending, self-referral is rejected, and one payment conversion can create a commission. Its current conversion path is not a recurring engine and uses decimal `Number`; both require redesign before reuse.
- `[D]` N1 checkout defaults to 990 ₽ for 30 days and extends access after a manually initiated payment. It does not expose partner MRR or implement affiliate refund correction; 20% in the HTML is illustrative.
- `[D]` YooKassa documents `payment.succeeded` and `refund.succeeded` notifications, final `succeeded` payment status, full/partial refunds, and idempotence keys for mutating API calls. YooKassa keeps an idempotent result for 24 hours according to its current interaction-format page.
- `[D]` YooKassa documents saved payment methods/autopay, so repeated payments can exist; N3a observes applicable confirmed charges and must not initiate charges as part of affiliate logic.
- `[O]` payout is manual each 5th for the prior month's accruals; no per-payment 30–45-day hold and no automatic payout.

### Unknown before PRD

1. Для N1→N3a обязателен opaque authenticated contract, но event transport, authority, replay и retry semantics ещё не выбраны. Shared database запрещена утверждённым планом.
2. Merchant/program identity and tenant isolation for a future SaaS while only Proofwall is integrated.
3. Commission rate, percentage/fixed choice, recurring duration/max payments and rule changes for existing referrals.
4. Attribution window and winner rule; collision of link, promo, organic signup and manual override.
5. Mapping of N1 products/orders/accounts to canonical YooKassa payments, including retry and repeated subscriptions.
6. Refund after monthly close or after `sent`: negative balance, next-month offset or manual exception.
7. Calendar timezone, exact cutoff, behavior when the 5th is a non-working day, minimum payout and carry-over.
8. Partner eligibility, identity/payout details, required evidence, consent/disclosure copy and retention of personal data.
9. Badge copy/placement/removal policy and possible conflict with the existing Proofwall badge loop.
10. Pilot participants, baseline conversion/retention, pricing, support capacity and operator time.

## PD-014. Evidence register

Official sources fetched 2026-09-09:

1. [Rewardful campaign settings](https://help.rewardful.com/en/articles/14148863-campaign-settings-overview) — campaign, percentage/fixed reward, recurring limits, links/coupons, cookie and portal controls.
2. [Rewardful pricing and current provider boundary](https://www.rewardful.com/pricing) — merchant/affiliate dashboards, public setup claims, current Stripe/Paddle-only statement.
3. [Rewardful first-party cookies](https://help.rewardful.com/en/articles/9094146-does-rewardful-use-third-party-cookies) — documented referral-cookie behavior.
4. [Rewardful promotion-code tracking](https://help.rewardful.com/en/articles/9336630-how-to-use-promotion-codes-for-referral-tracking) — coupon attribution and net-sale commission behavior.
5. [Rewardful manual commissions](https://help.rewardful.com/en/articles/2773351-how-do-i-pay-commissions) — merchant sees amount due and pays by an external method; N3a uses the owner's different fixed day-5 policy.
6. [Rewardful Stripe/refund behavior](https://help.rewardful.com/en/articles/2213091-how-does-rewardful-use-my-stripe-account) — vendor-documented paid-invoice commission and partial/full refund recalculation.
7. [YooKassa incoming notifications](https://yookassa.ru/developers/using-api/webhooks) — payment/refund events and webhook subscription model.
8. [YooKassa payment process](https://yookassa.ru/developers/payment-acceptance/getting-started/payment-process) — payment lifecycle and final `succeeded` status.
9. [YooKassa API interaction/idempotence](https://yookassa.ru/developers/using-api/interaction-format) — `Idempotence-Key` behavior and documented 24-hour window.
10. [YooKassa refunds](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds) — full/partial refund behavior.
11. [YooKassa saved-method recurring payments](https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/pay-with-saved) — recurring charge capability; scheduling remains merchant-side.

Local evidence at baseline:

- `projects/01-testimonials-senja/CLAUDE.md` — N1 product/value moment and `widget_installed` metric.
- `projects/01-testimonials-senja/apps/web/src/lib/payment.ts`, `apps/web/src/app/api/webhooks/payment/route.ts`, `apps/web/src/lib/referral.ts` — provider/referral primitives and their limits.
- `projects/03-affiliate-rewardful/docs/discovery/research/product-research.md`, `market-trends.md`, `proofwall-code-audit.md` — research fetched 2026-09-08, reused only as dated evidence. Its A–D applications, managed payout and agent scope are not inherited.

## Манифест передачи

**Фаза 0 выполнена:** да
**Проверка манифеста:** ВЫПОЛНЕНА

Формат нормализован координатором на этапе PRD 2026-09-09 без изменения PD-ID и исходных выводов. Владелец выбрал A; последующий receipt ниже описывает прежний discovery-checkpoint.

| Выход | Идентификатор | Модуль |
|---|---|---|
| Bounded product/core scope | PD-001 | discovery |
| JTBD and interview segments | PD-002 | discovery |
| N1 pilot learning path | PD-003 | discovery |
| Compact M3 positioning/evidence | PD-004 | discovery |
| Compact M4 money boundary | PD-005 | discovery |
| Shared product backbone | PD-006 | discovery |
| CJM A screen contract | PD-007 | discovery |
| CJM B screen contract | PD-008 | discovery |
| CJM C screen contract | PD-009 | discovery |
| Comparison checkpoint | PD-010 | discovery |
| Required meanings of `FR-GROWTH-001..004` | PD-011 | discovery |
| Event/metric seed | PD-012 | discovery |
| Dependency and unknown register | PD-013 | discovery |
| Dated evidence register | PD-014 | discovery |

## Execution receipt

- Profile: `compact-quality-first-v2`; bounded single-writer research because this work owns one report.
- Requested model/effort from approved plan: `gpt-5.6-sol` / `high`.
- Actual model/effort: `null`; the execution host supplied no attested model metadata to this worker.
- Fallback: `null`; no attested fallback event was supplied.
- Checks: baseline SHA verified; official sources re-fetched 2026-09-09; scope checked against approved plan; report line count and diff hygiene checked separately at completion.
- Usage/cost/available quota: `null`; no worker-scoped host usage or billing/quota counter was exposed. No savings claim is made.
- Next permitted action: build the bounded HTML comparison from PD-006..010, then stop for owner choice. Do not create PRD or implementation from this report alone.

Status: completed
