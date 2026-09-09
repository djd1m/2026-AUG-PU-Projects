# Core implementation receipt

RUN_ID: 20260908T204432Z-go-shared-core
WORK_UNIT_ID: core-implementation
TRACE_PATH: /tmp/n3-core-implementation.md
Source base: 65e87f7
Commit: 90e23e114311b30330362b144526a8a9dc2a4b90
Branch: codex/n3-shared-core
Worktree: /tmp/n3-shared-core-work
Project: /tmp/n3-shared-core-work/projects/03-affiliate-rewardful
Profile: compact-quality-first-v2, XL, upstream plan/validation passed.
Requested model: gpt-6-astra, high.
Actual model/effort: null; execution metadata not exposed to this worker.
Input/output/cached/reasoning tokens: null; usage metadata unavailable.
Cost: null; cost_basis=unavailable. No savings claim or baseline.
Started: 2026-09-08T20:58:38Z
Implementation delivered: 2026-09-08T21:32:47Z
Elapsed worker wall: 2049000 ms, including waiting for parent-owned database verification.
Active wall / infrastructure wait breakdown: null, intervals not completely measured.
Delegation: none. No model fallback performed. No Docker container/network/port was created by this worker.

## Delivery scope and verification boundary

The bounded implementation and tests are complete and committed, with a clean worktree. This receipt authorizes consumption of the implementation candidate. It does **not** assert the whole shared feature or PostgreSQL integration gate is accepted. The assignment allocates Docker setup and container test invocation to the parent. Mandatory container integration and mutation results are still pending from that runner; no success has been invented. Parent must run them, fix any resulting failures, and perform integrated build/review before feature completion.

Local checks actually run:

- `npm ci --ignore-scripts`: passed; 15 packages installed, audit reports 0 vulnerabilities.
- `node --test tests/core-domain.test.mjs`: 2 passed, 0 failed, 0 skipped.
- Every owned module parsed with `node --check`; under-500-line check passed.
- Parent's current `scripts/build.mjs` checker executed against this isolated project by overriding its source root in an ephemeral data-module invocation: passed, 20 modules, no functional variant entries. This is an available-source import/syntax/boundary build check, not the integrated product build.
- `git diff --cached --check`: passed before commit.
- Deliberate unavailable-environment check: `node tests/core-access.test.mjs` without DB secret exited 1, four `DATABASE_SECRET_REQUIRED` failures, zero skips. `databaseConfig()` independently returned safe code/status/message (503). These are expected negative checks, not a passing integration suite.

Still required in parent-owned backend container:

```sh
node --test tests/core*.test.mjs
node tests/helpers/core-mutation-runner.mjs
```

There are 27 authored core tests, containing all 25 exact shared SC IDs plus credit, strict-schema, expiry, and lifecycle checks. All integration fixtures create a distinct `n3_test_<uuid>` schema, use actual pg transactions, and drop that schema after their applications close. Missing DB/secret is a hard failure. The mutation runner first requires a passing targeted baseline, copies sources into its own `/tmp` directory, checks mutant syntax, requires a targeted failing result, emits source SHA/results, then removes its own copy. Mutants cover membership, duplicate business event, and stale source. The stale-draft scenario permits no redundant approval-null guard to hide unsafe stale approval.

## Frozen input checksums

Paths below relative to project:

- docs/runtime-contract.md: 0ff2e66a413947b8948b974bb53ad0d9c242008112ec4dfff7e7b0cead6fb6c2
- docs/features/shared-core/01_specification.md: c8c82349029c64fee16b09fcc0752fa75614b9bd6a15a5d3e6248572b570f387
- docs/features/shared-core/02_pseudocode.md: e0a91d3ffaf657a517970d40dde23d6d7a4eb5c1d602628645f54bbbd1fe641b
- docs/features/shared-core/03_architecture.md: ed5b5c93e7ddd80d43e8b2152b44d72ca5653fd632dfc2fd2b2d0b085460ccdd
- docs/features/shared-core/04_refinement.md: 3201dfe0691ae0eade72f2c619f630e2ae7f8a67032b6d9ab9b150a63a08ec99
- docs/features/shared-core/validation-report.md: 203f5f4f9be35d32a33b513f25445a13255bf08ca5dae6b399dd41133e227e40

Root/project CLAUDE, applicable local rules, runtime/Architecture, shared PRD and variant PRDs were read. No manifests, lockfiles, documentation, root telemetry, HTTP/UI/config/compose files were edited.

## Owned files in commit

- shared/application/access.mjs
- shared/application/dispatch.mjs
- shared/application/index.mjs
- shared/domain/common.mjs
- shared/domain/credits.mjs
- shared/domain/events.mjs
- shared/domain/projections.mjs
- shared/domain/registry.mjs
- shared/infrastructure/journal.mjs
- shared/infrastructure/postgres.mjs
- shared/infrastructure/schema.mjs
- shared/infrastructure/seed.mjs
- tests/core-access.test.mjs
- tests/core-credit.test.mjs
- tests/core-domain.test.mjs
- tests/core-events.test.mjs
- tests/core-grants.test.mjs
- tests/core-registry.test.mjs
- tests/helpers/core-fixture.mjs
- tests/helpers/core-mutation-runner.mjs

## Storage and invariants

PostgreSQL holds each tenant aggregate under `SELECT ... FOR UPDATE`, hashed opaque sessions, per-actor/action/key command results, an append-only financial fact journal, and a unique allocation table. Journal records cover policies, payments, refunds, ledger, registry revisions, approvals, transfers, per-obligation transfer facts, invoice, reservation originals/transitions/applications, enrollments, exceptions, reconciliations, and audit. Unique SQL business keys and immutable journal/sent-allocation triggers reinforce domain checks. State changes and idempotency result commit on one checked-out client; errors rollback. This deliberately uses a bounded tenant aggregate rather than one normalized table per domain entity, accepted by parent in coordination.

