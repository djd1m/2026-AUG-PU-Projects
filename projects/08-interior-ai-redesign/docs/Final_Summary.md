# RoomKind — Executive Summary

Фото собственной комнаты превращается в стилевую гипотезу, которую можно сравнить с исходником. Конструкция помещения — обязательный критерий качества. Выбран CJM A и content-driven growth; альтернативные badge/referral варианты сохранены. Scope ограничен фото, стилем, редизайном, галереей, оплатой пакета и явным sharing.

Технически: Node22 web/API, PostgreSQL16 queue/credit ledger, private volume, отдельный Python SD+ControlNet-depth worker. Существующий compose.yaml содержит db/web/maintenance с disabled provider/inference; GPU-worker запускается отдельным явно настроенным процессом, его сервиса в этом Compose нет. Бюджет новых внешних затрат0, runtime GPU не подтверждён. До фактических generation checks результат нельзя объявлять полноценным MVP.

## Success Metrics

| Metric | Target | Timeline | Источник значения |
|---|---|---|---|
| Unique share-completed | 12 | неделя beta после GPU acceptance | наша БД |
| Shared-result rate | 20% только n≥30 | неделя beta | наша БД |
| GPU warm inference p95 | ≤25s при n≥30 | quality acceptance | наш журнал |
| Opening topology errors | 0 на12×3 corpus | quality acceptance | ручное измерение: разметка окон/дверей и сравнение anchors |
| Duplicate payment credit | 0 на replay/concurrent fixture | before release | наша БД |

## Фактическая готовность

Документируемый source `8030270f023d83c9cdd597c4578517a1b58b4b35`, run `n8-20261002-1740`. F01–F03 software и F04a backend приняты с immutable receipts. UI F04b реализован; четыре исходные находки и последующие узкие payment/upload/delete-order/logout-control исправления прошли независимое ревью. UI6 фактически прошёл42/42 основных проверок на1440/390 и2/2 проверки отдельно перезапущенного disabled-provider сервера; неудачи1–5 сохранены. Синтетические изображения не доказывают реальную геометрию. См. [F04 acceptance](features/f04b/acceptance.md).

ROOM20 серверный20кредитов/900₽, verified provider fixture и реальный PG проверяют программные финансовые границы. Реальная приёмка YooKassa/списания не заявлены. Consent/manual attribution, приватная галерея/композит, отдельный public opt-in/revoke и серверный AI label/badge реализованы. Реальная публикация требует независимого принятого GPU corpus и связанных неизменных output/evidence hashes.

Независимый F06a включает [двуязычные README](README/ru.md), [41AC map](features/f06a/acceptance-map.md) и [inert operations/restore](features/f06a/operations.md). [Фактическое восстановление](telemetry/n8-20261002-1740/n8-f06-restore-1-receipt.md):21таблица/451строка и10синтетических файлов совпали, исходная БД неизменна; временный стенд удалён. F05 real CUDA/safe pinned weights, security/compatibility,12×3geometry и≥30warm p95≤25s blocked. F04 local software принят; F05/полнаяF06/MVP не done. Draft PR возможен в `claude/install-npm-packages-n7l3m5` с явно незакрытыми gates; main/merge/deploy не разрешены.

## Risks and next actions
GPU unavailable: finish reversible code and local evidence, then obtain separately authorized environment. Geometry defects: never accept by file presence. Financial race: provider verify + transaction + concurrency tests. No calibrated delivery forecast; dates are work boundaries, not guaranteed production launch.

## Documentation Package
PRD.md — scope; Solution_Strategy.md — tradeoffs; Specification.md — FR; Pseudocode.md — entities/algorithms; Architecture.md — boundaries; Refinement.md — tests; Completion.md — rollout; Research_Findings.md — opened sources; ADR.md and C4_Diagrams.md — decisions/diagrams; project CLAUDE.md — implementation context. Additional docs preserve CJM alternatives, owner decisions, reuse, walkthrough and telemetry.
