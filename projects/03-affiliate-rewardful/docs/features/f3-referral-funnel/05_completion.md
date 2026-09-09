# Completion — f3-referral-funnel

Status: planned, not implemented or accepted.

## Deployment Plan

Pre-deployment: full build/regression, meaningful mutation and independent review; source-bound E2E of merchant integration plus A–D; docs/gates; source/image receipts. Check VPS ports and existing container ownership before each compose start. Database has no published ports, random secrets, only backend/internal network in all environments.

Sequence: build candidate; run additive schema in isolated test DB; test rollback image reading migrated legacy rows; retain previous image references; deploy API then UI A–D sequentially; health/public browser smoke; provider live acceptance only with configured dedicated merchant and actual payment. No secret is generated into version control or copied from other projects.

Rollback: restore previous images and keep additive tables/columns. Legacy code ignores connector snapshots, so after connector traffic starts old API must not consume new connector orders: quiesce connector/webhook ingress during rollback and reconcile outstanding orders before restoring legacy payment processor. Test this refusal/operational boundary; never silently process connector orders as legacy attribution.

## CI/CD and Monitoring

Existing commands: npm run build; isolated backend npm test; project check-pipeline wrapper; review/canon/ownership/source-version gates; node scripts/check-deployment.mjs; public and isolated browser scripts. There is no npm run lint or deploy.sh; do not invent a passing stage. Monitor HTTP503/429, verified-event failures and active order count via available logs; new alert integrations are not installed. Example thresholds p99>500ms, errors>1%, CPU>80% remain targets without PagerDuty/Slack/email delivery claims. Keep provider tokens and customer PII out of logs.

## Handoff

Developer: integration contract/client helper/example; QA: reproducible isolated merchant/provider fixtures and browser steps; operations: connect dedicated N3 shop, configure HTTPS destinations, issue key into merchant backend secret, verify email there, fulfill from authenticated verified order status. F3 access plan remains approved next.

## Criterion coverage

Pending implementation; no tests claimed yet. Coverage table is filled with actual test file/title evidence before IMPLEMENT advances.
