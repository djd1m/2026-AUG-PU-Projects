# Independent requirements validation — N5 acquisition analytics
Spec revision: sha256:8ef3b9cf796a21492aee67ec622bfbcbbcff9627a7fdba42fb0e06ab658b975d

Date: 2026-10-26. Input: `analytics-plan.md`, `analytics-plan.json` and authoritative owner addendum `deployment-context.md`; source baseline `/tmp/n5-acquisition-analytics-20261026`, `4d5b0e26`, project `projects/05-podcast-clips-opus`. Independent read-only validation; no coder chat or implementation received. Applied root/project instructions, requirements-validator and project-work-companion (preparation/handoff only). E2E preflight: not_applicable, because no runtime or browser executed. Requested profile: model-routing-econom; requested validator model gpt-6.1-sol/high. Actual model/effort, usage and cost: null, not exposed as verifiable launch metadata to this validator. Coordinator must bind actual launch data. No new delegation.

Verdict: PASS WITH CAVEATS for bounded implementation of default-off browser analytics and AC1–7 validation. AC8 live-provider/dashboard acceptance is planned for future Cloud.ru deployment in the Russian Federation, externally unavailable here because no counter exists. It remains unpassed, but the owner explicitly excludes live activation from this local coding delivery. AC9 pretraffic readiness remains coordinator-owned and unproven. This report completes validation only, not the user's analytics/acquisition task. No account creation, paid traffic, purchase, deployment, auth/billing/DB mutation or tariff implementation is authorized by this verdict.

## Findings and required bounded clarifications

1. **Pilot input caveat resolved by authoritative addendum.** Exact tuple: telegram / community / n5_pilot / demo_a (source/medium/campaign/content); reject term, mixed/unknown values, duplicate or overlong inputs and malformed storage. The fixed 1-1-1-1 is Telegram author community → target Старт 990₽/300 credits → vertical conversation clips with Russian subtitles → independent Russian-speaking weekly video-podcast author. Demand/CAC remain hypotheses. Implement this finite tuple without a new attribution engine; this is no authorization to implement the target tariff.
2. **Already-loaded SDK on withdrawal/navigation needs explicit tests.** AC2's zero-provider-request requirement must cover consent granted on landing followed by SPA navigation to excluded dynamic/guest/file routes, and withdrawal after SDK initialization. Testing only direct entry or suppressing explicit `reachGoal` calls is insufficient: removing a script element does not itself establish that loaded SDK activity stopped. Inspect actual SDK requests and browser-generated Referer headers as well as explicit payloads. A privacy failure blocks enablement; do not silently relax AC2. Default-off implementation can proceed while actual provider verification is unavailable.
3. **Finite dedupe caveat resolved by authoritative addendum.** Payment intent IDs stay local, at most 20 entries, TTL 30 days. Signup/activation have one browser/pilot marker each, TTL 30 days; visits use 30-minute inactivity. Storage-denied fallback is bounded memory for the current tab, with documented reload duplicates/undercount. Fail safely on corruption and do not claim exactly-once or account-level truth.
4. **Payment identity validation is feasible without backend changes.** `billing-handler.ts` GET response contains `data.intent_id`; current `CheckoutSnapshot` deliberately does not declare it. Validate raw response `intent_id === intentId` and literal `status === 'succeeded'` locally in allowlisted ReturnScreen before analytics emission. Do not infer success from plan, UI state, URL or cast-only TypeScript parsing. No need to expand the production allowlist to payment logic.
5. **Check authorization and exact receipts, rather than treating attempts as proof.** AC1's same-built-artifact/different-runtime-ID check and AC7 Docker/CJM checks require an isolated authorized fixture environment. A prohibition on live runtime mutation is compatible with such a separately bounded test environment; it does not permit starting an arbitrary existing stack. Missing prerequisites/exit 2 remain blocked, not green. Full checks, relevant concurrency/payment regressions, mutation evidence, responsive guard and independent review remain mandatory.
6. **Formal feature gate portability is not yet established.** This packet has AC1–AC9 prose labels, not canonical `### AC-<slug>-<n>` specification headings. This independent report binds the actual planner bytes above and maps all labels below. Before using repository byte-level `/feature` report gates, coordinator must materialize the canonical project specification and regenerate the digest-bound report; do not claim this temporary packet alone passed those executable gates.

## Requirement evidence and qualitative INVEST / SMART

The packet is a technical contract, not a set of formal user stories. The following are conditional story interpretations used to assess clarity, not additional approved scope. No numerical quality score or fabricated measurement is reported.

- US-A: As the pilot owner, observe a consented visit → authenticated signup → first available clip observed → confirmed payment observed funnel so pilot conversion can be assessed (AC1–6).
- US-B: As a visitor, choose analytics consent and continue using the product when analytics fails, without transmitting content or account identifiers (AC2, AC6).
- US-C: As the delivery owner, distinguish code readiness, transport response and dashboard visibility using source-bound evidence (AC7–8).
- US-D: As the acquisition owner, choose one pilot and understand its economics before traffic (AC9; coordinator-owned).

