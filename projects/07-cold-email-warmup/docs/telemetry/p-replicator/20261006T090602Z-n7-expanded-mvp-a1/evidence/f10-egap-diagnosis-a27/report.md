# A27 independent read-only diagnosis

Verdict: **completion starvation is localized to physical transport admission after successful durable selection**. This is a diagnosis, not F10 acceptance or a product patch.

Frozen source: `d2a03eb0ee91409b59b65dc66808159db7975d7e`; project `/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup`. Approved normative revision `dfb3219e58a86dbf0a16b68e4fb6f26def99a4da`; all 14 planner digests verified, plus clean A14b UID planner. Source unchanged. Requested Sol6.1/high; actual model/effort/usage/cost null because host metadata is unavailable. Profile `model-routing-econom`.

## Decisive findings

The exact genuine E completion gap is **69,815 ms**, `21:20:33.524 → 21:21:43.339 UTC`. Unique completion timestamps, rather than generic mailbox_poll trigger events, define completions. During that gap E receives **70 selections**, including **67 transport_busy yields** from `21:20:33.792` to `21:21:42.061`. Every busy yield retains failure_count=0 and the same due age; ordinary provider backoff is not the observed outcome. Across the whole run the maximum consecutive E selection gap is **1,120 ms**. A missed durable selection round therefore cannot explain this completion failure.

At `21:20:33.737` snapshot capture installs run `a45c354c-a7ab-43d7-9eae-61e69066e390`, UIDVALIDITY1/cursor0/high0/tailNULL/pages0, with no new freshness. The next 67 attempts return transport_busy without checkpointing the tail. At `21:21:43.205`, the same run checkpoints tail0; at `21:21:43.339`, the next quantum completes its empty tail. This is a stalled run continuation, not a fabricated completion, generation-reset loop, or a slow E FETCH.

Independent raw timestamp overlap gives a particularly strong counterexample: **52 of 67** E selection-to-busy-yield intervals are wholly covered by four simultaneous A–D native FETCH intervals. Each such A–D interval ends with the fixture's successful response after at least five seconds. For the other 15 attempts, recorded FETCH establishes only 2–3 occupied sockets; auth/EXAMINE/cleanup/slot transactions were not recorded, so their exact four-slot state is unknown. Do not turn this lower bound into reconstructed slot catalogs.

Frozen source explains the observable mechanism. RuntimeStore.claim advances tenant/mailbox service sequences before the adapter runs, including turns later returning busy. RuntimeStore.finish gives transport_busy a one-second eligibility delay. LiveReplyAdapter.operation separately authorizes then acquires a physical slot. acquireTransportSlot checks mailbox occupancy and chooses the first free global slot, with no durable wait queue, service sequence, or reservation for a selected mailbox. Competing workers can keep serving A–D in available-slot windows while E consumes unsuccessful turns. **Fair claim selection does not prove fair successful physical admission.** The 52 saturation witnesses make this an observed admission failure, not an inference from elapsed time alone.

The 1-second retry phase versus brief exact-release/new-acquisition windows is a plausible amplifier. Its precise contribution, mailbox-occupied versus global-full branch for the remaining 15 attempts, and cleanup timing are unmeasured. No unique root attribution to observer CPU/timers, stale grants, or OS scheduling is warranted. E's continuing ~1s selections and A–D successful ~5s operations refute a process-wide 69s event-loop stall as the direct explanation.

There is also a separate directly visible source condition: satisfied poll completion uses captured `now` for next_check_at/due_at (`RuntimeStore.finish` lines122–126), rather than the calculated 30-second delay. Repeated E completions consequently occur ~0.4–0.7s apart when slots are available. This raises work pressure, but the preserved chronology alone does not prove that correcting this branch would cure the 69,815ms admission gap. Do not patch this as the sole fix by assumption.

## Native/test semantics and retained acceptance

The trusted IPC fixture entry executes actual frozen dist/runtime/worker.js with execArgv=[]; both competing processes invoke the same runWorker composition as normal runtime. Each process owns four logical poll lanes, while physical IMAP slots remain globally four and one per mailbox. Normal main loads configuration and readiness; the trusted entry deliberately supplies live_provider modes and loop/once plus local TLS fixture. The fixture does not replace native adapter operations with local_fixture reads.

