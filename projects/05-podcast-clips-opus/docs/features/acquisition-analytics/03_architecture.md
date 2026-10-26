# Acquisition analytics: архитектура и границы

Источник: [пакет планировщика](analytics-plan.md), baseline4d5b0e26.

Server runtime config → numeric public counter prop → client consent host → small
typed analytics adapter → official Metrika SDK. Default disabled. No new npm
dependencies, backend API, DB migration, queue service or payment-provider call.

События наблюдаются в существующих AuthForm, VideoDetail и ReturnScreen.
Изменяется только уведомление аналитики; существующие auth/payment результаты,
редиректы, загрузки, права и деньги остаются прежними. Signup200 отдельно не
доказывает регистрацию; successful code.apply подтверждает действующую сессию.

## Контур данных

Внешний payload: версия схемы, closed goal, pilot, статический route category,
закрытая UTM tuple. Не включать email/account/video/clip/intent IDs, filename,
title, transcript, prompt, referrer/query/hash или подписанные ссылки. Локальные
платёжные dedupe IDs не покидают браузер. Лимиты/TTL —deployment-context.

Согласие guest publication не используется как согласие на аналитику. Host
показывает компактный доступный выбор аналитики только при настроенном ID,
позволяет отказ/отзыв. SDK destruct при отзыве и переходе на исключённый путь.
SDK иногда может собирать поля вне явного payload: проверять реальные запросы,
а не только типы TypeScript. Сбой аналитики не должен ломать N5.

## Владение файлами

Allowlist —analytics-plan. Кодер меняет source/tests в отдельном worktree.
Integration owner один меняет compose, конфигурационные манифесты и документы
переноса. Lockfile/версии не менять. Передача через коммит и terminal receipt.
Ревьюер получает planner packet и snapshot, без coder chat.

## Запуск

Текущий VPS —разработка и изолированные проверки. Cloud.ru РФ —целевой runtime.
Счётчик создаётся владельцем на запуске; ID передаётся через runtime setting.
Не включать аналитику текущего production VPS и не запускать рекламный трафик.
Browser goals не заменяют финансовый ledger и не доказывают полноту всех оплат.
