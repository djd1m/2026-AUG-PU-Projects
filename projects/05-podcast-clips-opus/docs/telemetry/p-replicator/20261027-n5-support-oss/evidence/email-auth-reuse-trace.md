# Квитанция read-only аудита доноров email verification

Run-ID: 20261027-n5-support-oss
Work-Unit-ID: cross-project-email-verification-reuse
Attempt-ID: cross-project-email-verification-reuse-20261027
Source-Revision: f468e8dda0f714668de4207cd7bd8af417db1e56
Observed-HEAD: f468e8dda0f714668de4207cd7bd8af417db1e56
Build-Revision: null (source-only audit)
Repository: /tmp/n5-acquisition-analytics-20261026
Branch: feature/n5-credits-cloudru-20261026
Launch-Path: /tmp/n5-auth-reuse-audit-20261027-launch.json
Launch-SHA256: 3ebd8114f296363e5a89e528f1356aeecd1cf330c827451f05fa0f2080b73edf
Report-Path: /tmp/n5-auth-reuse-audit-20261027-report.md
Report-SHA256: ba5ebcb884fff9c708835ef2273998bd62fa8ae354a60d848fafecbad31ca9e4
Started-At: 2026-10-27T23:23:25.978502+00:00
Finished-At: 2026-10-27T23:28:10.091160+00:00
Launch-Elapsed-Seconds: 284.1
Profile: source-only reuse audit, bounded 15 minutes
Requested-Model: gpt-6.1-sol
Requested-Reasoning: high
Actual-Model: null (runtime identity metadata unavailable)
Usage: null (no measured counters exposed)
Cost: null (no measured cost exposed)
Verdict: pass_source_audit

AC: all project numbers1–8 plus03a/05a/06b inventoried at immutable pin — pass.
AC: concrete email verification donors, API/UI/schema/delivery/test source identified — pass (N1/N3).
AC: distinguish registration proof, existing-account proof, reset, passwordless sign-in and unrelated bot verification — pass.
AC: closest minimal N5-compatible donor with contract differences, no auth replacement — pass (N1; N3 supplementary guards).
AC: no unsupported universal-absence claim — pass.
AC: fresh two-file output receipt, source and launch/report SHA256 bound — pass.

Checks executed (exit0): pinned tree/source inventory; two complementary searches across source extensions; targeted API/UI/schema/provider/auth/test reads; launch SHA256 equality; HEAD continuity. No test/build/E2E execution, no production email/inference/network/DB calls, no donor edits or Git changes. Test paths/names in report are source evidence only.
Coverage: 11 project directories, 2372 project source/SQL/test files under filter;73 root source files. Project05a contains0 source files under filter; other branches/dirty trees/private clones/production delivery out of scope. Search excluded configuration secrets,docs,telemetry,artifacts,experiments. No coder context/receipts from another feature read.
Safety: initial default sandbox failed during bwrap startup; subsequent narrow escalated commands read immutable sources and wrote only the two authorized /tmp artifacts. No auto-review rejection received.
Remaining-AC: none for this audit. Pending out_of_scope: N5 implementation/migrations/testing/deployment; actual mail delivery/provider availability.
Next-Owner: /root
Next-Step: reconcile report and select N1 email-proof fragments; no new implementation was authorized by this audit.

Status: completed