| INVEST criterion (all six) | Assessment and evidence |
|---|---|
| Independent | US-A/B implementation is independent of counter creation; US-C live evidence and US-D traffic readiness have explicitly named external/coordinator dependencies. Do not bundle them into an unconditional completion promise. |
| Negotiable | Mechanism is bounded to optional browser Metrika; constants/UI and finite dedupe structure remain implementation choices. Privacy, business truth and mandatory checks are nonnegotiable constraints. |
| Valuable | Four funnel steps support acquisition decisions; consent and default-off preserve visitor choice and product operation. Browser observations are honestly distinguished from ledger revenue. |
| Estimable | Eight production surfaces and focused tests are named; 20-minute attempt is a checkpoint, not a promise of all mandatory tests. Actual SDK privacy and fixture readiness retain uncertainty. |
| Small | One adapter, one host and three observation hooks; no backend/outbox/new engine. Research/economics and live onboarding stay separate bounded coordinator work. |
| Testable | Explicit AC exist with positive and negative cases. For example AC3: “Explicitly test fake register-200 with protected-request-401”; AC4: “Ready goal fires once on initial available done clip or later server polling transition”; AC8: “HTTP success proves provider transport response, not ingestion into owner reports.” All nine labels map below. |

| SMART criterion (all five) | Assessment and evidence |
|---|---|
| Specific | Event truth, off behavior, consent and allowlist are concrete. Literal pilot tuple and finite payment marker limits are now supplied by the owner addendum. |
| Measurable | Zero forbidden provider requests, once-per-defined-browser-scope goals, exact status/identity checks and check exit codes permit observable pass/fail. Mock invocation is explicitly not real receipt. |
| Achievable | Source exposes required authenticated observation points and dynamic layout supports runtime public ID. Live receipt cannot currently be achieved because the counter does not exist; privacy must be verified, not assumed. |
| Relevant | Every AC supports truthful pilot measurement, privacy, failure isolation or evidence quality; changing tariffs or payment mode is correctly excluded. |
| Time-bound | Event timing is after authenticated continuation/server observation; inactivity is 30 minutes and attribution maximum is 30 days. Separate attempt budget is 20 minutes. No unsupported delivery ETA or report-latency promise is made. Marker expiry is fixed in the addendum; SDK timeout must be concrete in implementation. |

Completeness evidence: AC3 names fake register-200/protected-401; AC4 names initial/polled success, expired/failed/queued negatives and refresh/StrictMode edges; AC5 names pending/succeeded/canceled/timeout/unauthorized/not-found/mismatched/malformed states. Thus happy, error and edge AC are present. Traceability is provided by the following table; the blocking floor for absent AC/scenarios does not apply to this qualitative packet validation. No executable feature-report gate was run.

## Criterion scenarios

| Criterion | Scenario |
|---|---|
| AC1 | Runtime counter changes without rebuild; invalid counter is silent |
| AC2 | Consent and sensitive-route transition suppress provider collection |
| AC3 | Protected registration continuation proves signup; dummy cookie fails |
| AC4 | First available clip observation dedupes initial render and polls |
| AC5 | Only matching authenticated confirmed intent counts payment |
| AC6 | Analytics and storage failure preserve product actions |
| AC7 | Exact candidate passes required checks with negative guard evidence |
| AC8 | Real counter transport and dashboard evidence remain distinct |
| AC9 | Single frozen pilot and reconciled economics precede traffic |

## Named BDD scenarios

