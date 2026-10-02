# F03a R1 correction receipt

RUN_ID: 20261002T211800Z-f03
WORK_UNIT_ID: n7-f03a-sol-r1
Attempt-ID: correct-a1
Source-Revision: 62a4acd18529f14a274c9349147fc3e0ebb73bfa
Spec-SHA256: e215f1e53e89b42dccc35e8835209cba31b055f075212b82599fa61368af42be
Launch-SHA256: 140779b7566e40ebec0de0172c8e83d64dffbd3f6e7c9137147926e5db65d410
Started-At: 2026-10-02T21:52:53.322940+00:00 (immutable caller launch; agent first date observation21:53:08Z)
Finished-At: 2026-10-02T22:01:50.368754+00:00
Source-Snapshot: r1-a/source-snapshot.json
Source-Snapshot-SHA256: dedad04a44e1dd3fe7f33f6724a966464df9bbf5beff44d4b612d591bee460e5
Build-Revision: sha256:7fd30f7b180b368689e4c988b3aaa6adb9f0f48a872836341a897c38860d6d74
Image: sha256:7fd30f7b180b368689e4c988b3aaa6adb9f0f48a872836341a897c38860d6d74
Verdict: PASS — exact confirmed R1 correction; whole F03 is not accepted.

Fixed finding: review-a.md R1/P2/AC-A4, equal caller timestamps prevent max(claimed_at) from advancing sender rotation. DispatchStore now orders by sender max(claim_order) and assigns sequence nextval on every successful queued→claimed update under the existing FIRST lock(7,1). No extra lock or clock adjustment. Forward-only db004 adds nullable bigint claim_order and its owned sequence; applied003 bytes remain unchanged. src/db.ts migrates/requires4. Existing pre004 history has null order until next claim; timestamps are preserved. F03b next migration is005, recorded in implementation-a.md.

Regression extends the existing realPG lock/suppression/rotation test: seven campaign recipients minus one suppressed produce three eligible queued jobs per sender. Their due instants differ by1second; both have spare daily/provider quotas. Six successful unique claims share exactly tickNow and alternate throughout, including after both senders have history. claimed_at remains tickNow and every lease remains tickNow+45seconds. Existing20-contender/remaining3 quota, common-lock blocker, expiry and freshness checks run in the full suite. No transport authority or behavior changes.

| Actual command | Exit | Evidence |
|---|---:|---|
| `bash ../../scripts/check-port-conflicts.sh .` | 1 | `r1-a/port-conflicts-own-reuse.txt` |
| `taskset -c 0,1 npm run typecheck` | 0 | `r1-a/typecheck.txt` |
| `taskset -c 0,1 npm run lint` | 0 | `r1-a/lint.txt` |
| `taskset -c 0,1 npm run build` | 0 | `r1-a/build.txt` |
| `docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03a-web .` | 0 | `r1-a/image-build.txt` |
| `docker compose -p n7f03a up -d --no-build --wait` | 0 | `r1-a/own-stack-up.txt` |
| `docker compose -p n7f03a exec -T web npm test` | 0 | `r1-a/unit.txt` |
| `docker compose -p n7f03a exec -T web npm run test:integration` | 1 | `r1-a/full-pg.txt` |
| `taskset -c 0,1 npm run typecheck` | 0 | `r1-a/typecheck-correction.txt` |
| `taskset -c 0,1 npm run lint` | 0 | `r1-a/lint-correction.txt` |
| `docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03a-web .` | 0 | `r1-a/image-build-correction.txt` |
| `docker compose -p n7f03a up -d --no-build --wait` | 0 | `r1-a/own-stack-up-correction.txt` |
| `docker compose -p n7f03a exec -T web npm run test:integration` | 0 | `r1-a/full-pg-correction.txt` |
| `docker compose -p n7f03a exec -T web ./node_modules/.bin/tsx --test tests/dispatch-integration.test.ts` | 1 | `r1-a/old-order-mutation-correction.txt` |
| `docker compose -p n7f03a exec -T web ./node_modules/.bin/tsx --test tests/dispatch-integration.test.ts` | 0 | `r1-a/restored-dispatch-pg-correction.txt` |
| `git diff --check` | 0 | `r1-a/diff-check.txt` |
| `docker exec n7f03a-db-1 psql -U n7 -d n7 -Atc <server_version + schema versions>` | 0 | `r1-a/migration-state.txt` |
| existing check-f03a-secrets.py, executed with evidence destination redirected to r1-a/secret-scan.txt | 0 | `r1-a/secret-scan.txt` |

Initial preflight harness exited1 on the known occupied own port; preflight-checks.json and port-conflicts.txt retained. Own inspected labels/binding confirm n7f03a web on127.0.0.1:18703, DB unpublished. Generic port check1 is a known own-stack reuse signal, not a green free-port claim. No other stack restarted/removed. Immutable lock-matching donor node_modules reused read-only; host Node20.20.2 used for type/lint/build, Docker application/build/test Node22.20.0. CPU2 and RAM>=2500000KiB; flock held only for actual heavy commands. Grant /tmp/n7-f03a-heavy.allowed. Actual heavy intervals and before/after notes: /tmp/n7-f03a-r1-run/progress.md; primary21:54–57 window was missed, actual first heavy21:57:21Z.

Initial fullPG failed on newly added fixture: existing start distributes recipients between senders, so four addresses minus suppression left only3 total jobs. Corrected only the exact test fixture to seven addresses; product code unchanged. Failure retained in full-pg.txt. Repeated affected type/lint/image and full required PG, without rerunning unchanged successful unit/hostbuild. Final unit12/12, full F01/F02/F03 PG20/20, restored dispatch PG6/6. F01 UTC-minute harness reused unchanged (wait only if current seconds>=50); auth assertions/code unchanged.

Guard mutation temporarily reverted only max(q.claim_order) to historical max(q.claimed_at). Underlying realPG test exit1 and exact equal-clock alternation assertion ERR_ASSERTION prove rejection; restored test exit0. Original store bytes restored in finally locally and in own container, with SHA in mutation-restore.json. Fresh source/image comparison AFTER tests and restoration: 40 application files match,0 mismatches; Dockerfile/compose additionally hashed locally. New source diff SHA256: bd2260b7c6792229597ad58340c985471cabbcca8cf6e93ee049f5406af9a854. No historical reports/logs or caller launch/manifest bytes changed.

Profile: compact-quality-first-v2, inherited XL authorization retained; mechanical ROUTE exit1/L lower bound before implementation, scope bounded to approved AC-A4 correction. Requested gpt-6.1-sol/high, sole executor, no agents/fallback/global model change. Actual model/effort/usage/cost: null pending host metadata, as required; no estimated usage or savings claim. Elapsed from caller launch: 537.046s; active duration null (not separately measured). Telemetry: r1-a/run.json and events.jsonl. One test-fixture correction; no product scope expansion. Project-work-companion preparation/delivery applied; browser E2E preflight not_applicable (local PG integration only).

Fresh independent review of this correction and all F03b remain out_of_scope/pending. No browser, real SMTP/IMAP/mail, charge, LLM, deployment, proxy, secret/env/header output or push. Scoped Russian commit includes owned code/db/test/harness/new evidence and this receipt; no Co-Authored-By. Caller launch/manifest remain untracked.

Status: completed