The traffic journal records only a4 FETCH. E has UIDNEXT1/cursor0/horizon0, and imapRead returns an empty page after successful native EXAMINE without FETCH. Therefore traffic[E]=[] does **not** establish absent native E requests. Successful snapshot and tail DB states establish proof consumption; exact E CAPABILITY/AUTH/EXAMINE request-response timestamps were not captured. Source requires new slot acquisition for each snapshot/read.

Initial all-five eligibility, later E due time, first four A–D scheduled five-second page successes, and E-first-before-old-second across actual restart are retained. First E selection=6,218ms; genuine first E completion=7,099ms. A–D all finish pages20/cursor2000/high3000/tailNULL/attempt1 and rescan_incomplete, with original due times retained. All five remain denominator. Physical max sockets=4. Three worker joins are code0/drained, no timeout; original test native1/114,995ms. These successes do not erase the failed healthy-E ≤30s completion criterion.

## Executed minimal counterproofs

1. Read-only Python replay of preserved JSON: map each E busy yield to its preceding selection; count native FETCH intervals spanning that complete interval. Exit0; results 67 busy, coverage {4:52,3:10,2:5}, maximum E selection gap1120ms. Inputs are SHA-bound in context_provenance.json. No product, DB, sockets, runner or test files are altered.
2. Actual frozen compiled `dist/mailboxes/transport-slots.js` acquisition called with an in-memory query client in Node22. Occupied case returns transport_busy and rolls back; free case acquires slot1 and commits. Both release client; assertions prove neither path queries runtime_due/service_seq. Exit0 in 601ms. This proves the admission boundary's behavior, not historical slot contents. The command used was:

```sh
/tmp/n7-expanded-runtime-20261006/bin/node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {acquireTransportSlot} from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/dist/mailboxes/transport-slots.js';
async function probe(free){const queries=[];let released=false;const client={query:async(sql,args)=>{queries.push(sql);if(sql.startsWith('SELECT 1 FROM transport_operation'))return{rows:[],rowCount:0};if(sql.startsWith('SELECT slot FROM transport_operation'))return{rows:free?[{slot:1}]:[],rowCount:free?1:0};return{rows:[],rowCount:1};},release(){released=true;}};let outcome;try{const s=await acquireTransportSlot({connect:async()=>client},'imap','tenant-probe','E-probe');outcome={slot:s.slot,mailbox:s.mailbox};}catch(e){outcome={code:e.code};}assert.equal(released,true);assert.equal(queries.some(s=>s.includes('runtime_due')||s.includes('service_seq')),false);return{free,outcome,queries,clientReleased:released};}
const occupied=await probe(false),available=await probe(true);assert.equal(occupied.outcome.code,'transport_busy');assert.equal(available.outcome.mailbox,'E-probe');console.log(JSON.stringify({occupied,available,network:false,database:false}));
JS
```

Prelaunch input SHA: transport-slots.js `50adabb94594c6d42ca0d884e371d4b9a5f3d78755dfe818c0eb13b06c52f1cb`; transaction.js `73a1c140d4c26fce559ea9c1f401362c743a0374dc5c177aa668df018a5cf6b9`; errors.js `960a11b1d06cc22ca03989ba183dfd16d1322b19cf9b8744874a9cd624fe9c4b`; Node `b1cbec894e45a5814b6ab756e1e14f8a76516273197e67e0412b57c1e10d0d9f`.

## One next bounded scope

Fresh MEDIUM owns **only tests/f10-runtime-protocol.test.ts and tests/f10-runtime-fixture.ts**, initially observer instrumentation, no product patch. Extend existing n7_fair instrumentation to record actual transport_operation acquire/release transitions with slot/mailbox/operation/owner identifiers and post-lock timestamps, plus all native commands/responses (excluding authentication payload) and loop observer query begin/end monotonic times. Add source/slot snapshots at E busy boundaries only if the same-transaction boundary is observable through the existing fixture seam; a delayed snapshot must be explicitly marked non-atomic. Keep successful real5s A–D operations, later initially eligible E, all five denominator, competing compiled workers/restart, physical4/one-per-mailbox, and literal20-page/120s hold unchanged.

