# F7 integration — independent operational review

Reviewer family: codex
Spec revision: sha256:d3a3312c1f961101fa116247f1c918f29c4d0006c5d934932f1bf1b5ced5e161
RUN_ID: 20261013T220722Z-integration-47db
WORK_UNIT_ID: integration-review-1
Profile: compact-quality-first-v2; requested gpt-6-astra/high; host-confirmed actual model/effort unavailable.
**Verdict:** PASS — four integration criteria closed; final image9 source/performance binding completed; foundation relation-status finding independently closed below.

Scope: independent source and QE review of configuration, readiness, migrations,
storage/worker bounds and benchmark methodology. This is not another whole-product
review. Only this report, `tests/integration/operations.test.ts`, and this work unit's
fresh telemetry are reviewer-owned. No paid calls, service restarts or published DB ports.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-integration-1 | met | Final image9 `final-benchmark-4.json`: ten clients each have20 warm-up+100 measured GETs; all200 warm-up and1000 measured responses status200 with valid owner/list body and no error. Independent index/count and nearest-rank recomputation yields p95=40.804434ms≤500ms. Exact benchmark source SHA matches running image. |
| AC-integration-2 | met | Same receipt: immutable200-line fixture includes one unmatched element,50 warm-ups+1000 measured calculations; independent p95=8.007006ms≤100ms. Literal known subtotal67,090,000 minor, reserve6,709,000, total null. Exact driver reports1000 golden matches `e859e7593e7ec83599a7f41435ef6db7a337f0cb481a808626b9485629706aee`; source increments only on canonical equality. |
| AC-integration-3 | met | `restart-before-3.json` and `restart-after-3.json`: same final image9, ready200 and exact deep equality of2 projects,2 shells,1 design,3 budget snapshots,3 asset metadata rows and2 original-byte hashes after web+worker restart. Independent Docker inspection confirms both healthy, same image, named volumes, DB original creation2026-10-13T22:59:07Z and no published DB port; web127.0.0.1:3088 only. Prior actual role/migration/atomic-rollback evidence retained. |
| AC-integration-4 | met | Prior independent six operations tests and real non-root worker storage failure/recovery probe retained. All six corrected worker/health/config source hashes independently match both current host and final image9. Both deployed services healthy after restart. Failure/startup negatives remain the prior actual-source execution, with verified unchanged-source deployment continuity. |

## Findings and options

### F7-R1 — medium — CLOSED — measured fixture omitted unknown prices/costs

Original reviewed source: `tests/procurement/fixture.ts::procurement200Fixture` supplies only known prices,
confirmed services and delivery. `scripts/benchmark.ts` expressly asserts
`complete === true` and `unresolvedCount === 0`. The specification requires a fixture
with Decimal/**unknown**/services/delivery/reserve. The current golden and timing
cannot establish that stated workload. This is a source-contract mismatch, not an
observed performance regression.

Preferred code correction: add a deliberate unknown component to the fixed
200-line fixture, independently derive the expected known subtotal/reserve/unknown
count, freeze a new golden, and run the prescribed 50+1000 workload. Alternatively,
change the specification explicitly with a reason and refreshed dependent source
receipts; do not silently relabel the current fixture as complete conformance.

Closure: coordinator kept the original all-known procurement fixture/golden as historical
evidence, and changed only the measured variant to unmatched line 199 with null snapshot.
Independent literal oracle: materials 17,440,000 + 99 known chair lines 49,500,000
+ services/delivery 150,000 = 67,090,000 minor; reserve = 6,709,000; unknown count 1,
complete false, scenario total null. `integration-review-1-benchmark.json` retains
all samples/host metadata; `integration-review-1-benchmark-validation.json` binds
exact source hashes and independently checks sample 950 of the sorted 1000.

### F7-R2 — high — CLOSED — worker reported ready on unwritable asset storage

Original reviewed source: `apps/worker/src/index.ts` calls `prepareAssetDirectory` at boot; that function
checks directory type/free space but not read/write/execute access. Maintenance
checks schema/rate and cleanup but does not repeat the web storage readiness probe.
An existing owner-readable directory with mode `0500` passes boot and produces
`N8_WORKER_READY` and a `state: ready` heartbeat. This contradicts fail-closed worker
startup/readiness on incompatible storage.

