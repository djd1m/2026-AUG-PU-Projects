RUN_ID: `20261006T090602Z-n7-expanded-mvp-a1`  
WORK_UNIT_ID: `f10-frozen-verify-a16`  
Launch-SHA256: `e17fa1e792ec4de72ea66ad8d16c72fc1951b1dd1717551e5667d6ef6e094f38`  
Source-Revision: `eae17bbea36312ee5290adb8390e066b1f0d6c2a`  
Build-Revision: `eae17bbea36312ee5290adb8390e066b1f0d6c2a`; frozen manifest `39eb6cc84f603c73d12ee641604fbb0beaf4eb1fa0d3287faa80a9c806a5826a`  
Finished-At: `2026-10-06T19:18:48.038895+00:00`  
Profile: `model-routing-econom`  
Requested model/effort: `gpt-6.1-sol` / `high`  
Actual model/effort: `null` — host metadata unavailable. Usage/cost: `null`.  
Verdict: **failed / partial scoped verification; no F10 acceptance**

All 120 source and 73 build files match the frozen manifest at sealing. Original guard unchanged (`9c2b899e9d7e173beb631415044e8b5106b257b006bb06cd2283500b528bd33f`); own guard `0714d60b6627cc46ca5d57bf2bdb4b02e6ad4b209bbfd48548b3108bb99ed3fe` changes output root only. Separate fs-only helper `9b7232e3013f99db4fcc5ec8ff338b82d8d13662adea87a12dc8b21bce2b81f2` remaps only exact legacy short-native files and anchored UUID F04B fixture paths. Product/build stayed read-only. Network remained numeric127.0.0.1 and192.168.176.2:5432; no external SMTP/IMAP/LLM, installations, Docker changes, spend or publication. TMPDIR and evidence stayed in own scratch; DB assertions precede each reset. Browser not_applicable.

The standard sandbox initially failed before command start (`bwrap: Can't mkdir repo/.codex: Permission denied`). Standard narrow require_escalated calls passed auto-review. Guard probes passed external TCP/TLS/DNS denial, inherited child denial, missing fixture rejection before delivery, canonical IPC delivery and real numeric TLS with string/Buffer CA. Own probes and provenance are retained.

| Native stage | Measured result | Raw evidence |
|---|---|---|
| Full330 | TAP PASS1/fail0; witness330670ms; ALL30 strict first/gap/censored-tail healthy+postrestart completion30s, selection60s and whole330 pool300s PASS | full330.tap, full330.stderr, cadence-1791313358589.json, full330-independent-metrics.json |
| Full330 wrapper | exact wrapper exit2; native exitNULL | full330-terminal.json; own runner was changed while Bash awaited native, invalidating file read offset after native completed |
| Full realPG | exit124 at150s;36 completed parents,130693.066375ms cumulative; whole suite unfinished | fullpg.tap/.stderr/.exit/-terminal.json; fullpg-timeout-diagnosis.json |
| Both current physical120s | TAP PASS2/fail0; exact exit0;124089.019147ms expired occupied slots;123074.346885ms suspended runtime owners;248330.416718ms total | physical.tap/.stderr/.exit/-terminal.json; sigstop-v2.json |

Full330 includes100 connected/30 active/3 tenants/2CPU,30 explicit retries, fault and restart.609 resource samples; maximum4 child operations/4slots/4connections,359244KiB aggregate RSS,124FD. Both graceful drains returned actual code0/drainedtrue in167ms and149ms. These exact raw facts survive the wrapper measurement failure; native exit0 is not inferred.

The fullPG timeout last reported `B2/B3 actual unsubscribe shared-lock race before final: before0 after1 later0` (565.234782ms), with last TAP write2026-10-06T19:11:39.229000Z. Next expected unreported subtest is the unsubscribe-after variant in suppression-integration.test.ts. Per-test absolute completion UTC is unknown because TAP contains durations only. The required pre-physical-reset join/wait snapshot was missed; that ordering gap is irrecoverable. Causal SQL wait state at timeout is UNKNOWN. Post-reset snapshot showed no blockers, but cannot establish pre-reset state. No hang or simple longer-run cure is claimed.

At19:14:17 all2192 prior observed guard terminal PIDs were absent, fullPG shell951190 gone, and current own guarded processes all began after physical launch. Physical process PID/starttick identities were recorded separately. Terminal seal now shows own live guarded processes `[]`, known physical IDs all absent `True`, and heavy mutex independently free. Prior exited child startticks that were not captured remain null; they are not reconstructed. Physical raw assertions verify exact confirmed exit, DB release-failure retention, stale-proof denial and final zero occupied slots. No foreign processes were killed and no TTL release was introduced.

Actual launch proofs: full330 ready19:02:34.664876Z/PID842880/startticks123636435/session13880; fullPG ready19:09:09.585160Z/PID951190/startticks123675920/session36687; physical ready19:12:23.565108Z/PID1000602/startticks123695325/session70864. Each ready file binds source/build/guard/environment/command/DB assertion/disk; future stages used unique immutable runners. Physical completed `2026-10-06T19:16:32.342235+00:00` before freeze19:17:00.376882Z. No native test started after freeze. The prepared quick fullpoll runner was NOT executed.

Remaining mandatory work under coordinator responsibility: fresh exact full330 repeat with independent native exit capture; fresh fullPG with measured per-test chronology, live PID/starttick inventory and wait snapshots before any subsequent reset; affected protocol tests outside glob including native UID retry and reset guard denial/fullpoll; any unestablished current unit/static/source-bound evidence; all current required material/cadence/physical mutants, full canary, and fresh independent final HIGH8minute review. This attempt gives partial evidence for AC001–007 and cannot accept any composite gate from partial results. Existing F06/F11–F15 boundaries remain pending. The same RUN_ID/source must continue in a new bounded attempt; responsible next executor is n7_sol_coordinator. No silent A16 extension or source correction is authorized by this result.

Artifacts: `/tmp/n7-f10-frozen-verify-a16/artifact-manifest.json`; all raw files retained. Disk available at seal3266174976bytes. Actual model, token usage/cost and missed chronology remain null. Elapsed from launch to seal is included in this attempt, not reported as savings.

Final timing violation: first seal occurred2026-10-06T19:18:48.038895Z,17.662013seconds after the19:18:30.376882Z deadline. This is an additional A16 failure. This factual annotation was added 2026-10-06T19:19:25.277520+00:00. No native test resumed; no time was backdated.

Status: failed
