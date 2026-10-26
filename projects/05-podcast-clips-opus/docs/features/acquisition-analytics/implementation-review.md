# Independent implementation review — N5 acquisition analytics
Reviewer family: codex
Spec revision: sha256:8ef3b9cf796a21492aee67ec622bfbcbbcff9627a7fdba42fb0e06ab658b975d

Candidate: `d489a80ccd725363116184b6a18b97f89958b85b`; base `c6cc0096`; isolated source `/tmp/n5-acquisition-analytics-code-20261026/projects/05-podcast-clips-opus`. Inputs: approved analytics-plan.md/json, validation-report.md, authoritative deployment-context.md and the frozen eight-file source/tests diff. Coder receipt, coder logs and coder chat were not read. No implementation edits or delegation performed. Applied project reviewer checklist and direct, evidence-based review guidance; no minimum finding quota was imposed. Actual model/effort, usage and cost: null, unavailable as verifiable execution metadata to this reviewer. The caller owns metadata binding.

Verdict: REQUEST CHANGES for two demonstrated funnel/dedupe defects. No backend/auth/payment/DB mutation was found. The source implements the required business observation seams, optional runtime public ID and default-off consent path. Full checks, built-browser behavior and actual SDK network privacy are not certified by this source review. Counter activation, real transport and authenticated dashboard receipt remain planned for future Cloud.ru in РФ; this report does not establish exercise 3.4 completion.

## Findings

### R1 — high: excluded-route navigation erases the 30-day dedupe and first-touch campaign

File: `apps/web/src/lib/acquisition-analytics.ts:90` (calls `stop(!allowed || !nextRoute)`); deletion at lines 40 and 86. Relevant tests: `tests/acquisition-analytics.test.ts`, scenario “destroys loaded SDK and clears state when consent is withdrawn or SPA route excluded”, currently asserts deletion for both cases and therefore encodes this conflict.

Given consent is still yes, observe first-ready and a confirmed payment, navigate to `/g/excluded`, then return to the same authenticated video/payment. `!nextRoute` calls `stop(true)` and removes the entire persistent browser-pilot state, including ready/signup/payment markers and captured first touch. Returning creates new state and emits the same ready/payment goals again, inside the nominal 30-day scope. If return has no UTM, the approved first-touch attribution is lost too. This violates AC4/AC5 and the fixed 30-day markers in the addendum.

Read-only deterministic probe against the exact candidate produced:

```text
configure(123,true,'/dashboard/videos/A')
goal('n5_first_clip_ready')
goal('n5_payment_confirmed','A')
configure(123,true,'/g/excluded')
configure(123,true,'/dashboard/videos/A')
goal('n5_first_clip_ready')
goal('n5_payment_confirmed','A')
=> n5_first_clip_ready, n5_payment_confirmed,
   n5_first_clip_ready, n5_payment_confirmed
```

Fix: on route exclusion destruct the SDK, discard pending calls and transient loaded state, while preserving bounded consented dedupe/first-touch records; only withdrawal deletes those records. Add a regression returning from an excluded route and verifying the same ready/signup/payment cannot re-emit and original campaign remains. The addendum's phrase “очищать очередь и состояние” needs to mean transient SDK state here, or the coordinator must explicitly reconcile it with its own 30-day dedupe requirement. Do not resolve that ambiguity by silently claiming both guarantees.

### R2 — medium: visit session measures time since last landing configuration, not inactivity

File: `apps/web/src/lib/acquisition-analytics.ts:69` and `:106`.

The only activity timestamp update occurs inside `goal('n5_visit')`, and configure invokes that goal only on the landing route. Allowed dashboard/video/upgrade activity does not refresh it. A user who opens landing at t=0, navigates dashboard at t=20 minutes, and returns landing at t=31 minutes is assigned two visits, despite only 11 minutes since the last observed allowed-route activity. This contradicts the promised 30-minute inactivity session and inflates the funnel denominator.

Read-only deterministic probe against the exact candidate produced:

```text
configure(123,true,'/')             // t=0
configure(123,true,'/dashboard')    // t=20min
configure(123,true,'/')             // t=31min
=> n5_visit, n5_visit
```

Fix: maintain bounded last-observed activity/session state across allowed page hits and qualifying goals, with the visit goal emitted once for a landing-associated session. A single last-activity timestamp plus a small session marker suffices; do not add a general activity engine. Test landing→dashboard→landing below the inactivity threshold and a genuinely inactive return above it. Document browser-observed activity semantics instead of claiming continuous physical-user activity detection.

## Source findings that passed inspection