Independent reproduction used `docker exec --user node` on image3, a new child
worker, a private fresh PostgreSQL test schema, a temporary mode-0500 asset directory
and writable heartbeat parent. The original services and real project data were
untouched. Receipt: `integration-review-1-storage-probe-2.json`. The earlier host
uid65534 attempt was inconclusive because repository parent files were not readable;
its separate receipt is preserved and is not counted as a pass or reproduction.

Preferred code correction: enforce the same schema/storage/free-space/rate gate at
worker startup and maintenance, keep failed readiness sticky until a complete
successful maintenance pass, and prohibit dispatch while unhealthy. Then repeat
only this concrete probe plus affected focused tests. Weakening the worker storage
requirement would conflict with its private-asset maintenance responsibility.

Closure: worker now calls the existing web `checkReady({pool,config})` before
startup and within each 10-second maintenance pass. No weaker duplicate storage
check was added. `integration-review-1-storage-closure.json` proves read-only boot
exit1 with fixed redacted log/no heartbeat; runtime ready→failed→sticky failed→ready;
SIGTERM exit0 and heartbeat removal. Six current source modules were copied into
a temporary directory in the image3 container, while the original worker service
continued untouched. Source hashes and reusable probe are retained. This proves
the correction in current source, not final-image deployment.

## Verified boundaries and retained limitations

- `loadConfig` rejects absent mandatory fields, blank/unknown enabling modes,
  incomplete live caps/rates/models and incomplete payment config; fake is never
  accepted in runtime. Defaults apply only to absent manual/off modes.
- Schema checks compare every migration name/hash and reject missing/extra/changed
  records. Migration execution is transactional and advisory-locked. Failed later
  DDL rolls back both prior DDL and ledger writes in an isolated test schema.
- Actual `n8_app` has no superuser/create-role/create-DB/public-DDL/schema-ledger-write
  privileges; it has application DML. The migration ledger is owned by migrator.
- Worker loop is sequential; maintenance continues independent steps after a failure,
  retains its failure result, and does not dispatch while that result is false.
  Heartbeat refuses malformed/future/expired/failed states. Signal handling stops
  the loop and removes heartbeat. Dispatched jobs retain uncertain state/holds;
  claim requires queued and undispatched, and lease fencing rejects stale completion.
- Project/ref/object/shopping-line/revision/page caps and decode/body/provider/DB
  timeouts exist at their relevant boundaries. Revision insertion locks the project
  and counts shell+design+budget history together. Existing race tests were read;
  full integrated regression execution belongs to the coordinator.
- Image3 (`sha256:2f22714b3f42dfe3e6ed3645d22a1c4f851ef152ae998f66ac5cb485ba0088cf`)
  is the probed runtime, not a claim that current dirty source is deployed. Image2
  EACCES and the original malformed-GLB runtime failures remain historical failures;
  parser-path source correction alone does not prove a runtime fix.

## Checks and measurement

Evidence directory: `docs/telemetry/p-replicator/20261013T220722Z-integration-47db/`.

- `integration-review-1-tests.txt`: original worker/config/health 6/6 pass; new
  operations 5/6 initially pass. Failure was the reviewer's wrong uppercase
  `NOT_READY` assertion; actual contract is `data.status = "not_ready"`.
- `integration-review-1-tests-corrected.txt`: affected independent suite 6/6 pass.
- `integration-review-1-data-retention-test.txt`: the strengthened changed-migration
  check preserves a concrete stored sentinel row; targeted 1/1 pass (five unrelated
  tests intentionally excluded, covered by the prior full operations run).
- `eslint tests/integration/operations.test.ts --max-warnings 0`: exit 0.
- `integration-review-1-source-runtime.json`: SHA-256 source manifest and redacted
  actual Docker/role observations. No secrets or environment-file contents retained.
- Requested 45-minute attempt, 30-minute checkpoint. Started 2026-10-13T23:58:47.982918Z;
  elapsed, report SHA and final closure evidence are recorded in the terminal receipt.
  Token usage, active-time intervals and cost are null because host measurements are
  unavailable. No savings claim is made.