```gherkin
Feature: Optional truthful acquisition observations
  Scenario: Runtime counter changes without rebuild; invalid counter is silent
    Given the same immutable built web artifact in an authorized isolated fixture
    When it starts with each of two valid runtime counter IDs and then malformed or absent ID
    Then the browser uses only the selected public numeric ID
    And malformed or absent ID creates zero provider requests and preserves product operation

  Scenario: Consent and sensitive-route transition suppress provider collection
    Given an unknown or denied analytics choice
    Then no provider request or attribution storage occurs
    When the visitor opts in on landing and later enters an excluded route or withdraws consent
    Then actual loaded-SDK requests satisfy the no-collection requirement
    And withdrawal clears app attribution and dedupe state
    And sentinels in content, URL, hash, title and referrer do not leave the browser

  Scenario: Protected registration continuation proves signup; dummy cookie fails
    Given a registration attempt whose response is 200
    When authenticated code.apply succeeds normally or by explicit referral discard
    Then one signup observation is attempted before redirect
    But when that protected request returns 401, or the form is login or failed
    Then no signup observation occurs

  Scenario: First available clip observation dedupes initial render and polls
    Given authenticated initial or polled clips
    When at least one clip is done and available
    Then one first-available observation occurs within the documented browser scope
    And repeated polls, StrictMode, remount and refresh do not duplicate it in that scope
    But queued, failed, expired, unavailable and button clicks do not qualify

  Scenario: Only matching authenticated confirmed intent counts payment
    Given an authenticated status request for intent A
    When response data has intent_id A and literal status succeeded
    Then one local-per-intent payment observation occurs, including paid_inactive display cases
    But mismatched B, pending, canceled, missing, malformed, timeout and unauthorized responses do not qualify
    And plan paid alone never qualifies and intent identifiers are never transmitted

  Scenario: Analytics and storage failure preserve product actions
    Given blocked SDK, throwing storage, network timeout or corrupt bounded state
    When the visitor registers, navigates, polls clips or starts an anchor download
    Then normal product behavior continues without analytics spinner or unbounded queue
    And unapproved UTM tuples or malicious fields do not enter outbound payloads

  Scenario: Exact candidate passes required checks with negative guard evidence
    Given a frozen source/build identity and authorized fixture environment
    When full repository checks, relevant existing suites, Docker browser and responsive checks run
    Then fresh receipts bind commands, exits and evidence to that identity
    And introduced analytics guards fail under targeted mutation and pass after restoration
    And unavailable prerequisites or exit 2 never count as pass

  Scenario: Real counter transport and dashboard evidence remain distinct
    Given the owner has supplied a real counter and authorized synthetic verification
    When all four goals produce nonintercepted requests and provider responses
    Then record redacted counter/event/time/host transport evidence
    And separately establish authenticated debugger or report visibility
    But absent counter/access, mock ym, fulfilled interception or tag loading cannot satisfy live acceptance

  Scenario: Single frozen pilot and reconciled economics precede traffic
    Given analogue evidence and one chosen channel, tariff, feature and segment
    When coordinator freezes the closed pilot tuple and one-line economics with denominators and unknowns
    Then ledger reconciliation and runtime-versus-target tariff reconciliation are explicit gates
    And traffic does not start on analytics code readiness alone
```

## Security BDD and boundary assessment

Input validation and sensitive-data restrictions are explicit. Existing authentication/ownership controls remain authoritative; counter ID is public configuration, never the environment object. No new webhook or public endpoint is added. Existing payment webhook verification must remain unchanged. Cross-account attempts are relevant as regressions of observation truth, not new authorization logic. Rate limiting is applicable only to existing auth endpoint regression; no analytics brute-force mechanism is introduced.

```gherkin
Feature: Acquisition observation security boundaries
  Scenario: Auth bypass cannot manufacture signup or payment
    Given dummy, expired or missing authenticated cookies
    When a protected continuation or checkout status request fails
    Then no success goal occurs and existing anti-enumeration behavior remains unchanged

  Scenario: Injection cannot execute or enter provider fields
    Given executable counter text and SQL, script, command or token sentinels in URL and UTM inputs
    When configuration and attribution are parsed
    Then invalid config disables analytics and unknown fields are discarded
    And no payload or browser-generated referrer leaks the sentinels

  Scenario: Cross-account intent and clip access cannot qualify
    Given account A requests account B resources through existing APIs
    When existing ownership checks return the same 404 as a missing resource
    Then analytics emits no payment or clip-ready success from that request
    And no ownership check or database query is altered

  Scenario: Auth rate limiting is preserved
    Given the existing authorized isolated auth test fixture
    When its established rate-limit regression sends excess attempts
    Then existing limiter responses and operation order remain unchanged
    And rejected attempts produce no signup goal
```

Growth traceability: the inspected baseline exposes `docs/Specification.md` but no `docs/product-discovery-brief.md` was found by the bounded path search. Per skill, absent brief is not a negative score. Acquisition obligations remain explicit in AC9; this does not establish that research/economics artifacts are complete.

## Source corroboration and delivery limits

Directly inspected `AuthForm.tsx` normal and discard continuations; `ReturnScreen.tsx` existing authenticated fetch and its cast-only snapshot; `payment-return.ts` status-versus-plan display logic; `billing-handler.ts` matching response intent_id; `VideoDetail.tsx` initialClips and polled clip.list; dynamic `layout.tsx`; narrow auth-store/trpc source references. These support the plan's observation seams. No source or business state was modified; no product test or provider receipt is claimed.

Mechanical routing evidence is accepted as documented planning evidence, not independently rerun here. Existing full-file YOOKASSA matches do not prove a new money change. Retain substantive L full PLAN/VALIDATE/IMPLEMENT/REVIEW and rerun actual-diff routing before implementation. Genuine new money/auth mutations require scope escalation. The six-path M result does not remove the optional environment/compose surfaces from substantive review.

Owner addendum is authoritative for implementation: code is prepared here, default off; runtime enablement, counter creation and genuine goal receipt are planned for future Cloud.ru in РФ. Current VPS is not the activation target. This does not establish exercise 3.4 as actually completed. Local intercepted provider checks prove routing only.

Coordinator next action: use frozen pilot literals and finite bounds from deployment-context.md; hand the isolated coder this packet/report with the bounded allowlist and the withdrawal/SPA/identity tests above. Preserve full check/review gates. Keep AC8 planned for Cloud.ru and unpassed, and AC9 pending; do not announce complete analytics delivery, start traffic, create accounts or implement target tariffs from this validation.

Status: completed
