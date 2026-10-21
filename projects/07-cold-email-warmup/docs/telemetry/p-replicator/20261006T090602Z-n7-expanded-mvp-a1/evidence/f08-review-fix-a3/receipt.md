# F08 R1/R2 correction receipt
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f08-review-fix-a3
Launch12:12:58Z; first action12:13:39Z; bound12:20:58Z; receipt 2026-10-06T12:20:28.383544+00:00.
Baseline00f6888fe753a546ac17f63eb1eda270e260600a; result 521ae2b3208c7ffa2f33a6701c84a816f07c3d5a.
SpecSHAa3ad1300fde78f396c850627e9fd833391d3a572214801315519b92ad197a0a8.
LaunchSHA8d9d3575c6864f18d6bf78021e80e53a6bad25d61e08e7f2d4ab6d7678b5d95e.
RequestedSol6.1/high; actual model/effort/usage/cost null, host metadata unavailable. Inherited XL.
Source manifest /tmp/n7-f08-review-fix-a3/source-manifest.json; local buildSHA 7c75627c0bef87b06cb4795647ade213674dc8d571181a3587811cf5ee5612b9, build-manifest.json. Own dependency symlink points to separately checked readonly typescript-eslint8.48.0; target unchanged.
R1: signal after FIRST lock/awaited persistence and synchronous before-COMMIT guard; rollback and matching-attempt cleanup. FIRST ordering/default callers preserved. COMMIT submission immediately after synchronous guard is irreversible boundary; after-submission abort cannot retroactively revoke committed observation.
R2: configured validated operatorTokenDigest required before readiness/file/authority action; no token argv/output/new auth engine.
Red real-PG controls failed both final lock/persistence cancellation tests; actual missing-capability CLI published (exit0). Later authorized-case red errors cascaded from that unexpected revision mutation, not extra product findings.
Green affected20/20 actual PG/HTTP/CLI: both cancellation wait intervals, server-observed HTTP abort, no result/cleared attempt/admission reuse, after-commit ordering, unset capability for publish+revoke with unchanged authority, retained invalid/missing/expired committed revoke/conflict/rollback. typecheck/lint/build PASS with new readonly deps. Logs: red.log,store-final.log,typecheck-final.log,lint-final.log,build-final.log.
Full mandatory real-PG regression: 1..16
# tests 146
# suites 0
# pass 146
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 94972.238293
Full regression source is this exact commit; job session26232. Unchanged70s channel deadlines/unit/UI not redundantly rerun. Existing browser20 remains bound to00f6888f/image3791cac50f5b6c2c87dd5cd3975f8141a1dd846b405361ca7456623121ec0b37; no new E2E claim. No container start, provider, spend, publication or push.
All modified files<500lines; git diff --check PASS. Next owner /root/n7_expanded_coordinator immediately launches fresh focused Astra review of R1/R2/common-helper default behavior, updates canonical gates/telemetry and binds final image as needed. If fullPG unfinished/fails, coordinator owns concrete session/log verification continuation before acceptance. No pause or unowned background.

Status: completed
