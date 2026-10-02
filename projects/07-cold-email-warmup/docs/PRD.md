# PRD — Когорта

Версия 1, 2026-10-02, CHOSEN_CJM: A. Source: секция 07 исходного prompt.
Состояние: XL-план v1 утверждён, продукт ещё не реализован.

## Problem / target users

Основатель и небольшой B2B sales-оператор хотят управлять несколькими ящиками,
пулом подготовки и последовательностью сообщений, сохраняя явный контроль
над отправкой. Seed cohort курса — стартовая группа, не обещание доставляемости.

## MVP

Регистрация → SMTP/IMAP setup → opt-in cohort → лимиты → контакты/поля →
preview цепочки → отдельный campaign consent → dispatcher → stop-on-reply.
Системные границы: unsubscribe в каждом сообщении, suppression, complaints,
tenant isolation, encrypted credentials, real evidence для reputation.
Free/team entitlement и partner attribution проектируются сразу; sandbox
payment integration не даёт live charge. FR/SC/AC — в Specification.md.

Вне scope: AI-ответы, CRM, domain/mailbox purchase, email existence validation,
искусственные открытия/изъятие из spam, автоматическая публикация от имени
пользователя. README-строка про AI replies отклонена в пользу explicit prompt.

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