## Final image8 closure — integration-final-closure-1

Closure RUN_ID: `20261013T202009Z-expanded-cjm-9f69`. Fresh evidence directory:
`docs/telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/integration-final-closure-1/`.
The initial review and F7-R1/F7-R2 failures above are historical evidence, preserved.
This bounded independent pass supersedes only the pending final-image/API/restart
qualification. No broad tests, benchmark, restart, migration, or paid call was rerun.

Final image: `docker:sha256:e5be7120110b92ed9b15b163638e65e339c796b16a0b567e166f53e11d8d8d21`;
Next build `W9tBOwFbU3PwZwa1-u6rr`. `validation.json` retains independent recomputation,
18 local source SHA256 values,14 direct running-image matches, redacted container
identity/health/private ports, and source-evidence digests. All six source modules
from the earlier worker storage closure are byte-identical in the final image.
The coordinator's broader `final-source-image-1.json` additionally binds148 files.

Independent arithmetic: floor requires10 packs; the other99 material rows require
one each, so109×160000=17,440,000 minor. The99 known chair rows round quantity1.08
to2 pieces:99×2×250000=49,500,000. Services100000+delivery50000 give67,090,000;
10% reserve6,709,000; the remaining unmatched chair keeps total unknown. Both p95s
were recomputed from sorted retained samples at index949. All client indices and
warm-up/measured sample counts were checked. The1000 canonical hash matches are an
aggregate verified against exact driver source;1000 separate hash values were not
retained, and this report does not claim they were.

Restart evidence uses the coordinator's actual `restart-after-2.json`, never the
premature after1 attempt. The reviewer inspected the private synthetic snapshot's
collection counts and original hash entries without copying private credentials.
The driver asserts deep equality after fresh authenticated reads. DB creation time
and service identities establish that only web/worker restarted. Share-image bytes
are explicitly excluded by that driver; their metadata is included. This satisfies
project-data persistence without claiming a full disaster recovery or DB restart.
The premature after1 socket failure and earlier before1 invalid-fixture failure
remain failures in the coordinator's history. A first reviewer read-only manifest
check failed because docs are intentionally excluded from the image; restricting
image comparisons to copied source resolved that tooling assumption, with no
product test repeated.

Final journey `journey-runtime-8/result.json` is21/21 pass on this same image, with
no page errors, no outbound network and zero live calls. Earlier full regression
`final-regression-1.txt` is228/228 but predates the last two product changes; it is
not relabeled a final-source full rerun. Affected export checks subsequently13/13;
budget hydration has image7 RED→image8 GREEN plus the independent Add expense proof
in `docs/reviews/budget-hydration-closure.md`. Scope defaults remain manual AI/off
payment; this is local acceptance, not proof of live-provider operation.

## Bounded cross-feature composition note

The foundation report remains historical and unchanged. Its UI reload qualification
is closed by actual image8 measured-shell and saved-budget reload assertions plus
its original two-project isolation test. Its HTML/URL qualification is closed by
image8 reference-note and public-caption script-inert assertions, original
parameterized-SQL tests and `tests/space/geometry.test.ts` rejection of
`https://u:p@example.com/a`. These are composition of named existing evidence,
not a new full foundation audit.

**FND-FINAL-1 — medium, open pending coordinator decision:** the final browser
foreign-account case verifies404 on all enumerated project-child/file GET paths,
but does not inject foreign IDs into array/JSON writes. Targeted source reading
found `packages/db/src/design/revisions.ts::checkReferences` rejects an ID outside
the owned project with422 `INVALID_REFERENCES`, whereas the literal foundation
relation criterion requires404 for such embedded foreign IDs. The same query
rejects missing IDs and performs no write; no private-data leak is asserted.
Therefore that literal whole-product relation criterion cannot be upgraded solely
from the passing GET journey. Coordinator was notified immediately; a focused
code/test correction or explicit reasoned contract correction is required. This
finding does not invalidate the four integration performance/operations criteria.

