# F13 independent review — review-1

Verdict: **ACCEPT_WITH_CAVEATS** for the bounded source review. No concrete correctness or authorization defect requiring a code change was found. This is not feature delivery acceptance: pending mandatory runtime and browser gates remain blocking for delivery.

Run-ID: 20261003T031332Z-studio-subaccounts  
Work-Unit-ID: studio-subaccounts-review  
Attempt-ID: review-1  
Source-Revision: 362e8f4f3d341023751b085e3b32c82b59acb053  
Build-Revision: none  
Launch-SHA256: c3f8c1d00ce0c5b82d97f4dbd3ab327889092825d3e24ce5c2206158412dfa4f  
Snapshot-SHA256: 38cca51076dc9b4bbfbd1b35209e47005233e228aa0766f5d6b14fa3f87eed8a

## Independent obligations established first

Before reading the implementation plan, source, tests or author report, read the root/project instructions and canonical Specification FR-n6b-13 / SC-US-013-1..3, FR-n6b-11 / SC-US-011-2, Pseudocode Studio sub-account / Badge click and referral, Architecture authorization and account model, ADR-008, and Refinement concurrency/family boundaries. Derived obligations:

1. Only a root studio session may create a client; an owner or nested studio must receive 403. Child creation explicitly sets owner/free, null credentials, the authenticated parent and studio access. It must not create an impersonated child session.
2. At most five attached children, including inaccessible attached children: eligibility, count and insertion must serialize with competing creation. Sixth creation returns the specified 409 message; failures cannot leave partial rows.
3. Selecting a child must enable useful bot construction and return to the studio account. Selection is untrusted input; tenant identity stays the session actor. Existing RLS must reject foreign, sibling, revoked and detached access on subsequent operations.
4. Bot, site/PDF, file, job, document, chunk, logs and account-scoped quotas belong to the child. A studio plan must not grant the child paid entitlements. ADR-008 precludes moving bot ownership to implement selection.
5. Cookie-derived referral attribution must be server validated and exclude the studio and its children even without studio access. Family classification must remain coherent through commit when membership changes; source-bot existence and deterministic lock ordering matter.
6. Existing owner/public flows and schema/RLS/grants must remain intact. Static correctness, test execution and actual browser acceptance are separate claims.

## Source identity and scope

Read-only SHA256 verification matched **22/22 exact file digests** in `tests/artifacts/studio-subaccounts/implementation-source-hashes.json`; recomputing sorted compact JSON of its files map produced the snapshot above. HEAD and exact launch-file digest match the assigned values. Git inspection showed no migration or `tenant.ts` changes. Review covered every changed production file, new/changed tests and cap mutation script, plus the unchanged RLS, tenant transaction, PDF, job, worker ownership and answer seams. No N6 donor, network, Docker, ports, tests/probes, product edits, commits, child agents or global configuration were used.

## Findings and evidence

Confirmed severity findings: blocker 0, high 0, medium 0, low 0. These counts describe this bounded review, not proof that no undiscovered defects exist.

| Obligation / plan mapping | Source assessment and test oracle |
| --- | --- |
| Root authority and cap, STU-01/02 | `apps/web/src/server/studio-handler.ts` checks Origin before session authentication, bounds any body before creation, ignores body authority and reads only the validated referral cookie. `packages/db/src/studio.ts:9` uses one service transaction; after referral account locks it locks/rereads the studio, checks kind/parent, counts all attached children and inserts only below five. Null child credentials and absence of session creation are explicit. The six creation/referral PG cases assert statuses, row defaults, session identity, eight concurrent requests, rollback and eligibility changes after observable lock waits. |
| Selected account and actor RLS, STU-03/05 | `packages/db/src/studio.ts:34`, cabinet page and bot handler keep actor and selected owner distinct. Context comes from tenant-visible account rows; bot insertion independently revalidates target visibility inside its tenant transaction. Selected lists filter by owner without replacing the actor. Existing RLS computes visibility from parent plus studio_access. Tests use `n6b_app_tenant`, not the fixture owner, for cabinet operations and reject direct bot/job UUID operations after revocation/detachment and from foreign/ordinary/sibling actors. |
| Actual ownership and entitlements, STU-04 | Bot creation writes target ownership to bot/source/job. Existing site/PDF helpers derive ownership from the RLS-visible bot, including PDF plan lookup from the child's account. Ask lookup and publication drop the redundant actor-equals-owner predicate while retaining tenant RLS. Sandbox quota now uses `bot.accountId`; answer and model logs already use that owner. Existing worker lease, site/PDF document writers and chunk embedding propagate `job.accountId`. Workflow tests assert child rows, Free PDF cap despite studio plan, child quota exhaustion, publication/demo identity and no provider calls on denied access. |
| Family attribution, STU-06 | `packages/db/src/referral.ts:11` retains bot KEY SHARE, locks actor/source accounts in UUID order with NO KEY UPDATE, then rereads parent membership. The surrounding creation transaction holds locks through insertion commit. No studio_access condition weakens family exclusion. A preceding membership update is seen after waiting; a following update must wait until creation commits. Four PG cases establish those before/after orders with actual lock waits and an insertion barrier; another checks reciprocal studio referrals. Ordinary registration/click callers without a studio retain the prior resolver path. |
| UI and regression, STU-03/07/08 | Cabinet selection is explicit in the query, creation navigates to the returned child, and the own-account link returns to the root. Bot-ID operations preserve existing handlers. New unit tests cover request shaping and error responses, not browser execution. Mandatory actual browser acceptance remains pending. |

