# F04a R1 P1 correction receipt

Run-ID: 20261002T232200Z-f04
Work-Unit-ID: n7-f04a-sol-r1
Attempt-ID: correct-a1
Source-Revision: 40623e0ec4444c11efacbf9def6beea7726af1f3 (caller launch baseline)
Product-Revision: d869e64f29a673614f3032f53118a717418bb8af
Build-Revision: d869e64f29a673614f3032f53118a717418bb8af
Launch-SHA256: 0d1a4282e74e1188e03f617af98ded40db9eef5110ec99e5d2121d339d794ce9
Spec-SHA256: 6deaa2f48d531ca66b71abb9f1b90794836cc4ab80eab557076863b92de74a38
Started-At: 2026-10-02T23:57:17.975772+00:00
Finished-At: 2026-10-03T00:05:45.035049+00:00
Deadline: 2026-10-03T00:12:17.975772+00:00
Verdict: correction implementation gates PASS; fresh independent review remains parent gate
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol high
Actual-Model: null (pending attributable host evidence)
Actual-Effort: null (pending host evidence)
Usage/Cost: null; no estimate substituted for counters
Elapsed-Wall-Ms: 507059
Active-Wall-Ms: null (complete attributable wait partition unavailable)

## Concrete correction

The store previously marked every accepted tail prefix complete. `PageInput` now requires explicit trusted same-validity `tailHighWater` for every tail page. The first accepted tail snapshot captures this horizon durably; subsequent pages require the same horizon and current run/validity/attempt/cursor. Coverage cannot exceed it. Completion requires coverage reaching it, regardless of header count. Empty and sparse prefixes retain progress and pause; genuinely empty horizon=cursor completes. The timestamp changes only on complete, using the post-lock clock.

Additive migration007 only adds the nullable bounded horizon and is registered by migrate/ready. Deployed006 and all old migrations are unchanged. Retry preserves run/H/cursor/horizon and resets only attempt budget. Same-validity unfinished capture resumes the existing run. Completed incremental capture creates a new run with horizon=null. All effects/horizon/progress/completion remain atomic under the first shared advisory transaction lock. Budgets20pages/120s and F03 dispatch algorithms remain unchanged.

## R1 acceptance matrix

| Requirement / AC | Fresh production evidence | Result |
|---|---|---|
| P1 / A4: valid100-prefix of101 cannot complete | oldH10 covered; UID11..110 observed, tailH111, effectS0, cursor110, poll incomplete, old completed_at unchanged; actual DispatchStore.claim=null, actual SubmissionStore adaptercalls0 | PASS |
| P1 / A4: final coverage consumes S then completes | UID111 matches own sent reference+recipient; effect1, observation101, enrollment replied and complete timestamp at current clock; later production claim permitted | PASS |
| A3/A4: empty/sparse prefix vs genuinely empty | tailH30 with equal cursor10/empty headers remains paused; sparse prefix through20 remains paused; empty final coverage through30 completes; initial empty tailH=cursor0 completes | PASS |
| A3/A4: immutable horizon/retry/incremental | changed horizon20/31 rejected after capture30; failure+operator retry retains30/run/H/cursor; unfinished capture cannot replace it; incremental new run resets horizon; old callbacks reject | PASS |
| A3/A5: stale run/epoch/reset and atomicity | wrong UIDVALIDITY and old attempt rejected; unchanged second-reset lock race rejects old tail; BEFORE rollback, AFTER durable cursor/effects and duplicate concurrency guards remain green | PASS |
| A4/A5: budget/post-lock clock/final freshness | exact20page/120s, future/failed/slow evidence and actual final-submit before0/after1/later0 production races | PASS |
| A6 correction gates | full type/lint/build/unit/PG; targeted P1 mutation RED/restored affected GREEN; runtime canaries and source/build/image binding | PASS implementation; parent fresh review pending |

## Checks and exits

