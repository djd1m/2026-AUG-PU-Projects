# N8 F07 I4a bounded writer receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i4a
Attempt-ID: replicate-i4a-1
Source-Revision: 64d640622444fe944ac61468ba9820a31f3907ac
Build-Revision: null (no deployed/runtime build; Node ESM syntax checked)
Launch-SHA256: 6f414f363eefdc2f3030316a12ad1ed3223f59eecac57a95b0b883a2ce3cf244
Trace-Path: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i4a-receipt.md
Trace-Prelaunch-State: absent
Started-At: 2026-10-03T09:33:07.654144Z
Finished-At: 2026-10-03T09:52:07.712045+00:00
Verdict: implementation_ready_for_runtime_review

Profile: compact-quality-first-v2; substantive XL retained from accepted F07 plan and I4 slice contract. Requested model/effort gpt-6.1-sol/high; actual model/effort=null, usage=null, cost=null until host attestation. No delegation/model switch/fallback executed or claimed. Writer wall duration 1140.058s, including reading/implementation/test authorship/checks/handoff. Active duration and time to independently accepted result=null. Hard budget1500s; soft freeze+receipt target1350s; lateness=false.

## Delivered bounded implementation

Submission-aware lifecycle precedes generic local retry and uses account/job/submission locks with fresh post-lock DB time. Known hosted identity reclaims one original consumed ticket/attempt/deadline under a new job fence/capped lease; no capacity/ticket allocation. Unknown submitting after crash becomes ambiguous/unresolved and locally failed with one unique release. Known provider failed/canceled/aborted, quarantine and binding/input mismatch fail closed. Current deadlines terminate even after lease loss; old job fence cannot terminalize the new owner. Post-CAS hold preserves the bounded private attempt/recovery; I1 pre-CAS hold denial remains.

Deletion tombstones input/job, fences, produces owner404 and one release, sets needed/unresolved markers and retains cleanup-only late I1 identity. Existing unique release code is reused in the caller transaction; no spend/counter/ticket decrement or second financial adapter. Worker-only workerContext and finalAuthorize expose original trusted remaining time/identity/current ownership and perform the final account→job→submission→envelope check; stale/revoked/exception yields literal false. Existing complete denies local evidence for any hosted submission until the accepted I5 branch exists.

Four frozen product/test files (project-relative):

- web/jobs.js:357lines — authoritative hosted lifecycle and existing local compatibility.
- web/provider-submissions.js:243lines — additive worker context/finalAuthorize collaborators only.
- tests/replicate-lifecycle.integration.test.js:301lines —15 nested real-PG scenarios authored, not executed here.
- tests/replicate.integration.test.js:344lines — only pre007 old-schema seed compatibility plus pure helper imports.

Snapshot-SHA256: 370b1cf3f98d66ae49e0e23ee462b803eb4146f198dd336ad9238aad01c73afe
Exact file map/digests, accepted five role-doc and API/closure digests, tracked diff digest, protected I1–I3 hashes and protected assertions: docs/telemetry/n8-20261002-1740/replicate-i4a-snapshot.json.
Handback: docs/features/f07-replicate/i4a-implementation.md (exact APIs, I4b create versus GET-only recovery, cleanup markers, I5 evidence requirements and PG commands).

## Checks and honest remaining gates

Node22.20.0 via /tmp/n8-node22: jobs unit5/5 exit0; provider unit2/2 exit0; generation13/13 exit0. Related jobs/provider units reran5/5 and2/2 after final guard edits; unchanged generation was not repeated. ESM/static syntax build (scripts/check.js), all changed/new JS syntax and git diff --check exit0. Exact owned/protected-path and existing I1 compatibility source guard exit0. Failed executed check history: none. Command/exits/counts and repetitions are recorded in replicate-i4a-checks.json; final jobs/provider TAP logs retained.

The source guard compares the existing I1 authority module after removing only additive methods to the baseline byte-for-byte. It compares the I1 suite from exact before/after legacy migration evidence assertions through the final case byte-for-byte. I2/I3 transport/media/test files and007/schema/migration/local worker/quality files remain source-identical. All four code/test files stay below500lines. Pre-existing read-only node_modules symlink remains untracked and untouched.

Real PG16 lifecycle, I1 regression/migration proof and existing jobs integration remain **pending coordinator execution** with dedicated TEST_DATABASE_URL and suite-specific N8_TEST_DB_OWNERSHIP. Authored PG tests exercise production methods and real pg_stat_activity barriers, never mocked SQL. Independent Astra/high review is pending. Unit/syntax green is not PG acceptance. No provider, real-quality, MVP, whole-F07 or deployment pass is claimed.

Next responsible executor: parent coordinator, after checking this snapshot, runs the three handback PG commands in the authorized dedicated Node22/PG16 environment, then assigns fresh independent review and only specific corrections. The writer launched no background continuation/runtime/reviewer. Later hosted evidence completion, HTTP worker wiring, remote cleanup execution, full mutation/regression/browser, actual corpus/performance and separately authorized paid pilot remain later gates. Current live spend authorization0 remains unchanged.

No commit/push/run-events/global configuration/network/provider/Docker/install/listener/migration/schema/evidence/public/auth/payment/transport/media change was performed. Existing approved source/evidence was not cleaned.

Status: completed
