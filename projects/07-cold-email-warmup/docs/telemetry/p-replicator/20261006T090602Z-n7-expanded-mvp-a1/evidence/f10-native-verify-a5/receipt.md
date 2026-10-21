# f10-native-verify-a5 terminal receipt
Run: 20261006T090602Z-n7-expanded-mvp-a1
Baseline: 8dc405d237afa78950e57a3da54e02c9af76e39c
Result commit: 6b1e464558283c1e0cfafd35344bb8b9e503f18d
Spec SHA: 410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8
Launch SHA: 2174f37e6981caf2aba015e0a158beea1a3a4917cb7eda25b20f9cd98b1d973e
Requested model/effort: gpt-6.1-sol/high. Actual model/effort/usage/cost: null, host_not_exposed.
Launch: 2026-10-06T16:04:20.326339Z; first actual ACK: 16:04:56Z.
Freeze target: 16:22:50.326339Z; actual commit/receipt timestamp recorded below. Freeze exceeded after compaction delivery; final deadline remains16:24:20.326339Z. No scheduler source changed.

Delivered seven authorized paths: src/runtime/worker.ts; tests/expanded-mvp-04.test.ts; tests/f10-runtime-fixture.ts; tests/f10-runtime-process-fixture.ts; tests/f10-runtime-protocol.test.ts; tests/f09-live-transport.test.ts; tests/f09-transport-fixture.ts (extension01 only two database guards).
Compiled production worker operations exposed through trusted internal fixture DI; normal CLI unchanged. No fixture HTTP/environment authority. Owned database n7f10_a2, exact current_database guards; no old/default DB resets. No real providers, image publication, dependency changes or push. Browser N/A: UI unchanged.

Executed checks (raw logs in /tmp/n7-f10-native-verify-a5):
{
  "full-pg-v1.exit": "0",
  "type-v1.exit": "2",
  "physical-v1.exit": "0",
  "cadence-run-v1.exit": "1",
  "build-v1.exit": "0",
  "type-v3.exit": "0",
  "gap-observer-v1.exit": "0",
  "type-v2.exit": "0",
  "full-unit-v1.exit": "0"
}
Full unit npm test:59/59 PASS, duration74766.896ms. Full real PG npm run test:integration:162/162 PASS, duration128988.800ms. Explicit tsx --test tests/f10-runtime-protocol.test.ts:2/2 PASS, duration128933.997ms. Type v1 failed harness typing, corrected v2/v3 exit0; npm run build build-v1 exit0. Final lint not executed in this bounded window.
Native SIGSTOP artifact sigstop-v1.json: actual suspend120571ms; six physical TLS owners (SMTP2/IMAP4), per-mailbox1; two actual compiled CLI starts; expiration never reclaims physical owners; DB release failure and stale proof deny reuse; observed exit proof permits recovery. This proves physical retention, not complete cadence recovery.

Actual compiled runtime cadence test parent literal 'persistent fair workers serve every eligible mailbox': RED exit1. cadence-v1 began16:12:00.203Z ended16:17:30.788Z (330585ms),100 connected/30 active/3 tenants. All30 completed at least twice overall; each had only one completion in first90s healthy window. Second completion deadline was missed before deliberate fault start; healthy_gap_values empty is censored evidence, not a passing gap assertion. Observer60127ms interval ends16:13:39.977 INSIDE fault16:13:30.405–16:13:45.768 and is not wholly healthy. One participant full completion max61329ms, poll selection max36644ms, pool gap301826ms. Drain458ms, fixture connections max3. Actual fault wrongTag with uidNext1 never reaches FETCH; operator retry0, so fault composition unexercised. TSX loader inherited by native children may affect cadence; normal compiled-loader-free two-completion probe required before root-cause attribution. Current compiled/source binding cadence-v1-source-manifest.json and frozen-source-build-manifest-v1.json.
Parent reports observer exit first2 then0 at samefilename; prior bytes unavailable, measurement gap disclosed without reconstruction. Observer current exit0 is not a cadence PASS. Main cadence v1 was executed once.

Remaining mandatory AC/gates: strict healthy poll<=30s and pool<=300s actual runtime proof failed; distinguish loader overhead with short compiled probe, then minimal authorized scheduler correction if reproduced. Fresh graceful restart/fair-round and real fault/stall composition; descendant CPU/RSS/FD and fixture latency/resource aggregate; affected F09 finalFenceScenario60s retry/native regression; final lint/type/build on corrected final source; current meaningful mutation inventory and encoded canary inventory; fresh full300s cadence following correction. Existing full unit/PG passes do not establish AC007 or whole F10 acceptance.
Next owner: parent /root/n7_expanded_coordinator allocates fresh bounded A6 to same author, proposed owned runtime/store.ts + runtime/loop.ts only on proven cause, existing runtime integration/unit and native harness paths. Do not silently extend A5 or weaken30/300 targets/backoff/physical limits. No new checks after seal.
Sealed at: 2026-10-06T16:24:27.236518+00:00
Status: failed
