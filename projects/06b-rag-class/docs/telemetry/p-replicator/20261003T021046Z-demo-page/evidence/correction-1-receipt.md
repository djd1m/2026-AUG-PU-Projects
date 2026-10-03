Corrected only F12-R1: matcher expectation now includes root and demo routes; all first-touch assertions remain; `/b/slug?ref=valid` is checked for no referral cookie and `private, no-store`.

Affected tests: **11/11 passed**. Root/web typechecks and scope verification: **exit 0**. Original 24 mapped files and existing history are unchanged. Final 25-file snapshot: `eb5370af0ae47b9dd6a5534ba49ba43940ccb0f2f6aea9427f82126601a0ad7d`.

Evidence: `docs/features/demo-page/09_correction.md` and `tests/artifacts/demo-page/correction-1-*`. Full regression, PG and browser gates remain coordinator-owned.

Run-ID: 20261003T021046Z-demo-page  
Work-Unit-ID: demo-page-correction  
Attempt-ID: correction-1  
Source-Revision: 24d7e6fb85c425347ae31205f43888575e84594c  
Build-Revision: none  
Launch-SHA256: 1bd881353c53223842e2bc46ad9f68b7f9575dc5f8c405db4e032608e84b3f3a  
Finished-At: 2026-10-03T02:41:11Z  
Verdict: bounded correction handoff

Profile: `compact-quality-first-v2`. Requested: `gpt-6.1-sol/high`; native actual model, usage and cost unavailable. Measured handoff duration: **212.85 seconds**.

Telemetry: `docs/telemetry/p-replicator/20261003T021046Z-demo-page/`. CLI captures `evidence/correction-1-receipt.md`; TRACE was not manually written.

Status: completed