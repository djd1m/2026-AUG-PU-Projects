Implemented F03a; acceptance remains blocked by unavailable mandatory runtime checks.

- Run: `n8-20261002-1740`
- Work unit / attempt: `n8-f03a` / `n8-f03a-1`
- Source: `2879672d8b79ce78711366986084f888b0ab1c61`
- Launch SHA256: `e0534b9a9c9f6fe6cd66e21ea40eabd8d58a9cf9c0e191b685cd01f7b3af922a`
- Build snapshot SHA256: `787c84b893ccbfb0f70c20ffbd14f93314250360a5e563fe903de85de98734f2`
- Finished: `2026-10-02T22:54:37.544838Z`; elapsed: **19m 29.544s**

The implementation adds server-priced ROOM20 intents, durable asynchronous checkout creation with immutable request bytes and UUID idempotency, authenticated payment/refund verification, unique purchase grants, permanent billing holds, queued-job release, and immutable first-payment attribution. Unknown creation outcomes stop automatic POST retries after 23 hours. Fixtures are explicit, nonproduction, and use separate verified objects through the same settlement logic.

Changed source inventory:

- `db/004-payments.sql`
- `web/{payments,provider,payment-fixture,app,config,server,jobs}.js`
- `scripts/{payment-worker,payment-fixture,migrate,mutation}.js`
- `tests/{payments,payments.http,payments.integration,mutation,boundaries}.test.js`
- `.env.example`

The necessary extra path is `tests/boundaries.test.js`, updated for explicit fixture support and the disabled provider default. Evidence and implementation notes are under `docs/features/f03a/`.

| Check | Result |
|---|---|
| Final Node host regression | 49 passed; exit 0 |
| Python software tests | 5 passed; exit 0 |
| Syntax/build and whitespace | Passed; exit 0 |
| Payment, Origin, fixture mutations | Green baselines; targeted assertion failures detected |
| Four PostgreSQL suites | Exit 1 before setup: missing dedicated URL/ownership markers |
| Local HTTP transport suite | Exit 1: sandbox `listen EPERM` |

The PG suite contains 15 scenarios covering replay, mismatches, refunds, holds, attribution, and HTTP boundaries. PG execution, owner/budget mutations, local HTTP verification, and fresh independent review remain pending.

[Check evidence](projects/08-interior-ai-redesign/docs/features/f03a/checks.json) records commands, exits, and complete log hashes. Its SHA256 is `239c993269be01c5a7426335a4c1469e0a651a4e9e298d95e5bf874177dce3cc`. [Source snapshot](projects/08-interior-ai-redesign/docs/features/f03a/source-snapshot.json) records all 57 production/test/runtime files, including `.env.example` and `.dockerignore`.

Profile: `compact-quality-first-v2`, substantive XL. Requested model: `gpt-6.1-sol/high`; actual resolved model/effort, usage, and cost are **null** because host measurements were unavailable. Telemetry: `docs/features/f03a/attempt.json` and `events.jsonl`.

Live payment calls, money movement, deployment, messages, secret-file reads, delegation, and Docker commands: **0**. No commits or pushes performed.

Status: failed