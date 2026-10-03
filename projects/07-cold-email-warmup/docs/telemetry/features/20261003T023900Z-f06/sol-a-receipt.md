# F06a — final implementation receipt

RUN_ID: 20261003T023900Z-f06
WORK_UNIT_ID: n7-f06a-sol
Attempt-ID: implement-a1
Source-Revision: 8932763d78fc169acf177fbf5b78874ad680e168
Candidate-Revision: 27608099a7b58473d953f88153313033622fa1a9
Spec-SHA256: 72b44888ddab0405d955084d572130649fbdddc70b33d53a364db7dd80f05de5
Launch-SHA256: c9c3e58382991d4cc80f0593e25b3d538b574a46855dd51eea67ee7a900d7b19
Started-At: 2026-10-03T02:44:18.440002+00:00
Finished-At: 2026-10-03T03:07:57.185120+00:00
Verdict: implementation and automated A gates passed; independent acceptance review remains caller-owned
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol / high
Actual-Model: null (host evidence pending; no inferred switch)
Actual-Effort: null (host evidence pending)
Usage-Tokens: null (host unavailable)
Cost: null (host unavailable; no estimated cost)
Elapsed-Seconds: 1418.745 (wall time, includes instruction reads, coordination, queue and correction)
Active-Seconds: null (not independently measured)

/next → /go F06 → /feature full SPARC preserved. Approved F06 docs01–04 reused; no design resurvey. Root/project rules and coding/testing/security skills plus companion prepare read. Mechanical ROUTE L/exit1 is lowerbound; substantive ROUTE XL repeated before IMPLEMENT: authenticated privacy/session authority, separate send consent and payment presentation. OWN-N7-002 covers autonomy. No agents, model fallback or global configuration changes. Fresh Astra review and B browser/perf/docs/PR are caller-owned subsequent work, not performed or claimed by A.

| AC | Concrete product and evidence | Result |
|---|---|---|
| A1 | Real protected /app, auth redirects /signin and /app, six sidebar steps, API modes and state; no private storage. Central epoch/abort and opaque session marker reject old success/error/body/finally. Cross-tab session notification, reload/relogin persistence. web-unit lifecycle + real HTTP assets/auth/relogin | implementation + automated PASS; actual browser B pending |
| A2 | Mailbox add/edit/1–30 total limit/quarantine/pause/local TEST verify; SMTP465/587 + IMAP993 TLS; secret inputs blank and cleared on save. Separate unchecked pool/campaign grants, current version/fingerprint, sender/header/test-body disclosure and private-scope boundary. Honest pool waiting and poll source/staleness; at most one already-submitting attempt explained | accepted F02 regressions + focused HTTP PASS |
| A3 | Usable 1–5 subject/body/delay steps and <=100 semicolon recipient rows with allowlisted personalization. Create/edit/escaped text preview, current mailbox/campaign consent, start readiness and actual start/pause APIs; edits invalidate consent, server quota/suppression preserved | accepted F03 regressions + focused HTTP PASS |
| A4 | Manual source/ref/UTC windows/metric/direction/counts/confirmation form, history and pair reasons; raw small-n rule, no causal promise. Explicit opaque report creation, real public HTML, owner copy/open events and revoke; public canary excludes private URL path/ref | accepted F05 + focused HTTP PASS |
| A5 | Actual free/team limits/expiry, disabled mode, TEST100minorRUB30days. Optional code before checkout, cookie-presence status, stable payload key, persisted intent history/canonical refresh, no browser operator authority. Owner partner create/deactivate/code/link copy with fallback and actual TEST counts/history | accepted F05 + focused HTTP PASS |
| A6 | Type/lint/build, fullunit31, full realPG115, focused auth/app/assets HTTP/source security; actual central401 mutation RED1/restoredGREEN0; frozen source/build/image file equality and secret scan | automated PASS; fresh independent Astra review still required |

Commands / actual exits (project cwd):

- `npm run typecheck`: 0; `npm run lint`: 0; `npm run build`: 0.
- `npm test`: 0, 31/31. After the final small form-validation disclosure change, affected `tsx --test tests/web-unit.test.ts` remained 0; full unchanged unit set was not repeated.
- `python3 scripts/check-f06a-mutation.py`: 0; actual source mutation central401 disabled: RED exit1; restored GREEN exit0. Assertion covers private clear/abort/signin and obsolete late response, plus session/body and late UI catch/finally tests.
- `docker compose -p n7f06a exec -T web npm run test:integration`: 0, 115/115, no skipped/canceled/todo. Includes accepted backend suites and focused F06 realHTTP protected route, all modules MIME/CSP/allowlist/build equality, persistent mailbox/campaign/evidence/report/billing/partner flows, revoked-cookie rejection and relogin.
- Docker build: 0; own Compose healthy startup: 0; port/RAM/disk preflight: 0.
- `python3 scripts/check-f06a-snapshot.py final`: 0 after narrow checker correction; `python3 scripts/check-f06a-secrets.py`: 0.

