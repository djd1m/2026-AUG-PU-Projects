# N8 UI E2E attempt1 — failed

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-ui-e2e-1
ATTEMPT_ID: n8-ui-e2e-1
Source-Revision: ee74677afcbfa870a866321067671a331fb643f7
Build-Revision: ac8b9e5390194cd12e0bc6bc648149e2ea274e4a953d30eeda4a8e698c30c56d
Launch-SHA256: eaa366d40ef635bc8b747021f5296ca6659bbebd280add3f88830dcd0a90d2a9
Started-At: 2026-10-03T01:49:54.335436Z
Finished-At: 2026-10-03T01:50:11.580493Z
Verdict: FAILED — browser runtime fixture synchronization

Actual Chromium through existing Playwright1.63 remote server, owned HTTPS app and real PG. Structural companion preflight passed before execution;79 container and88 host source hashes matched. App initialized6 migrations and HTTPS200. Browser exited1 after17245ms at fixture checkout: fixtureSignal reported “Run asynchronous checkout creation first”. Driver invokes runOne once then signals target before its provider_id is ready; asynchronous normal worker may already hold lease. No complete browser matrix or payment/browser acceptance is claimed. No screenshots/results final artifact was reached. Raw log outsidegit; redacted log in docs/features/f04b-fix/ui-e2e-1.

Initial --network=none build failure, initial TLS issuance probe failure and Node-e probe import failure are preserved; corrected normal build/init/HTTPS/schema reads succeeded. Probe import failure was evaluation without argv[1], not normal application startup.

Next bounded action: Sol fixes only owned fixture driver target-intent wait, adds exact pending/preceding-intent regression, fresh Astra closure, new image/owned stack and new E2E attempt. GPU quality remains pending; synthetic software data only. Usage/cost/native coordinator model null; deterministic runtime Node22.20/Playwright1.63.

Status: failed
