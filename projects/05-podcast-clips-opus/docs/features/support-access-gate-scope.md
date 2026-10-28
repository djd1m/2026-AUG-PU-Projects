# N5 support-access: предлагаемая область штатных gates

Дата: 28.10.2026. Статус: **владелец явно разрешил указанную область28.10.2026**.
RUN_ID: `20261028-n5-support-implementation`.

Владелец разрешил реализацию [конкретного плана поддержки](../research/support-oss-20261027/README.md):
N1/N3 email/reset, небольшой read-only раздел оператора N6b/N4, bridge Libredesk.
Это не разрешение менять деньги, production или исторические результаты проверок.

## Почему нужна отдельная граница

[Штатная команда /feature](../../../../.claude/commands/feature.md) требует:
“Exit `0` is the only advancing result”. Общая проверка N5 возвращает `1` из-за
11 дублирующихся machine IDs корневого Pseudocode и 30 старых каталогов фич без
новых machine-key/Algorithm заголовков. Одни переименования/aliases это не исправляют.

Официальная последняя версия p-replicator 1.13.5 проверена независимым аудитором:
её checker совпадает с установленным 1.13.4, SHA256
`06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8`.
Поддерживаемого feature filter нет. [Аудит и фактические ограничения](../telemetry/p-replicator/20261028-n5-support-implementation/evidence/gate-audit-report.md).

Прежнее [разрешённое исключение](credits-cloudru-plan-gate.md) явно перечисляет
только credit-packages и cloudru-provider-foundation. Оно не объявляется разрешением
для новой support-access.

## Конкретное предлагаемое действие

Для этого прогона применить **неизменённый официальный checker** к source-bound
снимку только `docs/features/support-access/` с настоящими нужными файлами тестов.
До и после запуска фиксировать SHA256 каждого входа; Spec revision, BDD scenarios,
bidirectional traceability и criterion coverage должны пройти своими exit0.
Общий исторический exit1 сохраняется отдельной неуспешной квитанцией.

Остальные требования сохраняются: независимая валидация плана и cold review,
одноразовость/expiry/revocation и конкурентные тесты, отрицательные проверки прав,
мутации guards, полный regression/typecheck/lint/build и Chromium/WebKit E2E
в существующем `codex-ui-playwright`. Нет автоматического допуска неполного результата.

Реальные почтовая доставка, Libredesk pilot и запуск в Cloud.ru требуют готовых
целевых настроек и отдельных квитанций. Эта область gates их не доказывает.

Решение владельца28.10.2026: «Да, разрешаю указанную область проверки».
Квитанция: `docs/telemetry/p-replicator/20261028-n5-support-implementation/evidence/owner-scope-approval.json`.
Переход к коду остаётся зависимым от успешных gates и независимой валидации плана.
