# N3 agent CJM consequential review

RUN_ID: 20260908T201412Z-agent-cjm-e004
WORK_UNIT_ID: agent_cjm_review
TRACE_PATH: /tmp/n3-agent-cjm-review.md
Scope: read-only review of discovery, agent-flow.js, app.js, shell.html. No repository edits.
Requested model/effort: gpt-6-astra/high. Actual model/effort and provider usage: unavailable; no host attestation in this worker.

## Confirmed findings

### R1 — P2: Manual continuation silently restores the old registry
- Locations: assets/agent-flow.js:33; assets/app.js:23 and :34.
- Reproduce: D → grant → prepare → approve → simulate refund. Current D registry becomes 8,400 ₽ (Anna 1,200 ₽). Revoke or expire if desired, then “Продолжить вручную в A”.
- Observed: A displays 9,600 ₽ (Anna 2,400 ₽); its CSV exports the original amount. The user was offered continuation of the reviewed task, but their correction disappears.
- This contradicts the proposed shared business model and gives the wrong manual payout amount in the new explicit D→A handoff. No backend audit is required to reproduce it.
- Fix: carry the current registry/version into the manual view and CSV, or explicitly label the link as a separate independent demo without carrying the result; remove the promise that this link continues the same task if choosing the latter.

### R2 — P2: Evidence explanation contradicts the corrected artifact
- Location: assets/agent-flow.js:14.
- Reproduce: D → prepare → simulate refund → select “Готовый результат” again.
- Observed: artifact says 8,400 ₽, but “Почему можно проверить результат” still explains “48 000 ₽ оплачено × 20% = 9 600 ₽” without the refund deduction. The panel is presented as the explanation for the current artifact.
- Fix: include the 1,200 ₽ refund adjustment and net 8,400 ₽ in the explanation when corrected, keeping the separate held commission distinguishable.

## Verified behavior

A Node VM harness executed the actual source with DOM/download stubs (exit 0):
- Ungranted preparation is rejected.
- Approved current revision can export; revise clears approval and blocks export.
- Revoked/expired access blocks prepare, approve, revise and export; prior export count unchanged.
- Duplicate pending partner request keeps the same task ID.
- Cancel and partner revoke reject a later simulated response; new authorized request can complete.
- Completed partner markup includes only Studio’s status, with no Anna/Media registry rows.
- Same harness confirmed both R1 (8,400 → 9,600) and R2 (stale explanatory figure).

Source review: D is registered before app’s first render; all four tabs, comparison cards, mixed selection options, D localStorage validation and JSON export are wired. Browser persistence/regression remains coordinator-owned. Agent state itself is intentionally session-local.
MCP/A2A are consistently labelled future hypotheses; no claimed connected endpoint. Manual transfers and “response received ≠ money sent” remain explicit. No PRD/backend created.
No protocol-wire/authentication audit was demanded for this static model.

## Reviewed source SHA-256

- discovery/agent-interface-cjm.md: 885278f4dda18d0158a6af708d16b129805344a3df77427a408557ce1f0ed202
- assets/agent-flow.js: dc59ec2084dc9cbaa7934e7e559d98122a6b3095dc485e92167bdbcfb5ac6862
- assets/app.js: 403368e98e6b6de8514fefcf084d9d7817777045abcc9805cc37cb026bb6a293
- assets/shell.html: 53c2e063e783d09eb46ff3fe5b0c68646ab211931a3ccee5be92cec6b04a8b2d

Status: completed

## Исправления после снимка ревью

R1: ручной A принимает тот же артефакт D (сумма, строки, версия), владелец может утвердить и выгрузить его даже после истечения доступа агента. Отдельный старый пример A открывается только явной кнопкой. Browser guard проверяет8400₽ и содержимое CSV.

R2: после возврата доказательство обновляется:48000−6000=42000×20%=8400. Browser guard проверяет объяснение на экране результата. Эти исправления повторно проверены координатором в Firefox, не приписаны второму запуску модели.
