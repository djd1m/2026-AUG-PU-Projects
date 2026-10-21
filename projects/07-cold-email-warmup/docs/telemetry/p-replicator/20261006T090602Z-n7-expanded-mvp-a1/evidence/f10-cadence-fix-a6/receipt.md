# f10-cadence-fix-a6 terminal receipt
Run: 20261006T090602Z-n7-expanded-mvp-a1
Baseline:6b1e464558283c1e0cfafd35344bb8b9e503f18d
Result:6495ab7c8dee4ef76788f9ce2e49539b10789e0b
Spec SHA:410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8
Launch SHA:003d2dfa5d54bdf7547056dfd76f1db5ac074089bf8a056453fce285bd99bc8b
Requested model/effort:gpt-6.1-sol/high. Actual model/effort/usage/cost:null, host_not_exposed.
Launch16:25:39.582559Z; actual first tool ACK16:26:11Z. Freeze target16:34:09.582559Z; actual freeze16:33:31.808100Z. Final deadline16:35:39.582559Z. Sealed:2026-10-06T16:34:43.267203+00:00.

Changes:src/runtime/store.ts anchors successful poll to durable reply_rescan.attempt_started_at+30s (fallback selected last_served_at only if no rescan exists), instead of completion+30; successful pool checks again60s <=300 target. No change to provider failure30/60/120/300, busy1, finite4IMAP/2SMTP, service sequences, locks or physical owners. No runtime/loop change. Tests/f10-runtime-integration.test.ts verifies persisted anchor and exact failure backoffs. tests/f10-runtime-process-fixture.ts loads compiled config/db/worker and native subprocess no TSX execArgv. tests/f10-runtime-protocol.test.ts adds real30-mailbox two-completion discriminator. tests/expanded-mvp-04.test.ts faults with UIDVALIDITY2/UIDNEXT2/tagged NO so FETCH is reachable and adds actual UID/retry assertions; this longer fault test NOT executed in A6. No other trackedpaths. Internal IPC fixture only, no env/HTTP authority. Owned database n7f10_a2 current_database guarded; no old/default DB writes; no providers/push/images/dependency changes. UI unchanged/browser N/A.

Checks/raw unique artifacts:/tmp/n7-f10-cadence-fix-a6
{
  "build-v2.exit": "0",
  "affected-v2.exit": "0",
  "short-native-v1.exit": "1",
  "type-v1.exit": "0",
  "short-native-v2.exit": "1",
  "lint-v1.exit": "0",
  "lint-v2.exit": "0",
  "short-native-v4.exit": "1",
  "affected-v1.exit": "0",
  "build-v1.exit": "0",
  "schedule-red-v1.exit": "1",
  "short-native-v3.exit": "0",
  "type-v2.exit": "0"
}
Exact commands from product cwd with source /tmp/n7-f09-verify-a2/env.sh then DATABASE_NAME=n7f10_a2:
node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='compiled healthy' tests/f10-runtime-protocol.test.ts; v2 RED0/1, v3 superseded GREEN1/1, v4 finalsource RED0/1.
node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='successful polling yields' tests/f10-runtime-integration.test.ts; schedule-red-v1 RED0/1, original completion+30.
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/f10-runtime-integration.test.ts tests/f10-runtime-unit.test.ts; affected-v2 finalsource18/18 PASS,15536.964ms.
npm run build/typecheck/lint:final v2 exit0, heavy mutex used. Full unit/full PG/nativeSIGSTOP remain previous A5 source evidence, not rerun after store change; mandatory fresh relevant final regression remains nextstage.
Initial short-native-v1 command failed wrong workdir module path; originalraw retained. v2 no-TSX realnative baseline gaps44128–46078ms, all30 miss30s; startup execArgv empty, stderr empty. A temporary zero-success-delay variant v3 passed with gaps18590–20057ms, but violated accepted02 line38. It was removed beforefreeze. Its v1 build/affected18/18/static0 are superseded, never finalsourcePASS. Exact v3 historical source/build hash snapshot was not preserved before overwrite by build-v2; raw and recorded tool edit remain, measurement gap disclosed.
Final v4 compiled native startup execArgv empty, stderr empty; all30 completed twice, gap min27226 max33688ms; 25/30 exceed strict30000ms. Actual duration52038.932ms. Source/build bindings frozen-source-build-manifest-v1.json. No full330 rerun or threshold/cohort weakening.

Remaining actual blocker: literal pre-I/O round-start is not persisted in existing fields. ReplyStore.capture creates attempt_started_at AFTER first snapshot I/O; runtime_due.last_served_at is overwritten every quantum, due_at is original eligible age/deadline. Existing durable rescan attempt anchor improves cadence but actual final v4 stillRED. Need separately authorized narrow durable pre-I/O round-start capture/field or independent validated exact scheduling-clause correction; do not claim this partial anchor satisfies all AC002/AC007.
Next owner: parent /root/n7_expanded_coordinator immediately assigns bounded concrete continuation to author/reviewer for exact anchor decision, then freeze BEFORE independent full/native evidence. Remaining actual real fault/pause/explicit retry/recovery and post-restart fairness; full300 pool/per-mailbox target; descendant resource/CPU/RAM/FD+fixturelatency; affected F09 60s retry/final-fence native; finalfullunit/fullPG, canaries/current mutation inventory and independent review. Whole F10 unaccepted. No further A6 checks/source changes afterseal.
A5 timing correction accepted: prior receipt sealed16:24:27.236518Z,6.910179s AFTER16:24:20.326339Z deadline; earlier beforedeadline statement was wrong. A5 originalreceipt immutable.
Status: failed