Retained failures/corrections: an initial test-only TypeScript cast needed `unknown` before fetch type; corrected before freeze, final type/lint/build green. Two initial shell invocations used the wrong cwd and did not validate or mutate product; corrected paths used. Heavy wrapper first exited1 after PG passed because its checker expected Dockerfile inside image. Existing Dockerfile copies src/config/tests but not itself. Corrected only the evidence script: Dockerfile remains a SHA-bound build input, every shipped source/config/test/JS file is checked inside the actual image. No product source changes after freeze and no unchanged successful PG repeat. RED mutation failure is expected evidence, not a hidden regression.

Source/build/image:

- Product source freeze: 2026-10-03T03:01:46.878758+00:00, before minute18; commit `27608099a7b58473d953f88153313033622fa1a9`.
- Frozen source SHA256: `9d8687754a8c85dada747898492e72f71f53582bcfb388bf981c7e3bbe7a3574`; full per-file map `sol-a-frozen-source.json`.
- Build JS SHA256: `b9a214109bef0d428a4609960962782d2631abcb2bb1d311d44084934a403e5a`; exact source and compiled JS hashes matched in running image.
- Image: `sha256:79c996d66355dbdd6d2d87b4fb5e0723d4d899651b798b1ce6d34a1d98b7ecf9`; actual container Image matched. Dockerfile build input SHA256 `f8d6728ac4337c589cf55983654e2cf51ac437ef4711e20086f12d775cc997f5`. Native TS emits `dist/web/*.js`; existing Docker build copies src and runs tsc, no extra copy/dependency required.
- Entrypoint `/app` → `/assets/app.js`; assets use explicit known-name allowlist and JavaScript/CSS MIME, CSP script-src self. TS-source HTTP tests resolve the same `dist/web` build; production uses co-located compiled modules. No arbitrary file route, untrusted innerHTML or third-party script.
- Own stack `n7f06a`, local URL `http://127.0.0.1:18709/app`, runtime random files `/tmp/n7-f06a-runtime`, DB no host ports. CPU2; port18709 and RAM/disk checked; grant `/tmp/n7-f06a-heavy.allowed`. Flock acquired03:02:37/released03:04:47 UTC.
- Companion ready recorded immediately before runtime (`sol-a-preflight-runtime.json`) and real HTTP/PG (`sol-a-preflight-http.json`), not as implementation prerequisite. Readiness is not browser acceptance.
- Immutable donor node_modules symlink only; both lock SHA256 `49b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a`. No target dependency install/prune or manifest/lock change.
- Donor CJM A `docs/cjm/cohort-desk.html` SHA256 `9e464965d558a6cfdc3d7e8f1a99aa9a0ff70937dd1876f165074f1a38cf1172`: visual hierarchy only, demo states rejected. Auth seam from bound baseline; business API sources read directly and unchanged.

API handoff: /api/app is authenticated safe metadata only (actual modes, pool disclosure, plans/provider host caps, <=50 own intents, referral-cookie presence). X-N7-Session is an opaque non-credential UUID for session lifecycle. Existing mailbox/consent/campaign/poll/evidence/report/billing/partner endpoints retain business authority. No operator secret/endpoint in client, no schema/SMTP/provider/payment/consent/reply business mutation. Unit/static guards and API canaries preserve the private/public boundary.

Limits: actual 390/1440 rendering/overflow, keyboard/focus/reducedmotion screenshots, browser journeys/tenants, performance p95, fresh Astra acceptance and B delivery/docs/PR have NOT been executed here. Code presence is not browser evidence. Local TEST verification is not a live connection; no SMTP/IMAP, real charge, LLM, deploy/shared proxy or push. Own runtime stays available for B. Caller launch/manifest and donor symlink remain unstaged. Economy not established; token/cost/model measurements remain null pending host reconciliation.

Evidence: `sol-a-type/lint/build/unit/guard-final/pg` logs and exit files, mutation RED/GREEN logs, frozen source, runtime/HTTP preflights, image receipt, secrets receipt and append-only events, under `docs/telemetry/features/20261003T023900Z-f06/`.

Status: completed
