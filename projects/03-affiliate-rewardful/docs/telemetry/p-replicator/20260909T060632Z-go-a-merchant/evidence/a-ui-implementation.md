# N3 variant A UI implementation receipt

- Project: `projects/03-affiliate-rewardful`
- Owned scope: `variants/a-merchant/app/**`
- Base revision: `82efe647160a8ea6f0ee626a71a078fda72cfe62`
- Commit: `5c9dcc66ff8779fc509d2d1ba50f0307745f9272`
- Worktree: `/tmp/n3-a-ui-work`
- Started at: `null` — the host/delegation message did not expose a machine timestamp and no start sample was captured before work; no estimate substituted
- Ended at: `2026-09-09T06:19:03Z`
- Elapsed/active duration: `null` — missing start sample
- Profile: `sol-baseline-v1`
- Requested model/effort: `gpt-5.6-sol` / `high`
- Actual model/effort: `null` / `null` — execution metadata was not exposed to this agent
- Usage/cost: `null` — no attempt-exclusive host usage counters or billing metadata were exposed
- Delegation/retries/fallback: none / none / none

## Delivered behavior

1. Dashboard renders server-projected accrued, available, held, sent and adjustment values, partner breakdown, event history and exceptions.
2. Fixture lab adds a payment, replays the exact same payment, then applies a partial refund to that same payment; refund is unavailable until payment exists. Replay leaves the negative correction intact. Demo time advances explicitly.
3. Policy editor accepts cash/credit, percentage, attribution window, hold and recurring. Percentage is converted exactly to integer basis points at the command boundary. Missing/out-of-range input stays visible with explicit errors; each successful save displays the returned policy/version, including credit policy.
4. Monthly registry prepares August 2026, renders exact rows/hash/revision and all server exclusions, approves, exports the exact server CSV, and separately records a manual transfer with partner, evidence and operator date.
5. Registry freshness compares its source version with the dashboard projection. Draft or approved stale artifacts expose an explicit recompute action that preserves the artifact id and creates the server revision.
6. Selected artifact id persists per demo run. A valid `session.handoffArtifactId` has priority and opens that exact persisted artifact; the UI shows its id/hash/revision rather than preparing another dataset.
7. Enrollment copy uses the server-returned `/join` URL. The `/join` route shows published terms/version/rate and says that opening the link does not enroll anyone; root owns the static-server fallback for this route.
8. Tariff view is visibly a branded F1 pricing hypothesis with no price claim, payment form, billing or money movement.

## Stable browser selectors and actions

Navigation:

- `[data-testid="nav-dashboard"]`, `nav-program`, `nav-registry`, `nav-invite`, `nav-tariff`

Policy (`SC-US-101-1/2`):

- `policy-form`, `policy-kind`, `policy-rate`, `policy-window`, `policy-hold`, `policy-recurring`, `policy-save`, `policy-errors`
- Clear `policy-rate` and submit to prove explicit validation; set `credit` or `cash`, submit, and assert visible returned version/rate.

Payment/refund/replay (`SC-US-102-1/2`):

- `dashboard-summary`, `payment-history`, `adjustment-total`
- `fixture-payment` → `fixture-refund` → capture `adjustment-total` → `fixture-replay` → assert captured correction remains and the payment count/ledger does not double.
- `advance-days`, `fixture-advance`, `exceptions`

Registry (`SC-US-103-1/2`):

- `registry-empty`, `registry-period`, `registry-prepare`, `registry-rows`, `registry-exclusions`
- `artifact-id`, `artifact-hash`, `registry-approve`, `registry-export`, `registry-refresh`
- After a source-changing refund: `registry-stale`, `registry-recompute`; assert artifact id unchanged, revision/hash changed.
- Manual transfer: `sent-form`, `sent-partner`, `sent-evidence`, `sent-date`, `registry-sent`, `transfer-facts`. `sent-date` max follows fixture clock (`2026-09-03` initially).

Invite/handoff/tariff (`SC-US-104-1/2`):

- `enrollment-link`, `copy-enrollment`; opening `/join` exposes `enrollment-preview` and `enrollment-back`.
- Handoff entry exposes `handoff-artifact`; compare `artifact-id` and `artifact-hash` with the upstream artifact.
- `tariff-interest` only reports local interest and explicitly does not start payment.

## Checks

- `node --check variants/a-merchant/app/app.mjs` — passed.
- `node --check variants/a-merchant/app/views.mjs` — passed.
- `npm run build` — passed; 33 modules checked, functional entry `a-merchant` found.
- `git diff --check` — passed.
- Source files are 201, 20, 20 and 106 lines; all remain below 500 lines.
- Worktree clean after commit; only the four owned files are in the commit.
- Docker and real browser E2E intentionally left to the root owner, who requested serialized use of its shared browser/container environment.

## Constraints and evidence gaps

- Browser imports only `/shared/client/api.mjs`, `/shared/ui/ui.mjs`, and same-variant `./views.mjs`.
- UI performs no payment, reward, registry or transfer amount calculation. It formats values returned by the server. The only arithmetic maps displayed policy basis points to/from a human percentage.
- No provider SDK, network integration, funds movement, MCP/A2A claim, lockfile, Docker file, shared module or other variant was changed.
- Live browser/Docker acceptance and exact 390/1440 screenshots are pending the integration owner's run against the cherry-picked commit.
- No numerical model-efficiency or cost claim is possible from the available metadata; savings are not established.
