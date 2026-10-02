# RoomKind — Executive Summary

Фото собственной комнаты превращается в стилевую гипотезу, которую можно сравнить с исходником. Конструкция помещения — обязательный критерий качества. Выбран CJM A и content-driven growth; альтернативные badge/referral варианты сохранены. Scope ограничен фото, стилем, редизайном, галереей, оплатой пакета и явным sharing.

Технически: Node web/API, postgres queue/credit ledger, private volume, отдельный Python SD+ControlNet-depth GPU-worker в Compose. Бюджет новых внешних затрат0, runtime GPU не подтверждён. До фактических generation checks результат нельзя объявлять полноценным MVP.

## Success Metrics

| Metric | Target | Timeline | Источник значения |
|---|---|---|---|
| Unique share-completed | 12 | неделя beta после GPU acceptance | наша БД |
| Shared-result rate | 20% только n≥30 | неделя beta | наша БД |
| GPU warm inference p95 | ≤25s при n≥30 | quality acceptance | наш журнал |
| Opening topology errors | 0 на12×3 corpus | quality acceptance | ручное измерение: разметка окон/дверей и сравнение anchors |
| Duplicate payment credit | 0 на replay/concurrent fixture | before release | наша БД |

## Risks and next actions
GPU unavailable: finish reversible code and local evidence, then obtain separately authorized environment. Geometry defects: never accept by file presence. Financial race: provider verify + transaction + concurrency tests. No calibrated delivery forecast; dates are work boundaries, not guaranteed production launch.

## Documentation Package
PRD.md — scope; Solution_Strategy.md — tradeoffs; Specification.md — FR; Pseudocode.md — entities/algorithms; Architecture.md — boundaries; Refinement.md — tests; Completion.md — rollout; Research_Findings.md — opened sources; ADR.md and C4_Diagrams.md — decisions/diagrams; project CLAUDE.md — implementation context. Additional docs preserve CJM alternatives, owner decisions, reuse, walkthrough and telemetry.
