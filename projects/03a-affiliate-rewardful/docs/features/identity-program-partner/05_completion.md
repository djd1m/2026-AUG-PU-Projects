# Identity, program and partner — completion

Accepted implementation slice: all11 ACs met, mandatory checks passed and final independent review delivered. Feature canonical path: `docs/features/identity-program-partner/`; five role files map exactly to `01_specification.md`, `02_pseudocode.md`, `03_architecture.md`, `04_refinement.md`, `05_completion.md`.

## Completion criteria

The feature is accepted only after all 11 local ACs have executed evidence, mandatory regression/typecheck/build/integration/browser/mutation gates pass, and independent REVIEW has no unresolved blocker/high issue. VALIDATE and REVIEW reports bind exact specification/source revisions. Complete code is not permission to claim actual identity verification, production deployment, active N1 integration or monetary outcomes.

| Check | Required evidence | Current status |
|---|---|---|
| PLAN |five substantive role documents, exact machine-key/scenario coverage, donor compatibility/ownership decisions |passed: five documents and validation-report.md |
| VALIDATE |independent semantic review, terms/trust/atomicity/replay/admission/ownership challenge, source hashes |passed: validation and integrated verification recorded |
| IMPLEMENT |11 AC executable evidence, full foundation regression, source/build receipts |passed: validation and integrated verification recorded |
| REVIEW |independent code/security review, confirmed fixes and retests, targeted killed mutations |passed: final independent review-report.md |
| Browser |real secure-cookie onboarding with disposable DB at4 widths, persisted data and honest inactive state |passed:55 checks,8 screenshots and served-image source hashes |
| Operational bootstrap |reviewed real identity and N1-owner authority, separate provisioning credential, private manual delivery |not executed; no real user created |
| N1 activation |actual bridge/connection/cutover/reconciliation readiness in later feature |intentionally unavailable; activation must deny |

No blanket final-product readiness is inferred from this slice. D7/platform lead choice remains pending and independent. N1/YooKassa and manual transfers on the5th remain governing product decisions; this slice does not send money or messages.

## Implementation handoff order

1. Coordinator integrates these five docs and donor report, runs exact role/scenario gates and independent validation. Existing XL continuation is authorized; do not request the same plan approval again.
2. Freeze core DTO/error exports from architecture. Core writer owns domain/DB/SQL/bootstrap and test scope in its worktree; coordinator owns HTTP/UI/shared manifests/runtime/test harness. New source must adapt compatible actual donor helper code with provenance, not substitute untracked rewrites when a suitable block exists.
3. Implement new migrations and typed service producer/consumer contract. Do not modify applied001/002 bytes. Root updates exports and harness once; do not run two writers in one worktree or allow children to edit shared package manifests.
4. Integrate only after regular non-symlink substantive post-launch terminal receipts include owned source SHA and tests. Validate each receipt before cherry-picking; narrative completion is not evidence.
5. Run required full checks on the integrated source, independent REVIEW, fix findings and retest affected plus mandatory regression. Update lifecycle/current feature/roadmap and reports only to the actually achieved state.

## Safe operational bootstrap contract

Command is implemented/tested without running on a real pilot identity. Deployment operator later supplies a request UUID, program name/slug/RUB, explicit owner identity, actor reference, reviewed identity evidence reference/hash, reviewed N1-owner authority reference/hash and grant expiry≤72h. No mail/API lookup is promised. The issuer verifies identity and authority outside N3a and delivers the single-use secret through an established private channel; possession plus the matching identity is the pilot enrollment mechanism.

Web never receives migration/provisioning credentials. Bootstrap and web share the same stable IDENTITY_SECRET through the secret mechanism so normalized identities match; session-key rotation does not change identity hashes or enrollment-token lookup. Bootstrap creates draft owner_id null and grant only; the human chooses a password and accepts using the normal UI. If a user already exists, login/bind preserves its password. Returned secret is written to a new restrictive mode0600 non-symlink file, not stdout/command line/env logs/URL. Command arguments contain no password/grant; sensitive identity/evidence input should come from a restricted input file/stdin, with only safe IDs in output. Do not add it to automated container startup or seed it with demo identity.

Bootstrap checks the receipt before opening the handoff file; retries with same request/hash return IDs without token redisclosure even when the original output file exists, and conflict denies. A committed grant whose handoff failed uses the same offline command in explicit reissue mode with a new request ID, predecessor grant, same program and reviewed evidence. It locks pilot→program→predecessor, checks the nonrevoked unused current receipt-chain tip and ownerless program after locks, and atomically revokes the unused predecessor and records a linked replacement receipt; an established owner or consumed predecessor denies recovery. This is never implicit rotation, ownership transfer or a second pilot program. Routine implementation uses only disposable synthetic fixtures. No account ownership is asserted from an unverified email string or sample evidence hash.

## Runtime configuration and operations

Keep existing `DATABASE_URL`/`SESSION_SECRET` startup checks and fixed cookie attributes. Add explicit `APP_ORIGIN` and separately persistent `IDENTITY_SECRET`/`ADMISSION_SECRET` validation through root-owned runtime config/startup; missing/malformed values fail closed at runtime while offline build remains possible. DB private, no host publication, isolated namespace/network/volume and fresh project secrets. Reuse neither donor credentials nor a previous project's production permissions.

