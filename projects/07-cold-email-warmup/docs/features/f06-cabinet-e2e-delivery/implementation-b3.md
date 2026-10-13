# F06 B3 — фактическая оставшаяся B1–B4 матрица

Вердикт **failed**: один подтверждённый product defect **F06B-003**, публичный отчёт имеет горизонтальный overflow на 390 px. Независимые группы продолжены после находки; она не превращена в PASS. Продукт src/db/deps не менялся. B5/B6 и fresh Astra B review — следующие стадии координатора; MVP не завершён.

Run `20261003T023900Z-f06`, unit `n7-f06b-final-sol`, attempt `b3`; launch revision `f048a69490947fac943ad56d1f796220ccb5040b`, spec SHA256 `72b44888ddab0405d955084d572130649fbdddc70b33d53a364db7dd80f05de5`. Профиль `compact-quality-first-v2`, substantive XL сохранён; mechanical ROUTE L/exit1 — нижняя граница. OWN-N7-002 и текущий brief покрывают один локальный TEST writer, без агентов/fallback. Requested `gpt-6.1-sol/high`; actual model/effort/usage/cost=null до метаданных хоста. Экономия не установлена. Время включает чтение, подготовку, ошибки harness и повторы; точные start/end/elapsed — `sol-b3-run.json` и terminal receipt.

Использован только принятый `sol-b-r2-image-receipt.json`: frozen provenance revision `03c8952488baa781e88fe54a41d891d2c6aa8e9a`, 93 source inputs, source `e9e78e47c349a0c23b3542dc68945d1f976f76c6edbb8bee61c817a3aebd084b`, compiled JS `455e80941dc8bc0c0dd7cca1a2f9b1388e1275b7f8b85fdf716993fdcb1ca27f`, image `sha256:4a0935cfa92622f453ef0b922d3b119099a20b066e5ac7880dec0f2d67ee70fb`. Старые bindings не ослаблены. Сборка читалась через временный собственный dist symlink на принятую R2; target не изменён, symlink удалён после проверки. No rebuild, unchanged39unit/115PG не перезапускались. Их прежние результаты — provenance, не новые измерения B3.

Все evidence ниже относительны `docs/telemetry/features/20261003T023900Z-f06/`. `a2` = `sol-b-b3-attempt-2`, `remaining` = `sol-b-b3-remaining-1`, `cross` = `sol-b-b3-crossbrowser-1`, `focused` = `sol-b-b3-focused-4`, `extra` = `sol-b-b3-extra-2`. Каждый содержит checks/exit/preflight, PNG и скопированные browser scripts; fixture RPC отдельный JSONL, auth-seed credentials подавлены. `sol-b3-immutable-check.json` показывает совпадение копий с READY SHA и честно перечисляет hash-only некопированные launcher/fixture ранних попыток. С focused-3 Python launcher/audit/fixture также копируются до выполнения; перед READY проверяется отсутствие drift.

| AC / обязательная группа | Фактический результат | Evidence / остаток |
|---|---|---|
| B1 browser/runtime | **PASS исполнения**: existing Docker Playwright1.63, Chromium153.0.8010.12 full1440×900+390×844; Firefox155/WebKit26.6 critical login/cabinet/report/revoke/reload/login390 | a2 desktop, remaining mobile, cross. No host browser/new container. |
| B1 accessibility/layout | Keyboard Enter, focus button/title, labels всех form controls во всех шести разделах, reduced motion, cabinet overflow checks **PASS**; public report mobile **FAIL F06B-003** | focused-1 desktop/mobile keyboard+empty/unavailable; focused/extra PNG. Просмотрены реальные representative PNG через view_image; перечень в sol-b3-visual-inspection.json, не все повторные изображения. |
| B1 console/evidence/cleanup | Pageerrors=0; exact HTTP negatives и intentional abort/offline классифицированы; READY source/build/environment/input names/command/effects/evidence перед каждым browser execution; global flock, собственный network detach и context/socket/bridge cleanup **PASS** | sol-b3-negative-classification.json, preflight/checks, sol-b3-progress.md, events. Failed attempts сохранены. |
| B2 mailbox/consent/campaign | Real register/login, add/edit/default10/limit7/invalid31, TESTverify, separate unchecked pool/campaign grants/revoke/waiting, preview/start/pause, v2/edit→unchecked reconsent, hostile personalization rendered literal **PASS** | a2/remaining/focused, actual API fetch and durable DOM. Credential inputs cleared; actual API-body canary absent. |
| B2 stops/messages | Accepted PollWorker→DispatchStore→SubmissionStore gives3 TEST messages per full flow, body+List-Unsubscribe+List-Unsubscribe-Post; real reply stop, native unsubscribe POST200/repeat200, complaint quarantine, campaign pause **PASS** | 1/2-local-messages.json and fixtures; sol-b3-persisted-stops.json confirms durable replied/suppressed/jobs. Accepted R2 null/cross-origin zero-effects/native30 checks retained by exact image provenance; separate green probe не повторён. Existing no-Origin capability exception preserved per coordinator clarification. |
| B2 observations/reports | Real manual saves/compare/share/public report/revoke/reload, privacy origin-only, explicit copy/link persistent events and idempotent copy **PASS behavior**; mobile layout **FAIL** | focused and cross/remaining. Unknown initially blocked; noimprovement/incomparable/stale share blocked; real n20 raw counts shown by extra. Current server local_test; disabled billing mode separately не запускался. |
| B2 billing/partner | Actual code create/deactivate/reactivate/copy/link, self-referral400, explicit foreign attribution, stable retry intent, actual operator-only canonical success, team grant after reload; actual referral cookie fallback and one counts-only TEST conversion **PASS** | a2/remaining/focused/extra; no browser operator key, mock business API or client-paid authority. |
| B3 tenant isolation | Two independent contexts foreign mailbox/campaign/evidence/report404, no private DOM leak; denied mutations zero effects **PASS** | a2/remaining foreign assertions, extra complete-zero-effects-1/2: before/after rows for mailboxes/campaigns/evidence/reports/events/intents/consents/jobs/suppression/grants/partner/conversions equal. |
| B3 sessions | Old logout cookie401, held actual upstream response after logout cannot repopulate DOM, expired401 clears cabinet; passive signin/app preserves unsaved draft and no echo; explicit logout invalidates other tab **PASS** | a2 desktop/remaining mobile; actual held response, no fabricated JSON. Original explicit-login test used real login API plus explicit channel notification; additional true UI login result below. |
| B3 states | Empty/loading/native invalid/typed campaign invalid/unavailable real offline/blocked grant and edited-version states desktop/mobile **PASS**; no auto-consent | focused-1 + focused + a2/remaining, no business response interception. Only bridge delay holds actual bytes. |
| B4 performance/runtime | 10 concurrent authenticated /api/mailboxes,100 samples per series, all200/p95<500; exact source/image/CPU2/PG no host ports/loopback/random external runtime keys/secretcanary audit **PASS** | performance-summary and sol-b3-audit.json; no backend/image/dependency changes. |
| B4 acceptance review | **PENDING** fresh independent Astra B review, as assigned to coordinator next | This writer does not self-accept B1–B4 or claim MVP completion. |

