# N5 exact API bindings correction

RUN_ID:20261028-n5-support-implementation
WORK_UNIT_ID:support-backend
Attempt-ID:support-backend-route-bindings-fix-01
Baseline-Revision:eb9f7dac1242ab99f817329392435ca56b7c0c20
Root-Integrated-Input-Revision:7af2f25a
Source-Revision:52f046340862c8e5e5725fcf39f90d3ebc2467aa
Spec-SHA256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Canon-SHA256:560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
Original-Launch-SHA256:f5b949d88177aee59e4140136c97d3b9d8d147d32376fc68975cb9f67c5f6631
Correction-Launch:root message, bounded10min; no new manifest supplied
Finished-At:2026-10-28T01:18:46.070184+00:00
Observed-Check-Start:2026-10-28T01:17:28Z
Observed-Elapsed-Seconds:78.070
Verdict:PASS for assigned signature batch; actual generated Next build pending root

The previous correction fixed only the failing dynamic route and left the generic optional staff context exposed by accounts/search bindings. This batch inspects all nine new API exports together. Every non-dynamic export now has explicit (request:Request)=>Promise<Response> binding, covering accounts/search, support session/context and all email/reset POSTs. The dynamic account-card GET keeps its required second context. Runtime factories and validation remain unchanged. Eight owned API files changed, one type annotation per file; no other source/tests/configuration/dependencies changed.

Observed checks:
- PATH=/tmp/n5-acquisition-node22-bin:$PATH npm run typecheck --workspace apps/web:exit0.
- PATH=/tmp/n5-acquisition-node22-bin:$PATH npm run lint:exit0.
- git diff --check:exit0.
- TypeScript compiler API inspected actual exported call signatures on all nine route modules:8 unary,1 required two-parameter dynamic handler; no optional parameter or undefined context. Exit0. All source hashes match committed files.
Arity-Receipt:/tmp/n5-support-backend-checks-20261028/route-bindings-final-01.json
Arity-Receipt-SHA256:3077021843c4375e9965964136d028f9746a4b2debced08588285a158a1cba0c
Commit:52f046340862c8e5e5725fcf39f90d3ebc2467aa
Worktree:clean

Requested model:gpt-6.1-sol,medium, same author context. Actual model/usage/cost:null; host metadata unavailable. Original receipts unchanged. No full Next build or mirror unit test here. Root next:integrate this commit and repeat the actual affected web build/generated Next route validation, then remaining integrated acceptance. Full-suite ffmpeg PATH issue is root-owned environment diagnosis, not claimed fixed in this unit.

endStatus: completed
Status: completed
