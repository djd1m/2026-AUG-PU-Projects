# f10-cadence-implement-a7 terminal receipt
Run:20261006T090602Z-n7-expanded-mvp-a1
Baseline/accepted READY:2f24e06cc8460450c88d2103c38221fa85f32b48
Result:87bb94944f33bf99f9f9fd6d6390d097ca415dc2
Launch SHA:c24fcef75521c23d739d606d21f9c309a187c6012cde45f04f01250239e809fb
Accepted cadence spec revision: current02/03/04 and validation-report in2f24e06c. Earlier F10 baseline specSHA410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8 is historical, not a claim of unchanged corrected spec.
Requested:gpt-6.1-sol/high, compact-quality-first-v2/XL. Actual model/effort/usage/cost:null, host_not_exposed.
Launch16:51:41.703653Z; actualtoolACK16:52:14Z. Freeze17:00:11.703653Z; actualsourcefreeze16:59:09.587940Z. Finaldeadline17:01:41.703653Z; seal2026-10-06T17:01:58.961391+00:00. No source changes afterfreeze.

Eight authorized paths changed:src/runtime/store.ts,src/runtime/loop.ts,tests/f10-runtime-integration.test.ts,tests/f10-runtime-unit.test.ts,tests/expanded-mvp-04.test.ts,tests/f10-runtime-process-fixture.ts,tests/f10-runtime-protocol.test.ts,tests/f09-transport-fixture.ts. Supplement authorized byparent duringattempt: accepted localTLS peer protocol/openedAt/closedAt/monotonicelapsedMs records, in same alreadyownedfixturepath; no credentials/transcript/payload collected.
Successful poll finish verifies existing complete reply proof and matching mailbox_poll validity/scan_complete under FIRST global lock, then owner/generation CAS sets due_at=next_check_at=post-lock DBnow retaining selected service_seq. Partial/error/authority/busy/held outcomes cannot take success branch; unsatisfied age retained; provider30/60/120/300 backoff unchanged. No cadenceclock/schema. Runtime lane awaits operation+finish, yields via cancellable setImmediate before freshclaim. Fixed4IMAP/2SMTP, physicalproof, no-overlap/consent/quota unchanged.
Trustedinternal compiledfixture uses noTSXloader, noenv/HTTP fixture authority. Parentfullharness now records descendantCPU/RSS/FD (rootchild-reapedCPU included), operation/reason/originaldue-age samples, variable localIMAPresponse delays, actualFETCH/pausedexplicitretry assertions, clean child code/signal/drained + duration. These full300s/fault/resource measurements are CODED, NOT EXECUTED inA7. Fullparent assigns2CPU affinity; shortprobe retains hostaffinity, neverclaim2CPUresourcePASS. Noimage rebuild/browser/deps/push/providers/charges; owned n7f10_a2 guards; old/default DB untouched.

Raw unique artifacts:/tmp/n7-f10-cadence-implement-a7
{
  "build-v2.exit": "0",
  "affected-v2.exit": "0",
  "mutation-failure_success-v1.exit": "1",
  "short-native-v1.exit": "1",
  "type-v1.exit": "0",
  "short-native-v2.exit": "1",
  "mutation-reset_sequence-v1.exit": "1",
  "lint-v1.exit": "0",
  "lint-v2.exit": "0",
  "mutation-sleep30-v1.exit": "1",
  "native-recovery-v1.exit": "0",
  "affected-v1.exit": "0",
  "lint-v3.exit": "0",
  "build-v1.exit": "0",
  "type-v3.exit": "0",
  "type-v2.exit": "0"
}
Exact checks fromproductcwd, envsource /tmp/n7-f09-verify-a2/env.sh and DATABASE_NAME=n7f10_a2:
npm run build:v2 exit0; npm run typecheck:v3 exit0; npm run lint:v3 actualexit above (if absent atseal pendingjob77247, notPASS).
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/f10-runtime-integration.test.ts tests/f10-runtime-unit.test.ts:affected-v1/v2 both20/20 PASS; restoredv2 duration26604.963ms. Includes actualproof success/no30delay, originalage underfailure-as-success flag, held/partial/authority/busy negatives, selectedsequence retention, joinedasyncyield.
node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='native ambiguous' tests/f10-runtime-protocol.test.ts:native-recovery-v1 actualTLS1/1 PASS,duration7890.374ms.
Three scoped production mutations (sleep30/failure_success/reset_sequence) each exit1 with independent PG complete-proof test; patches/sourcehash/logs preserved, EXACTsourcebytes restored sha256796892ca3519d30a205f76a251b99d69cb01d968591970fa6b4d259d4872ae11. Mutant delayedsuccess actualnative run was not performed: pending broader mutation inventory.
node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='compiled healthy' tests/f10-runtime-protocol.test.ts:short-native-v1 RED0/1,34587–41241ms gaps, runtime overlapped author type/lint jobs so no cleanresource attribution. v2 RED0/1,duration87619.265ms, serialized underheavylock without authorparallelheavyjobs, varying0/15/40ms acceptedIMAPcommand delays. Startup execArgv empty, stderr empty; all30 complete twice; gap min35433 max40542ms,30/30 exceed30000ms.180actualpeerIMAPconnections, peer elapsed min40.697 max186.866ms; operationcounts{"CAPABILITY": 180, "AUTHENTICATE": 180, "AUTH_RESPONSE": 180, "EXAMINE": 180}. NoFETCH on emptyhorizon shortcase expected fullproofsuccess; separate actualnative recovery covers FETCH. Childdrain{"code": 0, "signal": null, "drained": true, "elapsedMs": 215} proves cleanexit215ms, not onlya duration.
Source/build bindings:short-native-v2-source.sha256; frozen-source-build-manifest-v1.json; full-source-build-manifest-v1.json (90source/schema/packagefiles,73compiledJSfiles plus nonsecretfixtureconfig). v2 began beforeGitcommit but identical sourcebytes; commit onlyGitmetadata changed duringrun. Historicalzero trial not cited asfinalPASS.

Remaining mandatory finding: strict actual healthypoll<=30 target stillFAILS despite validated immediateeligibility and asyncyield. Serialized nativev2 disproves attribution solely to earlierstaticoverlap. PeerTLSlatencies alone are short; peroperation process-start/DBqueue/slot/quantum timings plus actualCPU/RAM need measuredcausal witness before targetedsourceoptimization; no blindadditional change authorized. No new sourceextension requested withinA7. WholeF10 NOT accepted.
Next owner: parent/root/n7_expanded_coordinator immediately allocates fresh bounded readonly/finding investigation on87bb9494 with realnativeCPU2/resource/operationtimings; any provenproductioncorrection receives narrowfileownership. Full330s frozen-source native cohort,300s pool deadline, actualfaultpause/retry/recovery+restartfairness,15s drain underfault, resourceaggregate receipts remain unexecuted. Fullunit/fullrealPG/F09finalfence60s retry+SIGSTOP/currentnative composition, encodedcanaryinventory, broaderrequiredmutationinventory/native delayedsuccess and freshindependentreview remain gates. EarlierA5 wholechecks are historicalsourceproof and do not implyfinalsourcePASS.
Status: failed