Track safe counts of auth/admission denials, overload/unavailable, enrollment conflicts, expired grants and pending draft setup; never log token/identity/evidence contents. Rate counters are fixed rows and survive restart; global/source windows use database time, changing ADMISSION_SECRET is an explicit rotation event rather than ordinary restart. KDF queue bounds and pool limits remain foundation values. Expired unconsumed grants deny without a required cleanup job; retention policy for identity/audit/terms is unresolved for production and must not be implemented as silent history deletion.

Private responses use no-store; terms are plain text and hashable. Owner invitation token is displayed once and can be copied manually; issuing it sends no notification. Membership grants are current server state, not a cookie role. Revocation takes effect on subsequent authorized reads/mutations. Existing grant replay cannot restore suspended/revoked access. No owner transfer, password reset, self-service public registration or email-verification dashboard is hidden in onboarding.

## Rollback and next feature boundaries

Roll forward migrations only; app rollback must not remove Users/Membership/terms/consent/history or restore revoked grant state. If new routes fail, remove their ingress/navigation and retain database facts; do not reset the database or grant app broad writes as a workaround. Unknown commit outcomes use stable identifiers and existing replay checks. Backups preserve current access and append-only history; a later production restore still follows project RecoveryGate/financial gates once those modules exist.

Next bounded integration feature reads these immutable policy/eligibility contracts, implements actual N1 registration/outbox/cutover and readiness checks, then enables draft→active atomically with calendar locking. No current `ready=true` config switch bypasses that work. Partner assets issued now remain marked inactive until that verified state transition; no referral redirect/tracking route is implied by displaying a future link. Financial ledger, version-frozen attribution, taxes/manual registry, business dashboards, external test-store acceptance and D7 remain distinct unfinished product work.

## Telemetry and final reporting

RUN_ID `20260909T211734Z-identity-program-partner`; PLAN WORK_UNIT_ID `identity-plan`; coordinator prelaunch/run events are authoritative. Planner receipt: `docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/identity-plan.md`.

Report profile `compact-quality-first-v2`, requested versus host-attested actual model/effort, checks actually executed, source SHA, measured elapsed/active where available, tokens/cost or null with cause, repeats/fallback and telemetry gaps. Model choice in prose does not attest execution. Unknown usage is not0 and no baseline means savings unestablished. Plan completion is only a completed PLAN attempt, never accepted implementation or production readiness.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-identity-program-partner-1 | packages/db/tests/onboarding-enrollment.integration.test.ts | offline bootstrap creates no user/session, replays receipt before opening output and rejects changed evidence/app authority |
| AC-identity-program-partner-2 | packages/db/tests/onboarding-enrollment.integration.test.ts | two simultaneous normalized registrations create one identity/session and no membership or credential overwrite |
| AC-identity-program-partner-3 | apps/web/tests/onboarding-http-routes.test.ts | AC3 logout clears only after durable revocation and outage preserves explicit failure |
| AC-identity-program-partner-4 | packages/db/tests/onboarding-enrollment.integration.test.ts | operator grant scope ceiling and revoked membership replay cannot restore authority |
| AC-identity-program-partner-5 | packages/db/tests/onboarding-policy.integration.test.ts | expected version races insert one immutable version and activation is always closed |
| AC-identity-program-partner-6 | packages/db/tests/onboarding-partner.integration.test.ts | every coupled acceptance write rolls back and leaves the invitation usable |
| AC-identity-program-partner-7 | packages/db/tests/onboarding-partner.integration.test.ts | existing identity adds a second program membership only after binding and consent; old credentials and membership survive |
| AC-identity-program-partner-8 | packages/db/tests/onboarding-partner.integration.test.ts | suspension denies portal/replay, reactivation restores read only and preserves separately revoked asset/history |
| AC-identity-program-partner-9 | packages/db/tests/onboarding-process.integration.test.ts | separate processes share source/identity limits and replacement processes preserve durable windows |
| AC-identity-program-partner-10 | packages/db/tests/onboarding-roles.integration.test.ts | actual app has no table reads/DML or internal/bootstrap functions; all published functions fixed search path and PUBLIC denied |
| AC-identity-program-partner-11 | tests/onboarding-browser.py | PASS real browser onboarding journey |

## Integrated evidence and limits

The table names one executable anchor per AC; the full scenario set also includes all onboarding, foundation, HTTP/DOM and process suites. Current integrated evidence:46 unit tests,44 PostgreSQL/workspace tests,30 killed mutations including the ingress isolation guard,55 real Firefox checks,8 screenshots. Evidence folder: `docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/`. Final infrastructure regression passed in namespace n3a-foundation-4105e617819b; independent final review passed with11/11 ACs met and no unresolved blocker/high/medium.

Browser-only diagnostic runner reused the exact harness-created namespace and built image;77 application/DB source hashes match the image. `image-proof.json` records actual image and served build IDs; browser report's local BUILD_ID is the separate workspace build, not the served image. `log-check.json` verifies11 synthetic identity/credential/runtime values are absent from actual web logs; raw logs/secrets were not published.

Runtime correction: web uses its own `ingress` bridge in addition to the internal `private` network, with127.0.0.1-only port publication. DB and test containers remain exclusively private and DB has no published ports. The initial internal-only web network configured a port binding but Docker did not publish it (`NetworkSettings.Ports` null); real host navigation reproduced failure. No host-global Docker/network changes or donor services were used.

Luna audit identified minor UX consistency follow-ups: ASCII passwords over200 characters and terms above16KiB can reach server validation and receive a generic input error. Server bounds are enforced; no bypass or acceptance waiver is claimed. All-program membership locking is unbenchmarked at large membership counts; no production latency/capacity claim.