Profile `compact-quality-first-v2`; requested `gpt-6-astra/high` confirmed by parent
spawn metadata. Actual model/effort, token counters, cost and active-time intervals
remain null: no authoritative host measurements were exposed. Mechanical docs-only
route T/exit0; substantive scope is independent closure of existing L/XL evidence.
Applied canonical memory lesson `teach:deae300b63174339`: one independent review,
then specific closures. Companion preflight is not_applicable because this pass
only inspects existing evidence/runtime reads. Exact measured elapsed and report
hashes are retained in the fresh terminal receipt; no savings claim.

## FND-FINAL-1 focused closure on corrected source

The preceding open finding is now **closed on corrected source**, with the original
failure retained. The coordinator chose a code correction; the accepted foundation
specification was not weakened. `foreign-relation-red-1.txt` reproduces actual422
where404 was required. `foreign-relation-green-regression-1.txt` then records8files,
47tests passing; `final-regression-2.txt` records33files,229tests passing in91.20s
including the additional account/spend no-effect assertions.

Independent source review covers exactly `packages/db/src/design/revisions.ts`,
`packages/db/src/design/jobs.ts`, `packages/domain/src/design/scene.ts` and the new
case in `tests/design/revisions.test.ts`. Five embedded relation boundaries now
return the same404/NOT_FOUND for foreign and missing IDs: reference arrays, parent
revision, explicit shell, product snapshot and scene object catalog ID. Job preview
and submit validate foreign shell membership before classifying owned stale shells.
The18 negative calls use real PostgreSQL and foreign/random-missing pairs; final
assertions preserve version/current design/catalog, zero design/job writes,
credits30/held0 and no spend rows. A valid foreign fixture is present, so absent-ID
checks cannot mask the foreign-ID case. Idempotent replay remains before mutable
eligibility; all admission reservations still follow relation checks. Null shell
still yields409/SHELL_REQUIRED, owned stale shell409, duplicate references422,
and changed dimensions of a known object422.

`foreign-relation-closure.json` freezes exact corrected source/test/evidence SHA256
values. The final relation composition is now supported by these array/scalar/JSON
negative checks, earlier module ownership tests and image8 foreign-file/child GET
checks. The original foundation stage report remains untouched. Final image9
runtime binding is a separate coordinator gate; the existing image8 journey,
benchmark and restart measurements remain explicitly image8 observations.

## Final image9 source and performance binding

Final deployed image: `docker:sha256:3ac28e68ccef3576d428547f04bbbb9df3097bb8baf28823bdd87076611369cb`;
Next build `z7Mp9IiPagz7p0uRCxACH`. `image9-binding.json` independently compares the
four corrected product/test files and all14 prior integration runtime inputs
against actual container bytes. The corrected files match current source; the14
integration inputs remain byte-identical to the verified image8 versions. Actual
web and worker are healthy, DB retains original creation identity and no published
port, web binds only127.0.0.1:3088. No new schema/storage/config correction occurred.
The coordinator's `final-source-image-2.json` also binds148 runtime files.

`final-benchmark-4.json` reruns the prescribed workload on image9. Independent
`image9-final-performance.json` rechecks all10 client index sets,200 warm-ups,
1000 status/body-valid measured responses, all1000 pure timings, literal unknown
arithmetic and the1000 golden-match aggregate: API p95 **40.804434ms**, pure budget
p95 **8.007006ms**. `journey-runtime-9/result.json` independently inspected21/21
passing checks, empty page errors/outbound traffic and zero live calls. These are
new image9 executions; earlier image8 measurements and failures remain preserved.
FND-FINAL-1 is now bound to the actual deployed image as well as the229-test source.

## Final image9 restart acceptance

`restart-before-3.json` and `restart-after-3.json` now close the fresh final-image
restart gate directly: ready200, identical12 snapshot keys and exact deep equality
of2 projects,2 shells,1 design,3 budgets,3 asset metadata rows and2 original hashes.
The reviewer independently inspected the synthetic snapshot and both receipts,
then actual Docker health/identity/private ports after restart. All services are
healthy; web/worker remain image9 and DB creation remains2026-10-13T22:59:07Z.
`image9-restart.json` records these observations and immutable evidence digests.
All four integration criteria therefore have final image9 evidence. No accepted
integration work or confirmed finding remains open in this bounded review.
