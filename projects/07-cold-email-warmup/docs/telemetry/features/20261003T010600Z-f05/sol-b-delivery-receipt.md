# F05 B separate delivery recovery

Verdict: saved author evidence delivered; product acceptance pending
RUN_ID: 20261003T010600Z-f05
WORK_UNIT_ID: n7-f05b-delivery-sol
Attempt-ID: delivery-b2
Source-Revision: 5f2f4a8150407802b2d800df08a5a5ddaf71288a
Build-Revision: 5f2f4a8150407802b2d800df08a5a5ddaf71288a
Spec-SHA256: f46fb91e7717f2a21237e56549ddfb2b8d831b792f130685c08d3a44297142b4
Launch-SHA256: ceb4eedbb5db7e02bb99c9e23148cbe6d9729aa357156536ae69a148ea6a0b8c
Started-At: 2026-10-03T01:59:59.705603+00:00
Finished-At: 2026-10-03T02:02:38.401283+00:00

Original implement-b1 process exit124 at01:58 is caller-reported; parent recorded failed receiptgate. Its receipt remains provisional and run remains running, byte-preserved; original delivery did not succeed. This separate attempt only inspects and packages evidence. OWN-N7-002 XL/autonomy retained; compact-quality-first-v2; requested gpt-6.1-sol/high; actual model/effort/usage/cost null pending host. No agents/fallback/global change. Recovery terminal duration 158.696 seconds, measured UTC; full time-to-acceptance unknown.

Saved commands/results (not rerun): `npm run typecheck`0, `npm run lint`0, `npm test`0,25/25 (sol-b-type/lint/unit). `bash scripts/check-f05b-heavy.sh` initial exit1: Docker build succeeded; `docker compose -p n7f05b exec -T web npm run test:integration`105pass/2fail (B4 fixture plus parent), billing_entitlement_check23514. Local attempt exit1 has empty log: cause not independently established. Commit5f2f4a81 corrects paid_at+30days expiry fixture AND updates heavy script/preflight/retry; no production change in that commit.

Final sol-b-heavy.exit0: build succeeded; retry type/lint succeeded; `docker compose -p n7f05b exec -T web npx tsx --test --test-concurrency=1 tests/evidence-integration.test.ts`9/9 before and after mutation. `python3 scripts/check-f05b-mutation.py`: mutant exit1,4pass/5fail,201 instead of409; restored reports.ts hash in sol-b-restored.txt. Canary and source/image checks PASS in heavy log. No final full-suite rerun: unchanged suites passed initially; affected B suite rerun.

| AC | Author evidence at bound source | Result |
|---|---|---|
| B1 | manual provenance/unknown/no source IO; observations1000 cap | PASS,final PG0 |
| B2 | foreign404/stale/incomparable/noimprovement;29/30/window boundaries | PASS,unit0/final PG0 |
| B3 |12 concurrent repeats one report/event; payload409; lock-wait expiry | PASS,final PG0; mutant RED1 |
| B4 | every-view current TEST entitlement; expiry/committed revocation | PASS,corrected PG0 |
| B5 | own idempotent copy/link counts; bounded history;200/600 caps | PASS,final PG0 |
| B6 | saved build/PG/concurrency/mutation/restoration/canary/sourceimage | PASS,heavy0; acceptance pending |

Preflight ready at01:57:34; its generic full-suite command differs from actual targeted retry, disclosed above. Frozen map matches current source files by SHA256. Source SHA25610d6b1b84f9210941a807036a36ac6a3b3726b28078067bb655c669128f04f5b; build SHA2568973b6ad99aefd33520dd77939ed55348431dc7c323cddc7fde06704bd8cb316. Saved image/container both sha256:1b1f2779ae7bf58a1162f80f1103fc043144616358a074367de8a060816d305d (sol-b-source-image.json). No runtime reinspection.

Scope: F05 B backend/API/public HTML author evidence only; implementation-b.md contains API handoff. Remaining gates: parent receipt validation/aggregation and fresh independent Astra F05 acceptance; F06 whole-cabinet Playwright out of this delivery scope. No product/test edits, reruns, network, deployment, live actions or push. Full local trace: /tmp/n7-f05b-sol/projects/07-cold-email-warmup/docs/telemetry/features/20261003T010600Z-f05/sol-b-delivery-receipt.md.

Timing exception: provisional receipt was immediate; terminal receipt at158.696s missed required120s gate. Evidence delivery completed; deadline compliance failed.

Status: completed