- `counterId` rejects absent, empty, malformed, unsafe and executable strings. Dynamic server layout passes only the parsed public numeric counter, not the environment object. `readEnvironment` change is one additive optional key. Docker forwarding remains integration-owner work outside this eight-file candidate; source inspection alone does not prove runtime delivery through the built container.
- Analytics host defaults to unknown/off; only exact persisted yes/no is accepted. Consent control is separate from guest publication consent. Unknown/denied configuration never invokes loader; storage failures are caught. Withdrawal calls `withdraw`, destructs a loaded SDK and clears app attribution/dedupe; loader cleanup cancels timer, removes script and ignores late callbacks. `configure` destroys on excluded routes. This establishes invocation intent, not actual SDK cessation on a live page.
- Signup observation is after awaited authenticated `code.apply`, with a ref identifying the registration attempt, including explicit discard continuation. Register-200 plus failed protected request cannot reach the observation. Login does not set pendingRegistration true. Existing auth handler/anti-enumeration logic is unmodified.
- Clip observation uses literal done AND available on authenticated initial/polled clips. Existing SSR page obtains data for authenticated account. A ready event listener allows initial clip observation after consent configuration. Browser-local dedupe works on ordinary reload/reconfigure; R1 breaks it across excluded navigation.
- Payment observation validates the raw response object, exact expected intent_id and literal succeeded status before passing its local-only intent marker. It is independent of the display's account_plan/paid_inactive distinction. Pending, canceled, mismatched/malformed and unsuccessful HTTP paths do not qualify. Existing billing provider, ledger, ownership and webhook code are unmodified.
- Payload schema is closed to fixed event/pilot/schema fields, static route and optional approved UTM tuple; local payment IDs are not passed into SDK payload. Explicit hit URL/referrer/title are static. Exact approved tuple is implemented, including rejection of utm_term and duplicate UTM fields. Source sends no account/media/content identifier directly. Actual SDK behavior or browser-generated Referer leakage remains unverified.
- Attribution storage is one fixed key, state input has length/type checks, payment IDs are locally bounded to 20 with 30-day retention, pending adapter queue is bounded to 20, and failure paths generally isolate product behavior. No new package/manifest/service or business-state write was introduced.

## Spec conformance

Verdicts apply to this source-review evidence, not to the caller's independent checks. “unverifiable” is intentional where runtime or broader evidence is required.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC1 | unverifiable | counter parser, dynamic layout public prop and optional environment key inspected; same-built-artifact runtime-ID/container forwarding checks are caller-owned and not run here. |
| AC2 | unverifiable | host off-by-default, consent persistence, destruct/cleanup and closed explicit payload inspected; actual SDK network, loaded withdrawal, excluded SPA transition and sentinels require built-browser receipts. |
| AC3 | unverifiable | AuthForm source places goal after protected continuation and separates registration; helper unit tests do not execute real/dummy form behavior. Caller-owned browser truth test required. |
| AC4 | not met | R1 deterministic excluded-route roundtrip duplicates first-ready within the required 30-day browser scope. |
| AC5 | not met | Identity/status guard inspected, but R1 duplicates the same observed payment intent after excluded navigation. |
| AC6 | unverifiable | bounded queue, safe wrapper, storage catches and loader timeout inspected; no built-product redirect/poll/download failure-injection test executed by reviewer. |
| AC7 | unverifiable | reviewer did not run full suites, build, lint/typecheck, mutations, Docker E2E, responsive or CJM checks; caller performs these independently. |
| AC8 | unverifiable | owner has no live counter; future Cloud.ru activation/transport/dashboard checks remain planned and unpassed. |
| AC9 | unverifiable | addendum freezes pilot tuple/1-1-1-1; research, economics, ledger/runtime reconciliation and pretraffic delivery evidence were not supplied to this implementation review. |

R2 additionally violates the events contract for n5_visit even though AC1–AC9 do not separately name session-inactivity implementation as its own AC.

## Checks actually performed

1. Read `git show --stat` and complete `git diff c6cc0096 d489a80... -- apps/web/src tests` at the isolated project root; eight changed paths match the frozen candidate.
2. Inspected actual authenticated video route/SSR loading and existing checkout response identity fields, plus project reviewer instructions.
3. Ran two deterministic adapter probes by reading the committed TypeScript file and transpiling it in memory with installed TypeScript, using bounded Map storage, synthetic SDK and controlled clock. No test/source file or business state was written. Both produced the concrete outputs above. They demonstrate adapter state behavior only, not provider transport or product E2E.

Ordinary sandbox setup failed previously with bwrap mount Permission denied; this review used narrow authorized escalated read-only commands. No network, stack start, account creation, purchase, paid model/provider call or deployment occurred. Only this report artifact was written.

## Bounded correction handoff

Integration owner should fix R1 and R2 with focused regressions, preserve default-off runtime behavior and mandatory checks, and bind final evidence to the corrected candidate. No optional polish or new architecture is requested. Actual SDK privacy verification remains a required enablement gate; an intercepted/mock wrapper cannot establish it. Live counter receipt remains a future Cloud.ru task, not local coding proof. Report is terminal for this independent review pass; validation of concrete corrections and exact final checks remains coordinator-owned.

Status: completed
