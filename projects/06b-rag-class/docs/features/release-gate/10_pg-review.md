# F16 targeted independent PostgreSQL review — review-2

Verdict: ACCEPT_WITH_CAVEATS for the targeted PG test and evidence compatibility. No concrete blocking source defect found. This completes the assigned review, not F16 release acceptance or MVP delivery.

- Run-ID: 20261003T064351Z-release-gate
- Work-Unit-ID: release-gate-pg-independent-review
- Attempt-ID: review-2
- Source-Revision / verified HEAD: edb04288fc687f8da97b86a0748230be66437aad
- Review build revision: null (read-only review; no build executed).
- Launch-SHA256: cfde82035c89e7b9664d21909d2579ff3f9a4694fadb2cdd34632a8a4394b1b7
- PG snapshot SHA256: 2c73e18a2e6099c0d613c22a3710b6abbf3951e84656896faf4c776ba66a797a
- Exact test SHA256: 319d115324898978fe19d3585dce9072a10f1dfaf070f3b7837e8000b9250aca
- Unchanged live-store helper SHA256: ec4e86139b3c1be5df27c170ea9317d359b13986160a808051a8307c4ae9676f
- Recorded PG runner image: sha256:ff0c8692df9cfbaeae0d176d4c9de9a28cadb7fd9d5e9dae2725e99ee2fcb65f
- Profile: compact-quality-first-v2; inherited substantive M / mechanical S, targeted independent review.
- Requested model/effort: gpt-6-astra / medium. Actual model/effort: null; authoritative runtime metadata not exposed to this reviewer. No claim of a model switch.
- Usage/input/output/reasoning/cached tokens, active time and cost: null, unavailable; no estimated counters substituted.

Independent obligations were derived from Specification SC-US-006-4 and scripts/calibration/live-store.ts before reading author validation and earlier review. Read applicable root/project instructions and used project-work-companion for evidence/source boundaries. E2E readiness: not_applicable, existing-artifact review only. Parent work-record was already present; only assigned report and receipt are written, with parent integration owned by coordinator.

The independent oracle requires real service-role SQL, verified is_test fixture, exact corpus persistence, real search isolation despite equally close foreign vectors, and scoped accounting with unknown usage/cost preserved. SC-US-006-4 separately requires 30 live gpt-4.1-mini observations: 20 known questions, at least 17 cited answers, and 10/10 high-similarity unknown questions refused. Fake-provider PG checks cannot satisfy that release gate.

| Obligation | Assessment |
|---|---|
| Actual exported helpers | Test directly imports createFixture, prepareCorpus, seedCorpus, readEvidence from the unchanged live-store module. Vitest aliases resolve db/rag source; existing real PG helpers and migration global setup are used. No SQL/helper mock replaces the implementation. |
| Service role and test marking | Assertions verify session_user n6b_app_service, current_user n6b_service inside withService, and stored account.is_test=true. Owner connection independently inspects persisted rows. |
| Corpus persistence | Ten documents/chunks checked for title, URL, text/hash, ordinal, token count, source bot/account, and vector dimensions 1536; two checkpoints and one bounded embed gateway call asserted. |
| Search isolation | Actual searchChunks SQL runs for two fixtures with equal-vector corpora; own search returns five own chunk IDs, top similarity 1 and expected text; foreign search returns five IDs outside the own set. Fake vectors are disclosed. This proves the tested SQL filter, not live semantic retrieval, HNSW execution-plan selection or scale performance. |
| Evidence scoping | Populated model/question rows include own bot, same-account sibling, and foreign tenant. Result count/kinds/IDs/token sums exclude sibling and foreign rows. Quota scope checks include own account and global counters and exclude foreign-account counters. Source SQL filters both account_id and bot_id for logs. |
| Null usage and billing | Incomplete started answer call makes aggregate input/output null; billing stays null. Global quotas remain shared counters, not isolated per-run consumption or monetary measurement. |
| Runner/evidence | Read-only mounts bind relevant source/test inputs; cached image identity and no ports / one CPU per service are recorded. Shell short-circuits overlay verification, pretest, typecheck and targeted test. No runner was executed by this review. |

Independently recalculated the manifest digest and all 65 file hashes: 65 matched, zero mismatches. Recalculated launch, test and helper digests; all match the brief. Snapshot metadata identifies e5672838a107c2cafc616600a4cb00de7d5895b8 plus the then-new test; the immutable manifest binds its actual bytes to current HEAD edb04288. Git comparison confirms no product/helper/runtime/dependency changes in the PG increment.

Recorded command (data only): npm run pretest && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && npm run test:int -- packages/rag/tests/int/release-gate.int.test.ts.
Evidence: tests/artifacts/release-gate/pg-validation.txt shows in-container verification of 65 files, package builds and 3/3 passing tests; pg-validation-exit.txt and pg-driver-exit.txt both contain 0. Sequential shell execution supports pretest exit 0 and root typecheck exit 0. pg-container-bindings.txt matches the stated image, read-only overlays, empty port bindings and CPU allocation. Cleanup log records removal of the unique stack/private env; remaining container/network/volume files are empty. These are inspected execution records, not a fresh runtime inspection.

Both prior PG failures remain visible: pg-pass1-validation.txt has missing calibration/check-cjm overlays causing typecheck exit 2; pg-pass2-validation.txt has bot_public_id_format failure in the sibling fixture, with 2 passed / 1 failed. Final test uses randomBytes(9).toString('base64url'). No product helper change was needed. The successful final result does not erase these attempts.

V-1 disposition: accept the repaired composite regression result with provenance caveat. offline-full-unit.txt records 676 passed / 7 failed (all seven worker boot cases failed on missing workspace dist exports). offline-boot.txt records canonical pretest and exactly that boot file passing 7/7. Thus 683 distinct tests have passing observations across two runs, not a monolithic green full suite. Git diff from 0c6fb48efacb7ae59ba970c0b8774083405c1ed2 to reviewed HEAD changes only documentation/evidence and the new PG test/runner; product and existing unit-test bytes remain unchanged. Container IDs for the two offline runs differ. The supplied offline artifacts do not provide the same in-container hash/mount attestation as the PG run; identical runtime overlay is consequently a coordinator assertion, not independently established here. This limits provenance strength, not evidence of a new code regression. No unchanged-green full-suite repetition requested or performed, per owner instruction.

C-1 disposition: the narrow real-PG tooling execution gap is addressed by source-bound 3/3 evidence. Remaining live 30-question calibration, public stand/CJM, foreign-origin browser behavior, rollback and performance gates remain NOT_EXECUTED. Historical F15 310-PG/build/UI results are historical only and are not current release evidence. C-2 from the earlier review remains: actual live answers need human semantic review; keyword/value scoring alone does not establish truth.

No new blocking findings; no optional polish requested. Mandatory remaining release gates prevent release/MVP acceptance and belong to the coordinator's continuing F16 task. This review neither authorizes external actions nor claims those gates passed. No donors/N6, secrets, network, Docker, new runtime probes, children, product edits, commit or push were used.

Delivery report: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/features/release-gate/10_pg-review.md
Terminal receipt: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate/evidence/review-2-receipt.md
Telemetry root: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate
Launch time: 2026-10-03T07:34:57.734459+00:00
Receipt prepared: 2026-10-03T07:37:51.204529+00:00
Elapsed launch-to-receipt: 173.470 seconds (180-second budget); full final response follows within the same bounded attempt. Active time unknown. Savings not established.

Status: completed
