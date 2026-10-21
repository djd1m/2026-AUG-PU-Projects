# F05a implementation receipt
RUN_ID: 20261003T010600Z-f05
WORK_UNIT_ID: n7-f05a-sol
ATTEMPT_ID: implement-a1
Source-Revision: 33a165cfcc31cd33f3f3288624cc58c59cb4c3d2
Build-Revision: aa9c658e771182454b1ea72c1d026b42aca917ef
Spec-SHA256: f46fb91e7717f2a21237e56549ddfb2b8d831b792f130685c08d3a44297142b4
Launch-SHA256: 653329491d7158357705196fac549f5a4d27ada0ce8db8401cb3a950b5545bef
Started-At: 2026-10-03T01:04:50.471832+00:00
Finished-At: 2026-10-03T01:22:15.432271+00:00
FinishedAt: 2026-10-03T01:22:15.432271+00:00
Duration-Seconds: 1044.960
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol/high
Actual-Model: null (pending host evidence)
Actual-Effort: null (pending host evidence)
Usage: null (pending host counters)
Cost: null (pending host counters)
Fallback: none; one executor, no agents or global configuration changes.
Verdict: PASS for author A1–A6 implementation and local required checks; fresh parent Astra acceptance pending.

Full SPARC scope preserved: exact validated F05 01–04 plus canonical SC-US-009/011/013; repeated substantive/mechanical XL before IMPLEMENT, mechanical exit1. Existing OWN-N7-002 and explicit full-autonomy work order apply, no reapproval. B evidence/public report/HTML and F06 whole cabinet excluded. Source frozen at aa9c658e before heavy, well before minute18. Initial Russian commit cb526740, fixture correction aa9c658e. No push, live charge/SDK/network fallback, SMTP/IMAP, LLM, browser, deployment, root/toolkit/other-project/old-migration/auth-algorithm/mailcrypto/dispatch-safety edits. Hard1500s deadline01:29:50 maintained, no extension.

| AC | Actual evidence | Result |
|---|---|---|
| A1 | Server free3/3, TESTteam10/10,100minorRUB30days. Concurrent free mailbox8→3 and team10→7 new/10 total; activation5→3 and team9→7 new/10 total. Locked expiry at capacity3 denies fourth after lock; existing10 remain read/edit/pause. Active duplicate created0 after entitlement ends. Quota30/unsubscribe regressions retained. | PASS |
| A2 | NonPII unique owner code/status/aggregate; same-origin303 and signed bounded purpose30daycookie. Valid cookie accepted; invalid explicit with valid cookie errors, self/inactive reject; absent/tampered/expired reasons. Cookieblocked explicit works. Code deactivation after checkout leaves frozen snapshot eligible. | PASS |
| A3 | Closed body, immutable intent before providercreate; 8 parallel HTTP repeats one intent/payment; changed explicit payload409; foreign404, forged auth401, Origin403; crash after independent create before bind retries one matching payment. Disabled service creates0 provider/grants. Usable owner intent/status TEST API. | PASS |
| A4 | Separate durable canonical provider table and operator auth; ordinary session cannot simulate. Canonical amount/currency/metadata mismatch grants0, unavailable503, oversized wakeup413, redirect/query grants0. Fetch outside app transaction; delayed success after cancel/expiry rejected by atomic current-version/status fence. | PASS |
| A5 | One grant/intent and conversion/buyer; verified paidAt+30days fixed, 8 replay/reconcile calls never extend. Two distinct buyers aggregate2 with no other identity; revoked current plan free, terminal cannot return success,31day-old success grants0. Snapshot/grant/conversion same atomic apply. | PASS |
| A6 | Actual local HTTP checkout→operator success→canonical reconcile→grant+conversion; all full gates below pass, meaningful mutantRED and restoredGREEN, canary/secrets/source-image verified. Independent Astra acceptance belongs to parent, pending. | Local PASS; parent review pending |

Entry command (exit0): `bash scripts/check-f05a-heavy.sh > docs/telemetry/features/20261003T010600Z-f05/sol-a-heavy.txt 2>&1`, own project cwd. Exact sequential commands and exits:

| Command | Exit / actual result |
|---|---|
| `npm run typecheck`; `npm run lint`; `npm run build` | each0 |
| `docker build --cpu-period 100000 --cpu-quota 200000 -t n7f05a-web .` |0|
| `docker compose -p n7f05a up -d --no-build --wait` |0|
| `docker compose -p n7f05a exec -T web npm test` |0,20/20|
| `docker compose -p n7f05a exec -T web npm run test:integration` |0,98/98|
| `python3 scripts/check-f05a-mutation.py` |0 harness; mutant1 with ERR_ASSERTION Missing expected rejection on stale canonical success; finally restored exact hash|
| `docker compose -p n7f05a exec -T web npm run test:f05a` |0,7/7 restored|
| `python3 scripts/check-f05a-secrets.py`; `python3 scripts/check-f05a-snapshot.py` |each0|

Own stack n7f05a, runtime `/tmp/n7-f05a-runtime`, loopback18707, PG no host ports. Port/RAM/disk prechecks passed; CPU2, grant checked, global flock acquired01:17:32Z/released01:19:52Z. Lock never held during coordination. Read-only actual E2E readiness: sol-a-preflight.json. Source/build/container-image equality after restoration: sol-a-source-image.json, source digest `8aa82afff798b81bb15eec602077b258ebb21eb271d4bb7723073a2d21771abd`, build digest `5192e48c9a21bd68db5e868c5406e681c81043d3c51ddc0392a802993742b4c0`, image `sha256:50e4d665d6e64f05a152052300a3ec53e677adfa4c8854e38f7d58972a335ea6`. Package-lock unchanged and equal immutable donor dependency lock SHA25649b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a; donor dependencies not installed/pruned/mutated. Temporary dependency symlink removed after checks.

Durable B contracts: `currentEntitlement(db,tenant)` and `/api/billing/status` are current clock/canonical entitlement authority; `/api/billing/checkout` closed plan/key/code, `/api/billing/intents/:uuid` owner state, `/api/partner` owner nonPII code/counts TEST/no rewards. Operator-only `/api/operator/billing/simulate|reconcile` wakeup and monotonic fixture. BILLING_MODE defaults disabled; Compose N7_BILLING_MODE explicit local_test. Limits use existing `(7,1)`; billing writers `(7,1)`→`(7,5)`; no adapter IO under application transaction. Additive010 immutable/unique constraints persist through restarts. Full details implementation-a.md; exact N3/N6 provenance/adaptation/license context reuse-a.md plus existing03-architecture/reuse-inventory; donors SHA256 independently confirmed. No Next/N6 coupling/liveHTTP/new dependencies.

Author delivery complete. Pending out-of-author scope: parent fresh Astra acceptance, B and F06. Usage/actual model/cost null pending host evidence; savings not established. Runtime is intentionally left for parent verification, local billing only. Launch and manifest remain caller-owned and unstaged.

Status: completed
