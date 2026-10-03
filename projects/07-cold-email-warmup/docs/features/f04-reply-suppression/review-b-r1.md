# F04b B-R1 independent closure review

Verdict: **ACCEPT**. **B-R1 closed; B5 and its B6 review/test dependency accepted.** No confirmed remaining defect in this correction. A and B1–B4 remain accepted and were not reopened. This is not whole-MVP acceptance; F05/F06 remain pending.

Reviewed `c3f5803b..06ed2f9d271b416e2f75ccb95f309bb7d1acde1c`, `review-b.md` B-R1, `correction-b-r1.md`, exact AC-B5/B6 and the feature algorithm/architecture. Existing substantive XL, owner autonomy and companion prepare remain unchanged. Single independent review lane; no delegation.

`src/replies/worker.ts:20` durably claims a fresh owner before observing source generation and starting adapter I/O. `fixture.ts:27` changes ownership without revoking existing completion. `observePoll` captures owner plus nullable generation; its returned guard compares both again. Every validated seed replacement generates a fresh UUID under `eligibilityTransaction`, whose first statement after BEGIN acquires lock(7,1).

Capture, page and failTail invoke the optional guard **inside their own mutation transaction**, before run/effect/completion writes (`store.ts:45,72,97`). The null-run failure UPDATE also checks inside its transaction (`worker.ts:51`). Seed and owner changes share that lock, closing the check/write TOCTOU window. Adapter calls occur after observation transactions release their clients; no advisory lock spans adapter I/O. Stale success throws before mutation; stale failure is rejected before pausing. Current absent/failed fixtures still pause because the current nullable generation remains valid.

The store diff adds only an optional trusted guard. With it absent, A’s existing capture/page/failure behavior remains; retry, immutable H/tailH, run/attempt/cursor validation, budgets and semantic dedup are unchanged. B public paths and renderer are unchanged. Migration009 adds the two durable UUID fields without rewriting migrations001–008.

`tests/suppression-owner-integration.test.ts:29–71` exercises actual FixtureAdapter snapshots/errors, captured before promise barriers. A second worker resets/completes before releasing old initial success, initial failure or changed-tail success. Whole-row deep equality checks run ID, validity, H, cursor, attempt, tailH, timestamps and completion, plus observations/messages/effects/jobs. Same-validity reseed, owner-only replacement and generation-only invalidation are independently covered. Current missing/failure followed by successful current polling is asserted. A real `pg_locks` waiter proves seed blocks until the guarded transaction commits. These are worker callbacks, not only direct-store stale-page tests. Effect/job tables are empty in these focused races; atomic rejection before ingestion is additionally established by source inspection, with persisted effect/cancellation coverage retained in B’s existing integration suite.

Recorded evidence inspected: full PostgreSQL **91/91**, unit **18/18**, restored owner suite **11/11**, typecheck/lint/build/image and canary/source-image checks all exit0. Capture-guard mutation produces actual run/cursor/validity/tailH corruption; failure-guard mutation flips newer `scan_complete` true→false. Both have ERR_ASSERTION and exit1, followed by restored-source hashes and green11. No runtime checks were rerun.

`astra-b-r1-source-evidence.json` verifies all **63** source inputs, Dockerfile and spec against worktree, product donor `af99d97f`, and evidence donor `d9e280b4`; nine donor evidence files match byte-for-byte. Copied-input map and source/build aggregate digests agree. No mismatch. Author launch/manifest/runtime are later metadata, absent from that evidence donor. All36 compiled files are absent locally: image/build verification relies on the inspected snapshot script and archived checks, not a new image inspection. Recorded image: `sha256:3d4467ed3c6d1cc3bab63d87ff9c16d2e0a9f8797854467e5f240dddde4b61ba`.

Profile: compact-quality-first-v2. Requested Astra/high; actual model, usage, cost and active-time partition null pending host. Receipt records identity, timing and command exits. No product edits, commits, push, runtime/DB/network/browser/secret access; launch/manifest untouched.

FinishedAt: 2026-10-03T01:00:45.955486+00:00
Duration-Seconds: 272.951

Status: completed
