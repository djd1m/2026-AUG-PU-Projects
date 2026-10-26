# N5 acquisition analytics — independent planner packet

Date: 2026-10-26. Source: `/tmp/n5-acquisition-analytics-20261026`, baseline `4d5b0e26`. Project: `projects/05-podcast-clips-opus`. Planner is independent of implementation; this packet contains no coder notes. Requested policy: `model-routing-econom`, planning/review `gpt-6.1-sol high`, coding `gpt-6.1-sol medium`. Runtime model/effort and usage/cost must come from launch metadata; unavailable measurements remain null.

## Scope and route

Build one optional Yandex Metrika browser adapter for the pilot funnel visit → successful signup → first available clip observed → confirmed payment observed. Research of analogues, the one-channel/one-tariff/one-feature/one-segment decision and the economics sheet are coordinator-owned artifacts; the implementation consumes their fixed pilot UTM tuple rather than inventing additional campaigns. Revenue in the economics sheet is reconciled against the existing payment ledger, not browser counts. Existing runtime tariffs/payment mode may differ from owner target documents: correcting them is a separate pretraffic gate, not authorized by analytics instrumentation.

Accepted substantive route: L, full PLAN → VALIDATE → IMPLEMENT → REVIEW because this adds external data transmission. Existing payment truth is observed without modifying money state/provider calls/DB. Mechanical ROUTE is a lower bound and has a diagnosed explicit-mode false positive, recorded below. Existing authorization covers the bounded implementation only as the coordinator establishes; this packet does not add authorization to deploy, mutate runtime or spend. No source is changed by this planning task.

### Exact mechanical ROUTE evidence

Both invocations used `bash scripts/complexity-router.sh` in MAIN root `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects`, main HEAD `732df4cccca8cd03bdaa51eaafe49adac23f01ee`; neither used the baseline worktree script. Baseline being planned remains `4d5b0e26`. The coordinator separately confirmed the diagnosis; planner independently reproduced the narrow six-path result.

First invocation (8 candidate paths):
```sh
bash scripts/complexity-router.sh projects/05-podcast-clips-opus/apps/web/src/app/layout.tsx projects/05-podcast-clips-opus/apps/web/src/app/AuthForm.tsx projects/05-podcast-clips-opus/apps/web/src/app/videos/'[videoId]'/VideoDetail.tsx projects/05-podcast-clips-opus/apps/web/src/app/upgrade/return/ReturnScreen.tsx projects/05-podcast-clips-opus/apps/web/src/lib/acquisition-analytics.ts projects/05-podcast-clips-opus/apps/web/src/app/AcquisitionAnalytics.tsx projects/05-podcast-clips-opus/apps/web/src/server/environment.ts projects/05-podcast-clips-opus/docker-compose.yml
```
Actual output: explicit mode, 8 files, XL, exit 1. Flags: money/provider reference; new external host; cache/retries. Source diagnosis: current script line 79 assigns `ADDED=cat` of the full existing file bodies in explicit mode; line 106 matches pre-existing `YOOKASSA` in `server/environment.ts` and compose although analytics only adds a separate optional public key. This output does not demonstrate a new money mutation in the future diff. The external-host flag likewise reads pre-existing code. No script, rule or check was changed to obtain the second result.

Second invocation (6 observation paths, same command omitting only `server/environment.ts` and `docker-compose.yml`):
```sh
bash scripts/complexity-router.sh projects/05-podcast-clips-opus/apps/web/src/app/layout.tsx projects/05-podcast-clips-opus/apps/web/src/app/AuthForm.tsx projects/05-podcast-clips-opus/apps/web/src/app/videos/'[videoId]'/VideoDetail.tsx projects/05-podcast-clips-opus/apps/web/src/app/upgrade/return/ReturnScreen.tsx projects/05-podcast-clips-opus/apps/web/src/lib/acquisition-analytics.ts projects/05-podcast-clips-opus/apps/web/src/app/AcquisitionAnalytics.tsx
```
Actual output: explicit mode, 6 files, M, exit 0; cache/retries flag only. The substantive L includes all eight production surfaces and the new external analytics call, retaining the full lifecycle and required checks. Before IMPLEMENT rerun ROUTE on the actual source diff, verify config changes are strictly additive analytics wiring and ensure no money/provider/auth behavior has changed. A genuine new money change raises scope to XL and returns to the coordinator's applicable owner checkpoint.

