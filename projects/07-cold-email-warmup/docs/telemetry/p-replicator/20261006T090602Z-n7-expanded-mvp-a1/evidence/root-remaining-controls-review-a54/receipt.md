# A54 independent remaining-controls review
Run-ID: 20261006T090602Z-n7-expanded-mvp-a1
Work-Unit-ID: f11_a54_remaining_controls_review
Attempt-ID: A54
Source-Revision: e9ec591e714932cfdd17339f5017b460f8476b16
Baseline-Revision: 7dee9b9a33b87359feeae4fb82b88331ca50d5de
Source-Root: /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
Source-SHA256: ad86b17826e6807236442fa398a5575f9470dfe7ce5c0d9daf91ace9b5c82157
Test-SHA256: 948dff75bc4433720525397703505dbcedf775c0c365f9cfb050ac1bf71f28a6
Launch-SHA256: 669a1df2eecd8463a87bd50f9d4b67bf26889504c14438fa03dc0c8f84fa34cb
Started-At: 2026-10-07T11:20:16+00:00
Source-Cut-At: 2026-10-07T11:25:09.432231+00:00
Finished-At: 2026-10-07T11:26:09.773861+00:00
Verdict: LOCAL_TEST_DELTA_ACCEPT
Profile: model-routing-econom
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null
Actual-Effort: null
Usage: null
Cost: null
Measurement-Gaps: Host runtime model/effort and usage/cost evidence unavailable; no estimates substituted.
Source-Ownership: released throughout; no writer or runtime actor launched by reviewer.
Preflight: not_applicable (read-only review, no E2E execution).

One fresh independent pass on the immutable A52 delta, with the approved A51 plan SHA3405f012e9f64fcd4da4b8bec346c772d27e6595ac22325d5d0ba58aab7e9063 and context-manifest SHA899d43bdbe2cc5b5a096ebe71e08cd193c138d36286e71ad5f161afcee4bd99d. Objective packet SHA454daf36fcc7664461732ba347172d395044c2347535406909e58a0bdbb2386b. No author receipt/report/telemetry/deviation/chat or coordinator historical narrative read. Root/project instructions, relevant rules, companion handoff and canonical specification/architecture were consulted. Initial sandbox failed before executing; approved narrowly scoped shell fallback performed read-only inspection and wrote only A54 evidence. No test/runtime/DB/network/install/source mutation, delegation, or policy change.

Findings: none within the assigned local test delta. Exact one-file scope is tests/f10-runtime-protocol.test.ts. HEAD, commit delta, candidate/final full projection and all current 222 source/build hashes agree. All591 objective files independently match packet hashes and byte sizes. Product source/dist are unchanged in the delivered candidate. Existing positive guards and original phase-delay assertions remain byte-preserved by the immutable diff.

AC1 PASS: lines459-467 tighten only attempt_deadline after actual phase_start under eligibilityTransaction FIRST(7,1), preserve whole post-mutation baseline and foreign rows/slots. Original admitted450000ms queue delta and12000ms window are retained; db/016 permits shortening below the450s maximum. Native lifetime source confirms exit/join and exact successful physical release precede recovery; original window is still future at DB recovery clock. Lines496-505 assert exact whole logical held/capture_window_expired row, earliest tightened terminal and bounded24h expiry, immutable queue/window/metadata expiry, socket0/occupancy0/no second phase and no subsequent reopening. Raw greenfinal shows deadline11:09:19.471Z, native socket close11:09:19.483Z, recovery11:09:19.533Z, window end11:09:30.882Z. This is explicitly synthetic independent deadline evidence; no natural/load timing claim.

AC2 PASS: lines469-471 replace only operation UUID on exactly owned physical protocol/slot while checking original operation/process/host and preserving the complete replacement row. Native planned drain uses the retained genuine slot. Unchanged lifetime/slots source gives no interrupted capability after a zero-row exact release. Lines496-505 prove whole physical replacement remains occupied and whole logical event safely held/capture_cancelled, foreign rows unchanged and no reopening. Raw greenfinal socket closes11:09:27.888Z before held disposal11:09:27.927Z; complete replacement occupancy remains1. Finally line512 joins pending before fixture cleanup, locks/checks whole row then clears only exact replacement protocol/slot/operation/process/host under FIRST and requires rowCount1/physical0. Inner finally closes fixture/pool even if preservation assertion fails; strict assertions are retained. The accepted native counterproof demonstrates that assertion failure path terminates normally with exit1.

AC3 PASS: operationcounterretry removes ONLY release operation equality with necessary parameter remap (src/mailboxes/transport-slots.ts:51 plus its dist). Unchanged final tests produce native ERR_ASSERTION, whole replacement physical row unexpectedly cleared; exit1, TAP fail1 and complete terminal summary. attemptcounter removes EXACT three redundant deadline fences at context-store.ts:127,139,170 plus its dist; unchanged tests fail exact logical held-row expectation because capture resumes pending before original window closes. No trigger/test/value/other authority removals. Counterproof frozen launch projections match recorded freezes. Full PID/startTicks joins at11:10:51.717903Z and11:13:24.564423Z precede restored byte proofs11:10:57.735574Z and11:13:30.027345Z. Delivered source/dist equal candidate bytes. Rejected operationcounter exit124 and false join remain rejected; its partial AssertionError is not counted as a valid counterproof.

Validation PASS from source-bound raw evidence: greenfinal2/2 native PASS, controls24/24 native PASS with no cancellations/skips. Both accepted counterproofs exit1 for the exact intended assertion cause, never timeout124. Every launch has fresh absent trace, exact command/source/build/helper/environment/schema preflight; helper hashes match current bytes. Positive metadata native delays2800.72595/2800.69859ms and text2802.57474/2801.54951ms retain the>=2800 floor. Raw typecheck/lint/build/diff checks exit0. Final185 exact process receipts (171 native children) all joined; current read-only /proc check finds no same PID/startTicks alive. Terminal DB raw identity has zero other sessions; independently compared public/A44/A45/A50 complete table snapshots equal before/after. All five A52 schemas have physical0/runtime_claims0/body_claims0. Protected historical ownership remains preserved; no reviewer DB access occurred.

Independent mechanical evidence: independent-checks.json SHA50f63001f474c381652fd9dfb9c26baa4f265ca5aee10fec941e2150c925351f. It contains exact source/build/objective digests, native launch/raw digests, projections, PID liveness and table/claim results; original raw artifacts remain in the A52 directory. Coordinator must run the existing native check-swarm-receipts on the unchanged predispatch manifest before aggregation.

Remaining AC: Full F11 remains UNACCEPTED. No integration/material/fleet/legacy gate waived. Separate registered child-schema readiness, original diagnostics integration, complete context-integration tail/partition coverage, full mandatory regressions, literal20-page real5s/native19 legacy obligation, original full300 fault/original150s SIGTERM then healthy full300, ALL30/fleet denominator and all remaining delivery gates stay assigned to root. Local acceptance does not authorize live network, provider calls, spend, new access, publishing or deployment.
Status: completed