Before any product fix, use ONE targeted observer diagnostic whose stopping condition is the first E busy interval with a proven four-slot acquire/release sequence and subsequent competing successful admission; do not invent a new framework, lower caps/thresholds, use rejected42s/7–20 variants, or blindly rerun the110s workload. The diagnostic may terminate and join after the counterexample is captured; it is explicitly not acceptance, and untouched original test127 retains the exact69,815ms failure. If existing fixture cannot give atomic busy-branch proof in this two-file scope, return a precise proposed seam to HIGH planning rather than widening author ownership. A product correction must make selected polling progress survive physical contention; preserve ownership sealing, FIRST lock, original due/service persistence and all native authorities. New independent final review remains mandatory after any fix.

## Ownership, resource and telemetry seal

No DB connection/query/reset, lock acquisition, network operation, daemon, agent launch, source write, global setting, expense or publication occurred. No owned DB transaction or physical slot remains; source/DB diagnostic lease returned to coordinator. Heavy mutex was not acquired because no PG/build/heavy workload ran. The sole pure Node subprocess has joined exit0. Prior three worker joins are retained as raw evidence, not revalidated current liveness. Scratch writes are limited to report.md/context_provenance.json/receipt.json. Available /tmp disk3033722880 bytes (>2GiB early-warning threshold). Default sandbox failed before first command; narrow read-only escalations were approved, with no rejection bypass.

Companion applied only for source-bound terminal handoff; telemetry/process-analysis forecasting is not this runtime diagnosis, so no historical telemetry analyzer, broad acceptance validator or historical record mutation was invoked. E2E preflight not_applicable: no E2E was launched. Mechanical implementation route not_applicable: immutable source; substantive risk high because concurrency and physical ownership are implicated. Canonical330/fullPG/physical/unit gates retained, not rerun or relabeled current acceptance. Missing metadata: actual model/effort, usage, cost, in-gap exact slots, observer timestamps, authority/grant/resource catalogs and full E wire chronology.

## All unique E completed_at values and preceding claims

