# N5: область проверки PLAN — исключение разрешено

Дата26.10.2026. Это предложение исключения по области входных документов,
а не успешная квитанция и не разрешение менять деньги/окружение.

## Установленные факты

- Installed p-replicator1.13.4 verify exit0 после восстановления одного
  отсутствующего штатного hook из этого же пакета, byte-identical.
- Текущий packaged checker выполнен на настоящем проекте с официальными
  role-map-source flags для общего toolkit репозитория.
- credit-packages: bidirectional PASS,21требование/алгоритм;15сценариев.
- cloudru-provider-foundation: bidirectional PASS,14требований;6сценариев.
- Общий результат: exit1, features33/gaps11/inconclusive30. Причины —
  прежние root claims и30исторических фич с иными именами документов.
- Registry latest1.13.5 проверен отдельно; у checker также нет feature filter.
- Независимый process audit подтвердил: role-map меняет имена файлов, но не
  область обхода. Sparse export может доказать только выбранные контуры.

[Полная диагностика](../telemetry/p-replicator/20261026-n5-credits-cloudru/evidence/phase1-traceability-aggregate.log)
и [независимый аудит](../telemetry/p-replicator/20261026-n5-credits-cloudru/evidence/n5-workflow-gate-resolution-20261026.md).

## Почему требуется явное исключение

[Штатный /feature](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/n5-credits-cloudru-20261026/.claude/commands/feature.md#L108)
требует: “Exit `0` is the only advancing result” и запрещает превращать
ненулевой результат в warning. Поэтому Phase2/код не объявляются начавшимися.
Переход на feature-adr также не означает автоматической отмены этого gate.

## Конкретное предлагаемое исключение

Разрешить для ЭТОГО прогона применить неизменённый официальный checker к
неизменяемому source-bound снимку только двух новых контуров:
credit-packages и cloudru-provider-foundation. Снимок копирует реальные файлы,
фиксирует SHA256 каждого, проверяет hash до/после и получает отдельный exitcode.
Исходный общий exit1 сохраняется как неуспешный baseline, не переименовывается
в PASS. Исторические документы/замороженная спецификация не переписываются.

Все проверки новых требований, обратная трассировка, criterion scenarios,
criterion coverage, независимое review, money/concurrency/mutation tests,
полные regression/typecheck/lint/build и Docker UI E2E сохраняются.
Денежные правила утверждаются отдельно; scope exception их не утверждает.
Whisper UNCONFIRMED и реальные Cloud.ru/Метрика требуют своих квитанций.

Статус: **владелец явно разрешил исключение26.10.2026 и автономную работу**.
Неизменённый checker выполнен на source-bound снимках: CloudfoundationPhase1/2
и creditPhase1 проходят. Общий исторический exit1 сохранён.
Кодирование начинается только после независимого VALIDATE своего контракта.