No exception to the existing authorization matrix, schema, roles or grants is needed. Creation holds DB connections only for DB operations; request body parsing and external validation are outside creation locks. Pool acquisition retains the existing 10-connection/5-second bounds. The future F14 handover must preserve compatible account lock ordering; this review does not accept an unimplemented handover path.

## Test and artifact assessment

Saved implementation artifacts show typecheck exit 0 and **94 focused tests passed** (55 + 39 across twelve files). Read the raw logs and check record; these tests were not rerun by this reviewer.

The saved Origin mutation is meaningful: disabling rejection makes the fixed `studio-handler.test.ts:24` expectation fail with **201 instead of 403**, one failed/four passed. After exact-byte restoration the same five tests pass. The original/restored hash equals the frozen handler hash. This is an assertion failure, not a setup failure.

The cap mutation script checks frozen hashes, changes only cap 5 to 500, runs the fixed real-PG eight-request test, restores exact bytes in `finally`, and reruns the same test. Its oracle requires five 201, three exact-message 409 and five committed rows; the mutation should violate the first assertion. The script checks exit statuses, so the coordinator must still inspect the saved red log for that intended assertion rather than credit any unrelated exit 1. No cap execution is claimed here.

The fourteen new PG cases use real service authentication and restricted tenant connections, with owner connections only for fixture provisioning, observations and controlled changes. Four membership races and both eligibility races use observed PostgreSQL lock waits. Reciprocal referral coverage uses concurrent requests; the stable SQL lock ordering also supports the deadlock assessment. Document/chunk rows in the new workflow test are explicitly seeded under tenant RLS: that test does not itself run the worker. The existing worker ownership implementation was inspected separately; full worker regression is a coordinator gate.

At the last artifact observation, `final-full-regression.txt` was still progressing through integration tests. Partial logs are not a terminal all-suite pass. Full unit/PG outcomes, real-PG cap mutation, application production build and source/image-bound actual Docker UI at 1440/390 must be reconciled by the coordinator. UI must demonstrate create/select/build/publish/back/reload, refusals, no overflow and no JS errors. No UI acceptance or release is claimed. Reviewer E2E preflight is `not_applicable`: this assignment expressly prohibits runtime execution and assigns E2E to the coordinator.

## Handoff and measurements

Profile: `compact-quality-first-v2`, substantive tier M; saved implementation route is mechanical M. Review used one independent executor and stayed within the 480-second inclusive budget. Requested reviewer model/effort: `gpt-6-astra` / medium. Native reviewer actual model/effort and usage are not exposed here: null, pending coordinator reconciliation. No model switch or fallback was performed by this executor. The implementation native receipt reports actual `gpt-6.1-sol` / high; that metadata does not establish this reviewer's actual model.

Reviewer tokens, cached tokens and cost: null (no authoritative attempt-exclusive counters). Active time: null (no interval accounting). No savings claim. Coordinator owns run/events/work-record and native reconciliation at `docs/telemetry/p-replicator/20261003T031332Z-studio-subaccounts/`; this reviewer writes only this review report. CLI `-o` is responsible for the final substantive receipt at `evidence/review-1-receipt.md`; TRACE is not manually written.

Report-Written-At: 2026-10-03T03:47:04.558935+00:00  
Elapsed launch-to-report seconds: 254.381. Final receipt timestamp includes remaining handoff time.
