# Targeted independent corrective review — F1/H1

Verdict: PASS for the bounded source correction. Original review H1 (concurrent blocked-owner creation) is resolved in immutable integration revision `c4556fac9a73cb080ec7dbc01e9d4536a0d1d7c1`, compared with previously reviewed `11510d283d8c16b528b83d8017ae984d3c486a30`.

Repository: `/tmp/n5-acquisition-analytics-20261026`.
Project: `projects/05-podcast-clips-opus`.
Plan v2 SHA256: `dbaba0f7109601b56a86cab13609a3895f187c110d8e1c391b570cc0d54605f1`, with mandatory clock_timestamp refinement.
Prior review: `/tmp/n5-referral-review-20261028.md`.

Immutable diff contains exactly `apps/web/src/server/partner-code.ts` and `tests/partner.integration.test.ts`. Helper now locks ALL owned partner_code rows, including active rows, in stable ID order using FOR UPDATE. The blocked check uses returned locked statuses, so a previously uncommitted antifraud transition is observed after waiting. Same-code idempotency/status is retained and new-code insertion still requires no blocked owned code. Existing account/partner serialization and collision behavior remain.

The new ordered regression opens a blocking transaction, marks an existing code blocked, starts campaign creation, observes PostgreSQL blocking by blocker PID, requires creation still pending, commits blocker, then requires 409 and no fresh code. It exercises the actual gap rather than only sequential blocking. Cleanup rolls back/releases blocker and awaits creation. This review inspected test source; it does not claim that test executed or passed. Root must retain fresh red/green evidence and run affected checks on the corrected revision.

`git diff --check 11510d2 c4556fac` exited0. No new findings within the two-file correction. Prior financial/UI/public-route/migration source assessment remains applicable because those files did not change.

Source continuity: a regression process launched on the earlier revision and running across a checkout/source change is not automatically a clean full-suite receipt for c4556fac. Report its launch source and drift honestly; bind fresh affected concurrency/ownership tests and final build/browser qualification to c4556fac (or exact later accepted source). This static PASS does not replace outstanding required full gates, mutation proof, mobile/browser or isolated test-shop E2E evidence.

No coder logs, credentials, DB/provider calls, installs, source/git/production writes or runtime tests were used. Only requested /tmp report/trace written. Profile: model-routing-econom, requested review/high. Actual model, effort, usage and cost: null, execution metadata unavailable. E2E preflight: not_applicable, source review only.

finishedAt: 2026-10-28T12:59:11Z
Status: completed