`bash scripts/check-f04a-r1-heavy.sh`: exit0. Typecheck/lint/host build/image build each exit0. Full unit16/16; full real PostgreSQL regression66/66 (unchanged F01/F02/F03 plus F04). Node22.20.0. Global flock: ready/acquire00:01:55 UTC, release00:03:57 UTC, recorded in `/tmp/n7-f04a-r1-run/progress.md`. CPU2; RAM/disk checked. Existing own stack n7f04a, runtime `/tmp/n7-f04a-runtime`, loopback18705, DB unpublished. Initial port-check exit1 identified exactly the existing own container; explicit own-name/loopback exclusivity checks permitted caller-authorized reuse. No other stack changed.

`python3 scripts/check-f04a-r1-mutation.py`: harness exit0; mutant PG exit1 expected. Only completion condition mutated to unconditional kind=tail. Both new P1 101-tail and empty-prefix tests fail with ERR_ASSERTION on premature complete. Host and copied runtime restored in finally; hash verified. Subsequent affected realPG15/15, exit0. Existing semantic dedup mutant was not repeated; its unchanged guards passed full regression. No green suite repeated after final image binding.

Fresh canary/secret source+runtime log+reply persistence check exit0; values suppressed. `npm audit --audit-level=high` exit0, zero vulnerabilities. Snapshot script exit0 verifies all host source/test/db/package/type hashes against copied runtime inputs, compiled JS against runtime build, and running container image against built image.

Source-SHA256: bf2e05e510128c9a0ae4d015b6686ba93471d7a956ce7946a891fb8185255e80
Build-SHA256: 1d8ce1b43ac566444fc5eeff15ecd6d284863a423879a30e834e21c9a2cbf109
Image-ID: sha256:83149eaf54020cf8dedcec267848d114ea02ef0f77d779fd21c21bcb9619c94a
Container-Image-ID: sha256:83149eaf54020cf8dedcec267848d114ea02ef0f77d779fd21c21bcb9619c94a
Dockerfile-SHA256: f8d6728ac4337c589cf55983654e2cf51ac437ef4711e20086f12d775cc997f5
Package-Lock-SHA256: 49b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a

Evidence in this directory: sol-a-r1-heavy.txt/.exit; sol-a-r1-mutation.txt; sol-a-r1-restored-source.txt; sol-a-r1-source-image.json (individual hashes); sol-a-r1-preflight.json; sol-a-r1-route.txt; sol-a-r1-run.json; sol-a-r1-events.jsonl; initial sol-a-r1-port-precheck.txt/.exit. Mechanical before-IMPLEMENT ROUTE exit1 is the high-tier result, not test failure; substantive approved XL is retained. Resume preserves prior history and OWN-N7-002/explicit correction authority. No native checkpoint exists; caller source+receipt handoff applies.

## Delivery and limits

FILE: /tmp/n7-f04a-r1/projects/07-cold-email-warmup/docs/telemetry/features/20261002T232200Z-f04/sol-a-r1-receipt.md
API handoff: docs/features/f04-reply-suppression/implementation-a.md and correction-a-r1.md. B trusted reader must supply an actual same-validity snapshot and honest covered range; no HTTP freshness authority, B implementation, live SMTP/IMAP, charge, paid LLM, browser, deploy, push, agents or global configuration edits occurred. Auth/mail crypto/dispatch algorithm/root/other projects remain unchanged. Historical reports remain unchanged; caller launch/manifest remain unstaged. Product correction commit uses Russian conventional message and no coauthor. Final docs/evidence commit does not alter bound image inputs.

Requested F04 dependency symlink was absent; existing actual F03b node_modules was reused read-only through a temporary own symlink after identical package-lock hash verification. Donor dependencies were not installed/pruned/mutated. One local shell command used root cwd for a project log path and failed before starting any test; corrected project cwd, retained substantive port-check failure evidence. No required check was weakened.

Parent performs fresh independent source-bound review after this correction delivery. This receipt completes the correction unit, not acceptance of all F04/B. Actual model, effort, tokens, cost and active-time partition remain null pending host proof; no measured savings claimed. Parent control read at delivery confirms heavyrelease and asks terminal without optional polish; grant removed, no further heavy work. Hard900s respected; receipt written with more than60s remaining and delivery time reserved.

Status: completed
