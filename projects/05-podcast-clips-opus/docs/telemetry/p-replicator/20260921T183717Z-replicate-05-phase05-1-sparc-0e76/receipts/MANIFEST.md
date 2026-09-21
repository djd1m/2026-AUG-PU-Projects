# Манифест квитанций прогона 20260921T183717Z-replicate-05-phase05-1-sparc-0e76

Требование `swarm-file-evidence.md`: у каждой единицы пишущего фан-аута — свой `WORK_UNIT_ID`,
абсолютный `TRACE_PATH` и терминальная строка `Status:`. Координатор интегрирует только по
положительным квитанциям. Ниже — полный перечень; `check-swarm-receipts.cjs` читает этот файл.

| WORK_UNIT_ID | Агент | Стадия | TRACE_PATH | Status |
|---|---|---|---|---|
| spec-writer-attempt-1 | spec-writer | PLAN · requirements | receipts/spec-writer.md | completed |
| algo-writer-attempt-1 | algo-writer | PLAN · pseudocode | receipts/algo-writer.md | completed |
| ops-writer-attempt-1 | ops-writer | PLAN · refinement/completion | receipts/ops-writer.md | completed |
| spec-writer-attempt-2 | spec-writer | PLAN · correction 1 | receipts/spec-writer-2.md | completed |
| algo-writer-attempt-2 | algo-writer | PLAN · correction 1 | receipts/algo-writer-2.md | completed |
| ops-writer-attempt-2 | ops-writer | PLAN · final summary | receipts/ops-writer-2.md | completed |
| validator-stories-ac-attempt-1 | validator-stories-ac | VALIDATE · INVEST/SMART/BDD | receipts/validator-stories-ac.md | completed |
| validator-docs-coherence-attempt-1 | validator-docs-coherence | VALIDATE · 4 линзы + решения | receipts/validator-docs-coherence.md | completed |
| spec-writer-attempt-3 | spec-writer | VALIDATE · fix round 1 | receipts/spec-writer-3.md | completed |
| spec-writer-attempt-4 | spec-writer | VALIDATE · DEC-A-014 | receipts/spec-writer-4.md | completed |
| spec-writer-attempt-5 | spec-writer | VALIDATE · DEC-A-015 | receipts/spec-writer-5.md | completed |
| algo-writer-attempt-3 | algo-writer | VALIDATE · fix round 1 | receipts/algo-writer-3.md | completed |
| ops-writer-attempt-3 | ops-writer | VALIDATE · fix round 1 | receipts/ops-writer-3.md | completed |
| revalidator-attempt-1 | revalidator | VALIDATE · re-check | receipts/revalidator.md | completed |
| astra-second-opinion-attempt-2 | codex-astra-reviewer | PLAN · ADR очередь/хранилище | receipts/codex-astra-second-opinion.md | completed |
| astra-second-opinion-attempt-3 | codex-astra-reviewer | PLAN · ADR Cloud.ru | receipts/codex-astra-second-opinion-2.md | completed |

## Единицы БЕЗ отдельной квитанции — и почему это не пробел

| Единица | Что писала | Где отчёт |
|---|---|---|
| `arch-writer` (Architecture.md, ADR.md, C4_Diagrams.md) | стадия 2b Phase 1 и правки раундов | исполнялась САМИМ координатором в его сессии, а не дочерним агентом: у координатора нет отдельного `TRACE_PATH` по построению — он и есть интегратор. Отчёт — события `arch-writer-attempt-1/2` и `coordinator-fix-round-1` в `events.jsonl`, находка V3-R11 |
| `scaffold-attempt-1` | docker-compose.yml, Dockerfile, Caddyfile, .env.example | то же: событие `ev-0047` с результатами стражей |

Это ограничение записано, а не обойдено: правило требует квитанцию от ДИСПАТЧЕРИЗОВАННОЙ единицы,
и координатор к ним не относится, но читатель обязан знать, что два набора файлов прошли без
файловой квитанции.
