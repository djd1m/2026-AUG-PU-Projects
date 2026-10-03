# Mandatory local rollback receipt

Run-ID: 20261003T064351Z-release-gate
Work-Unit-ID: release-gate-local-rollback
Attempt-ID: rollback-1
Source-Revision: 86d4b0ceedc348f85f3e65de2ebfb272528b1801
Build-Revision: null — canonical current/previous worker images were not built.
Launch-SHA256: a3db258a4bc5475e28a34147bd0d5d9494ad2240815be3dbd4e2eea81a6330e4
Started-At: 2026-10-03T07:42:57.900785+00:00
Finished-At: 2026-10-03T07:54:32.462082+00:00
Verdict: blocked — mandatory runtime rollback NOT accepted.

The bounded attempt prepared a reproducible owned-stack runner and performed its resource preflight. The corrected `python3 tests/artifacts/release-gate/rollback-runner.py --execute --prefix rollback-1-corrected` returned **75**, before acquiring the heavy-operation mutex, building images, migrating, seeding, or starting any container. Available disk was **1126559744 bytes (1.05 GiB)**; the conservative build guard requires **6442450944 bytes (6 GiB)**. This threshold is a safety estimate, not measured build consumption. Cache inventory contains BuildKit build outputs, but the CPU-constrained legacy build path cannot rely on those cache hits. Existing Dockerfile dependency layers reach roughly 1.25 GB and a runtime dependency COPY reaches roughly 860 MB; two canonical worker builds, prune/export layers and ephemeral PostgreSQL need headroom. No shared prune or unsafe build was attempted.

## Exact image and source bindings

| Role | Actual tag | Actual local image ID | Own tested source |
|---|---|---|---|
| Current web | n6b-f15-source-management-web:corrected | sha256:d518d2e9eacfae4b0646aa161253b9edc5a78375b9935b267cdb6d467d220b1e | b3df79f3c748c426d7eac16717008ccd121eb10e |
| Previous web | n6b-f14-handover-web:20261003 | sha256:3ed4f43381dc4acff4d74aba9155c187f89747d626d39f04a9018bd627cbb2d5 | edf7d770f021831d115d347e1532cea102e1c098 |
| Current migrate | n6b-f15-source-management-migrate:corrected | sha256:9f9537fcc59c647b5ea7ae1114844383e69a8a0655a2948d095e3090380bd480 | accepted F15 migration image |
| Test DB | pgvector/pgvector:0.8.6-pg16 | sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b | cached PG16/pgvector image |
| Current worker | planned n6b-f16-rollback-worker:current | null: absent | b3df79f3c748c426d7eac16717008ccd121eb10e |
| Previous worker | planned n6b-f16-rollback-worker:previous | null: absent | edf7d770f021831d115d347e1532cea102e1c098 |

Current source manifest: **5688fdf46c4c14ddd378841cc2c55b4384822d2ba763921e526aabd0e2c956f0**, 253 tracked build inputs.
Previous source manifest: **24845ea3d27f94da796f69f11063124296652587e515916d554e7964c4cd43a5**, 237 tracked build inputs.
Migration manifest: **58f4aba5e7217d54cf6e1f1c618296f9afa9bed0a423fcd8a75bd93fdf712597**, five byte-identical SQL files between F14 and F15. This source-level compatibility evidence does not prove that previous processes run correctly against migrated PostgreSQL.
Actual container/image bindings: **null; no owned runtime containers were created**. Accepted existing web IDs were verified with `docker image inspect`; they were not started in this attempt. No test runner is presented as a production worker.

## Required checks and limitations

| Check | Result | Evidence |
|---|---|---|
| Launch/source identity | pass | launch digest, HEAD 86d4b0ceedc348f85f3e65de2ebfb272528b1801 |
| Plan mechanical route | S, exit 0 | initial explicit two-file invocation; substantive scope remains mandatory rollback validation |
| Implementation mechanical route | S, exit 0 | rollback-route-implementation.txt |
| Runner syntax/import/root | pass, exit 0 | rollback-checks.json |
| Disk guard positive/negative controls and mutation | pass, exit 0 | 1 GiB rejected; threshold accepted; disabling guard makes unsafe input pass |
| Isolated compose config and port conflict probe | pass, exit 0 | corrected result operations: compose-config and port-conflicts |
| Configured CPU envelope | pass as configuration only | DB=.5, web=.75, worker=.75; migration+DB=2; no host ports; internal network only |
| F14/F15 SQL migration equality | pass as source check only | rollback-checks.json |
| Canonical current/previous worker builds | blocked | disk guard; no actual worker IDs |
| Current/previous worker live PG query loops | not executed | mandatory AC remains open |
| Current/previous web health, auth/session and cabinet bootstrap | not executed | mandatory AC remains open |
| Seed/sentinel/schema/session preservation across actual image switch | not executed | mandatory AC remains open |
| Optional return to current images | not executed | prepared in runner |