Financial source changes invalidate approvals and release only unsent allocations. Cached approve/export recheck the fresh approved revision. Sent facts remain immutable, including after refund. Reconciliation records actual historical CSV use and discrepancy without releasing sent obligations. Credit unknown holds its reservation; terminal outcome replays cannot apply/release twice. Own-target, grant scope, real/demo expiry and session membership precede cached returns; final rights are rechecked before publication. Tasks are persisted deterministic fixtures; business validation/conflict failures persist failed terminal state after reverting their draft changes. No LLM, provider, bank send, MCP/A2A wire implementation exists.

## Application API

```js
import { createApplication } from './shared/application/index.mjs';
const app = await createApplication({ database: pgConfig }); // N3_MODE=fixture required
const session = await app.createDemo({ variant: 'A', role: 'merchant' });
const context = { token: session.token, actorId: session.actorId };
const dashboard = await app.execute(context, 'dashboard', {});
const artifact = await app.execute(context, 'registry.prepare', { period: '2026-08' }, 'prepare-1');
const reference = { artifactId: artifact.artifactId, revision: artifact.revision, hash: artifact.hash };
await app.execute(context, 'registry.approve', reference, 'approve-1');
const exported = await app.execute(context, 'registry.export', reference, 'export-1');
await app.close();
```

`database` accepts a pg config object; `databaseUrl` string also supported. Otherwise pg env applies, with mandatory PGPASSWORD_FILE read (nondefault secret at least24 characters). Pool max4, connection3s, statement5s, lock2s. Validated test `schema` config propagates search_path to every connection. Optional trusted constructor inputs: mode='fixture', clock function returning epoch-ms/Date/ISO, maxDemoRuns (default200).

All errors expose `code`, `status`, safe `message`. `execute` arguments are context, action, input, key. Mutations require a nonempty key; reads do not. `grantId` must be absent or a nonempty string, never a falsy substitute for direct context.

Bootstrap shape: `{runId,token,actors:[{id,role,name,promoCode?}],actorId,clock,seedVersion,expiresAt,simulated:true}`. Default grants all four synthetic actor contexts for laboratory switching. `{limited:true}` restricts membership to the requested role's actor, for denied tests. Bootstrap strict fields are variant/role/limited.

Dashboard shape: `{actor,clock,seedVersion,sourceVersion,policy,policies,summary,partners,payments,refunds,ledger,registries,transfers,exceptions,reconciliations,reservations,grants,tasks,fixtureEvents,tariff,simulated}`. Summary minor-unit fields: accruedMinor, heldMinor, availableMinor, allocatedMinor, sentMinor, adjustmentMinor, dueDate. Partners include their own summary. Initial eligible August cash=60000, held=10000, fully refunded entry retained, customer credit30000 against invoice150000.

Registry shape: `{artifactId,id,revision,hash,sourceVersion,policyVersions,period,rows:[{partnerId,name,currency,amountMinor,obligationIds}],exclusions,amountMinor,currency,dueDate,preparedAt,status,approval,transfers,simulated}`. Initial draft version1, same-content optional artifactId preserves it; changed content appends version. Export returns `{artifactId,revision,hash,csv,filename,simulated}`. Sent requires reference plus partnerId/evidence/sentAt. Reconcile uses artifactId/revision/partnerId/amountMinor/evidence/sentAt, preserving historical revision.

Program read returns policy/version/policies/enrollment/enrollmentUrl/terms/payoutSchedule/branded. Save accepts exactly kind/bps/windowDays/holdDays/recurring. Enrollment requires consent:true and returns id/actorId/policyVersion/referralUrl/joinedAt. Share requires enrollment and returns own referralUrl/promoCode/disclosure/text/branded. Partner read returns own actor, summary, ledger, reduced payment history, policies, transfers and exceptions. Optional partnerId must match.

Credit read returns own actor/clock/sourceVersion/currency/heldMinor/availableMinor/reservedMinor/appliedMinor/adjustmentMinor/ledger/reservations/invoice/exceptions/explanation. Invoice has id/amountMinor/remainingMinor/reservedMinor/dueDate. Reserve accepts amountMinor/invoiceId and returns reservationId plus reservation fields. Fixture merchant resolves reservationId with success/failed/unknown. Optional customerId must match.

Grant create accepts actions array, expiresInSeconds1..3600 and optional artifactId restriction, returns grantId/id/actions/actorId/role/expiresAt/demoExpiresAt/revokedAt/scope. Revoke accepts grantId. Task create requires grant context and `{kind:'registry'|'partner'|'credit',input:{...}}`; returns taskId/id/state/result/usage:null/runner. Run/read/cancel use `{taskId}`. Completed registry task.result is the same persisted registry projection with artifactId/revision/hash; owner uses it directly for handoff.

Fixture event samples are on merchant dashboard.fixtureEvents.payment/refund. Payment accepts `{type:'payment',provider:'fixture',accountId,objectId,verified:true,status:'confirmed',customerId,beneficiaryId,kind:'cash'|'credit',amountMinor,paidAt,promo?:{code,beneficiaryId?,attributedAt},cookie?:{beneficiaryId,attributedAt}}`. Promo resolves the tenant actor promoCode and has priority; invalid explicit promo explains zero without fallback. Refund accepts `{type:'refund',provider:'fixture',accountId,objectId,paymentId:<provider-object-id>,verified:true,status:'confirmed',amountMinor,refundedAt}`. Unknown/unverified cannot claim business identity. Advance accepts `{days:nonnegative integer}`.

Status: completed
