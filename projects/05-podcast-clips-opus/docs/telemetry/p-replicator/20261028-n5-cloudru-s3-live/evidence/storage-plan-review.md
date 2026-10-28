# Independent N5 S3 deployment-plan review

RUN_ID: 20261028-n5-cloudru-s3-live
WORK_UNIT_ID: s3-deployment-plan-review
Source: /tmp/n5-acquisition-analytics-20261026
Source-Revision: cc6e66e57bd47e7a403612a4964dae059da66195
Plan: /tmp/n5-s3-deploy-plan-20261028.md
Plan-SHA256: 8921b006344603b8a8b5e44ab6ffc4f8c0cf3fd1c4334236abd40e41538a7aa9
Planner-Launch-SHA256: 60cc87b7a6cd9ca99fecc21bc67f0fb048190fa0aeac8bd1962f88a7fa7217f5
Verdict: changes_required_before_production_cutover

The plan is suitable for bounded S3 qualification and inventory. It is not yet a launch-ready production rollout. No production state, bucket, credentials, containers, paid models or git state was changed. No coder logs/reports/chat history were consulted.

## Blocking findings and smallest corrections

1. **HIGH — AC4 mandates unrelated 022/023 before choosing a minimal rollout, but the exact XL checkpoint is unresolved.** Plan lines18,24,40–42 prescribe the full candidate compiled migrator. This migrator applies every missing SQL file in one transaction; there is no storage-only selector. SQL022 actually backfills succeeded payment_intent.fulfilled_at, adds immutable-offer and video-policy triggers and ledger schema. SQL023 adds support schema. N5_BILLING_MODE=legacy avoids credit opt-in, but does not avoid those production mutations. Current source register unconditionally inserts account.billing_policy (apps/web/src/server/auth-store.ts:16); simply skipping 022 while deploying this source is broken.

   Minimal correction: make a decision gate before candidate construction. First prefer a config-only S3 switch on the exact existing runtime if its installed S3 implementation passes the same smoke suite and its env/compose can be overlaid without adopting current billing/support code. This needs no 022/023. Record exact existing image IDs, entrypoints and storage implementation identity; host source SHA alone does not identify old runtime. This branch completes storage only. It cannot claim Yandex/Cloud.ru model acceptance unless the existing runtime already contains those provider adapters. Otherwise a narrow provider+storage candidate against the old DB contract is possible only after dependency/schema audit and required checks; it is a separate source-bound candidate, not copying current dist into old images. If selecting the full current candidate, identify existing owner approval that explicitly covers the 022/023 effects and plan version. If none covers them, XL rule requires the plan checkpoint before running the migrator. Do not ask again if adequate approval already exists. 023 alone is L/schema; it is bundled here with XL022. There is no need to approve or perform account credit migration or enable billing/support to connect S3.

2. **HIGH — final acceptance can pass a >200s recording while the applicable long-file gate remains pending.** AC5 and sectionD explicitly leave real long-file acceptance separate; project CLAUDE requires real long-file acceptance in the new environment and docs/REPRODUCE.md §8 specifies a 60–90 minute recording with two participants. Crossing the 180s chunk boundary is useful provider smoke, but it is not that gate. Minimal correction: make >200s an intermediate smoke and retain 60–90 minute actual media acceptance as mandatory before declaring full rollout accepted, or obtain an explicit owner scope override. Budget disk and spend before that job; do not declare success with mandatory accepted-scope evidence pending.

3. **MEDIUM — old-interface logout is absent from the plan and its AC.** Current source already has SignOut in dashboard/layout.tsx and apps/web/src/app/support/SignOut.tsx, with server POST /api/auth/logout revoking the session and clearing the cookie. This proves current-source behavior only. A config-only storage switch retains the old UI. Minimal correction: add a before/after browser check of visible logout on the actual deployed interface, server-session revocation (a protected request must fail/redirect), and login again as the same retained account with existing media visible. If the old interface lacks the control, add a narrow existing-endpoint UI control or explicitly include the current SignOut in the reviewed candidate. Do not build a second logout API or deploy unrelated support features. Clearing only browser cookies does not establish server logout. This is required before final UI acceptance, not before scratch S3 smoke.

## Checks that are sound and should remain

- Media/user safety: drain all app writers before cutover; preserve PostgreSQL, Redis, MinIO, work/spend volumes; inventory source, clip, thumbnail and showcase keys, copy exact keys plus metadata and verify bytes. Keep old storage untouched. Plan forbids automatic DB restore and identifies the two-storage rollback problem after new jobs. These provisions are appropriate. Full DB backup restore verification is still operational evidence, not established by reading the plan.
- Disk: 3254321152 minus2147483648 leaves1106837504 bytes. An unbounded local npm/Docker build is correctly blocked. No prune or arbitrary cache deletion is authorized. Before any launch root must show a concrete sum for backup, image-transfer/load delta, source download, decoded/chunk audio, render intermediates and browser download, including concurrency, plus the floor. A low-water sampler alone cannot prevent exhaustion. An externally built artifact is only an option if an already authorized environment and transfer capacity exist, not an instruction to buy access.
- S3 smoke: production SDK, real browser signed multipart PUT/ETag, complete/list/abort, hash/Range/download disposition, conditional publication/412 and contract metadata, anonymous/expired denial are materially correct. Use unique scratch keys for every attempt and clean only exact created keys/upload IDs. Existing package SDK helpers do not all expose raw HTTP status/headers; a small driver must inspect actual responses for206/Content-Range/ETag/412 instead of inferring them from successful helper return. No new engine is needed.
- CORS/security: preserve rules; exact origin and requested headers; ETag exposure; no ACL/public policy/lifecycle changes. CORS is browser access control, not object authorization; unsigned GET denial and server-controlled keys remain separate checks. Runtime key does not need bucket CORS/versioning/lifecycle administration. Read denial for those management APIs can be resolved with owner-provided evidence and must not be confused with failure of application object operations.

## Review scope and remaining operational evidence

Read-only source review only. HEAD and plan SHA matched the assigned immutable identities. Actual runtime image contents, schema state, available disk, object inventory, bucket capabilities, live UI, credentials presence and spend authorization were not independently inspected here. Planner numbers are plan inputs, not fresh reviewer measurements. Source reads were limited to applicable instructions, migrator/022/023, compose/shared config, S3 implementation, render storage and logout/auth stores. E2E preflight is not_applicable: no E2E was launched.

Profile: model-routing-econom. Requested model/effort: gpt-6.1-sol/high per coordinator. Actual model/effort: null (no host execution metadata supplied). Tokens/cost/active duration: null; no fabricated measurements or savings claim. Independent reviewer is distinct from planner/coder. Six-minute attempt budget; exact elapsed measurement unavailable because no launch clock timestamp was supplied/recorded.

Next owner: root coordinator. Next allowed step: resolve findings through a narrow plan amendment, then run existing authorized S3 smoke/inventory; do not deploy full schema/candidate until its checkpoint and disk/artifact gates are satisfied. The overall task remains with root.

Finished-At: 2026-10-28T06:55:15.501123+00:00
Status: completed
