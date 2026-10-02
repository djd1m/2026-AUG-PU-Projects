# F03a independent review receipt

RUN_ID: 20261002T211800Z-f03
WORK_UNIT_ID: n7-f03a-astra
Attempt-ID: review-a1
Source-Revision: 4cbb1ec4a490ded07232c2be07a000342a6d5c86
Spec-SHA256: e215f1e53e89b42dccc35e8835209cba31b055f075212b82599fa61368af42be
Build-Revision: sha256:cf0a7adfb9c98a273256c9526543d7e5995379eec1218f57e6e3d6c7e927535a
Launch-SHA256: 6b3d40546e7962fa4cbf56e21bf9116ac057471e80cb523d390fc472156db660
Started-At: 2026-10-02T21:41:30.929004+00:00
Profile: compact-quality-first-v2
Requested-Model: gpt-6-astra/high
Actual-Model: null (pending parent host proof)
Usage: null
Cost: null

Review-only stage, inherited substantive XL; no implementation or E2E rerun.
Readiness preflight: not_applicable — source/evidence review only.
No delegation, model switch, external action, or product mutation authorized/performed.


Finished-At: 2026-10-02T21:49:01.771735+00:00
Elapsed-Wall-Ms: 450843
Active-Wall-Ms: null (not independently measured)
Verdict: REQUEST_CHANGES

Delivered: docs/features/f03-dispatch-pool-campaign/review-a.md (six-AC matrix).
Finding R1 (P2, AC-A4): src/dispatch/store.ts:20,24 uses tied caller timestamps
as its sole rotation key; concurrent equal-time claims favor an older sender
backlog repeatedly after the first A/B pair. Existing test checks only two claims.
Minimal correction: advance a per-claim fairness ordering under the shared lock,
independent of clock ties, and add a >=4-claim realPG regression at the same time.

Independent checks: HEAD/spec/launch identity match; all41 local snapshot hashes
match; preserved launch/manifest bytes; git diff --check exit0. Consumed existing
39-file image/post-restoration receipt, no image rebuild or fresh image hash claim.
Read-only PostgreSQL synthetic VALUES counterexample, production ORDER BY extracted
from source: third=A and fourth=A while B remains queued, exit0. BEGIN READ ONLY /
ROLLBACK; no database mutation or product row read. Evidence: astra-a-counterexample.txt.

Recorded author evidence reviewed: unit12/12; final fullPG20/20 including F01/F02;
freshness/quota/consent/tenant mutants each fail meaningful assertions; restored
F03 TAP6/6; type/lint/build/audit/secret checks passed. Initial heavy16/20 failure
is retained accurately; only integration fixture source changed between snapshots,
and the minute-bucket harness does not weaken F01 auth assertions. These passing
gates do not cover continued equal-timestamp rotation. AC-A1/A2/A3/A5 pass;
A4 fails R1; A6 partial because rotation proof needs its regression.

Author actual gpt-6.1-sol/high confirmed by sol-a-runtime.json host turn contexts;
author input2913913, cached2804736, output35208, cost null. Reviewer actual model,
effort, usage and cost remain null pending parent host proof; requested Astra/high
is not proof of actual execution. No fallback/model switch/delegation performed.
Measurement/source evidence: astra-a-evidence.json. No savings claim.

Applied project-work-companion skill at .claude/skills/project-work-companion/SKILL.md
for source-bound handoff; no E2E readiness/pass claim. No heavy/build/browser rerun,
network, runtime key reads, transport/submission, product edits, commit or push.
File delivery is completed; F03a acceptance requires R1 correction. Whole F03 is
still pending F03b; F04 actual polling and F06 UI remain explicitly out of scope.

Status: completed
