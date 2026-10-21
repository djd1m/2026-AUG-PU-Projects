Exact P2 implemented: acceptance clears when refreshed cabinet data contains the submitted job ID, including a terminal first observation. Live-job and pending locks remain.

- Run-ID: `20261002T190728Z-pdf-source`
- Work-Unit-ID: `pdf-source-correction`
- Attempt-ID: `correction-1`
- Source-Revision: `20417e604f43066639e62ea1c79cca85b951f45c` plus correction snapshot
- Launch-SHA256: `c229e2d96236966f6be148c0d504c39fc7c6607545c8aebd2bd8a415ffed9f87` — verified
- Snapshot-SHA256: `2eee4083fed2fb8a8e151855d58abb99baa55da409c1bb04e91c429df57e2ef5`
- Finished-At: `2026-10-02T20:05:14.794658Z`
- Duration: **261 seconds**, within 300
- Profile: `compact-quality-first-v2`; requested `gpt-6.1-sol/high`; actual model, usage and cost unknown

Node 22 typecheck, **32 focused unit tests**, browser-script syntax and diff checks passed. No commit/push.

Prepared browser regression holds the real 202 until a real worker fails the damaged PDF, then verifies re-enabling and another upload. No cancel API exists; coordinator must provide the worker through the existing FakeProvider seam.

**Pending:** fresh full validation/build, browser execution, mutation proof and independent re-review. No browser-pass or feature-acceptance claim.

Report: `projects/06b-rag-class/docs/features/pdf-source/06_correction.md`  
Hashes: `projects/06b-rag-class/tests/artifacts/pdf-source/correction-source-hashes.json`  
Caller CLI receipt destination: `projects/06b-rag-class/docs/telemetry/p-replicator/20261002T190728Z-pdf-source/evidence/correction-1-receipt.md`

Status: completed