| completion UTC | preceding selection UTC | generation | service_seq |
|---|---|---|---|
| 2026-10-06T21:20:31.049+00:00 | 2026-10-06T21:20:30.881Z | 3 | 39478 |
| 2026-10-06T21:20:31.591+00:00 | 2026-10-06T21:20:31.410Z | 6 | 39484 |
| 2026-10-06T21:20:32.316+00:00 | 2026-10-06T21:20:32.064Z | 9 | 39496 |
| 2026-10-06T21:20:32.91+00:00 | 2026-10-06T21:20:32.753Z | 12 | 39512 |
| 2026-10-06T21:20:33.524+00:00 | 2026-10-06T21:20:33.360Z | 15 | 39522 |
| 2026-10-06T21:21:43.339+00:00 | 2026-10-06T21:21:43.212Z | 85 | 40168 |
| 2026-10-06T21:21:43.801+00:00 | 2026-10-06T21:21:43.659Z | 88 | 40178 |
| 2026-10-06T21:21:44.363+00:00 | 2026-10-06T21:21:44.223Z | 91 | 40190 |
| 2026-10-06T21:21:44.852+00:00 | 2026-10-06T21:21:44.714Z | 94 | 40200 |
| 2026-10-06T21:21:45.272+00:00 | 2026-10-06T21:21:45.151Z | 97 | 40206 |
| 2026-10-06T21:21:45.709+00:00 | 2026-10-06T21:21:45.553Z | 100 | 40218 |
| 2026-10-06T21:21:46.143+00:00 | 2026-10-06T21:21:46.009Z | 103 | 40228 |
| 2026-10-06T21:21:46.609+00:00 | 2026-10-06T21:21:46.466Z | 106 | 40238 |
| 2026-10-06T21:21:47.027+00:00 | 2026-10-06T21:21:46.899Z | 109 | 40244 |
| 2026-10-06T21:21:47.429+00:00 | 2026-10-06T21:21:47.297Z | 112 | 40252 |
| 2026-10-06T21:21:47.931+00:00 | 2026-10-06T21:21:47.778Z | 115 | 40262 |
| 2026-10-06T21:21:48.459+00:00 | 2026-10-06T21:21:48.309Z | 118 | 40278 |
| 2026-10-06T21:21:48.958+00:00 | 2026-10-06T21:21:48.822Z | 121 | 40288 |
| 2026-10-06T21:22:03.866+00:00 | 2026-10-06T21:22:03.737Z | 138 | 40422 |
| 2026-10-06T21:22:04.297+00:00 | 2026-10-06T21:22:04.147Z | 141 | 40432 |
| 2026-10-06T21:22:04.791+00:00 | 2026-10-06T21:22:04.637Z | 144 | 40442 |
| 2026-10-06T21:22:05.232+00:00 | 2026-10-06T21:22:05.083Z | 147 | 40454 |
| 2026-10-06T21:22:05.694+00:00 | 2026-10-06T21:22:05.542Z | 150 | 40464 |
| 2026-10-06T21:22:06.14+00:00 | 2026-10-06T21:22:06.001Z | 153 | 40474 |
| 2026-10-06T21:22:06.836+00:00 | 2026-10-06T21:22:06.556Z | 156 | 40480 |
| 2026-10-06T21:22:07.391+00:00 | 2026-10-06T21:22:07.225Z | 159 | 40486 |
| 2026-10-06T21:22:07.975+00:00 | 2026-10-06T21:22:07.778Z | 162 | 40492 |
| 2026-10-06T21:22:08.547+00:00 | 2026-10-06T21:22:08.377Z | 165 | 40502 |
| 2026-10-06T21:22:09.679+00:00 | 2026-10-06T21:22:09.463Z | 168 | 40516 |
| 2026-10-06T21:22:10.202+00:00 | 2026-10-06T21:22:10.043Z | 171 | 40526 |
| 2026-10-06T21:22:10.748+00:00 | 2026-10-06T21:22:10.570Z | 174 | 40540 |

## Every E selection within the failed completion interval