**F06B-003 (medium, blocks B1 acceptance):** real server HTML `/reports/:token` includes a wide immutable-observation table. Chromium390 root570 (focused report also overflows); Firefox390 root748; WebKit390 root604. Cabinet/report creation/privacy/revoke all function; no clipping or CSS workaround added. Exact layout values in remaining/cross/focused checks; actual PNG inspected. Repro: create two eligible same-source observations, compare and explicitly share; open returned public report at390, measure `document.documentElement.scrollWidth > innerWidth`. Product correction and affected browser layout rerun remain necessary.

Benchmark distributions, ms; nearest-rank percentiles, actual browser fetch+body parsing, excludes KDF/provider IO, own web CPU2 / PG private / bridge18709. Raw100 sample arrays and timestamps preserved; no estimate or pooling across runs:

| Series | min | p50 | p90 | p95 | p99 | max | errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| a2 Chromium1440 |21.4|55.4|98.0|109.1|138.2|139.4|0|
| a2 Chromium390 |19.6|47.7|68.4|85.2|98.5|98.6|0|
| remaining Chromium390 |12.7|42.8|70.7|78.5|82.9|84.8|0|

Commands from PROJECT (unique attempt names, never overwrite existing evidence):

```sh
# Precondition only when local dist absent: own read-only accepted build link.
ln -s /tmp/n7-f06b-r2/projects/07-cold-email-warmup/dist dist
timeout 660s python3 scripts/ui/f06-run.py b3-attempt-1 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json
# First actual command ran before link: exit1 strict compiled drift/missing, no E2E claim.
timeout 660s python3 scripts/ui/f06-run.py b3-attempt-2 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json
timeout 660s python3 scripts/ui/f06-run.py b3-remaining-1 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json
timeout 360s python3 scripts/ui/f06-run.py b3-crossbrowser-1 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json
timeout 360s python3 scripts/ui/f06-run.py b3-focused-4 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json
timeout 240s python3 scripts/ui/f06-run.py b3-extra-2 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json
python3 scripts/ui/f06-audit.py docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json b3
```

All matrix/focused/cross commands exit1 preserve mobile overflow; extra-2 exit0/51 checks; audit exit0. Prior harness mistakes remain failed: focused-1 native validation opens IMAP details, focused-2 hidden button role locator, focused-3 illegal template before missing-field oracle, extra-1 queried derived effective_limit as stored column. remaining Firefox registration429 exhausted five/hour IP protection; crossbrowser uses accepted external TEST seed plus actual UI login. No rate limit disabled/reset. Offline console false classification corrected by exact requestfailure class; prior record unchanged. Full assertions/counts/times/exits in sol-b3-attempt-summary.json.

Final syntax/AST/line limits/diff/scope/secret checks are recorded separately. Temporary own compiled link removed; own web/shared browser left running; no heavy lock/image build, SMTP, charge, paidLLM, deploy, shared proxy, global configuration, agent or push. Russian local commit preserves findings and evidence; coordinator owns correction/review/B5/B6.

Настоящий UI explicit login desktop/mobile: `timeout 90s python3 scripts/ui/f06-run.py b3-true-login-2 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json`, **exit0,19 checks**. После accepted expiry fixture прежний draft присутствует до реального клика «Войти» в другой вкладке; настоящий auth.js notification удаляет его. Итоговый authenticated cabinet чистый; signin auto-redirect с новой valid cookie допустим. true-login-1 exit1 сохранён: неверно ожидал устойчивый signin URL, фактический login был200. B3 session UI gap закрыт.