Excluded: DB schema/migrations/outbox; new public API; modifying authentication, authorization, sessions or payment state; server-to-server analytics; worker changes; provider account creation; purchase; paid API; deployment; runtime/environment mutation. No claims of full signup/payment coverage, financial-grade analytics or exactly-once delivery.

## Confirmed source facts

- `apps/web/src/app/layout.tsx` is dynamic server layout; no analytics. `apps/web/src/server/environment.ts` and `docker-compose.yml` have no analytics ID wiring. `Dockerfile` builds Next before runtime env injection, so a runtime-only NEXT_PUBLIC variable is insufficient. Prefer server-read `N5_METRIKA_COUNTER_ID` explicitly passed as a public numeric prop; do not pass the environment object.
- `apps/web/src/app/AuthForm.tsx` uses registration/login followed by authenticated tRPC `code.apply`, then redirects. `apps/web/src/server/auth.ts` and `auth-store.ts`: duplicate email intentionally returns 200 and a random unusable cookie; `ON CONFLICT DO NOTHING` preserves anti-enumeration. Therefore response.ok alone is not successful signup.
- `apps/web/src/server/trpc.ts` protects `code.apply` and `clip.list`. `VideoDetail.tsx` polls `video.get` and `clip.list`; `ClipScreen` has `status`, `available`. `screen.ts` derives availability from done state, object and expiry/retention. `clips_done` or a click is insufficient.
- `useClipDownload.ts` starts an anchor download then asynchronously calls `clip.markDownloaded`. `screen.ts` writes existing `growth_event.type='download'` after checking ownership and availability; this does not prove bytes arrived. Reuse its meaning if reporting download interest; do not add duplicate DB events or call it a completed download.
- `upgrade/return/ReturnScreen.tsx` polls authenticated GET `/api/checkout/{intent_id}`. `billing-handler.ts` reports succeeded from stored intent state; confirmation ultimately comes from verified provider notification and idempotent `packages/db/src/payments.ts`. A return-page view, checkout redirect, account_plan=paid, operator grant or interest event is not payment proof. Existing money logic stays untouched.
- Existing guest consent concerns guest publication, not analytics. No general analytics consent mechanism was located in the inspected product instructions. Do not reuse the guest checkbox as analytics consent.

## Minimal implementation contract

1. Add a small typed adapter and client host. Missing/empty/malformed ID disables script and all events; accept only a positive safe integer string, never executable config. Read optional runtime ID on server and pass to host. Compose forwards it only to web. Keep start, health and product working without a counter. No package dependency or Docker build argument is needed for this design.
2. Require explicit analytics consent; initial unknown/denied means no provider script, request, queue or attribution storage. A compact accessible choice can reuse existing notice/button styles; allow withdrawing consent and clear local attribution/dedupe state. Failure of storage, script, SDK, network or an ad blocker never blocks signup, rendering, navigation or download. All analytics calls are best-effort and bounded; avoid an unbounded persisted retry system.
3. On consent plus valid counter, load only official Metrika SDK asynchronously. Initialize with `defer:true`, `webvisor:false`, `clickmap:false`, `trackLinks:false`, `trackHash:false`, `sendTitle:false`, ecommerce disabled. Counter-side automatic goals/session replay must also be off; record this external prerequisite. Explicitly send manual pageviews using static sanitized route categories; suppress dynamic guest/file/showcase/API routes altogether. Do not use raw pathname, search, hash, document title or document.referrer as event data. Referrer is blank or a sanitized static category. Verify actual SDK requests, because options/payload sanitizers alone do not prove the SDK did not read other browser fields.
4. UTM capture: accept only exact owner-selected pilot values for source/medium/campaign/content (and reject term); every unknown/free-form/mixed/overlong value maps to no campaign. Store only this closed tuple after consent, first touch only, bounded to one pilot and a documented 30-day maximum. No emails, account/clip/video/intent IDs, titles, filenames, transcripts, prompts, raw URLs, referral/guest codes, tokens or media links in provider payload. Local payment dedupe may use an intent ID internally but never transmit it. Storage keys are fixed and bounded; corruption fails safely.
5. Ensure React StrictMode, hydration, repeated polls, remounts and reloads do not emit duplicate funnel goals within the defined browser scope. Document best-effort per-browser/session dedupe, its storage-denied behavior and the inability to provide exactly-once delivery across devices. Do not claim first-ever account activation from browser-local state.