| event | selected UTC | generation | service_seq | yielded UTC | result |
|---|---|---|---|---|---|
| 130 | 2026-10-06T21:20:33.586Z | 16 | 39528 | 2026-10-06T21:20:33.741Z | ready |
| 138 | 2026-10-06T21:20:33.754Z | 17 | 39532 | 2026-10-06T21:20:33.792Z | transport_busy |
| 143 | 2026-10-06T21:20:34.801Z | 18 | 39542 | 2026-10-06T21:20:34.819Z | transport_busy |
| 165 | 2026-10-06T21:20:35.828Z | 19 | 39550 | 2026-10-06T21:20:35.858Z | transport_busy |
| 169 | 2026-10-06T21:20:36.868Z | 20 | 39556 | 2026-10-06T21:20:36.886Z | transport_busy |
| 173 | 2026-10-06T21:20:37.902Z | 21 | 39566 | 2026-10-06T21:20:37.929Z | transport_busy |
| 182 | 2026-10-06T21:20:38.949Z | 22 | 39578 | 2026-10-06T21:20:38.975Z | transport_busy |
| 187 | 2026-10-06T21:20:39.987Z | 23 | 39588 | 2026-10-06T21:20:40.003Z | transport_busy |
| 209 | 2026-10-06T21:20:41.025Z | 24 | 39596 | 2026-10-06T21:20:41.052Z | transport_busy |
| 213 | 2026-10-06T21:20:42.066Z | 25 | 39602 | 2026-10-06T21:20:42.082Z | transport_busy |
| 217 | 2026-10-06T21:20:43.093Z | 26 | 39612 | 2026-10-06T21:20:43.110Z | transport_busy |
| 226 | 2026-10-06T21:20:44.128Z | 27 | 39624 | 2026-10-06T21:20:44.164Z | transport_busy |
| 231 | 2026-10-06T21:20:45.177Z | 28 | 39634 | 2026-10-06T21:20:45.191Z | transport_busy |
| 253 | 2026-10-06T21:20:46.205Z | 29 | 39642 | 2026-10-06T21:20:46.246Z | transport_busy |
| 257 | 2026-10-06T21:20:47.262Z | 30 | 39648 | 2026-10-06T21:20:47.280Z | transport_busy |
| 261 | 2026-10-06T21:20:48.291Z | 31 | 39658 | 2026-10-06T21:20:48.304Z | transport_busy |
| 271 | 2026-10-06T21:20:49.313Z | 32 | 39670 | 2026-10-06T21:20:49.329Z | transport_busy |
| 275 | 2026-10-06T21:20:50.409Z | 33 | 39680 | 2026-10-06T21:20:50.438Z | transport_busy |
| 297 | 2026-10-06T21:20:51.447Z | 34 | 39688 | 2026-10-06T21:20:51.461Z | transport_busy |
| 301 | 2026-10-06T21:20:52.474Z | 35 | 39694 | 2026-10-06T21:20:52.499Z | transport_busy |
| 305 | 2026-10-06T21:20:53.510Z | 36 | 39704 | 2026-10-06T21:20:53.523Z | transport_busy |
| 315 | 2026-10-06T21:20:54.538Z | 37 | 39716 | 2026-10-06T21:20:54.566Z | transport_busy |
| 319 | 2026-10-06T21:20:55.577Z | 38 | 39726 | 2026-10-06T21:20:55.588Z | transport_busy |
| 341 | 2026-10-06T21:20:56.597Z | 39 | 39734 | 2026-10-06T21:20:56.619Z | transport_busy |
| 345 | 2026-10-06T21:20:57.630Z | 40 | 39742 | 2026-10-06T21:20:57.664Z | transport_busy |
| 349 | 2026-10-06T21:20:58.677Z | 41 | 39754 | 2026-10-06T21:20:58.699Z | transport_busy |
| 359 | 2026-10-06T21:20:59.709Z | 42 | 39766 | 2026-10-06T21:20:59.734Z | transport_busy |
| 363 | 2026-10-06T21:21:00.745Z | 43 | 39772 | 2026-10-06T21:21:00.855Z | transport_busy |
| 385 | 2026-10-06T21:21:01.865Z | 44 | 39780 | 2026-10-06T21:21:01.877Z | transport_busy |
| 389 | 2026-10-06T21:21:02.886Z | 45 | 39790 | 2026-10-06T21:21:02.901Z | transport_busy |
| 393 | 2026-10-06T21:21:03.912Z | 46 | 39800 | 2026-10-06T21:21:03.925Z | transport_busy |
| 403 | 2026-10-06T21:21:04.935Z | 47 | 39812 | 2026-10-06T21:21:04.954Z | transport_busy |
| 407 | 2026-10-06T21:21:05.961Z | 48 | 39818 | 2026-10-06T21:21:05.973Z | transport_busy |
| 429 | 2026-10-06T21:21:06.984Z | 49 | 39826 | 2026-10-06T21:21:07.033Z | transport_busy |
| 433 | 2026-10-06T21:21:08.052Z | 50 | 39838 | 2026-10-06T21:21:08.072Z | transport_busy |
| 437 | 2026-10-06T21:21:09.084Z | 51 | 39848 | 2026-10-06T21:21:09.137Z | transport_busy |
| 447 | 2026-10-06T21:21:10.168Z | 52 | 39862 | 2026-10-06T21:21:10.193Z | transport_busy |
| 451 | 2026-10-06T21:21:11.203Z | 53 | 39864 | 2026-10-06T21:21:11.219Z | transport_busy |
| 473 | 2026-10-06T21:21:12.229Z | 54 | 39876 | 2026-10-06T21:21:12.250Z | transport_busy |
| 477 | 2026-10-06T21:21:13.263Z | 55 | 39886 | 2026-10-06T21:21:13.280Z | transport_busy |
| 481 | 2026-10-06T21:21:14.287Z | 56 | 39896 | 2026-10-06T21:21:14.301Z | transport_busy |
| 491 | 2026-10-06T21:21:15.310Z | 57 | 39908 | 2026-10-06T21:21:15.324Z | transport_busy |
| 495 | 2026-10-06T21:21:16.334Z | 58 | 39910 | 2026-10-06T21:21:16.356Z | transport_busy |
| 517 | 2026-10-06T21:21:17.367Z | 59 | 39922 | 2026-10-06T21:21:17.399Z | transport_busy |
| 521 | 2026-10-06T21:21:18.409Z | 60 | 39932 | 2026-10-06T21:21:18.431Z | transport_busy |
| 525 | 2026-10-06T21:21:19.447Z | 61 | 39942 | 2026-10-06T21:21:19.464Z | transport_busy |
| 535 | 2026-10-06T21:21:20.477Z | 62 | 39954 | 2026-10-06T21:21:20.491Z | transport_busy |
| 539 | 2026-10-06T21:21:21.499Z | 63 | 39956 | 2026-10-06T21:21:21.514Z | transport_busy |
| 561 | 2026-10-06T21:21:22.522Z | 64 | 39968 | 2026-10-06T21:21:22.533Z | transport_busy |
| 565 | 2026-10-06T21:21:23.545Z | 65 | 39978 | 2026-10-06T21:21:23.562Z | transport_busy |
| 569 | 2026-10-06T21:21:24.570Z | 66 | 39988 | 2026-10-06T21:21:24.580Z | transport_busy |
| 579 | 2026-10-06T21:21:25.588Z | 67 | 40002 | 2026-10-06T21:21:25.602Z | transport_busy |
| 583 | 2026-10-06T21:21:26.612Z | 68 | 40004 | 2026-10-06T21:21:26.635Z | transport_busy |
| 605 | 2026-10-06T21:21:27.646Z | 69 | 40016 | 2026-10-06T21:21:27.665Z | transport_busy |
| 609 | 2026-10-06T21:21:28.672Z | 70 | 40026 | 2026-10-06T21:21:28.683Z | transport_busy |
| 613 | 2026-10-06T21:21:29.697Z | 71 | 40036 | 2026-10-06T21:21:29.721Z | transport_busy |
| 623 | 2026-10-06T21:21:30.733Z | 72 | 40050 | 2026-10-06T21:21:30.755Z | transport_busy |
| 627 | 2026-10-06T21:21:31.767Z | 73 | 40058 | 2026-10-06T21:21:31.782Z | transport_busy |
| 649 | 2026-10-06T21:21:32.792Z | 74 | 40070 | 2026-10-06T21:21:32.812Z | transport_busy |
| 653 | 2026-10-06T21:21:33.824Z | 75 | 40080 | 2026-10-06T21:21:33.850Z | transport_busy |
| 657 | 2026-10-06T21:21:34.860Z | 76 | 40090 | 2026-10-06T21:21:34.873Z | transport_busy |
| 667 | 2026-10-06T21:21:35.882Z | 77 | 40102 | 2026-10-06T21:21:35.896Z | transport_busy |
| 671 | 2026-10-06T21:21:36.903Z | 78 | 40104 | 2026-10-06T21:21:36.913Z | transport_busy |
| 693 | 2026-10-06T21:21:37.920Z | 79 | 40116 | 2026-10-06T21:21:37.936Z | transport_busy |
| 697 | 2026-10-06T21:21:38.947Z | 80 | 40126 | 2026-10-06T21:21:38.960Z | transport_busy |
| 701 | 2026-10-06T21:21:39.972Z | 81 | 40136 | 2026-10-06T21:21:39.989Z | transport_busy |
| 711 | 2026-10-06T21:21:41.029Z | 82 | 40148 | 2026-10-06T21:21:41.039Z | transport_busy |
| 715 | 2026-10-06T21:21:42.046Z | 83 | 40150 | 2026-10-06T21:21:42.061Z | transport_busy |
| 733 | 2026-10-06T21:21:43.071Z | 84 | 40160 | 2026-10-06T21:21:43.207Z | ready |
| 743 | 2026-10-06T21:21:43.212Z | 85 | 40168 | 2026-10-06T21:21:43.343Z | ready |

Substantive work sealed: 2026-10-06T21:30:42.451500+00:00. Status: completed. F10 acceptance: pending.
