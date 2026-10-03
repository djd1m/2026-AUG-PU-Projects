# RoomKind — Completion and Operations

## Deployment Plan
Current authority covers reversible local implementation and review, not deployment. Before live release: all unit/integration/E2E gates pass, real GPU corpus and latency pass, provider test-mode evidence obtained, security review closed, dependency audit complete, secrets configured server-side, owner approves external spend and destination. A draft PR may disclose pending gates; it is not accepted MVP.

## Deployment Sequence
1. Verify exact commit/lockfile and source/build receipts; use the actual scripts in `package.json`: `npm test` covers foundation boundaries/media, `npm run lint` and `npm run build` are syntax/static checks. The remaining named PG/browser/GPU suites are separate mandatory gates; do not claim a full regression from `npm test` alone. Run migrate against an isolated backup-restorable database and exercise rollback procedure.
2. Before any compose start run root `bash scripts/check-port-conflicts.sh projects/08-interior-ai-redesign/compose.yaml` (from repository root, using the same private interpolation configuration); use internal database and loopback parametrized web port, never default credentials. Coordinate heavy builds with root and cap CPU2.
3. Start exact images, check readiness and actual browser journey with companion preflight. Production deployment remains a separate approval, and no `deploy.sh` or production release automation exists in this source. Local Compose startup does not establish a release.

## Rollback Procedure
Stop new jobs, allow active fenced attempts to finish or timeout, preserve database and private volume. Roll back image version only after backward compatibility check; do not erase payment/ledger records. Migrations are versioned; inspect all six before rollback, including historical attribution cleanup. No down-migration CLI exists. Restore test backup into isolated DB to prove procedure; never rewrite live ledger or historical telemetry. Monetary discrepancies go to operator review.

## Monitoring and logging

| Metric | Threshold | Destination |
|---|---|---|
| Response time p99 | >500ms API excluding generation | local operator report; PagerDuty not configured |
| Error rate | >1% over30 requests | local report; Slack not configured |
| CPU usage | >80% | local report; Email not configured |
| Expired leases | any >60s without reclaim | worker health report |
| GPU quality | any moved window/door | reject result and investigate |

These thresholds/retention are operator targets, not observed production SLOs or an installed monitoring pipeline. The named external monitoring services are not integrated; no alert delivery claim. Current source emits bounded status/error markers and opaque identifiers; structured JSON aggregation and automatic retention are not installed. Logging policy excludes image bytes/password/provider secrets. Local test retention target30d and production retention require an operator process and owner deployment decision. Telemetry unknown usage/cost stays null.

## Handoff
Development: docs/Architecture.md, donor inventory, environment sample without secrets, pinned dependencies, bounded scripts. QA: deterministic labelled fixtures, two accounts, real Postgres concurrency, separate GPU corpus inputs/licenses. Operations: model availability, secret provisioning, DB backup, worker lease recovery, share revocation and payment review runbook. `pipeline-walkthrough.md` explains the actual evolving chain and distinguishes designed from measured behavior.

## Required acceptance status
Source `8030270f023d83c9cdd597c4578517a1b58b4b35`: F01 auth/private uploads, F02 queue/inference-controller/quality guards, F03 payment/partner software and F04a composition/publication backend have accepted historical source-bound receipts. F04b UI and specific corrections are independently reviewed. Actual UI6 completed42 main checks at1440/390 plus2 checks on a separately restarted disabled-payment server; see [F04 acceptance](features/f04b/acceptance.md). Failed attempts1–5 are retained unchanged.

[Individual41 AC map](features/f06a/acceptance-map.md) separates software evidence from real acceptance. F05 remains blocked: real CUDA/pinned safe weights and dependency/security compatibility, licensed12×3 corpus/openings/anchors and≥30warm p95≤25s have no accepted real evidence. GEOM-03 guards are tested but no real output quality acceptance is claimed. YooKassa fixture/HTTP tests do not establish real provider acceptance. No actual card charge/refund, payout, mail, GPU rental or deployment occurred in this docs scope.

F06a independent documentation preparation may complete without GPU. [English README](README/en.md), [Russian README](README/ru.md) and [operations](features/f06a/operations.md) describe existing commands/env names, manual configured stack and an inert owned synthetic PG16 restore procedure. [Actual restore receipt](telemetry/n8-20261002-1740/n8-f06-restore-1-receipt.md) verifies21tables/451rows and constraints, source unchanged, target cleanup; separate10file archive recovery passed. This does not claim an application restart against the recovered pair or production RPO/RTO.

F04 local software is accepted. F05/fullF06/MVP remain not done. Fresh independent review of the integrated documentation remains a delivery gate. Draft PR may target existing `claude/install-npm-packages-n7l3m5` with these gates disclosed; no main creation, merge or deployment is authorized. Deployment destination, secrets and external effects require the retained separate release authority.
