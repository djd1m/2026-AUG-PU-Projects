# A15 bounded implementation receipt

RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f10-uidreset-implement-a15
Requested model: gpt-6.1-sol; effort MEDIUM. Actual host model/effort/usage/cost: null (not exposed).
Actual first-tool UTC: 2026-10-06T18:39:23.853590326Z
Baseline: 6255b8f19a456103f062b0d1d5fd2313b914af94
Result commit: eae17bbea36312ee5290adb8390e066b1f0d6c2a
Source/build freeze UTC: 2026-10-06T18:57:03.372878+00:00; bound 18:57:11.508868Z.
Final seal UTC: 2026-10-06T18:58:12.155643+00:00; bound 18:58:41.508868Z.
Launch SHA256: de1e409ffd8f3df029c295a414d705dfef26251296c14e0ba0a8470a4deff681
Independent A14b plan receipt SHA256: 998aeeb0b4c89294d7f196650b759954f3a965f62dacfaf8313d1e5eaf749662
Guard SHA256: 9c2b899e9d7e173beb631415044e8b5106b257b006bb06cd2283500b528bd33f
Profile: model-routing-econom; mechanical ROUTE10 exit0, substantive approved XL checks retained.

Implemented the planned typed read proof: authenticated complete EXAMINE can return changed UID generation before FETCH, captured under expected run identity plus existing tenant/source/poll/runtime/grant fences. Full poll and quantum each consume that proof without another protocol operation. Incomplete scans require explicit retry. Current-generation fixed horizon, protocol limits, quota and physical ownership remain fenced. Ten authorized files committed. Runtime, input, transport lifetime and transport child are unchanged. Existing generic successful child IPC transports the typed union; focused real native tests verify it.

Checks (guarded Node22, private env, DATABASE_NAME=n7f10_a2; DB asserted before resets):
- Baseline old-UID explicit retry regression: node --import tsx --test --test-name-pattern='explicit retry captures changed native UID proof' tests/f10-runtime-protocol.test.ts: exit1, expected scanning actual paused, baseline-native.tap. Dedicated readiness JSON was missing BEFORE this initial diagnostic launch; this gap is preserved and the baseline is not acceptance evidence.
- Initial typecheck exit2 from affected direct callers; adjusted callers, type-v2.log exit0.
- Focused native/PG: node --import tsx --test --test-concurrency=1 --test-name-pattern='explicit retry captures|full poll captures|settled native UID|reset capture fences' tests/f10-runtime-protocol.test.ts tests/f09-live-transport.test.ts tests/f10-runtime-integration.test.ts: exit0, 4/4, focused-v1.tap.
- Affected protocol/transport/runtime/replies files: node --import tsx --test --test-concurrency=1 tests/f09-live-protocol.test.ts tests/f09-transport-integration.test.ts tests/f10-runtime-integration.test.ts tests/replies-integration.test.ts: exit0, 50/50, affected-v1.tap.
- npm run typecheck && npm run lint && npm run build under heavy lock: exit0, static-build.log; compilation completed before freeze.
- npm test under heavy lock: exit0, 62/62, full-unit.tap.
- Actual temporary mismatch-return mutant tested with node --import tsx --test --test-name-pattern='IMAP proves bounded read only' tests/f09-live-protocol.test.ts: mutant exit1, exact restored source exit0. Source restored byte-identically before freeze; mutant-read-reset.tap/restored-read-reset.tap.
- Current F09 native: node --import tsx --test --test-concurrency=1 --test-name-pattern='transport grants|final live submission|UID reset|independent capacity|expired slot age|native pool fixture|full poll captures|settled native UID' tests/f09-live-transport.test.ts: exit0 8/8, f09-current-native.tap.
- git diff --check exit0; route.log exit0.
- Own corrected guard TCP/TLS/DNS denial, inherited child denial, missingfixture before listener, actual numeric local TLS string and BufferCA positives, IPC delivery received:true validated:1 all exit0. Original historical guards untouched.

All subsequent changed-source native stages have actual prelaunch readyJSON (focused/affected/mutation/restored/f09-current), binding source/build/guard/environment/commands/effects/DB assertions. Exact statvfs records precede each heavy stage, all above2GiB; no cleanup or installs. All nine launch sessions terminal. terminal-process-v1.json records109 own guard PIDs, none currently present; no pending own processes. Native tests assert settled physical rows zero; physical SIGSTOP proof is not claimed.

Frozen source/build: source-build-final-v1.json (120 source files,73 build files). Final recheck mismatches: 0. Native driver is worktree TypeScript helper importing frozen dist, not an independent copied runner; next verifier must recheck BOTH source/helper and build hashes and keep worktree immutable. Historical integrity: [{"directory": "/tmp/n7-f10-frozen-verify-a11", "checked": 53, "mismatch": []}, {"directory": "/tmp/n7-f10-graceful-claims-fix-a12", "checked": 32, "mismatch": []}, {"directory": "/tmp/n7-f10-verify-a13", "checked": 123, "mismatch": []}].
Raw manifest: raw-artifact-manifest-v1.json (150 files), SHA256 53e4f5833afbe81d55f34059e6584fad7b2127451a8c6afe608dcdfeebf2b0ae. Own final artifacts added only for terminal sealing after source/build freeze.

Overall F10 acceptance remains PENDING. Original A11/A12 native RED is not erased. This bounded implementation completed its scoped fix/checkpoint only. Required next executor: fresh independent HIGH frozen verifier assigned by coordinator, using approved planner packet+A14b plan+frozen candidate/raw facts; no author-chat dependence.

Concrete next checks after own validated guard and readiness with exact DB/disk/source hashes:
1. Frozen full330 native: F10_EVIDENCE_DIR=<fresh-owned-dir> NODE_OPTIONS='--import <fresh-validated-guard>' flock /tmp/codex-heavy-build.lock node --import tsx --test --test-concurrency=1 tests/expanded-mvp-04.test.ts. Assert all30 eligible postrestart/censored gaps; blocked rows and explicit operator retry remain visible.
2. Full realPG: NODE_OPTIONS='--import <fresh-validated-guard>' flock /tmp/codex-heavy-build.lock npm run test:integration, plus protocol files excluded by that script. Affected50/current8 do not substitute full inventory.
3. Physical current native: guarded node --import tsx --test --test-name-pattern='expired occupied slots' tests/f09-live-transport.test.ts and guarded node --import tsx --test --test-name-pattern='suspended transport owners' tests/f10-runtime-protocol.test.ts; verify actual selected names/inventory before launch. Require SIGSTOP >120s, DB fault/stale-owner/no-release proof; not run in A15.
4. Coordinator current material/cadence mutation inventory and full canary remain required; this one isolated mismatch mutant does not replace them. Exact inventory commands must be bound from approved packet, not invented here.
5. Fresh independent HIGH review and all delivery gates remain pending; no push/publication/acceptance claimed.

Status: completed