## Events and truth

| Goal | Trigger / truth source | Negative cases and limits |
|---|---|---|
| `n5_visit` | Once per consenting browser visit after sanitized landing page hit; adapter manages a bounded visit session (30-minute inactivity). Fixed route=`landing`. | No script/goals before consent or without ID. Route changes do not create new visits. Provider's own visits are a separate denominator. |
| `n5_signup_success` | A real registration attempt in AuthForm followed by successful authenticated `code.apply`; include successful explicit discard-referral continuation. Keep a local pending-registration flag tied to this form attempt. Emit before redirect, nonblocking. | Never on login, duplicate register 200 with dummy cookie, failed auth or failed protected request. Invalid referral temporarily undercounts signup until user successfully continues. If user leaves before continuation it remains unobserved; record the limitation. No change to register response or anti-enumeration. |
| `n5_first_clip_ready` | First browser observation of `clips.some(c => c.status==='done' && c.available===true)` after authenticated clip list/SSR data in VideoDetail. Works for already-ready initial data and later polling. | No upload/start/queued/rendering/failed/expired/unavailable clip, no download button click. Meaning is first available clip observed within browser scope, not first render/account globally. Persist one bounded activation marker per browser pilot. |
| `n5_payment_confirmed` | Only a valid authenticated checkout-status response for the requested intent with `status==='succeeded'`; emit after parsing response, independently of display label. Existing DB is the upstream truth; dedupe by intent locally. | No return mount, URL query, pending/canceled/404/401/error/timeout, interest, account plan alone or forged local UI state. paid_inactive can still mean historically confirmed payment; do not treat it as current entitlement/revenue. This counts observed confirmations only; absent return, denied consent and blocked SDK undercount. Reconcile actual payments/refunds with DB. |

Payload is a closed schema: schema_version, pilot id, static route category, approved UTM tuple, event name. Optional fixed tariff label only if it matches frozen pilot docs; omit price/revenue because status API does not return the authoritative charged amount and runtime tariff can differ. Provider pseudonymous client identity is documented; app identity is not sent. No browser payload is trusted to modify a business record.

## File allowlist (all relative to project)

Implementation:
- `apps/web/src/lib/acquisition-analytics.ts` (new typed config/payload/attribution/dedupe/SDK wrapper)
- `apps/web/src/app/AcquisitionAnalytics.tsx` (new minimal client host/consent)
- `apps/web/src/app/layout.tsx` (public prop + host)
- `apps/web/src/app/AuthForm.tsx` (authenticated registration observation)
- `apps/web/src/app/videos/[videoId]/VideoDetail.tsx` (available clip observation)
- `apps/web/src/app/upgrade/return/ReturnScreen.tsx` (confirmed status observation)
- `apps/web/src/server/environment.ts` (optional runtime key)
- `docker-compose.yml` (integration owner only; web env forwarding)
- `.env.example` (only if that tracked template exists; public ID comment/default off)

Validation and evidence:
- `tests/acquisition-analytics.test.ts` (new)
- `tests/browser/acquisition-analytics.test.ts` (new; use existing browser harness)
- `tests/auth.test.ts`, `tests/browser/billing.test.ts`, `tests/browser/video-screen.test.ts` only for focused regression assertions if existing harness placement warrants it
- `docs/features/acquisition-analytics/*`, `docs/telemetry/p-replicator/20261026-n5-acquisition-analytics/*`, `docs/REPRODUCE.md` analytics configuration paragraph (coordinator integration ownership)

No other production file edits without coordinator scope review. Auth/server/DB/payment/worker files remain read-only. Shared manifests, compose and lockfile remain integration owner responsibility. No invented test harness if existing one suffices.

## Acceptance and checks

AC1: Valid runtime ID reaches built Docker-served browser through dynamic layout, with absent/malformed ID producing zero provider requests and no broken product. Exercise same built artifact with different runtime public IDs; no secret/environment object enters HTML.

AC2: Consent unknown/denied produces zero provider requests and no analytics local storage. Opt-in works; opt-out stops future calls and clears local state. Actual SDK requests contain no sentinel email, filename, title, transcript, prompt, guest/referral token, raw query/hash, dynamic video/intent ID or sensitive referrer. Manual sanitized hits work for SPA transitions. SDK scripts/requests on excluded routes remain absent. If SDK leaks despite sanitized explicit payload, fail AC and resolve before production enablement; do not bypass the guard or claim compliant delivery.

