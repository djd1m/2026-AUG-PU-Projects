# Requirements Testability Analysis — a-merchant
Spec revision: sha256:d9bce34cfcdb8f3321573a1570e4c13cf1fde520fee5c26d8112e2112268ed34

Verdict: CAVEATS; no blocking criterion. Independent Astra high review requested; actual model/usage unexposed. Base story mean 92.25/100 (rubric vectors, AC quotes and scenario table in [receipt](../../telemetry/p-replicator/20260908T204432Z-go-shared-core/evidence/f1-requirements-validation.md)). Lowest story80/100.

Scope: all business AC on F1 fixtures and real UI. MCP/A2A wire, production SSO and payment integration deferred explicitly. No real model productivity claim. Preserve always-branded pilot, promo/link cohorts, B foreign-origin embed, all4 desktop/mobile and denied/error states. Tests must demonstrate invariant enforcement, not names alone.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-a-merchant-1011 | SC-US-101-1 — Given есть права владельца и fixture project; When сохраняет валидные ставку/окно/тип вознаграждения; Then создана версия политики, видимая в preview; будущие начисления ссылаются на неё. |
| AC-a-merchant-1012 | SC-US-101-2 — Given ставка отсутствует или значение вне разрешённого диапазона; When пытается опубликовать; Then публикация запрещена с исправляемой ошибкой; скрытого default нет. |
| AC-a-merchant-1021 | SC-US-102-1 — Given есть confirmed fixture payment и атрибуция; When запускает пример начисления; Then видит событие/правило/сумму/hold; общий SC-US-002 применяется. |
| AC-a-merchant-1022 | SC-US-102-2 — Given после оплаты зарегистрирован возврат; When повторно получает старое событие оплаты; Then коррекция остаётся; комиссия не восстанавливается из-за delivery replay. |
| AC-a-merchant-1031 | SC-US-103-1 — Given есть eligible cash entries за месяц; When готовит/проверяет/утверждает реестр; Then выгружает именно эту версию и видит исключённые строки. |
| AC-a-merchant-1032 | SC-US-103-2 — Given уже выгрузил CSV; When ещё не делал перевод; Then интерфейс не показывает отправку; отдельная отметка хранит оператора и дату. |
| AC-a-merchant-1041 | SC-US-104-1 — Given создана программа; When копирует приглашение; Then получает enrollment link, а не customer referral link; отображается действующая ставка. |
| AC-a-merchant-1042 | SC-US-104-2 — Given агент подготовил исправленную версию реестра; When открывает её в A; Then тот же id/version/hash/суммы доступны по правам владельца; не подставляется старый demo dataset. |
