# CJM Variants — N7 «Когорта»

CHOSEN_CJM: **A — Cohort Desk**, выбор по явному разрешению владельца выбирать
оптимальный вариант самостоятельно. Все HTML — автономные интерактивные прототипы,
демо-состояния не являются production evidence. Источники микро-трендов:
[Linear 2026](https://linear.app/changelog/2026-03-12-ui-refresh),
[W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Variant A — Cohort Desk

| Поле | Решение |
|---|---|
| Aha Moment | Пользователь видит датированное улучшение сопоставимой reputation observation; до этого честное unknown |
| Entry Hook | Основатель/оператор с новыми ящиками хочет безопасно подготовить переписку |
| Onboarding → Core Loop → Paywall | Подключение → отдельный consent → seed cohort → health/limits → preview цепочки → отдельный запуск → stop-on-reply → тариф |
| Growth loop | NETWORK EFFECT: больше пригодных opt-in участников расширяет общий пул; эффект подлежит проверке |
| FR-GROWTH-001 | Share только после evidence-backed improvement и отдельного действия, без автоматической публикации |
| FR-GROWTH-002 | Подписанная attribution cookie до платной конверсии + явный code fallback |
| FR-GROWTH-003 | Badge на бесплатном shared report, paid entitlement снимает badge; не скрывать unsubscribe |
| FR-GROWTH-004 | Уникальный персональный partner code, события конверсии без self-referral |
| Микро-тренды | Контекстная плотность, раскрытие advanced controls, объяснимые empty/blocked states |
| Главный риск | Пустой или низкокачественный пул; seed минимум — operational target, не доказанная critical mass |

**Выбран:** единственный вариант сохраняет заданный primary loop и превращает
seed strategy в первый продуктовый экран. Нельзя заменить этот loop рефералкой.

## Variant B — Partner Studio

| Поле | Решение |
|---|---|
| Aha Moment | Партнёр видит первую подтверждённую eligible конверсию по своему коду |
| Entry Hook | Автор курса/консультант хочет приводить клиентов и видеть атрибуцию |
| Onboarding → Core Loop → Paywall | Partner profile → code → обзор приглашённых → shared evidence → sandbox checkout |
| Growth loop | INCENTIVIZED REFERRAL |
| FR-GROWTH-001..004 | Evidence share; cookie+code; free report badge; личные partner codes, pending rewards без выплат |
| Микро-тренды | Контекстная аналитика, компактные событийные ленты, объяснимые pending статусы |
| Главный риск | Приглашения не создают полезный pool автоматически, мошенничество атрибуции |

**Не выбран. Причина отказа:** заменяет обязательный network effect другим primary
loop. Partner attribution остаётся обязательной поддерживающей механикой A, без
второй самостоятельной кампании роста и без новых reward обещаний.

## Variant C — Operator Review

| Поле | Решение |
|---|---|
| Aha Moment | Оператор закрывает readiness review и видит безопасно остановленную цепочку после ответа |
| Entry Hook | Агентство хочет управлять несколькими клиентами с прозрачными ограничениями |
| Onboarding → Core Loop → Paywall | Intake → readiness review → mailbox checklist → sequence approval → monitoring → assisted upgrade |
| Growth loop | SALES LOOP |
| FR-GROWTH-001..004 | Evidence report после результата; attribution до checkout; free badge; code консультанта |
| Микро-тренды | Одно действие на экран, видимая очередь решений, progressive disclosure и keyboard-first управление |
| Главный риск | Ручные продажи линейны и дороги; это не доказанный viral loop |

**Не выбран. Причина отказа:** улучшает контроль агентства, но не решает cold start
общего пула. Из C сохранена простота safety review, без agency/CRM расширения scope.

| Критерий | A | B | C |
|---|---|---|---|
| Соответствует обязательному primary loop | Да | Нет | Нет |
| Seed встроен с первого дня | Да | Косвенно | Ручной onboarding |
| Без новых платёжных reward обещаний | Да | Риск | Да |
| Scope недели | Минимальный | Дополнительная incentive экономика | Дополнительный assisted sales процесс |

Уровень оценки — архитектурное решение, не результаты A/B-теста.