AC3: Signup goal fires once only after real register+authenticated continuation, including referral discard. Existing-email dummy cookie, login, failed request, retry and double submit do not create false signup goals. Explicitly test fake register-200 with protected-request-401.

AC4: Ready goal fires once on initial available done clip or later server polling transition; not on failed/expired/queued/unavailable clips or clicks. Repeated poll, hydration, StrictMode and refresh dedupe are verified with the documented browser scope.

AC5: Payment goal fires once per locally observed confirmed intent. Fake checkout backend must cover pending→succeeded, repeated success, canceled, timeout, unauthorized, not found, mismatched intent, malformed status and plan=paid while pending. No provider account/purchase. Existing payment guards/mutations remain green because money logic is unchanged.

AC6: Adblock/script timeout/network failure/storage exception cannot break register redirect, polling, ready cards or anchor download. Unavailable SDK leaves no unbounded queue or product spinner. Unknown UTM values and malicious payload fields never enter requests.

AC7: Required repository checks on exact candidate snapshot: `npm test` full suites with mandatory reporters and real PostgreSQL/Redis/MinIO test environment; `npm run typecheck`; `npm run lint`; `npm run build`; added guards exercised red with a targeted mutation then green after restoration. Existing relevant concurrency/payment suites run through full suite; do not add a new DB shared resource solely for analytics. Run `scripts/check-env-wiring.sh`, root `scripts/check-port-conflicts.sh`, Docker browser tests against actual built app, responsive check because consent UI is added. Existing required CJM check is preserved; where full CJM would require prohibited paid API/user content, record blocked/not-run and use an explicitly isolated authorized fake fixture environment instead. Exit 2/unavailable prerequisites are not passes. E2E needs immediate read-only companion preflight and source/build/environment receipt. No unauthorized stack start, deployment or live content upload.

AC8: Separate delivery evidence levels. Mock window.ym proves code invocation only. Intercepted/fulfilled requests prove serialization/browser routing only. With real owner-supplied counter and separate authorization, record nonintercepted request URL host/counter/event and HTTP response/SDK callback for all four goals using synthetic inputs. HTTP success proves provider transport response, not ingestion into owner reports. Goal settings/debugger/report visibility is a separate authenticated dashboard check with time/counter/event evidence. Preserve sentinels and redacted HAR/screenshots; never claim real receipt from mocks, copied console text or tag.js loading alone. No counter ID or access means live receipt/report AC remains blocked; do not invent ID, create an account or launch traffic.

AC9: Before traffic, coordinator has: researched analogue acquisition evidence; one chosen channel/tariff/feature/segment; one-line economics with denominators and unknowns; fixed UTM tuple; frozen runtime-vs-target tariff/payment-mode reconciliation; working four-step funnel demonstration and accurately labelled live-provider evidence. Analytics code readiness alone does not pass this gate.

## Bounded handoff

Coder attempt: maximum 20 minutes to the allowlisted minimal implementation plus targeted tests; stop adding scope at first concrete blocker, preserve diff and identify failing AC. Follow with one independent review using this planner packet and frozen candidate revision, without coder chat. Fix only concrete findings; mandatory checks stay intact. Coordinator owns continuation if attempt budget expires and must not confuse a stopped process with active work. Counter absence does not block coding/tests; it blocks live-provider proof. Deployment, spend and real purchase remain excluded.

Planner inspection used narrow escalated read-only exec because ordinary sandbox failed before execution with bwrap `.codex` mount Permission denied. E2E preflight for this planning-only step: not_applicable (no code, runtime or browser execution). No source or runtime mutated. Planning usage/cost: null (not exposed). Mechanical ROUTE actually executed, not inferred.

## Primary provider documentation checked

- Initialization/defer/collection flags: https://yandex.com/support/metrica/en/code/counter-initialize.html
- Explicit SPA hit URL/referrer and reachGoal: https://yandex.com/support/metrica/en/code/counter-spa-setup
- Goal names/parameters/callback contract: https://www.yandex.com/support/metrica/en/objects/reachgoal.html
- Debugger versus conversion report: https://www.yandex.com/support/metrica/en/general/check-goal

Provider docs support manual hits and callback semantics; privacy and delivery claims still require actual request inspection. No additional integration or guarantees are inferred from SDK availability.
