# Product discovery brief

Mode QUICK, 2026-10-02. Это минимальный проверяемый scope недели из секции 07,
а не полный аналог Instantly. Research: [источники](Research_Findings.md).

## M2 — Product & Customers

JTBD основателя: «Когда я подключаю новые рабочие ящики, хочу явно контролировать,
кто и сколько отправляет от моего имени, чтобы начать полезную переписку без
потери контроля». Оператор небольшой команды дополнительно хочет видеть ответ
до следующего шага цепочки. Когорта курса даёт потенциальный seed; наличие
30 реально согласившихся ящиков пока не подтверждено. Интервью не проводились;
JTBD — гипотеза по постановке, а не цитаты клиентов.

## M3 — Market & Competition

Instantly — primary reference, Smartlead — названный альтернативный конкурент.
Подтверждено только описание pool warmup в Instantly Help Center. Аккаунты
конкурентов не созданы, интерфейс пока не снят. TAM/SAM/traffic/CAC неизвестны.
Отличие N7 для курса: прозрачный cohort onboarding, отдельные согласия,
unknown вместо выдуманного reputation score. Это продуктовая гипотеза.

## M4 — Business & Finance

Тарифная гипотеза: free — до 2 ящиков и badge в отчёте; team — до 10 ящиков,
badge removal. Денежные суммы до решения владельца отсутствуют; checkout
проверяется sandbox fixture, не выдаётся за доступную live покупку.
Метрики затрат: measured worker time, messages attempted, infrastructure cost
при доступном счётчике. LTV/CAC/payback не оцениваются на ненаблюдаемой базе.

## M5 — Growth Engine

Мотион: self-serve внутри seed когорты; primary loop: NETWORK EFFECT. Новые
пригодные opt-in ящики расширяют доступные пары и разнообразие пула. Это
архитектурный mechanism, эффект на доставляемость — проверяемая гипотеза.
На старте приглашает организатор курса вручную, через личную ссылку; продукт
не отправляет приглашение автоматически. Есть waiting state, отдельный consent
и отзыв. Weekly target: 30 eligible pooled mailboxes за 7 дней после pilot launch.

Confidence блока A: manual 2/5 для полезности network effect; 5/5 для наличия
явного требования владельца. Партнёрские коды — поддерживающая атрибуция, не
второй обещанный growth loop. Вознаграждения и выплаты в MVP не обещаны.

Допустимость: нет купленных баз/скрытых invitations/поддельных отзывов. Отдельное
согласие отправителя не подменяет согласие получателя. Campaign recipients
нуждаются в доказуемом основании контакта и opt-out; pilot ограничен consented
cohort. Jurisdiction-specific legal review не выполнено и не объявляется пройденным.
Снятие provider restrictions требуется до live activation, а не для локальных тестов.

## Growth Requirements Seed

| ID | Требование (ЧЕРНОВИК) | Блок-источник | Confidence из блока | Допустимость | Статус |
|---|---|---|---|---|---|
| FR-GROWTH-001 | Share по отдельному действию после подтверждённого улучшения reputation observation | A. Primary Growth Loop | manual 5/5 для требования владельца | Только анонимизированный отчёт без автопубликации | ЧЕРНОВИК |
| FR-GROWTH-002 | Attribution cookie и независимый code fallback до paid conversion | B. Partner channel | manual 5/5 для требования владельца | Без выплаты и self-referral | ЧЕРНОВИК |
| FR-GROWTH-003 | Attribution badge на бесплатном shared report, removal по paid entitlement | A. Primary Growth Loop | manual 5/5 для требования владельца | Не скрывает unsubscribe/источник метрик | ЧЕРНОВИК |
| FR-GROWTH-004 | Персональные partner codes и deduplicated conversion events | B. Partner channel | manual 5/5 для требования владельца | Код не раскрывает PII; fraud guard | ЧЕРНОВИК |

Четыре обязательства приняты исходной постановкой, а не выведены из неподтверждённой
эффективности прогрева. Альтернативы CJM и выбор сохранены в [CJM_Variants](CJM_Variants.md).
