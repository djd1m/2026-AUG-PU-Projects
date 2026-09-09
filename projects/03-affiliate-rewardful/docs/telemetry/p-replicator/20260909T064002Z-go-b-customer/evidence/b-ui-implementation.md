# N3 variant B UI implementation receipt

- Run ID: `20260909T064103Z-b-customer-ui-b1`
- Started: `2026-09-09T06:41:03Z`
- Ended: `2026-09-09T06:48:42Z`
- Status: `completed`; integration/browser acceptance remains with root coordinator
- Baseline: `feeece20591a96262521afb2623e475db06f15b2`
- Project: `projects/03-affiliate-rewardful`
- Feature: `variants/b-customer/app`
- Pipeline: compact feature implementation, no delegation
- Tier: `XL` (credit reservation and billing outcomes are money-sensitive; owner-approved F1 scope and existing SPARC plan)
- Profile: `compact-quality-first-v2`
- Requested model: inherited parent execution model; no model override requested
- Actual model/effort: unavailable; host metadata is not exposed to this worker
- Usage: unavailable; host does not expose attempt-exclusive counters
- Specification SHA-256: `1685b59ca5fd0eda908165ff21256698ac1abb4ce87228466cb502fad68c6a13`
- Policy SHA-256: `cc958dec9cd12d0a83b0662fdb57d5a3f0874535f36bdf1d1e7b424f4660e1d9`
- Acceptance: standalone and embedded consent journey, server-derived credit state, explicit operator lab, strict postMessage contract, loading/error/empty/denied states, refresh persistence, source/build/syntax checks
- Constraints: only `variants/b-customer/app/**`; no servers, containers, WebDriver, shared files, other variants, or backend changes

## Timeline

- `2026-09-09T06:41:03Z` — ROUTE/IMPLEMENT attempt started; source and contract inspection in progress.
- `2026-09-09T06:46:00Z` — implementation complete; focused source and protocol validation started.
- `2026-09-09T06:48:42Z` — build/syntax/protocol/fixture checks passed; commit `060bf8d5c4ba690e148cf6b7405d9534d310ffff` created.

## Files, selectors, actions and checks

Committed files (all under the assigned ownership):

- `app/app.mjs` — `b19226961ad6ee15aead39957b758b5b675c6367a57fd9907067d5a82a47f939`
- `app/embed.mjs` — `e77270d91b0571bd27354e6fc46fbbc0d6265e6b46af6b0df7ecff94a86f9c00`
- `app/index.html` — `f9c95f938ba0cca8e405775be33733edf9608eee60def53d7d42a115a68cedf9`
- `app/styles.css` — `9aa50c09dff4203734e01e5c222708ae02f31bc36fedc215e9699cf8fd5b4b23`
- `app/views.mjs` — `a70e8b5cfc68993e18c1e4de85847c6ff0ca95e8eb5bc9f103cee79cb76b626f`

Stable selectors:

- boot/recovery: `app-loading`, `state-error`, `state-denied`, `retry`, `fresh-session`
- value moment/consent: `product-preview`, `widget-status`, `publish-widget`, `value-moment-waiting`, `invite-offer`, `decline-invite`, `restore-invite`, `enrollment-consent`, `enrollment-submit`, `enrollment-status`
- customer credit: `credit-balance`, `credit-ledger`, `credit-empty`, `invoice-card`, `invoice-original`, `invoice-reserved`, `invoice-remaining`, `reserve-credit`, `reservation-list`, `reservation-pending`, `reservation-unknown`, `reservation-success`, `reservation-failed`
- operator fixture lab: `operator-lab`, `lab-payment`, `lab-self-referral`, `billing-reservation`, `billing-unknown`, `billing-failed`, `billing-success`
- share/access: `share-kit`, `share-url`, `share-promo`, `share-text`, `share-disclosure`, `copy-share`, `copy-url`, `read-only-parity`

Server actions and contexts:

- Customer direct context: `program.read`, `credit.read`, `enrollment.join`, `share.read`, `credit.reserve`.
- Explicit fixture merchant context via `api.actor('merchant').id`: `fixture.event`, `credit.resolve`.
- The UI never calls `dashboard`, never loads merchant tariff, and derives no monetary totals; displayed amounts come from `credit.read`.
- `lab-payment` creates a verified confirmed promo-attributed credit event for a distinct friend at the server clock, producing hold under the current credit policy. `lab-self-referral` uses Maria as both customer and beneficiary and returns `no_reward` without changing available credit.

Embed contract:

- Accepts only `event.source === window.parent`, the selected exact allowlisted origin, and exactly `{type:'n3.value-moment',version:1,event:'widget_published'}` with no extra enumerable keys.
- Parent origin is selected from validated `parentOrigin` query input, falling back only to an allowlisted `document.referrer` origin.
- Sends only exact ready/dismissed messages to that fixed origin; no identity, token, or command crosses `postMessage`.

Validation:

- `npm run build` — passed; 42 modules, functional entries A and B.
- `node --check` for all three B JavaScript modules — passed.
- Focused embed source/origin/schema/ready/dismissed assertions — passed.
- Focused pure-domain fixture assertions for held distinct-friend credit and zero-reward self-referral — passed.
- `git diff --check` and trailing whitespace scan — passed before commit; worktree clean after commit.
- Browser, Docker and full integration tests were intentionally not run in this worker; root owns them and explicitly prohibited servers, containers and WebDriver here.

Metrics: elapsed wall `459000ms`; active wall and attempt-exclusive agent work are unavailable because no wait/usage instrumentation was exposed. Token counts and cost are `null`; no fallback or retry occurred. Economic savings are not established without a comparable measured baseline.
