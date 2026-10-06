# PRD — Когорта

> **Расширение scope от 2026-10-06:** OWN-N7-004 включает unlimited connected
> mailboxes, реальный автоматический прогрев и AI-ответы ≤5 минут. План:
> [expanded-mvp-plan](plans/expanded-mvp-plan.md). Ниже сохранена документация
> принятого локального MVP; его тесты не доказывают готовность расширения.


Версия 1, 2026-10-02, CHOSEN_CJM: A. Source: секция 07 исходного prompt.
Состояние 2026-10-03: локальное ПО реализовано и прошло независимую приёмку;
почтовые/платёжные адаптеры TEST. Статус PR и deployment — в [Completion](Completion.md).

## Problem / target users

Основатель и небольшой B2B sales-оператор хотят управлять несколькими ящиками,
пулом подготовки и последовательностью сообщений, сохраняя явный контроль
над отправкой. Seed cohort курса — стартовая группа, не обещание доставляемости.

## MVP

Регистрация → SMTP/IMAP setup → opt-in cohort → лимиты → контакты/поля →
preview цепочки → отдельный campaign consent → dispatcher → stop-on-reply.
Системные границы: unsubscribe в каждом сообщении, suppression, complaints,
tenant isolation, encrypted credentials, real evidence для reputation.
Free/team entitlement и partner attribution реализованы; локальный TEST
payment adapter не выполняет live charge. FR/SC/AC — в Specification.md.

Вне scope расширения: CRM, domain/mailbox purchase, email existence validation,
искусственные открытия/изъятие из spam, автоматическая публикация от имени
пользователя. AI-ответы включены решением OWN-N7-004; прежнее исключение отменено.

## Метрика недели

30 eligible opt-in ящиков в общем пуле через 7 дней после разрешённого pilot launch.
Источник: SQL count active non-quarantined pool memberships с действующим consent;
connected/invited не засчитываются. Source type: наш код.

Share/invites per user `i`: число явных copy/share events на активного пользователя,
отдельно conversion count и denominator. При n < 30 показывать raw counts,
не процент и не K-factor. CAC, D7/D30 и payback за эту неделю не обещаны.

## Release acceptance

AC-N7-001..012 из [плана](plans/mvp-xl-plan.md). Критичнее количества фич:
0 transport calls без consent; атомарные лимиты; остановка при ответе и suppression;
отсутствие credential leakage. Обязательны build/full tests и browser E2E
на выделенном общем Docker runtime с source-bound receipts.

## Milestones

F01 identity → F02 pool → F03 sequences → F04 stop/complaints → F05 growth/billing
→ F06 independent acceptance. `/next` выбирает следующий незакрытый milestone,
`/go` исполняет риск-зависимый процесс. Deployment остаётся отдельным checkpoint.
