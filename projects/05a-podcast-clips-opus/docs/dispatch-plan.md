# План пишущего фан-аута — Phase 1, проект 05a

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** adr-architect · 2026-09-23

**Пишущий фан-аут:** да
**Канон:** docs/canon.md
**Хеш канона:** dc2cb9b89ab4a5160d9e16cfcaa26ea54ad90c7427868d8a4dc7bfaf36c57566
**Проверка канона:** ВЫПОЛНЕНА
**Причина:** —
**Координатор пишет:** да
**Разрезы файлов:** да
**Проверка владения:** ВЫПОЛНЕНА

Канон заморожен после ответов владельца на СТОП 2 (OWN-05A-002…010) и решений [`ADR.md`](ADR.md). Каждая единица
пишет только свои файлы; общие имена берёт из канона. Правка канона после заморозки — только через координатора, с
новым хешем и повторной проверкой `node .claude/hooks/check-canon.cjs projects/05a-podcast-clips-opus`.

## Единицы

| Единица | Что пишет |
|---|---|
| pseudocode | docs/Pseudocode.md |
| architecture | docs/Architecture.md, docs/C4_Diagrams.md |
| refinement-completion | docs/Refinement.md, docs/Completion.md, docs/long-job-contract.md, docs/model-cost-contract.md, docs/webhook-contract.md, docs/embed-contract.md |
| spec | docs/PRD.md, docs/Specification.md, docs/Solution_Strategy.md, docs/Research_Findings.md |
| adr | docs/ADR.md |

## Владение

Единицы `spec` и `adr` писали параллельно с фан-аутом (приведение к канону), поэтому объявлены единицами.
Координатор внёс одну пост-правку в чужой файл после закрытия единицы — `docs/model-cost-contract.md`
(закрыл устаревший раздел о расхождении); она записана в `docs/source-versions.md`, владелец файла не меняется.

| Файл | Владелец |
|---|---|
| docs/Pseudocode.md | pseudocode |
| docs/Architecture.md | architecture |
| docs/C4_Diagrams.md | architecture |
| docs/Architecture-compose.md | architecture |
| docs/Refinement.md | refinement-completion |
| docs/Completion.md | refinement-completion |
| docs/long-job-contract.md | refinement-completion |
| docs/model-cost-contract.md | refinement-completion |
| docs/webhook-contract.md | refinement-completion |
| docs/embed-contract.md | refinement-completion |
| docs/PRD.md | spec |
| docs/Specification.md | spec |
| docs/Solution_Strategy.md | spec |
| docs/Research_Findings.md | spec |
| docs/ADR.md | adr |
| docs/canon.md | координатор |
| docs/dispatch-plan.md | координатор |
| docs/decisions-owner.md | координатор |
| docs/source-versions.md | координатор |
| docs/Final_Summary.md | координатор |

## События разреза

| Новый файл | Разрезан из | Владелец |
|---|---|---|
| docs/Architecture-compose.md | docs/Architecture.md | architecture |
