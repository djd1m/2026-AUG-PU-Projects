# Когорта — N7

Локальный MVP почтового пула и персонализированных цепочек: регистрация, ящики,
раздельные согласия, общая квота, остановка после ответа/жалобы/отписки,
ручные наблюдения, публичные отчёты, TEST-тариф и партнёрская атрибуция.

**Последнее сохранённое состояние08.10.2026:** LIVE runtime развёрнут, однако SMTP/IMAP соединения завершались timeout доTLS/AUTH;
успешная отправка/доставка не подтверждена, свежего полного IMAP-опроса нет. [Запись активации](docs/telemetry/exports/20261008-n7-live-transport-activation/README.md).
Ограниченный grant истёк09.10; реальная оплата отключена до настройки merchant keys. Расширенный MVP и AI-ответы≤5мин полностью не приняты.
Ниже сохранены результаты исторического локального MVP. Репутация без наблюдений unknown.
[Сводка main от13.10](../../docs/PROJECTS-STATUS.md).

[English](README.en.md) · [Руководство](README/ru/README.md) · [Quickstart](README/ru/01_quickstart.md)

## Проверенное состояние

F01–F05 и продуктовые проверки F06 приняты независимым ревью. Проверены настоящий
PostgreSQL, кабинет в общем Docker Playwright (Chromium 1440/390, Firefox/WebKit 390),
tenant isolation, остановка гонок, idempotency и отписка. Финальная правка отчёта:
218 браузерных проверок, без горизонтального overflow страницы на 390px.
39 unit и ранее принятые 115 PostgreSQL-сценариев; неизменные наборы после CSS не повторялись.

Точный статус PR, исходники, образы и ограничения: [Completion](docs/Completion.md).
Это локальная программная приёмка, а не результаты настоящей почтовой кампании.

## Документы

- [Как проходит работа: pipeline walkthrough](docs/pipeline-walkthrough.md)
- [Исследование почтовых сервисов и облачных провайдеров: контекст, ограничения SMTP/IMAP и варианты для N7](docs/research/external-mail-infrastructure-20261008/README.md)
- [12 критериев и доказательства](docs/acceptance-traceability.md)
- [PRD](docs/PRD.md), [Specification](docs/Specification.md), [Architecture](docs/Architecture.md), [ADR](docs/ADR.md)
- [Разрешения владельца](docs/decisions-owner.md), [план deployment](docs/deployment-checkpoint.md)
- [Внутреннее повторное использование](docs/reuse-inventory.md), [toolkit](docs/toolkit-validation.md)
- CJM: [A — Cohort Desk, выбран](docs/cjm/cohort-desk.html), [B — Operator Review](docs/cjm/operator-review.html), [C — Partner Studio](docs/cjm/partner-studio.html)

Исходники и телеметрия принадлежат этому проекту. Общий toolkit наследуется из
монорепозитория; отдельная копия одной папки N7 не является полной установкой toolkit.
