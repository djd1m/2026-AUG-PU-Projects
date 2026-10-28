# N5 support backend terminal receipt

Run-ID: 20261028-n5-support-implementation
RUN_ID: 20261028-n5-support-implementation
Work-Unit-ID: support-backend
WORK_UNIT_ID: support-backend
Attempt-ID: support-backend-code-01
Source-Revision: be9073a99c86c19364f2feea974e7f0f01b5734d
Baseline-Revision: ba993ac2f7ed69538a65b840eaa7949d873ba5d5
Launch-Source-Revision: ba993ac2f7ed69538a65b840eaa7949d873ba5d5
Candidate-Revision: be9073a99c86c19364f2feea974e7f0f01b5734d
Package-Build-Revision: be9073a99c86c19364f2feea974e7f0f01b5734d
Build-Revision: null (full Next build belongs to root integrated acceptance)
Spec-SHA256: ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Canon-SHA256: 560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
Launch-SHA256: f5b949d88177aee59e4140136c97d3b9d8d147d32376fc68975cb9f67c5f6631
Launch-Path: /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/docs/telemetry/p-replicator/20261028-n5-support-implementation/evidence/coding-backend-launch.json
Finished-At: 2026-10-28T01:07:57.098514+00:00
Verdict: PASS for assigned backend candidate/focused checks; overall integrated feature acceptance pending root
Delivery-URI: urn:n5:support-backend:be9073a99c86c19364f2feea974e7f0f01b5734d

Commits:71402216 then be9073a99c86c19364f2feea974e7f0f01b5734d; no push. Worktree clean; sole writer stayed in backend ownership. No planner/UI/process documents edited.
Profile:model-routing-econom with owner override Sol medium coding; no Anthropic.
Requested-Model:gpt-6.1-sol; Requested-Reasoning:medium.
Actual-Model:null (host execution metadata unavailable; request is not proof of routing).
Input-Tokens:null; Output-Tokens:null; Cached-Tokens:null; Cost:null. No estimates substituted.
Launch-To-Receipt-Elapsed-Seconds:1702.977 (measured launch.created_at through receipt, includes dispatch/reading/checks; executor start unavailable).
E2E-Preflight:not_applicable to this backend unit; browser/build E2E is root-owned and requires its own readiness preflight.

Backend AC mapping:
- AC1/3/4: retain N5 bcrypt10, HMAC, seven-day cookie, password-hash recheck and signup1800seconds. SHA25632-byte one-use tokens,24h verify/1h reset, purpose/current-email binding, cross-device same-account proof with active issuer. Reset revokes all sessions/tokens atomically without login/proof/credit grant; existing proof/membership/credits retained.
- AC2/5: mail/support default disabled; test requires runtime NODE_ENV=test AND DATABASE_URL ending_test, private capture accepts reserved synthetic recipient domains only. Nodemailer10.2.1 standard SMTP/TLS, process-global4-send budget across adapter instances,8000ms whole-operation deadline, no retries. Public getSocket hook retains raw TCP cancellation because nonpooled close alone does not destroy active sockets. Actual local synthetic TLS fixture verifies auth/acceptance, untrusted-cert rejection, auth rejection/no retry, and four trickling DATA sockets closed by deadline.
- AC5: pre-body IP limiter, exact Origin, strict4096-byte JSON and72-byte passwords. Persisted stable sorted IP/email/pair locks, literal5/30/5 per hour,60s cooldown,10000-row caps,<=100 pruning. Verify email quota uses server-read current email and rechecks snapshot under account lock. Cleanup commits before account lock to avoid inversion. Wall clock rechecked after waits.
- AC6/7: fresh DB session/membership locks for staff reads, no public grant endpoint. UUID/actor/reason process CLI grants only active verified account; membership/audit atomic. List25 and latest20 grant-ledger/payment/video rows use explicit safe projections. Existing credit balance reader reused inside staff transaction, with null for legacy/deleted accounts. No balance/payment/media mutation route.
- AC8/9/10: anonymous default official Libredesk bridge; explicit opt-in server-built60s HS256 JWT from current verified UUID/email, no user_id. Foreign/missing video context both404. Erasure immediately revokes local tokens/sessions/proof/membership and later removes token/membership rows. No remote-vendor revoke/deletion claim.
- AC11 backend seam: exact typed supportPageState DTO; anonymous no DB query, authenticated failure closes staff claim. UI/mobile/browser acceptance remains root/UI-owned.

