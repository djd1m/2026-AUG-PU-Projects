# N5 explicit fake STT pipeline correction

RUN_ID:20261028-n5-support-implementation
WORK_UNIT_ID:support-backend
Attempt-ID:support-fake-pipeline-fix-01
Baseline-Revision:f45c832cb300d297b02ef8bc1640387e392e557d
Root-Integrated-Input-Revision:b755 (root-supplied product-equivalent source)
Source-Revision:b17ee1d6a7c6f77a8b6b3c1d3024ab4379204241
Spec-SHA256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Canon-SHA256:560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
Original-Launch-SHA256:f5b949d88177aee59e4140136c97d3b9d8d147d32376fc68975cb9f67c5f6631
Correction-Launch:root explicitly assigned worker fake branch and new support-fake-pipeline.test.ts before editing; bounded15min; no new manifest supplied
Finished-At:2026-10-28T02:18:11.748182+00:00
Observed-Check-Start:2026-10-28T02:13:10Z
Observed-Elapsed-Seconds:301.748
Verdict:PASS for assigned fake fixture correction and local production-validator checks; actual canonical application runtime remains root-owned

Cause:old fake STT returned one word0..1 and no segments for a200s recording, while unchanged FakeSelector(valid) proposes0..25/30..55/60..85. Production word snapping then rejected every fragment. Only the explicit fake branch now returns clearly synthetic test words at deterministic1s intervals, final word clipped to measured duration, and a synthetic segment spanning that duration. Invalid/nonpositive/nonfinite duration rejects before array generation; cancellation still rejects before work. Typed transcriber signature, provider attribution and production fake-mode gate unchanged. No fallback or synthesized timings for real STT.

Live OpenRouter/Yandex source suffix verified byte-identical to baseline before checks. Live-Branch-SHA256:c36147df6e987708c7efa16102574836d288bc232e2bf0bf7d1a8c1118d8935b
Only assigned files changed:
- projects/05-podcast-clips-opus/apps/worker/src/stt/client.ts:SHA256 7eaa49ccffcb4aa7a5aa83c4b694885ce51db93c8e9b33401c28777748a49385
- projects/05-podcast-clips-opus/tests/support-fake-pipeline.test.ts:SHA256 70ff34a552de1f17c604c6e619b4843e28a2235c2a54799849b5f1599eef5ac8
Commit:b17ee1d6a7c6f77a8b6b3c1d3024ab4379204241
Worktree:clean

Checks:
- Original fake branch temporarily restored, new regression run:exit1. Fixed branch restored in finally; no source mutation remains.
- Node22 scripts/test.mjs tests/support-fake-pipeline.test.ts tests/selection.test.ts tests/config.test.ts:exit0,3files90/90PASS,0skipped,4.72s. New test file16cases covers direct200s fake STT to existing FakeSelector and unchanged parseTranscript/validateFragments; actual180s chunkBoundaries plus overlap mergeWords for200s; fractional/short measured bounds with zero/one/two/three valid unchanged candidates; invalid durations; cancellation; no provider/file IO and production fake refusal.
- npm run typecheck --workspace apps/worker:exit0.
- npm run build --workspace apps/worker:exit0 (includes existing queue build), no Next build.
- npm run lint:exit0.
- git diff --check:exit0.
- TypeScript diagnostics filtered specifically to new tests/support-fake-pipeline.test.ts:none,exit0; not an integrated whole-test typecheck claim.
Red-Green-Receipt:/tmp/n5-support-backend-checks-20261028/fake-pipeline-red-green-01.json
Red-Green-Receipt-SHA256:7df2f253ff9ae4728a7f0171c9f287e140551b0a26acbd2b58b8d4a65e381800
Worker-Build-Log:/tmp/n5-support-backend-checks-20261028/fake-pipeline-worker-build-01.log
Worker-Build-Log-SHA256:d9f397069a5a8797365700ce0332755c173bbba33ef5c8ef3aff199a347b6c15
Red/green individual log paths/hashes are in the JSON receipt; all private0600.

Requested model:gpt-6.1-sol medium,same author context; actual model/usage/cost unavailable(null). No paid model call, JWT/env/payment/schema/public-route/profile changes or production deployment. Production validators, selector, Yandex/OpenRouter branches and config gates untouched.
Next executor:root verifies/merges this immutable commit, stops/rebuilds isolated test workers, runs affected STT/config and fresh whole final regression, then reruns scripts/seed-ui-fixture.mjs and the actual explicit-fake application canonical journey. Local transcript/selection assertions are not SQL stand-ins for a full pipeline PASS and do not claim actual upload/render/browser success.

endStatus: completed
Status: completed
