# I3-R01 correction receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i3-r01
Attempt-ID: replicate-i3-r01-1
REPO_ROOT: /tmp/n8-replicate-i1
PROJECT_ROOT: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign
TRACE_PATH: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i3-r01-receipt.md
Source-Revision: e7c8bf5a10212189f128a7126eb11b97fd42eb0e
Build-Revision: not_applicable (offline Node/Sharp source checks)
Launch-Path: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i3-r01-launch.json
Launch-SHA256: 6d8e45a5c2f4ca926c5b2c835901d6aa008587be8ec117c6e4115488bad34891
Trace-Prelaunch-State: absent (checked before source edits)
Started-At: 2026-10-03T09:12:37.323Z
Finished-At: 2026-10-03T09:19:52.205359+00:00
Elapsed-Wall-Seconds: 434.759 through evidence finalization; includes reading/setup
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null (host confirmation unavailable)
Actual-Effort: null (host confirmation unavailable)
Usage/Cost: null (no host token/billing export; no inferred zero)
Verdict: PASS for bounded correction checks; delivered ready for independent review

Fixed only confirmed I3-R01: the shared input/provider metadata boundary performs a bounded length-checked PNG chunk walk before Sharp. All APNG/stray animation chunks are denied; malformed chunk bounds fail closed. Ordinary single-frame PNG remains accepted; compressed data is never substring-scanned. Existing WebP/JPEG and earlier guard code are unchanged after subtracting the added PNG helper/call.

The genuine CRC-correct two-frame review fixture matches4061 bytes and SHA256031839f815d9d497abec27a167b236c92816a8ceb6aac41303b387e364d154f5. Baseline focused tests: exit1,0pass/2fail, both Missing expected rejection; corrected focused tests: exit0,2pass/0fail. No compiler/startup mutation failure. Corrected full affected file: exit0,150pass/0fail/0skipped on Node v22.20.0 and Sharp0.35.4. Assertions cover safe provider_output_denied, no second download for animated depth, zero artifacts, PNG length/truncation/stray animation failures and a static positive whose compressed pixels contain animation names. Prior DNS/WebP/JPEG/deadline/size/cleanup checks passed in that same source-bound rerun. Node syntax and whitespace checks: exit0.

Frozen SHA256:
- web/replicate-media.js: 55baa1f5a8686fc2256106888a4e9e82724745497f38aa741045812e2d781e94
- tests/replicate-media.test.js: a071ea896aa1bffb75c22c0b12d921b1e4b255366eb109494bfe521321d356dd
- Snapshot: 1c60aad087d8223c3dd27b076aa50bc360074dece4e8626585405a395f5d7bab
- Checks: b7220e11a5d47a9dbc0ce522c899ae348bfd47685d4522560cff7a800d2120d1
- Correction report: 474a008bf0ae27e7f81b90eb36448f2c3a566ceab30ea9a500c5b9877780a584

Evidence paths:
- /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/features/f07-replicate/i3-r01-correction.md
- /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i3-r01-checks.json
- /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i3-r01-snapshot.json
- /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i3-r01-apng-baseline.log
- /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i3-r01-apng-fixed.log
- /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i3-r01-tests.log

134 protected hashes unchanged, including accepted I1/I2 sources/tests/contracts and previous evidence/reports/snapshots. Only the two authorized source files and fresh i3-r01 evidence were written. Caller launch and existing dependency directory unchanged. Initial hash-capture path resolution failed read-only and was corrected before implementation; recorded in checks. Preparation/run record was installed after instruction/setup reads; elapsed includes them and no historical usage was reconstructed.

Limits: CPU affinity[0,1], UV_THREADPOOL_SIZE=2, VIPS_CONCURRENCY=1, Sharp concurrency1, one test worker. Offline injected HTTP/DNS and synthetic temporary files only. No delegation, commit/push, run-events/global configuration, Docker, real network or dependencies. No fresh independent review, real-provider/full-AC claim, all-project PG/build or release. Parent owns independent affected review and later integration gates.

Status: completed
