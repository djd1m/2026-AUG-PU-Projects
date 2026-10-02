# RoomKind — Completion and Operations

## Deployment Plan
Current authority covers reversible local implementation and review, not deployment. Before live release: all unit/integration/E2E gates pass, real GPU corpus and latency pass, provider test-mode evidence obtained, security review closed, dependency audit complete, secrets configured server-side, owner approves external spend and destination. A draft PR may disclose pending gates; it is not accepted MVP.

## Deployment Sequence
1. Verify exact commit/lockfile and source/build receipts; run `npm test`, `npm run lint`, `npm run build` once implemented. Run migrate against an isolated backup-restorable database and exercise rollback procedure.
2. Before any compose start run root `scripts/check-port-conflicts.sh 08-interior-ai-redesign`; use internal database and loopback parametrized web port, never default credentials. Coordinate heavy builds with root and cap CPU2.
3. Start exact images, check readiness and actual browser journey with companion preflight. Production deployment remains a separate approval, so `deploy.sh` must refuse without an explicit deployment environment rather than pretending release happened.

## Rollback Procedure
Stop new jobs, allow active fenced attempts to finish or timeout, preserve database and private volume. Roll back image version only after backward compatibility check; do not erase payment/ledger records. SQL schema migration is additive initially. Restore test backup into isolated DB to prove procedure; never rewrite live ledger or historical telemetry. Monetary discrepancies go to operator review.

## Monitoring and logging

| Metric | Threshold | Destination |
|---|---|---|
| Response time p99 | >500ms API excluding generation | local operator report; PagerDuty not configured |
| Error rate | >1% over30 requests | local report; Slack not configured |
| CPU usage | >80% | local report; Email not configured |
| Expired leases | any >60s without reclaim | worker health report |
| GPU quality | any moved window/door | reject result and investigate |

The named external monitoring services are not integrated; no alert delivery claim. Structured JSON info/warn/error logs, no image bytes/password/provider secret, opaque IDs. Local test logs30d, production retention requires owner deployment decision. Telemetry unknown usage/cost stays null.

## Handoff
Development: docs/Architecture.md, donor inventory, environment sample without secrets, pinned dependencies, bounded scripts. QA: deterministic labelled fixtures, two accounts, real Postgres concurrency, separate GPU corpus inputs/licenses. Operations: model availability, secret provisioning, DB backup, worker lease recovery, share revocation and payment review runbook. `pipeline-walkthrough.md` explains the actual evolving chain and distinguishes designed from measured behavior.

## Required acceptance status
All product implementation and runtime checks currently pending; documentary gate outcomes recorded in validation report as they run. GPU unavailable is a remaining accepted-scope blocker. Completed preparation is not completion of the product.
