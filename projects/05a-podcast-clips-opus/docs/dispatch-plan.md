# План пишущего фан-аута — Phase 1, проект 05a

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** adr-architect · 2026-09-23

**Пишущий фан-аут:** да
**Канон:** docs/canon.md
**Хеш канона:** 082d04979f5128973397654ab17ffb38a700b65a5b2b2d720bbbb025137dcb48
**Проверка канона:** ВЫПОЛНЕНА
**Причина:** —

Канон заморожен после ответов владельца на СТОП 2 (OWN-05A-002…010) и решений [`ADR.md`](ADR.md). Каждая единица
пишет только свои файлы; общие имена берёт из канона. Правка канона после заморозки — только через координатора, с
новым хешем и повторной проверкой `node .claude/hooks/check-canon.cjs projects/05a-podcast-clips-opus`.

## Единицы

| Единица | Что пишет |
|---|---|
| pseudocode | docs/Pseudocode.md |
| architecture | docs/Architecture.md, docs/C4_Diagrams.md |
| refinement-completion | docs/Refinement.md, docs/Completion.md, docs/long-job-contract.md, docs/model-cost-contract.md, docs/webhook-contract.md, docs/embed-contract.md |
