# I5b independent review
Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Source: 8d6098c55d8ddfdb87d9149342e88e851a90f9c3
Verdict: ACCEPT
Confirmed findings: 0 (critical/high/medium/low: 0/0/0/0).
Scope: 5f6eb7be→cd4df7d6 seven owned files, plus 1dad9667 tests/sharing.integration.test.js:29 literal migration count 6→8. Acceptance is limited to I5b software contracts.
Profile: compact-quality-first-v2; inherited F07 XL; independent bounded REVIEW, sole reviewer, no delegation.
Requested reviewer: gpt-6-astra/high. Actual reviewer model/effort/usage/cost: null pending host metadata; no fallback or model-switch claim.
Author actual model: gpt-6.1-sol/high for both implementation and one-line correction, established by their actual-runtime.json records.

| Bounded contract | Result and inspected implementation |
|---|---|
| Closed hosted canonical and SQL binding | PASS — web/replicate-quality.js:22–38 strips only DB output_key, reuses I5a validateHostedOutput, checks full canonical SHA, job/key/mode/style and shared columns; preserves null metrics/model_revisions and normalizes only nonnull seed/queue values. |
| Exact config and actual private artifacts | PASS — web/replicate-quality.js:8–10,40–43 and web/quality.js:67–76 bind unchanged I3 provenance and actual input/output/depth/config bytes, including upload hash. No invented local revisions, provider warm/hardware/cost or raw URL/token fields. |
| Closed report and independent declaration | PASS — web/replicate-quality.js:48–57 requires actual report SHA, measured-hosted kind, nonsynthetic measured claim, reviewer/time/source and distinct reviewer attestation with timestamp/source/statement. |
| Corpus coverage and target | PASS — web/replicate-quality.js:59–88 checks 36–1000 pairs, ≥12 distinct input hashes sharing three allowed styles, duplicate/alias/input-swap denial, zero openings and finite anchors in [0,0.02]. Each pair binds full canonical/config, pins/source/style and license/annotation/measurement references; target full evidence/style must match. Different per-input request/config hashes are valid. |
| Privileged review and races | PASS — existing createQuality.review only; hashes/report work precedes account→job locks. Final owner/upload/key/style/mode/evidence/quality/deletion/hold checks gate append-only review. Rejected cannot reaccept; unchanged releaseRejected preserves unique release. web/quality.js:55–98. |
| Current eligibility | PASS — web/quality.js:105–126 checks four actual artifacts plus immutable matching accepted review/corpus and repeats accepted state and live row bindings after reads. |
| Publication, reads, lists and caches | PASS — shared real-mode classification replaces both hardcoded controlnet gates; existing consent/owner/review/hold/token/version/hash and final account→job→share authorization remain. web/sharing.js:13–24,44–76,139–154,177–214. public-pages.js has no missed mode gate. |
| Private labels and old modes | PASS — web/composite.js:37–45 permits private hosted unverified with UNVERIFIED; fixture remains DEMO UNVERIFIED. Old controlnet evidence/manifest/revision/corpus validation remains separate; fixture acceptance stays forbidden. |
| Scope and runtime evidence | PASS — all eight owned source hashes match the two snapshots and Source; critical DB008/jobs/evidence/I1–I3 files match protected hashes. Existing source-bound unit, mutation and actual PG evidence supports the bounded contracts below. |

No confirmed defect requiring a reproducer or minimal fix. No optional style findings. This is a source/evidence review; no tests, Docker, network/provider calls, installs, product edits, commits, push, run-events or global configuration changes were performed.

Source/evidence proof: HEAD equals Source. Spec and reviewer launch hashes match the supplied digests. The seven-file snapshot is replicate-i5b-snapshot.json; the separate replicate-i5b-fixture-snapshot.json binds the eighth file and explicitly protects the original seven. The original snapshot is not represented as covering the correction. Direct product/test diff at Source contains exactly these eight paths. Protected checks covered db/002-generation.sql, db/007-replicate.sql, db/008-replicate-evidence.sql, web/generation.js, web/jobs.js, web/provider-submissions.js, web/provider.js, web/replicate-evidence.js, web/replicate-media.js and web/replicate.js. The 1189 historical documentation hashes were not re-audited.

All evidence paths below are under docs/telemetry/n8-20261002-1740:

- replicate-i5b-checks.json and replicate-i5b-local-tests-candidate.log: 28/28 passing, zero failures/skips; static candidate syntax exit 0. Relevant logs match snapshot hashes.
- replicate-i5b-mutation-candidate.json and its baseline/mutant/restored logs: exits 0/1/0; unchanged synthetic-denial oracle fails with “Missing expected exception” on the mutant. Baseline/restored helper SHA is 1d4f19b33c92bc0889d4984397739b4236566d1592d094087efd25b4b52cbb33, exactly the reviewed helper; oracle file SHA also matches. Earlier different-SHA mutation is historical only.
- replicate-i5b-pg-binding.log: Node v22.20.0, seven files matched. Hosted quality PG 7/7 and old quality PG 7/7 pass at cd4df7d6. The new suite uses real I1 authorization/identity/observation and I5a completion, without trigger bypass or direct evidence insertion; inspected accountBarrier waits for actual pg_stat_activity lock contention. Final review and afterPrepare public/cache/list denial cases are substantive.
- replicate-i5b-pg-sharing-pg16.log preserves the actual original 8 !== 6 failure before sharing cases; original summary overall_exit remains 1. The correction changes only that obsolete literal, consistent with existing DB007/008.
- replicate-i5b-fixture-pg-binding.log: Node v22.20.0, eight files matched. Old sharing PG 6/6 passes at 1dad9667; final fixture summary overall_exit 0. Both cleanup exits are 0. Composite evidence is 7+7+6 PASS across the two runs, not a claim that the original run was wholly green.
- Both recorded PG configurations use cached Node22 image plus exact read-only overlays and PostgreSQL16.10; suites assert actual major versions. The reviewed source retains identical product bytes across both runs. No reviewer runtime execution is implied.
- replicate-i5b-actual-runtime.json and replicate-i5b-fixture-actual-runtime.json record actual Sol6.1/high author contexts, exit 0, elapsed 1229.263s and 94.684s, respectively; raw usage totals 2209631 and 181242 tokens, cost null. Reviewer usage/cost remain null until host capture.

Operator trust limitation: application validation proves declaration shape, binding and software authorization, not that licensed photos, real measurements or independent examination actually occurred. The privileged operator must retain and verify the actual licensed/annotated corpus and measurement/attestation materials. Explicit SOFTWARE TEST ONLY fixtures exercise otherwise-valid claims and confer no actual quality, performance, billing or project acceptance.

Remaining gates outside this review: I4b hosted worker/request reconstruction and cleanup; I6 send-CAS mutation/mock browser wiring; I7 full regression/canonical docs/final review; I8 actual shared-Docker browser E2E. Actual corpus, privacy/license/safety/billing, paid pilot/performance and deployment gates remain pending and require their existing authorization. Future worker absence is not an I5b defect. Parent owns continuation and integration.

Started-At: 2026-10-03T12:09:16+00:00
Finished-At: 2026-10-03T12:14:23.190293+00:00
Review elapsed seconds: 307.190 (wall clock from first recorded review operation; includes reading and artifact preparation).
