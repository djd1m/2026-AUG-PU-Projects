# Serial foundation verification

Candidate: `91e3b2d` plus `final-source-snapshot.json`; no source mutations between snapshot and run.
Command: `node scripts/run-foundation-integration.mjs`
Observed terminal exit: 0. Namespace: `n3a-foundation-d8cc9d20e2d8`.
Typecheck/build/infra/port checks: passed. Migrations: 2 applied.
Unit: 5 files, 9 passed. Integration: 6 files, 13 passed.
Original source restored after seven detected mutations (separate persisted artifact).
Own test stack stopped; volume retained. No production deployment or donor changes.
Standalone `npm audit --json`: exit0, total vulnerabilities0.
Native Argon2 observation: Node22.22.0,757ms,maxRSS191676KiB; not an SLO.
Terminal output for preceding mutation harness was lost; no exit code is invented for that invocation. The saved mutation artifact and this new serial run are separate evidence.


## Startup correction verification

2026-09-09: `node scripts/run-foundation-integration.mjs --mutations` exit0; namespace n3a-foundation-8d9f0eececa5. Typecheck/build/infra/ports passed,10unit/13integration passed,8mutations detected including runtime startup config removal; original source untouched and schema restored. Scope includes all four declared serve commands. Image build/start remains pending in the following run.


## Docker image and checker acceptance

`node scripts/run-foundation-integration.mjs --image` repeated typecheck/build/infra/ports/migrations10unit/13integration successfully; image build succeeded with manifest-list SHA `345124d4f7fd5b1426b5299eb475531c1a1fdf3f6e720aa4b51ca219f64a4c2a` and config SHA `490a517fd259fe8e9463dbcda7483b590cdcd91a957bb7ef273a17a66b4209fd`. Startup failed ENOSPC because host disk filled; this invocation exited1 and is not green.

After owner-approved removal of our obsolete408MiB dependency backup, `python3 /tmp/n3a-verify-built-image.py` exited0 against this same built image in namespace `n3a-foundation-2e252c6beb4a`. It reran infra/port checks, started web+private DB with --no-build, checked HTTP200/no-store/{status:alive}, Russian home and non-root UID inside actual image, then stopped app/test profiles and removed only its containers/network. No production deployment. Private test volume retained. Script SHA: 6afcbfa4bf9aabcdc49b4a9a1063b08fd72aaddde4826e01a40a25689f5a7330.

The harness cleanup was corrected to enable both app/test profiles; previous down omitted web. Explicit corrected scopeddown was observed successful in the image retry. Runtime application bytes are unchanged from4ff997d; final addendum binds tooling/cleanup/package-script-only changes.

Integrated `node --test tests/pipeline-completion.test.mjs`:2passed,0failed, measured3253.259432ms. `node scripts/check-pipeline-completion.mjs . --completion --traceability --report-revision --criterion-scenarios` exited0, all four modes PASS. Original upstream completion bug remains, recorded in completion-adapter.md; no vendor edits.


Final combined `npm run verify`: observed exit0; typecheck,10unit,Nextbuild,traceability,2tooling tests and all4 completion-adapter modes passed on final tooling addendum.

Status: completed
