# Independent F10 A25 review — BLOCKED

Reviewer family: codex
Spec revision: dfb3219e58a86dbf0a16b68e4fb6f26def99a4da
Candidate: 9ad64857e9b82303165934011f8ab4bf8a783409. Fresh independent planner-only HIGH review. All14 normative hashes, UID A14b planner/context and13 objective hashes verified. No author/coordinator/verifier narrative read. Legitimate independent A23 finding read. Current source120/build73/SQL15 exact matches. Only three tests differ from A23/A22: runtime fixture, runtime process fixture, runtime protocol test; unchanged source117/build73/SQL15 gates reused by component hashes.

## HIGH F10-A25-001 — stale instrumentation blocks required native witness

Existing original native test failed actual exit **1**, no timeout, before any scheduled worker started. PostgreSQL **42710**: `trigger "n7_fair_record" for relation "runtime_due" already exists`, at `tests/f10-runtime-protocol.test.ts:78`.

Trigger: previous process-level TERM leaves instrumentation in the disposable DB. `tests/f10-runtime-fixture.ts:10` migrates/truncates rows, preserving triggers. Protocol lines70–77 recreate the events table/function, then line78 unconditionally CREATEs named triggers. Joined cleanup line103 cannot survive process termination. This is a repeatability/setup defect; no runtime fairness failure is inferred.

Known fixture objects: `n7_fair_record` trigger on `runtime_due`, `reply_rescan`, `mailbox_poll`; function `public.n7_fair_record()`; table `public.n7_fair_events`. Prelaunch catalog inventory was not captured. Raw42710 proves the runtime_due trigger existed at line78; other before objects are unknown. A25 finally ran. Separate read-only catalog at 2026-10-06T21:14:08.975Z proves all three named triggers and the named function now absent; events table remains. DB has no other connections and occupied transport=0. Cleanup is therefore observed, not inferred.

Minimum fresh MEDIUM scope: **one file, tests/f10-runtime-protocol.test.ts**. Make only owned instrumentation setup idempotent **before adversarialFixture priming** on explicitly asserted current_database=n7f10_a2. Remove only the three named stale triggers/function; preserve existing data reset, twenty pages, monotonic native elapsed>=5000, original deadlines, modes and policy. No production/dependency/config change justified.

Fresh verification must force stale instrumentation using the test's exact existing function and all three named triggers; capture catalog before, execute a SHORT setup/cleanup proof, then the unchanged expensive native witness under a unique frozen attempt. Capture after inventory, raw exits, participants and actual once/restart/competing-worker joins. A25 executed no forced-stale proof, no second test and no fix. Coordinator owns the next attempt.

## Acceptance reconciliation

F10-A23-001 remains **OPEN**. New tests statically express approved later-due E already eligible before first claims; successful5s A–D pages; genuine once join and competing compiled-worker restart; E before ANY A–D second quantum; E completion<=30s/selection<=60s and all unique cadence gaps<=30s; preserved original due/service_seq; all5 participants;20page/120s attempt and explicit held state; fixed4IMAP lanes. However A25 raw fairness contains no phases, no runtime workers/joins, zero selections/pages for all5 and no E completion. Priming is not this witness. Current original native GREEN remains **unknown**, not zero.

Both raw named ordering negatives have actual native1/no timeout and literal E-before-any-second-quantum assertion failures. Their test/fixture/process hashes match current original bytes. Patches alter only compiled ORDER BY or finish service_seq; original compiled store SHA4f022e11e812813e495b3376b6c7d39c6842b3f6b7da8dd14d65dba235051716 equals current. Exact restoration recorded. Prior common restored run ended under TERM budget: not completed GREEN. Older merged at fields were launch times, not reconstructed finish times.

| AC | Independent result |
|---|---|
|001|Prior independent PASS reused by unchanged dependencies; no fresh restart evidence.|
|002|BLOCKED: A23 fairness witness and A25 setup defect.|
|003|Physical/attempt evidence reused; mandatory adversarial page witness BLOCKED.|
|004|Prior final stop/quota/pacing PASS reused by unchanged source/build/SQL.|
|005|Prior pool uniqueness/A22 corrected conflict PASS reused.|
|006|Prior due-age/backoff/overload PASS reused.|
|007|BLOCKED until mandatory original native0 and findings closed.|

A20 full330/fullPG raw native0/no timeout reused, elapsed334332ms/141647ms. Unit62/PG169/physical/native/canary independent analyses retain their admitted bounds; no broad reruns. Current empty type/lint logs alone are not a new independent static execution claim.

## Actual execution and release

One exact invocation: started 2026-10-06T21:10:53.424524+00:00, PID2753353, startticks124406342; actual finished 2026-10-06T21:11:01.434775+00:00; elapsed8010.282ms/native1. Exact command is recorded in ready/receipt:
`/tmp/n7-expanded-runtime-20261006/bin/node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 --test-name-pattern="native five-second rescans" tests/f10-runtime-protocol.test.ts`.
Prelaunch PG quiescent/mutex held. Terminal child joined, no remaining owned nodes, PG quiescent, runner/inputs unchanged. Nonblocking mutex reacquisition succeeded and released. Final catalog confirms occupied transport0. Source/DB lease **released to coordinator** at 2026-10-06T21:15:55.676090+00:00; no source/main/dependency/provider/deploy/key writes, extra test, paid service or CLI agent launch.

Guard policy copied identically with ONLY audit-root relocation; original/new digests and runner separate started_at/finished_at fix frozen before launch. Actual total guard counts {"socketDenied": 9, "socketAllowed": 15, "dnsDenied": 0, "ipcValidated": 8, "processes": 14}. Nonzero socketDenied are preserved blocked attempts; endpoints uncaptured, no IPC attribution fabricated. Scoped existing A21 canary helper scanned20 fresh runtime outputs/11383bytes against5 available secret files/encoded fixture markers:0hits, no values exported. Catalog and later seal metadata are after that scan. Uncaptured HTTP, trusted definitions, encrypted storage, TSX cache remain exclusions. Prior broader A21 scope/limits retained. No live/full expanded-MVP acceptance; F06 gaps/F11–F15 pending outside scope.

Profile model-routing-econom; requested gpt-6.1-sol/high; actual model/effort/usage/cost null (host not exposed). Review complete; acceptance BLOCKED. Evidence telemetry: /tmp/n7-f10-independent-review-a25/context_provenance.json and receipt.json. Coordinator retains continuation responsibility.
