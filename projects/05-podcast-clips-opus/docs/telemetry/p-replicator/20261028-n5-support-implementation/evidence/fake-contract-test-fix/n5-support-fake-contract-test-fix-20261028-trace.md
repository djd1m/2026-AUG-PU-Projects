# N5 stale fake contract assertion correction

RUN_ID:20261028-n5-support-implementation
WORK_UNIT_ID:support-backend
Attempt-ID:support-fake-contract-test-fix-01
Baseline-Revision:b17ee1d6a7c6f77a8b6b3c1d3024ab4379204241
Root-Integrated-Input-Revision:4c012d4f
Source-Revision:d67b90d28118c5ffc31a7753eec0647e4190497f
Spec-SHA256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Canon-SHA256:560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
Original-Launch-SHA256:f5b949d88177aee59e4140136c97d3b9d8d147d32376fc68975cb9f67c5f6631
Correction-Launch:root explicitly assigned only the named Yandex testcase body before edit; bounded5min; no new manifest supplied
Finished-At:2026-10-28T02:40:22.069658+00:00
Observed-Check-Start:2026-10-28T02:38:46Z
Observed-Elapsed-Seconds:96.070 (first source-read timestamp; initial tool scheduling delay not measured)
Verdict:PASS for test-only correction; complete integrated whole-suite rerun remains root-owned

Root whole regression1247passed/1failed/zero skips found an incidental old one-word fake expectation in the closed-selector/selected-key testcase. Replaced only that testcase's fake portion with production parseTranscript validation, nonempty positive timed words in[0,6], measured end6, an explicit request spy with0 calls, and fake config requiring neither real provider key. Existing live selected-key assertions remain unchanged. Surrounding testcase prefix/suffix byte identity verified. No product source, provider/schema guard, other testcase, environment, JWT or configuration changed.

Changed-File:projects/05-podcast-clips-opus/tests/yandex-stt.test.ts
Changed-File-SHA256:3300f0cca8c31fcb1cb792e3e67ebc5e8adecba19ffaea5ffc074b20a557bec5
Commit:d67b90d28118c5ffc31a7753eec0647e4190497f
Worktree:clean

Checks:
- Node22 scripts/test.mjs tests/yandex-stt.test.ts tests/support-fake-pipeline.test.ts:exit0,53Yandex+16fake cases69/69PASS,0skipped,3.07s.
- npm run lint:exit0.
- git diff --check:exit0.
Checks-Receipt:/tmp/n5-support-backend-checks-20261028/fake-contract-checks-01.json
Checks-Receipt-SHA256:2df5d4036c195fad78e375afd62ce6f43a810b8bb93f7a1865f3bfd1e77ac5bf
Checks-Log:/tmp/n5-support-backend-checks-20261028/fake-contract-checks-01.log
Checks-Log-SHA256:5727c12dc6b66ad3032b8df0c306432f438f7454e8da9b1fe8a2b8228bb301a9

Requested model:gpt-6.1-sol medium,same author context; actual model/usage/cost unavailable(null). SHA256 evidence is supplied; no HMAC key was supplied for a separate receipt HMAC, and no application secret was read for evidence. No paid provider requests, real mail, build/deployment or product modification. Root may continue browser checks against unchanged product; next executor root verifies/merges this test-only commit and performs a fresh complete final suite. Previous1247/1 remains diagnostic, not a full pass.

endStatus: completed
Status: completed
