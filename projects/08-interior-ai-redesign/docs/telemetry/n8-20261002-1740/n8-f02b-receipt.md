Implemented the bounded F02b coding scope. **F02 acceptance remains pending.** The [substantive receipt](/tmp/n8-f02b/substantive-receipt.md) contains the file inventory, commands, exits, log hashes, limitations, and coordinator handoff.

RUN_ID: n8-20261002-1740  
WORK_UNIT_ID: n8-f02b  
ATTEMPT_ID: n8-f02b-attempt-1  
Source-Revision: c345ec1ef57517acfca731b27254be5249aabd52  
Launch-SHA256: 542328c4ab3f3b8f33ac8560633ccfc5d4be067ab20f5a11d4137c5bfd4ccb4a  
Build-Revision: 362e3cedb6b2b31b09d80606d51fc11d958ad14ed3c0876ecbc0ec4d2ab29413

The build revision binds a verified 45-file source snapshot; no container image was built.

Delivered:

- Persistent Python engine controlled through bounded JSON, with heartbeat, cancellation, deadlines, fencing, and stale artifact cleanup.
- Offline pinned SD1.5/ControlNet-depth/DPT inference implementation retaining the safety checker.
- Independent actual-byte verification before attachment and private owner-only result reads.
- Canonical immutable evidence, append-only operator reviews, corpus binding, fixture exclusion, and existing unique credit release.
- Focused software tests and a prepared PostgreSQL integration suite.

Passed: six lightweight suite files, including 10 subprocess/artifact checks and five quality checks; five Python tests; syntax build; fixture and Origin mutations. Both mutations had green baselines and failed their targeted assertions after guard removal. Synthetic tests establish no GPU acceptance.

Pending: coordinator PostgreSQL integration/full regression and owner/budget mutations, container build, independent review, dependency security/compatibility, actual CUDA/model loading, licensed 12×3 geometry corpus, and ≥30-job GPU performance measurements. Intel DPT loading remains blocked until safe weights are provisioned. No weights were downloaded or heavy GPU dependencies installed.

Profile: compact-quality-first-v2, XL. Requested model: gpt-6.1-sol/high; actual model, usage, and cost: null. Measured elapsed: **23.40 minutes**.

Telemetry is under `projects/08-interior-ai-redesign/docs/features/f02b/`. The coordinator-owned TRACE remains absent for atomic installation at `projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f02b-receipt.md`.

Status: completed