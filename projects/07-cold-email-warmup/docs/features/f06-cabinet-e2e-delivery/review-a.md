# F06 A independent review

Verdict: REQUEST_CHANGES

Reviewed `8932763d..d006c1dad03059c9dd73908f207e22985dd619e5`, exact F06 01–04 A criteria, implementation-a, selected CJM A hierarchy, every web module, server integration, web unit/HTTP tests, and accepted backend contracts only at their UI call sites. Product/tests remained read-only. Browser evidence is not required to accept A, but a confirmed source defect blocks A1.

## Confirmed finding

**R1 — P1 / A1: passive authentication rebroadcasts login and disrupts other tabs.** Locations: `src/web/page.ts:5–6`, `src/web/app.ts:13`, `src/web/dom.ts:63–66`.

Exact trigger: keep an authenticated `/app` tab open with an unsaved campaign or observation form, then open `/signin` (or `/`) in another tab using the same valid session. The second tab's automatic `GET /api/auth/me` calls `signedIn()`. That function broadcasts `login` even though no login or session change occurred. The first tab's unconditional channel listener calls `invalidate()`, aborts requests, erases its form/private DOM, and redirects to `/signin`. Its successful automatic identity check broadcasts again. If the peer has reached `/app` and installed its listener, the same cycle repeats; even without that timing, the unnecessary redirect and loss of unsaved input are certain.

This is a source-confirmed control-flow defect, not a claim of browser reproduction. It also makes legitimate cross-tab login notifications echo through passive redirects. Current web-unit tests exercise SessionClient and Ui in isolation; HTTP tests do not execute this auth-script/channel interaction.

Minimal fix: make passive authenticated-page redirection silent. Emit the login notification only after an actual successful register/login action; retain cross-tab invalidation on genuine session transitions and logout. Add a focused regression proving a passive `/signin` identity check emits no notification and handling a genuine notification does not rebroadcast. No backend contract change is needed.

## A1–A6 matrix

| AC | Result | Functional integration assessment |
|---|---|---|
| A1 | FAIL — R1 | Protected `/app`, auth redirects, API modes, real bounded state, no private browser storage. Central 10-second abort/epoch/session marker checks precede success/error handling and follow body parsing; Ui catches/finally fence old epochs. Logout/401 clear DOM and metadata/key caches. Cross-tab notification logic has the confirmed defect above. |
| A2 | PASS, source/recorded evidence | POST/PUT payloads match `parseMailbox`; PATCH handles limits/quarantine. Connection editing deliberately requires unmasked address/logins/secrets again; masked metadata is never submitted as credentials. Successful save clears sensitive inputs before reload. Separate unchecked grants use exact scopeVersion/fingerprint fields. Disclosure comes from authoritative header/test-body metadata. TEST verification, waiting pool, poll freshness and submitting boundary are honest. |
| A3 | PASS, source/recorded evidence | Labelled 1–5 step/recipient forms map to accepted campaign input, including personalization on edit. Save reloads campaign data; inspect/grant use new content version/fingerprint. Preview uses text nodes, start/pause call actual endpoints, readiness reads consent/poll status, and server capacity/suppression remain authoritative. Async rendering remains under Ui pending/inert handling. |
| A4 | PASS, source/recorded evidence | Observation fields match exact accepted input including unit/count/manual confirmation and UTC values. Compare uses owned IDs, renders actual reasons, disables share until allowed. Explicit share reloads opaque-token reports; copy records only successful copying, open uses an explicit idempotent event, revoke calls API. Private values use textContent; accepted public projection omits private path/reference. |
| A5 | PASS, source/recorded evidence | Actual entitlement/expiry/TEST price and availability; unchanged checkout payload retries reuse the application-held key. Intent refresh reads canonical status and entitlement. Explicit partner code/cookie fallback, create/deactivate and counts use accepted APIs. No browser operator authority or fabricated paid state. |
| A6 | Recorded gates PASS; review complete with R1 | Modular source below 500 lines, known asset allowlist, same-origin CSP/MIME and compiled-module resolution. Existing tenant/auth tests retained. Unit31/fullPG115 and meaningful actual-source 401 RED1/restoredGREEN0 are recorded; those checks do not cover R1. |

## Evidence and boundaries

`astra-a-source-evidence.json` independently verifies all 92 frozen entries against donor `27608099` and current source, complete map and aggregate SHA, exact launch digest, specification01 digest, and CJM digest. Source integration `7c896979` and evidence integration `4858549a` introduce no frozen-source drift. Recorded build hash `b9a214109bef0d428a4609960962782d2631abcb2bb1d311d44084934a403e5a` binds image `79c996d66355dbdd6d2d87b4fb5e0723d4d899651b798b1ce6d34a1d98b7ecf9`, `/app` → `/assets/app.js`. Image equality/canary assertions were inspected as historical evidence, not rerun.

Recorded type/lint/build/unit/PG/snapshot/secrets exits are 0. The initial Dockerfile-in-image checker failure and correction remain documented in the author receipt; all historical files remain untouched. Only the checker changed after freeze; no unchanged PG rerun was performed here.

Profile compact-quality-first-v2; substantive XL and OWN-N7-002 retained, mechanical route L/exit1. Companion prepare applied; source-only E2E readiness `not_applicable`. Requested reviewer Astra high; actual model/usage/cost null pending host evidence. Author host receipt confirms Sol6.1 high, process1439.769s/exit0 and raw usage; cost remains null. Review timing is in the bound receipt. Terminal files arrived at371.324s, missing the360s target by11.324s during final drafting; this process miss is disclosed separately from the product verdict. No agents, product/test edits, commits, push, secrets, network, DB, browser or test reruns.

B remains mandatory next: actual shared-Docker browser journeys/tenancy, visual/keyboard/mobile checks, performance, delivery docs and PR. No actual UX pass or whole-MVP completion is claimed.

Status: completed
