# F04 B-R1 correction receipt
RUN_ID: 20261002T232200Z-f04
WORK_UNIT_ID: n7-f04b-sol-r1
ATTEMPT_ID: correct-b1
Source-Revision: c3f5803b9796299773fb5d5db9c806b95c9875ad
Build-Revision: af99d97f657dafd844c8a72fb5c66e37e54c31c2
Spec-SHA256: 6deaa2f48d531ca66b71abb9f1b90794836cc4ab80eab557076863b92de74a38
Launch-SHA256: 20a1c47a48e1d99a5a90b105cfc11e3918cfd8e0ab67bf99d02c6e16cb08fc71
Started-At: 2026-10-03T00:44:53.566707+00:00
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol/high
Actual-Model: null (pending host metadata)
Actual-Effort: null (pending host metadata)
Usage: null (pending host metadata)
Cost: null (pending host metadata)
Fallback: none; no model switching or agents.
Finished-At: 2026-10-03T00:55:16.572895+00:00
FinishedAt: 2026-10-03T00:55:16.572895+00:00
Duration-Seconds: 623.006
Verdict: PASS for author B-R1 correction and required checks; fresh parent Astra recheck pending.

Substantive ROUTE before preparation and implementation: XL (durable reply completion invariant, additive schema and internal store guard). Mechanical explicit-path router: exit0/M lower bound. Existing OWN-N7-002 and explicit caller correction authorization preserved; no approval expansion. Resume original F04 under new correct-b1 attempt. No native checkpoint: caller source-bound handoff. Confirmed input is review-b.md B-R1 and AC-B5/B6. B1–B4 accepted and untouched. Adapter/provider network remains disabled; no real SMTP/IMAP, charge, LLM, browser, deployment or push. No root/history/other-project/auth/mailcrypto/public-stop changes. Source code frozen at early Russian commit af99d97f; docs/scripts/evidence added afterward. Donor real node_modules used through a temporary local symlink, removed after checks; never installed/pruned/mutated donor. Own+donor lock SHA256: 49b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a.

Minimal fence: mailbox_poll owner UUID and local_reply_fixture generation UUID in additive009;001–008 unchanged. Observe before adapter operation, apply guard within capture/page/failure's same eligibilityTransaction, shared lock first. Seed/update changes generation under the same lock. Every poll claim replaces owner without clearing existing completion. Obsolete success/error/tail callbacks do no business writes. Current failed/missing fixture pauses. Optional trusted guard leaves unguarded A semantics unchanged; immutable H/tailH, dedup,20page/120s attempt budget and explicit retry retained. No generic engine or public API redesign. Internal API update: implementation-b.md; correction: correction-b-r1.md.

| B-R1 acceptance | Actual PostgreSQL evidence | Result |
|---|---|---|
| Old first snapshot success after newer UIDVALIDITY completes | Real FixtureAdapter result captured, barrier; newer worker complete; entire durable state compared after release | PASS |
| Old first snapshot failure when local run is null | Real FixtureAdapter error captured and delayed; newer worker complete; completion/timestamps preserved | PASS |
| Changed-tail success capture branch | Old second real snapshot validity2 delayed, validity3 completed by second worker; full state preserved | PASS |
| Same validity generation changes: success/failure | Old result/error delayed, fixture reseeded same validity, second worker completes; full state preserved | PASS |
| Same validity concurrent polling owner only | No reseed; newer worker token takes ownership and completes; old result cannot replace complete | PASS |
| Source generation independent of owner | Reseed same validity without second owner; old capture/error no business changes; current poll completes | PASS |
| Current missing/failed fixture | Both pause; subsequent valid current fixture completes | PASS |
| Atomicity with seed; adapter I/O outside lock | Seed and second worker finish while old adapter callback suspended; pg_locks shows seed waiting while guard transaction holds lock; after seed old guard rejects | PASS |
| Preserve run/attempt/cursor/H/tailH/timestamps/effects | Deep compare complete reply_rescan/mailbox_poll plus observations/messages/effects/jobs | PASS |
| Existing A semantics and full regression | Full PG includes all A tests; A tests source unchanged | PASS |

