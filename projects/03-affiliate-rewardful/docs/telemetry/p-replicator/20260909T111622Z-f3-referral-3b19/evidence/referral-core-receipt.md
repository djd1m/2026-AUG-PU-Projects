# Referral core implementation receipt

RUN_ID: 20260909T111622Z-f3-referral-3b19
WORK_UNIT_ID: referral-core
REPO_ROOT: /tmp/n3-referral-core
PROJECT_ROOT: /tmp/n3-referral-core/projects/03-affiliate-rewardful
Profile: compact-quality-first-v2, XL, implementation authorized after validation READY
Started: 2026-09-09T11:38:27.436957+00:00
Completed: 2026-09-09T11:47:57.368434+00:00
Measured receipt interval seconds: 569.931
Actual model: gpt-6-astra, effort high
Model evidence: coordinator confirmed host turn_context in /root/.codex/sessions/2026/09/09/rollout-2026-09-09T11-37-43-01a085f5-a377-7502-b710-356618870822.jsonl (session_meta task /root/referral_core).
Fallback: none
Usage tokens/cost: null; host counters unavailable to this worker, coordinator aggregates host evidence.
Weekly quota: null; unavailable to this worker; no estimate made.
Canon SHA256 verified unchanged: 53e90ae6f51d79d50c88cefbe68aece9323f3935d50d9cea484784be1dc0d4e9
Base: d54a65b
Commit: 9832dc35c7d6c163ab8ac37856aa6b4bc1743091

Implemented createReferrals with additive tables, immutable hashed-email customer bindings, 30/60/90 day frozen visit windows, cash-partner enrollment checks, narrow hash-only 90-day credentials, account→membership→tenant→credential lock order, bounded admissions, exact input validation, and owner/partner metrics backed by connector order/payment facts. No network or KDF executes within referral transactions.

Coordinator-confirmed semantics: self-referral denial applies only to attributed bindings and compares selected partner or tenant owner email; owner organic purchase remains valid with null beneficiary. Expired receipt yields stable attribution.reason=attribution_expired, persisted through source_id on the organic row and retained on retry. Partner status exposes only metrics. rotate returns token/expiresAt, configure returns configured/landingUrl/returnUrl, revoke returns revoked:true.

Metrics join source=connector/status=succeeded orders with matching persisted yookassa connector payments by shop_id/provider_id, requiring matching testMode and bindingId. Unique live/test customer counts are separate; first positive commissions use immutable paidAt and survive refund corrections; UTC Monday-based live activation is 0/1 and MRR is null.

Owned committed files:
projects/03-affiliate-rewardful/shared/referrals/helpers.mjs
projects/03-affiliate-rewardful/shared/referrals/metrics.mjs
projects/03-affiliate-rewardful/shared/referrals/schema.mjs
projects/03-affiliate-rewardful/shared/referrals/service.mjs
projects/03-affiliate-rewardful/tests/helpers/referral-fixture.mjs
projects/03-affiliate-rewardful/tests/referral-service.test.mjs

## Checks bound to committed source

- Port check PASS: bash scripts/check-port-conflicts.sh /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/docker-compose.test.yml; compose has no published host ports.
- Build PASS: npm run build from PROJECT_ROOT; 88 modules checked and all four variant entrypoints present.
- Focused PASS: docker compose -f /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/docker-compose.test.yml run --rm --no-deps -v /tmp/n3-referral-core/projects/03-affiliate-rewardful:/app:ro -v /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/node_modules:/app/node_modules:ro backend node --test tests/referral-service.test.mjs — 10 passed, 0 failed/skipped, 8253.260017 ms.
- Full regression PASS: docker compose -f /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/docker-compose.test.yml run --rm --no-deps -v /tmp/n3-referral-core/projects/03-affiliate-rewardful:/app:ro -v /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/node_modules:/app/node_modules:ro backend npm test — 93 passed, 0 failed/skipped, 27530.968528 ms. Includes core/account/identity/payment/protocol and A–D boundary suites available at base.
- Mutation PASS: temporarily replaced key.version === account.version with true; docker compose -f /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/docker-compose.test.yml run --rm --no-deps -v /tmp/n3-referral-core/projects/03-affiliate-rewardful:/app:ro -v /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/node_modules:/app/node_modules:ro backend node --test --test-name-pattern='credential invalidation' tests/referral-service.test.mjs failed as expected (1 failed, Missing expected rejection, exit 1). Original source restored before final build/focused/full runs and commit.
- git diff --cached --check PASS before commit.
- SQL tests use isolated randomly named schemas on existing internal Docker database network, no secrets printed/copied, no host database ports.

Meaningful tests cover rotation/revocation/version rejection, expiry after actual SQL lock wait, deterministic authorization-vs-rotation contention, 8 concurrent same-customer retries plus unrelated identity request, changed-email race, invalid-promo no-fallback, exact-email self-referral, expired/absent organic evidence, foreign/forged receipt rejection, public enrollment/real tenant gates, literal caps of 100000 visits/10000 customers including concurrent competition for last row, partner metric isolation and legacy exclusion, test/live separation, historical refund/week behavior.

Limitations: no browser/deployment/live provider acceptance performed by this worker. Existing createApplication still needs coordinator referralMigration and service wiring; its upcoming integration code is not in this isolated worktree. Full combined feature regression and independent QE remain coordinator responsibility. The prepared node_modules symlink remains untracked and is excluded from this commit.

Status: completed
