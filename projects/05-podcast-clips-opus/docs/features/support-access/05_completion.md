# Support access — implementation checkpoint

Status: IMPLEMENTED CANDIDATE; browser/responsive acceptance and independent cold review PENDING.
This is not final feature acceptance or a production deployment receipt.
Spec revision: sha256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Baseline:ba993ac2. Web build input:420affeb; current worker/test correction:4c012d4f.
The original Phase1 planned receipt is preserved byte-for-byte in telemetry evidence.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-support-access-1 | tests/support-email.integration.test.ts | 24h proof permits same-account other device, is one-use and preserves signup credits |
| AC-support-access-2 | tests/support-mail-tls.test.ts | four actual TLS sends stop at total 8000ms despite trickle traffic; fifth fails fast and sockets close |
| AC-support-access-3 | tests/support-email.integration.test.ts | issuer logout and foreign account invalidate proof |
| AC-support-access-4 | tests/support-email.integration.test.ts | supersession/current-email binding and password reset preserve existing proof, membership and credits |
| AC-support-access-5 | tests/support-email.integration.test.ts | literal10000 storage bounds refuse uniformly and expired pruning removes at most100 |
| AC-support-access-6 | tests/support-email.integration.test.ts | fresh staff guard rejects browser-like claims, grants only verified accounts, revokes immediately |
| AC-support-access-7 | tests/support-email.integration.test.ts | fresh staff guard rejects browser-like claims, grants only verified accounts, revokes immediately |
| AC-support-access-8 | tests/support-email.integration.test.ts | widget signs only current verified UUID/email and foreign/missing context are identical |
| AC-support-access-9 | tests/support-email.integration.test.ts | widget signs only current verified UUID/email and foreign/missing context are identical |
| AC-support-access-10 | tests/support-widget-ui.test.ts | vendor logout exception still clears local identity and broadcasts invalidation |
| AC-support-access-11 | tests/support-ui.test.ts | renders labelled recovery forms, honest disabled mail and no GET consumption |

The table identifies primary executable anchors, not exhaustive semantic proof of every clause.
AC7 bounded DTO fields/paging and staff revocation are asserted inside its primary integration case.
AC10 also uses local-erasure and reset SQL tests; AC11 additionally requires actual Docker journeys.

## Verified local evidence

- Native PLAN and VALIDATE passed on the explicitly approved support-only source snapshot.
- Full integrated suite passed1232/1232 in130files onb7557e82; worker fake correction has a new full run pending.
- All-workspace build, test-wide typecheck and lint passed on their recorded source revisions.
- Sixteen red/green backend guards and UI password guard preserved with source/test hashes.
- Actual built Next instrumentation rejects test mail/support under runtime production.
- Actual rebuilt app answers HTTPS200 inside existingDocker with isolated runtime test and *_test DB.
- Real local SMTP/TLS acceptance, untrusted cert, auth failure, total8000ms/socket cleanup and shared4-send cap were tested.
- SQL/operator bootstrap and B/operator proof ran through actual APIs and privileged CLI on synthetic accounts.
- Canonical upload/render/guest fixture passed after the explicitly fake-only timeline correction; no realmodel call or natural-STT quality claim.
- Port/env/model-cost static checks passed; first missing offline compose env results remain NOT-ESTABLISHED history.
- Full diagnostics retained: Next route-type failures; missingffmpeg runner interruption; missingSQL_ENUMS; compiledNODE_ENV alias; initialfake timeline no_fragments.
- Browser journey/responsive and cold review are PENDING at this checkpoint.

## Deployment plan

### Pre-deployment checklist

- [ ] Final local UI/responsive and cold review accepted with exact source/build receipts.
- [ ] Real SMTP sender/domain/TLS and inbox delivery verified; SPF/DKIM/DMARC configured.
- [ ] Pinned Libredesk pilot validates two accounts/legacy contact/history, replies and independent sessions.
- [ ] Contact owner/hours, retention/deletion, attachments/indexes/backups and restore are decided/tested.
- [ ] Target Russian VM, protected data transfer, real billing/storage/analytics checks completed.

### Deployment sequence

1. Build/migrate the target using REPRODUCE.md and cloudru-launch-plan.md; disabled mail/support defaults remain explicit.
2. Bootstrap verified staff through ops:support-operator; configure authorized SMTP and pinned helpdesk only after runtime acceptance.
3. Exercise the real target journey and monitor failures, queue/runtime costs and SSD before traffic.

### Rollback procedure

Current VPS was not deployed. Stop a future rollout before traffic when preflight fails; retain additive023 schema and audit history.
Use compatible code/forward-fix after password/reset state changes; never resurrect revoked sessions or drop credit/audit data.
Disable new mail/widget integrations with their explicit modes while diagnosing; vendor sessions require separate vendor procedures.

## CI/CD and operational limits

Local required sequence: npm test, npm run typecheck, npm run lint, npm run build, native gates and existingDocker E2E.
Publishing remains the previously authorized feature-branch Git delivery; no release/main/production promotion is implied.
Runtime logs use controlled codes and private/no-store responses; tokens/passwords/cookies/SMTP credentials are excluded.
Response p99/error/CPU alert integrations are not configured by this feature; helpdesk capacity and operator labor are unmeasured.
Keep SSD>=2GiB; delete only proven own regenerated caches, not databases/media/evidence.

## Handoff

Telemetry: docs/telemetry/p-replicator/20261028-n5-support-implementation/.
Profile:model-routing-econom; requested Sol/high PLAN/VALIDATE/REVIEW, Sol/medium CODE.
Actual model/usage/cost are unavailable/null. Root owns remaining runtime/browser/review checks and Git delivery.