Exact entry command (exit0): `bash projects/07-cold-email-warmup/scripts/check-f04b-r1.sh > projects/07-cold-email-warmup/docs/telemetry/features/20261002T232200Z-f04/sol-b-r1-heavy.txt 2>&1`. Per-command output/exits: sol-b-r1-heavy.txt; shell terminal exit: sol-b-r1-heavy.exit. Existing-own port preflight detects expected occupation, then asserts own container name/project/127.0.0.1:18706; DB has no host port. Parent grant read before acquire; flock and CPU2/RAM/disk gates passed. Heavy acquired 00:50:08Z; released 00:52:09Z. No lock held during coordination/coding wait.

| Exact command inside project / own n7f04b environment | Exit / result |
|---|---|
| `taskset -c 0,1 npm run typecheck` | 0 |
| `taskset -c 0,1 npm run lint` | 0 |
| `taskset -c 0,1 npm run build` | 0 |
| `DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f04b-web .` | 0, cached immutable dependency layer |
| `docker compose -p n7f04b up -d --no-build --wait` | 0 |
| `docker compose -p n7f04b exec -T web npm test` | 0;18/18 |
| `docker compose -p n7f04b exec -T web npm run test:integration` | 0;91/91 |
| `python3 scripts/check-f04b-r1-mutation.py` | 0; capture RED exit1 and first-failure RED exit1 with ERR_ASSERTION |
| `docker compose -p n7f04b exec -T web ./node_modules/.bin/tsx --test tests/suppression-owner-integration.test.ts` | 0;restored11/11 |
| `python3 scripts/check-f04b-r1-secrets.py` | 0; runtime secrets and credential/header/body canaries absent from applicable files/logs/reply data |
| `python3 scripts/check-f04b-r1-snapshot.py` | 0; all63 source inputs and36 JS build files match restored running image input/build |
| `docker compose -p n7f04b exec -T db psql -U n7 -d n7 -Atc 'SELECT version FROM schema_migration ORDER BY version'` | 0;1–9 |
| `docker compose -p n7f04b exec -T web node --version` | 0;v22.20.0 |

Preflight immediately before local E2E: ready; exact frozen source/build, own n7f04b Node22/PG16, local operator fixture input and runtime files available; bounded seed/poll durable effects permitted; command+evidence destination recorded in heavy log. No external provider actions executed. Readiness itself was not counted as a test pass.

Two independent meaningful mutations restore in finally: remove capture transaction guard; remove guard before null-run failure UPDATE. Tests observed durable corruption and failed, then host/container hashes were restored. Logs sol-b-r1-mutation-capture.txt and sol-b-r1-mutation-failure.txt retain exact assertions and exit1; restoration hashes in sol-b-r1-restored-capture.txt and sol-b-r1-restored-failure.txt. Focused restored GREEN11/11 follows both mutations. Final canary and source/image check ran afterward. Successful unchanged full suites were not repeated.

Source SHA256: de0cbf538d353488a5acae33d7ffa55d172c0f32cebfee89a2ccbe55367fa185
Build SHA256: 377f9916d66b5104c06f574adc71068ffa41857bd910bcdeba98c9abd2552a7e
Image/container: sha256:3d4467ed3c6d1cc3bab63d87ff9c16d2e0a9f8797854467e5f240dddde4b61ba
Source-image map: sol-b-r1-source-image.json (63 source inputs,36 compiled files). Dockerfile SHA256: f8d6728ac4337c589cf55983654e2cf51ac437ef4711e20086f12d775cc997f5.

Receipt structural check: `node .claude/hooks/check-swarm-receipts.cjs projects/07-cold-email-warmup/docs/telemetry/features/20261002T232200Z-f04/sol-b-r1-manifest.json` exit0; terminal FILE fresh/substantive. `git diff --check` exit0 on tracked source/doc changes before evidence staging. Final `git diff --cached --check` exit2 reports whitespace in raw Docker/TAP stdout logs only; those logs retain original bytes. No product/source whitespace findings. These checks do not replace independent review.

Limits: actual model/effort/token/cache/tool usage/USD remain null until host confirms; requested Sol6.1/high is not asserted as measured execution metadata. No automatic usage collector installed; stage active/wait partition unavailable. Wall duration includes instructions, coordination wait, implementation, tests, mutations and evidence to this terminal receipt; parent acceptance time is pending. Host type/lint/build ran Node20.20.2; Docker image build/unit/PG/runtime ran pinned Node22.20.0. Fresh independent parent Astra B-R1 recheck remains required before whole F04 acceptance. No forecast/savings claim. Caller launch/manifest retained untouched and unstaged. Original review and historical artifacts unchanged.

Status: completed
