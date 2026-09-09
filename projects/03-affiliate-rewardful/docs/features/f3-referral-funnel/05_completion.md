# Completion — f3-referral-funnel

Status: accepted and deployed as the agreed referral pilot on A–D, 2026-09-09. Live merchant payment acceptance remains NOT PERFORMED.

## Deployment Plan

Pre-deployment: full build/regression, meaningful mutation and independent review; source-bound E2E of merchant integration plus A–D; docs/gates; source/image receipts. Check VPS ports and existing container ownership before each compose start. Database has no published ports, random secrets, only backend/internal network in all environments.

Sequence: build candidate; run additive schema in isolated test DB; verify additive migration reads existing legacy rows and frontend rollback keeps compatible API; retain previous image references; deploy API then UI A–D sequentially; health/public browser smoke; provider live acceptance only with configured dedicated merchant and actual payment. No secret is generated into version control or copied from other projects.

Rollback: frontend images may be restored while retaining the F3-compatible API and additive schema. After ANY connector order exists, restoring the F2 backend/webhook processor is forbidden, including after reconciliation: late duplicate/refund events remain possible indefinitely. For a backend incident, stop API ingress and forward-fix or retain a known F3-compatible image; do not resume F2 webhook processing. Deployment/operations evidence must explicitly record this boundary. No automatic destructive downgrade or schema rollback is offered.

## CI/CD and Monitoring

Existing commands: npm run build; isolated backend npm test; project check-pipeline wrapper; review/canon/ownership/source-version gates; node scripts/check-deployment.mjs; public and isolated browser scripts. There is no npm run lint or deploy.sh; do not invent a passing stage. Monitor HTTP503/429, verified-event failures and active order count via available logs; new alert integrations are not installed. Example thresholds p99>500ms, errors>1%, CPU>80% remain targets without PagerDuty/Slack/email delivery claims. Keep provider tokens and customer PII out of logs.

## Handoff

Developer: integration contract/client helper/example; QA: reproducible isolated merchant/provider fixtures and browser steps; operations: connect dedicated N3 shop, configure HTTPS destinations, issue key into merchant backend secret, verify email there, fulfill from authenticated verified order status. F3 access plan remains approved next.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-f3-referral-funnel-11 | tests/referral-service.test.mjs | referral configuration validates destinations; key is hash-only, scoped, rotated and revoked |
| AC-f3-referral-funnel-12 | tests/e2e/referral.mjs | separate merchant UI: real redirect and first-party receipt through verified signup, authoritative checkout and provider-verified commission |
| AC-f3-referral-funnel-13 | tests/referral-service.test.mjs | verified binding has promo precedence, strict inputs, stable retries and no secret or email leakage |
| AC-f3-referral-funnel-14 | tests/referral-service.test.mjs | default 30 and published 60/90 day visits freeze server expiry independently of later policy |
| AC-f3-referral-funnel-21 | tests/referral-payment.test.mjs | lost connector create response retains idempotency; foreign credentials cannot query order or redirect binding |
| AC-f3-referral-funnel-22 | tests/referral-payment.test.mjs | connector orders freeze durable signup attribution; late renewal survives cookie expiry and refunds remain idempotent |
| AC-f3-referral-funnel-31 | tests/referral-payment.test.mjs | test commission does not consume one-time live commission; metrics count unique live customers and survive clawback |
| AC-f3-referral-funnel-32 | tests/e2e/referral.mjs | owner referral panel works on all A–D origins at desktop and mobile, key response cannot reappear after logout |
| AC-f3-referral-funnel-41 | tests/referral-payment.test.mjs | literal 5000-order cap refuses extra provider work while an existing connector retry stays available |
| AC-f3-referral-funnel-42 | tests/referral-payment.test.mjs | additive migration preserves old checkout rows and their legacy payment/refund interpretation |


## Candidate evidence

Shared runtime regression:118/118 passed, including final race/cap/migration cases. Test files run sequentially because auth admission has a database-wide fail-fast lock; explicit in-test concurrency remains enabled. Isolated browser:2/2 passed, including real navigation through a separate merchant frontend/backend, provider stub, refund fulfillment, A–D desktop/mobile and delayed key suppression. Six meaningful guard mutations were detected in disposable source copies. Final execution receipts are recorded under docs/telemetry/p-replicator/20260909T111622Z-f3-referral-3b19/evidence/.

New connector test payments carry provenance and remain auditable, but their amounts are excluded from payable registry/cash totals. Historical F2 facts retain their original interpretation; any old provider-test records require operator reconciliation before real payouts. An application source review found and closed the test-money and malformed-UUID defects; the formal complete-spec review follows the combined gates.

## Final acceptance and public rollout

Independent Phase4 review: PASS, all10 ACs met for the agreed pilot. Source candidate f8055e3; guide correction fae47b7. All five application containers healthy after rollout; frontend module bytes on all four public HTTPS origins match the reviewed source. DB has no host ports, only API/PostgreSQL in internal n3-database, random0600 secrets verified without recording their values. Existing port-checker exit1 referred only to these same already-running Compose services; ownership was checked before replacement.

Public regression after rollout:49/49 CJM checks,1/1 real account journey including HTTPS destination settings/key issuance/revocation,1/1 official MCP client+A2A shared-state/replay/revoke. Isolated browser remains2/2 at1440/390; backend118/118; six targeted mutants detected. Evidence: [public deployment](../../telemetry/p-replicator/20260909T111622Z-f3-referral-3b19/evidence/public-deployment.json), [formal review](review-report.md). The post-review public test gained extra UI assertions; executable production code was unchanged. Snapshot hashes distinguish that test version from the image source.

The pipeline is implemented by the installed /go and /feature workflow instructions and gates. No second orchestrator was installed. Mode2 has no pre-existing feature-roadmap.json; none was auto-generated. Feature completion and telemetry are the authoritative status for this run.

Next authorized product work: f3-access-onboarding (Resend verification/reset, Yandex ID, five provider runbooks). A live shop remains one selected tenant per deployment, requires dedicated credentials/merchant acceptance, and does not automatically import an existing subscription billing system. Frontend rollback keeps the compatible F3 API; old F2 backend images retained for provenance are not an allowed rollback after a connector order exists.
