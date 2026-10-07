# Research Findings — Грелка (N7)

Дата: 2026-10-07. Методология: Phase 0 (QUICK, M1–M5) + 4 целевых веб-поиска этой сессии + снятие
цитат провайдеров платежей (см. Architecture External Dependencies). Полный лог — в discovery-брифе.

## Research Findings

### Executive Summary

Ниша cold email-инфраструктуры монетизирована не подпиской, а сетью прогрева (у Instantly premium-
пул $500–1000/мес); одновременно правила Gmail/Yahoo/Microsoft (2024–2025) и закрытие GMass (2023)
сделали «магический» прогрев слабым — рабочий раствор = авторизация + комплаенс + сеть. Ниша
русского инструмента для международного аутрича пуста, donors (ЮKassa-платёж, auth, реферальная
атрибуция, очередь) есть в проектах 01/03a/06.

### Research Objective

Проверить механику монетизации и климата Anti-Spam, отобрать донорные модули курса, оценить
экономику.week-реалистичного MVP.

### Methodology

GOAP-стиль: цель → пробелы (архитектура источников, регуляторика, доноры) → план из 4 поисков →
снятие датированных цитат; OODA-корректировка при противоречивых числах («4,2M» источника).

### Market Analysis

Конкуренты: Instantly $37–358 flat unlimited; Smartlead $39–379 + white-label $29/клиент; per-seat
Lemlist/Woodpecker/Reply.io; RU-ESP — вне ниши. Benchmark: reply 3,43 % среднее, 58 % ответов —
на первое письмо (S, benchmark Instantly). Метрики TAM/SAM НЕ НАЙДЕНы честно (см. brief M3).

### Technology Assessment

SMTP/IMAP — рабочий при живой probe; Workspace-ограничения basic auth — риск R-002 (fair текст);
OAuth Gmail — дорогая верификация, вне MVP. Очередь BullMQ с фенсом — донор N6. Event-Driven
обработка входящих — по заголовкам (RFC 8058 уведомления), без хранения тел.

### User Insights

Сырых цитат не собрано (честная оговорка brief [a_voice]); паттерны из обзоров: ценят flat-fee
и unlimited, ненавидят скрытые аддоны/Fair Use-сюрпризы; warmup-скор у части лиц недоверие.

### Competitive Landscape

| Competitor | Strengths | Weaknesses | Differentiation |
|---|---|---|---|
| Instantly | flat-fee, unlimited+warmup, бренд | аддоны, «магия», RU нет | комплаенс by design, RU UI, публичный пул |
| Smartlead | агентства, white-label | Fair Use-потолки поздние | честные потолки, RU |
| Lemlist/Woodpecker/Reply | UX/enterprise | per-seat | flat-price |
| RU-ESP (SendPulse/Unisender) | платежи RU | вне cold email | вход через нишу RU→мир |

### Confidence Assessment

| Блок | Level | Основание |
|---|---|---|
| Тарифы/механика источников | High | первоисточники (pricing/help/блог) + 3 независимых обзора |
| Требования Gmail/Ya/Microsoft | High | support.google.com (2 датированные страницы), даты эскалаций |
| Регуляторика РФ | High-Medium | ст. 18 38-ФЗ + приказ ФАС №410/24; сборки вторичны |
| Экономика N7 | Medium | формулы от доноров; тариф — гипотеза |
| Паттерны пользователей | Low-Medium | без сырых цитат — оговорка [a_voice] |

### Sources (проверено 2026-10-07)

1. https://instantly.ai/pricing — тарифы [первоисточник, 9/10]
2. https://smartlead.ai/pricing — тарифы [первоисточник, 9/10]
3. https://instantly.ai/blog/unlimited-outreach-pricing/ — механика flat/unlimited [первоисточник-блог, 8/10]
4. https://gtm-tech-stack.com/blog/smartlead-pricing — Fair Use потолки (2026-02-01) [вторичный, 7/10]
5. https://help.instantly.ai/en/articles/10189418-premium-private-warmup-pool — Premium/Private Pools [первоисточник, 9/10]
6. https://helpcenter.smartlead.ai/en/articles/429-pre-warmed-mailboxes-by-smartlead [первоисточник, 9/10]
7. https://support.google.com/mail/answer/81126 — sender guidelines [первоисточник, 10/10]
8. https://support.google.com/mail/answer/14229414 — FAQ, эскалация 11.2025 [первоисточник, 10/10]
9. https://mailtester.com/blog/why-google-restricted-warm-up-networks-2024 — GMass/Apollo кейс [вторичный, 7/10]
10. https://scrap.io/email-warmup-tools — reply-бенчмарки 3,43 %/58 % [вторичный со ссылкой на Instantly benchmark, 7/10]
11. ст. 18 38-ФЗ «О рекламе»; приказ ФАС от 20.06.2024 №410/24; ч. 1 ст. 14.3 КоАП — норма [первоисточник права, документ]
12. https://yookassa.ru/developers/api, https://docs.stripe.com/billing/subscriptions — цитаты в Architecture [первоисточник, 10/10]

### Research Path Log

1) тарифы Instantly/Smartlead → 2) правила принимающих систем → 3) кейсы GMass/Apollo и дебата
→ 4) ст. 18/ФАС → сбор противоречий (пул противоречив [?]) → сдвиг к «честному health» → снятие
цитат ЮKassa/Stripe при конфокусе External Dependencies.
