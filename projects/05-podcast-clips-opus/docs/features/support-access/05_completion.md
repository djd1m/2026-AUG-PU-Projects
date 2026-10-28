# Support access — local acceptance

Status: LOCAL ACCEPTED; authorized feature-branch delivery follows the final native checks.
Spec revision: sha256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Application/test source and build:37e822f2cee45c2a284930ee46a90aa956ce1cb7.
Final documentation/roadmap changes do not change application or test inputs.
Current production was not deployed. Real SMTP/helpdesk/RF acceptance is out of scope below.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-support-access-1 | tests/support-email.integration.test.ts | 24h proof permits same-account other device, is one-use and preserves signup credits |
| AC-support-access-2 | tests/support-mail-tls.test.ts | four actual TLS sends stop at total 8000ms despite trickle traffic; fifth fails fast and sockets close |
| AC-support-access-3 | tests/support-email.integration.test.ts | issuer logout and foreign account invalidate proof |
| AC-support-access-4 | tests/support-email.integration.test.ts | supersession/current-email binding and password reset preserve existing proof, membership and credits |
| AC-support-access-5 | tests/support-email.integration.test.ts | literal10000 storage bounds refuse uniformly and expired pruning removes at most100 |
| AC-support-access-6 | tests/support-email.integration.test.ts | fresh staff guard rejects browser-like claims, grants only verified accounts, revokes immediately |
| AC-support-access-7 | tests/support-email.integration.test.ts | staff ledger includes owned grants and settled300s debit and caps combined history at20 |
| AC-support-access-8 | tests/support-email.integration.test.ts | widget signs only current verified UUID/email and foreign/missing context are identical |
| AC-support-access-9 | tests/support-email.integration.test.ts | widget signs only current verified UUID/email and foreign/missing context are identical |
| AC-support-access-10 | tests/support-widget-ui.test.ts | vendor logout exception still clears local identity and broadcasts invalidation |
| AC-support-access-11 | tests/support-ui.test.ts | renders labelled recovery forms, honest disabled mail and no GET consumption |

Primary anchors are executable tests, not exhaustive proof of each clause. AC7 additionally
has exact-microsecond cursor and latest-owned-stage PostgreSQL cases. AC3 additionally
waits on actual PostgreSQL token locks while each session expires. AC9 confirms anonymous
contexts omit accountId before and after proof. AC10 covers local erasure, reset and widget
cleanup failure. AC11 additionally uses the source-bound Docker checks below.

## Verified local evidence

All paths below are under docs/telemetry/p-replicator/20261028-n5-support-implementation/.

- Final npm test:1258/1258,131files,0skips; npm run build/typecheck/lint each exit0.
  Node22.22.3 and FFmpeg8.1.2; final-local-acceptance/index.json binds receipts and hashes.
- Existing Docker codex-ui-playwright:342responsive pages/screenshots, Chromium153.0.8010.12
  and WebKit26.6, light/dark, phone/tablet/desktop sizes; exit0,0errors,646warnings retained.
  Incomplete automatic contrast/caption checks are not claimed as manual accessibility certification.
- Support journey:51checks and24screenshots, exit0,0errors/findings; two customers and a separately
  verified/enrolled operator; explicit proof, fragment clearing, staff denial/read-only card,
  context consent/ownership, A→anonymous→A→B identity, SDK fallback and reset. Support/staff
  forms/cards checked360/1440 in both themes. The SDK is visibly synthetic; vendor history is unproven.
- Actual post-reset HTTP/SQL:0active prior A sessions; original issuer401, old password401,
  new password200, reset replay422; original proof preserved and exactly one1800-second signup grant.
- Actual compiled Next instrumentation rejects the EXACT support/mail test-mode guard under
  production; positive isolated runtime uses private local HTTPS and *_test DB.
  Self-signed TLS exception is limited to the private fixture, not production TLS acceptance.
- SMTP/TLS boundary tests exercise validated certificates/auth, total8000ms cancellation,
  socket close and shared4-send cap; no actual mailbox delivery or third-party support message.
- Native PLAN/VALIDATE passed on the owner-approved support-only snapshots; final completion/review,
  canon/ownership/source-version and documentation receipts are in final-native-checks.json.
  Historical aggregate exit1 (duplicate root keys/legacy headers) remains visible and is NOT PASS.
- Initial independent cold review found six defects; all corrected and independently re-reviewed
  against37e822f2. review-report.md is source-only clear; runtime evidence above is coordinator-owned.
  Initial report and every bounded corrective receipt/red-green log remain in evidence/.
- Canonical200s synthetic upload used real SQL/S3/queues/FFmpeg and explicit fake models.
  Two clips rendered; a third thumbnail failed with ffmpeg_failed. That real partial state was
  retained to verify mobile actions before preview without hiding the warning. No natural STT,
  three-successful-clips, real provider cost or live-media-quality claim is made.
- Original16backend guard mutations plus password and corrective red/green cases are preserved
  on their exact historical source/test hashes. They are not all described as freshly mutated final code.

## Deployment plan

### Pre-deployment checklist

- [x] Accepted local scope: implementation, full tests/build/types/lint, native lifecycle,
  existing-container browser and independent source review; authorized Git delivery recorded in run.json.
- [ ] Out of scope: actual SMTP sender/domain and receipt in an inbox; SPF/DKIM/DMARC.
- [ ] Out of scope: pinned Libredesk pilot with two accounts/legacy contact/history/replies,
  independent remote sessions/revocation, retention/deletion, attachments/indexes/backups/restore.
- [ ] Out of scope: real support contact/operator hours and target Russian VM capacity/deployment,
  protected data transfer, real storage/payment/analytics acceptance.

### Deployment sequence

Follow cloudru-launch-plan.md and REPRODUCE.md. Apply additive023 and preserve credentials,
credit/audit data and revoked-session state. Mail/widget default disabled; configure authorized
SMTP/helpdesk only after their separate runtime checks. Verified staff are enrolled through
ops:support-operator with UUID, actor and reason; there is no public grant route or money editing.
A receipt from SMTP is not delivery; N5 logout/JWT expiry is not global vendor-session revocation.

### Rollback procedure

The current VPS was not deployed. A future failed preflight stops rollout before traffic.
Keep additive schema/audits; use compatible code or a forward fix. Never restore old revoked
sessions or drop credit history. Disable mail/widget integrations while diagnosing; remote
vendor sessions and history require their separate vendor procedures.

## CI/CD and operational limits

Publishing is the authorized feature branch only; no main merge/release/production promotion.
Secrets and private credential/token fixtures stay outside Git. Synthetic screenshots alone
are included; captures/cookies/passwords are not. SSD stayed above2GiB; only proven regenerated
own build caches were removed. Real phones/webviews, p95 performance and helpdesk capacity
remain target-pilot work. See BACKLOG.md for the separate thumbnail/media acceptance finding.

## Handoff

Profile:model-routing-econom. Requested Sol/high PLAN/VALIDATE/independent REVIEW and Sol/medium CODE;
reviewer received planner sources, no coder chat/receipts/runtime outcomes. Actual model/token/cost
metadata is unavailable and remains null. Measured run duration and delivery URI are in run.json.
RUN_ID:20261028-n5-support-implementation. Root owns the final Git commit/push and remote verification.