The first preflight produced empty source manifests because the Git command interpreted paths from the project directory. It is preserved as `rollback-1-result.json` and is **superseded**, not acceptance evidence. The corrected root-scoped invocation rejects empty manifests and produces `rollback-1-corrected-result.json`. One concrete correction was made; no product test suites were rerun. Runtime/build branches remain unvalidated, including failure cleanup of a future interrupted build. Mechanical preparation is not an E2E pass.

## Reproducible remaining step and ownership

Runner: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/tests/artifacts/release-gate/rollback-runner.py`. It reconstructs only exact own N6b Git build inputs in private `/tmp` contexts, uses the canonical Dockerfile target `worker` with `--pull=false`, unchanged npm dependency/default network configuration, and a legacy-builder CPU quota of 200000/100000. Every operation is timed, each build is bounded to 300 seconds, runtime is bounded by an 840-second driver budget, and build/runtime disk checks retain 512 MiB reserve. All heavy operations use `/tmp/codex-heavy-build.lock`; startup checks run after builds.

After external resource availability changes, the parent coordinator owns a **new bounded attempt with fresh launch/receipt**, exact source revision and at least 6 GiB available disk. Concrete command: `python3 tests/artifacts/release-gate/rollback-runner.py --execute --prefix rollback-2`. Do not reuse earlier outputs. The prepared sequence builds both canonical workers; starts an internal, portless DB; migrates with private random role passwords; seeds a test account, bot sentinel and signed session via owner SQL; starts each worker alone to check a live pulse and PostgreSQL transaction progress before web; verifies web health and authenticated cabinet; stops web/worker and switches both tags current → previous → current; compares seeded data/session/migration hashes; checks no queued jobs or model-call rows; scans service logs for private values; verifies actual container IDs/images/CPU/ports; and removes only the owned stack/volume/private directory. Runtime log contents and credentials are not written into evidence.

No continuation is running. Remaining mandatory AC are owned by the parent coordinator and are blocked by disk resource availability. Telemetry run/work-record/events remain coordinator-owned and were not edited by this executor. F16 release remains pending actual rollback, live calibration, public-stand checks and NFR; this attempt makes no public-stand claim.

## Evidence digests, cleanup, time and usage

- Final runner SHA256: 69c5c96c582b56caa5502f7827cd1e2d2351c6f0813f07f005f0ffd700ee1d13
- Corrected preflight/result SHA256: 20aff26e0020fe429132363411f189d4230da0dcb815e6682a6bb01e2b8cd909
- Offline checks SHA256: 0c4233db3bfe275d3169da349d42d328232d9dce4f9248b12202fb9f14b5e938
- Full per-file source SHA256 maps and operation timestamps: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/tests/artifacts/release-gate/rollback-1-corrected-result.json`.
- Report: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/features/release-gate/12_rollback.md`.
- Terminal trace: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate/evidence/rollback-1-receipt.md`.
- Telemetry: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate`; launch identity matched; no coordinator telemetry mutations.

Cleanup: both preflight private directories removed; owned stack never started; no owned containers/networks/volumes/images created; no shared cleanup, commit, push, global-config edit, donor/N6 read, production-data access, provider call or deployment. No Docker image downloads or npm install were executed. Existing unrelated work-record and launch changes were preserved.

Profile: compact-quality-first-v2, owner override: one bounded executor, no children. Requested model/effort: gpt-6.1-sol/high. Actual model/effort: **null**, because the host exposed no independently verifiable runtime model/effort metadata; no fallback or switch is claimed. Usage, token counts and billing cost: **null/unavailable**, not zero. Baseline cost comparison unavailable; savings not established.
Elapsed launch-to-receipt: **694.561 seconds** including instruction reading, implementation, verification and correction; limit 900 seconds. Corrected resource probe: 5.827 seconds (2026-10-03T07:51:01.840288+00:00 → 2026-10-03T07:51:07.667431+00:00). Active time is unknown because complete wait intervals were not measured.

Status: failed
