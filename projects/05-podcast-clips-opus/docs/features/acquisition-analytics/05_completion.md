# Acquisition analytics: приёмка и запуск

Источник кода: `0394ff99`, ветка `feature/n5-acquisition-analytics-20261026`.
Подготовка кода на текущем VPS; настоящее включение и поступление целей —
при запуске на Cloud.ru РФ по уточнению владельца. Текущий production не изменён.

| Ворота | Результат | Доказательство |
|---|---|---|
| Исследование аналога и Similarweb | Готово с явными пробелами; главный канал неизвестен | [Исследование](../../research/acquisition-20261026/README.md) |
| Экономика пилота | Гипотеза CAC575 ₽ / Старт990 ₽; LTV неизвестен | [Расчёт](../../research/acquisition-20261026/economics.md) |
| Связка1-1-1-1 | Один Telegram-пилот; размещения и расходы не выполнялись | [План](deployment-context.md) |
| PLAN / VALIDATE | План принят для ограниченной реализации | [Validation](validation-report.md) |
| Независимое review | R1/R2, init URL, документация и sandbox base закрыты | [Review](implementation-review-fixes.md), [privacy](privacy-and-integration-review.md), [sandbox closure](sandbox-review-closure.md) |
| Build / lint / typecheck | PASS: production build, lint, полный typecheck | [Квитанции](../../telemetry/p-replicator/20261026-n5-acquisition-analytics/evidence/checks.json) |
| Полная регрессия финального источника | PASS:1067/1067,115файлов,456.465с | [Tests](../../telemetry/p-replicator/20261026-n5-acquisition-analytics/evidence/checks.json) |
| Browser SDK / consent / funnel | PASS:40запросов; четыре цели и отрицательные случаи; безID/invalid запросов0 | [SDK browser](../../telemetry/p-replicator/20261026-n5-acquisition-analytics/evidence/browser/result-on.json) |
| Штатная responsive матрица | PASS:206экранов,2темы/движка;0ошибок,646предупреждений | [Responsive](../../telemetry/p-replicator/20261026-n5-acquisition-analytics/evidence/responsive/attempt2-receipt.md) |
| Реальные цели в owner dashboard | **Planned Cloud.ru, не PASS** | [Инструкция запуска](cloudru-launch.md) |

## Что реализовано

Optional runtime public ID только для web; без ID аналитика выключена.
Согласие отделено от guest publication. Четыре наблюдаемых события:
`n5_visit`, `n5_signup_success`, `n5_first_clip_ready`, `n5_payment_confirmed`.
Login, dummy register200, pending и wrong intent не являются конверсиями.

SDK работает в пустом opaque sandbox, не имеет доступа к формам/DOM родителя;
init/hit и base используют статические URL. Bridge проверяет source/token,
поколение и закрытый payload. Отзыв согласия удаляет frame и локальное состояние;
исключённые страницы останавливают отправку, сохраняя ограниченный dedupe.

## Реальные границы доказательств

Браузер проверяет сериализацию настоящего cached SDK на синтетических данных.
Interception, HTTP200 и wrapper calls не доказывают приём целей сервисом.
Первый responsive проход завершился exit2: пересборка пересеклась с концом
матрицы, а fixture с одним клипом выявил7R9 ниже первого экрана. Этот edge
сохранён как незакрытая находка существующего экрана записи; повтор использует
основной сценарий с3готовыми клипами и не заменяет исходный неуспешный результат.

До трафика отдельно реализовать целевые30кредитов при регистрации,
Старт300/990, Про1800/3990, доп600/1490 (всегда рядом часы), а также Cloud.ru FM
и измерить фактическую себестоимость. Наблюдательная аналитика не мигрирует
тарифы, auth, биллинг, БД или обработчики. Настоящий счётчик и реальные цели
проверить по Cloud.ru инструкции, затем сверить оплаты/возвраты с ledger.

646 предупреждений штатного прибора:340color-contrast,170video-caption,
34page-has-heading-one,102landmark-unique. Они не подавлены и не названы
исправленными; нулевой exit следует текущей классификации прибора, а не
сертификату полной доступности. Media playback/реальные скачивания в этом
синтетическом прогоне не проверялись.

Профиль model-routing-econom: requested gpt-6.1-sol high для исследования,
планирования и независимого review; medium для кода. Reviewer получает план
и исходники, без coder chat/receipts. Actual model metadata, tokens/cost недоступны
и записаны null. Паспорт и журнал: docs/telemetry/p-replicator/
20261026-n5-acquisition-analytics/.