Checks on immutable final candidate:
- `npm run build --workspace packages/shared`: exit0; `/tmp/n5-support-backend-checks-20261028/final-build-shared-01.log` SHA256 `976bb5e3e663f87a05ad3f199dcf580683975802c224c6504241f01257f6b427`.
- `npm run build --workspace packages/db`: exit0; `/tmp/n5-support-backend-checks-20261028/final-build-db-01.log` SHA256 `b6cd0e886c8b67fa4867b7bda87be7f3610fb61a49915369fbf74d02838f46c8`.
- `npm run typecheck --workspace apps/web`: exit0; `/tmp/n5-support-backend-checks-20261028/final-typecheck-web-01.log` SHA256 `21816b8bb0da431db3d8625137867318323f36f496a7258c4bb734a5d5266882`.
- `npm run lint`: exit0; `/tmp/n5-support-backend-checks-20261028/final-lint-01.log` SHA256 `03d26c6ef0841b6eac1a8fb620e782e15d97a1f4467dc4566747082c86361443`.
- `/tmp/n5-acquisition-node22/node-v22.22.3-linux-x64/bin/node scripts/test.mjs tests/support-email.integration.test.ts tests/support-email-handler.test.ts tests/support-backend-boundary.test.ts tests/support-backend-environment.test.ts tests/support-backend-page-state.test.ts tests/support-mail-tls.test.ts tests/auth.test.ts tests/database.integration.test.ts tests/config.test.ts tests/wiring.test.ts tests/retention.test.ts tests/retention-route.test.ts tests/retention.integration.test.ts tests/retention-storage.test.ts`: exit0; `/tmp/n5-support-backend-checks-20261028/final-focused-01.log` SHA256 `abe15dbdc8dba374e92f50cc62ad447862a938a3cb9f10e2bef57292fd945cc0`.
Final focused result:14 files,141 passed,0 failed,0 skipped,41.64s. New backend plus affected auth/config/wiring/PostgreSQL/MinIO erasure suites; five reset and five shared-IP concurrency runs.
Checks-Receipt:/tmp/n5-support-backend-checks-20261028/final-checks-01.json
Checks-Receipt-SHA256:28a1d73635d0e4ecde3a7c4bac0c328cb3719b02b281ef3dd98bdc54c5c2aca7
Mutation-Receipt:/tmp/n5-support-backend-checks-20261028/mutations-final-01/mutations-0b4e847e.json
Mutation-Receipt-SHA256:5186a9530bf444dbcb1be791d15ec74e16b09329809f90ae9bc1b203f9a79107
Mutation result:16/16 red exit1 -> restored green exit0; all per-source/test SHA snapshots revalidated against final candidate. The mutation run began at71402216 with dirty source snapshots; explicit hashes match this committed candidate. Guards cover isolation/synthetic capture/runtime wiring/storage cap/pruning/erasure proof/origin/body/IP quota/one-use/wallclock/staff revoke/widget UUID/SMTP cap/deadline/TLS.
Source-Manifest:/tmp/n5-support-backend-checks-20261028/source-manifest-final-01.json
Source-Manifest-SHA256:c5598d9da77ff3ff23c80d63f1003d6bfae097b6b651b49ff32d0aa4b7f20e5c

Earlier failures retained in private logs: initial fixture/projection findings corrected; expanded focused-final-01 had6 source-anchor/env-fixture mismatches, corrected in owned source/environment fixture without unrelated test edits; affected-fix-01 then20/20 and final141/141 passed. Tests-wide TSC initially lacked existing @grpc overlay, supplied by root. Remaining responsive TS2742 belongs to UI's already delivered correction; full integrated TSC is root's responsibility and not claimed here.

