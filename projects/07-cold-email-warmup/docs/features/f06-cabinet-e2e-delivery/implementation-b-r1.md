# F06B-BLOCK-001 — narrow b-r1 correction

Bound source `50e3c26d93327dc16fee89cfbf8252bf5466cffe`; run `20261003T023900Z-f06`, unit `n7-f06b-r1-sol`, attempt `b-r1`. Substantive XL unchanged; mechanical explicit-file ROUTE M/exit0 is only a lower bound. Confirmed browser receiver risk; owner authorizes this bounded correction, no agents or new survey. Applied project-work-companion prepare/handoff; runtime readiness remains pending until the new image exists.

The exact production diff is one constructor default: `private transport: typeof fetch = fetch` → `private transport: typeof fetch = fetch.bind(globalThis)`. Native Window.fetch receives its required global receiver even when stored/called as a SessionClient method. Explicit injected transports retain their existing call behavior. Epoch, abort, 401, session-change, body-resolution, timeout and error semantics are untouched. No other product module, dependency, backend or database change.

New receiver-sensitive native-like regression rejects any receiver other than globalThis and verifies GET options/signal/result. Its injected function verifies the existing client receiver, POST body/result and that the native default is bypassed. `scripts/check-f06b-r1-mutation.py` replaces the entire actual client file with exact baseline bytes from git, proves RED exit1 (`network_error`), restores exact fixed bytes in finally and proves GREEN exit0. Logs and mutation JSON are under own telemetry. Initial typecheck caught a self-reference inference error in the new test; an explicit SessionClient annotation fixed it. Final typecheck/lint/build exit0 and full unit **39/39** (previous38); existing 401/session/late-response tests pass. Unchanged PostgreSQL115 is inherited, not rerun. Python AST, Bash syntax, node syntax, <500-line checks and actual runtime-value project/current-own-web-log secret scan pass.

Product frozen after light checks: `sol-b-r1-frozen-source.json`, source `cbe07f1ca34ec24312cc77ca14625be26dcf7ed07f79a44656b55e6b8cb9d047`, compiled JS `45385ec142c3cf23790226575dcbe2b4f7d2d760cd108cab5383e18a81fd8ae8`. It binds exact source/test/config maps plus exact compiled-JS map to the baseline revision and immutable dirty snapshot. Harness digests: `sol-b-r1-harness-checks.json`. Historical failed B evidence is preserved.

Heavy/runtime **pending**: `/tmp/n7-f06b-r1-heavy.allowed` absent at handoff. Current own image remains `sha256:a65867e3f1af46b3f4d8a4894a002397ce4a84f890b22b6d0d10d44d1eaa2f7f`, old source `932e7e0b5f8d3189ab8256f1858bd0b74389c91504775f4e2a8be704da67d1de`. No Dockerbuild, stack stop/restart, new-image claim or actual Chromium run occurred in this attempt. No build wait consumed the budget.

Coordinator command, from this project, only after granting the file:

```sh
timeout 450s bash scripts/check-f06b-r1-heavy.sh
```

The script requires nonblocking actual `/tmp/codex-heavy-build.lock`, >=2GB available RAM and >=1.5GB disk, existing nonempty external random runtime files without printing values, CPU2 build of existing `n7f06a-web` tag. It stops only own n7f06a web and then executes the mandatory port-conflict check. Build is bounded240s; startup90s; no PG rerun. Read-only companion READY precedes runtime startup. Exact frozen source and JS are compared against the running new image before allocating `sol-b-r1-image-receipt.json`; DB has no host ports and web is loopback18709/CPU2. Secret scan follows. Native smoke takes nonblocking actual UI flock, writes fresh read-only READY, uses existing shared Playwright1.63.0 Chromium only, registers a random own TEST account, proves bootstrap + direct fetch200 + imported actual SessionClient success with unchanged native fetch, and cleans own contexts/bridge/network attachment. No SMTP, charge, deployment, paid LLM, host/new browser or secret logging. Smoke results go to `sol-b-r1-native/`; busy UI or any source/image mismatch fails closed. Do not delete failed evidence or replace the frozen map silently; allocate a fresh attempt for retry.

After successful image receipt/native smoke, unchanged full browser flow can continue later with explicit current binding:

```sh
timeout 660s python3 scripts/ui/f06-run.py r1-matrix-1 docs/telemetry/features/20261003T023900Z-f06/sol-b-r1-image-receipt.json
python3 scripts/ui/f06-audit.py docs/telemetry/features/20261003T023900Z-f06/sol-b-r1-image-receipt.json
```

Both helpers retain exact historical defaults and accept only this explicit R1 receipt, validate its frozen map and exact current source/image/compiled JS. New audit/events use own paths. Browser journey/security/fixture code is unchanged. Full B matrix, new-image runtime and fresh independent review remain mandatory for acceptance and belong to coordinator. This handoff delivers bounded code/checks; it is **not product acceptance**.

Profile `compact-quality-first-v2`; requested `gpt-6.1-sol/high`, actual model/effort/usage/cost null pending host evidence; no fallback, delegation or savings claim. Timing and terminal delivery: own `sol-b-r1-receipt.md` and `sol-b-r1-events.jsonl`.