Configuration fields: N5_MAIL_MODE,N5_MAIL_FROM,N5_SMTP_HOST,N5_SMTP_PORT,N5_SMTP_USER,N5_SMTP_PASSWORD,N5_SMTP_SECURE,N5_MAIL_TEST_CAPTURE_FILE,N5_SUPPORT_MODE,N5_SUPPORT_BASE_URL,N5_SUPPORT_INBOX_ID,N5_SUPPORT_IDENTIFIED,N5_SUPPORT_JWT_SECRET,N5_SUPPORT_CONTACT_EMAIL. Test capture is /tmp private0600 O_NOFOLLOW JSONL {to,url,purpose}, never public API or token logs. Runtime NODE_ENV uses const process.env alias; wiring guard follows const aliases but rejects dynamic keys. Full production-bundle runtime smoke remains root-owned.

Reuse: N1 n3-proof.ts/password-reset.ts patterns adapted; audited N3 guards/scenarios; N6b metrics.ts membership/query pattern without role grants; N5 existing auth/credits remain authority. Donors read with git show at baseline, no clone. N7 Nodemailer donor is experiment-only, not production SMTP. Verified Nodemailer10.2.1 via npm and https://nodemailer.com/smtp plus current installed source. npm audit lists9 preexisting Next/Vitest/Vite/Zod graph advisories; new Nodemailer has none. No unrelated upgrade.

Remaining feature work and next executor: root integrates71402216 + be9073a99c86c19364f2feea974e7f0f01b5734d, then complete integrated typecheck/lint/full regression/full Next build, independent fresh-context review and browser360px/desktop acceptance. This completed backend unit is not overall feature acceptance. No production deployment, real outbound mail, paid calls, new subscriptions/containers/public DB ports. Shared owner DB stays privileged; no RLS/RCE isolation claim. Remote Libredesk10h lifetime/global erase and real RF mailbox delivery remain unqualified.

Changed files (42), all assigned backend ownership:
- `projects/05-podcast-clips-opus/.env.example`
- `projects/05-podcast-clips-opus/apps/web/package.json`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/admin/support/accounts/[accountId]/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/admin/support/accounts/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/admin/support/search/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/auth/email/confirm/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/auth/email/send/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/auth/forgot/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/auth/reset/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/support/context/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/app/api/support/session/route.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/environment.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/erasure.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/retention.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/support/boundary.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/support/context.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/support/email-handler.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/support/mail.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/support/page-state.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/support/routes.ts`
- `projects/05-podcast-clips-opus/apps/web/src/server/support/widget.ts`
- `projects/05-podcast-clips-opus/docker-compose.yml`
- `projects/05-podcast-clips-opus/package-lock.json`
- `projects/05-podcast-clips-opus/package.json`
- `projects/05-podcast-clips-opus/packages/db/migrations/023_support_access.sql`
- `projects/05-podcast-clips-opus/packages/db/src/credits.ts`
- `projects/05-podcast-clips-opus/packages/db/src/index.ts`
- `projects/05-podcast-clips-opus/packages/db/src/ops-support-operator.ts`
- `projects/05-podcast-clips-opus/packages/db/src/support-admin.ts`
- `projects/05-podcast-clips-opus/packages/db/src/support-email.ts`
- `projects/05-podcast-clips-opus/packages/shared/src/config.ts`
- `projects/05-podcast-clips-opus/packages/shared/src/support-config.ts`
- `projects/05-podcast-clips-opus/scripts/check-env-wiring.mjs`
- `projects/05-podcast-clips-opus/scripts/test-support-backend-mutations.mjs`
- `projects/05-podcast-clips-opus/tests/database.integration.test.ts`
- `projects/05-podcast-clips-opus/tests/fixtures/environment.ts`
- `projects/05-podcast-clips-opus/tests/support-backend-boundary.test.ts`
- `projects/05-podcast-clips-opus/tests/support-backend-environment.test.ts`
- `projects/05-podcast-clips-opus/tests/support-backend-page-state.test.ts`
- `projects/05-podcast-clips-opus/tests/support-email-handler.test.ts`
- `projects/05-podcast-clips-opus/tests/support-email.integration.test.ts`
- `projects/05-podcast-clips-opus/tests/support-mail-tls.test.ts`

endStatus: completed
Status: completed
