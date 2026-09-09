# N3 variant C partner UI — implementation receipt

- Work unit: `/root/c_ui`
- Scope: `projects/03-affiliate-rewardful/variants/c-partner/app/**` only
- Baseline: `2f9cd978bdf1bbc2c5f1bcd963752e9d2942a30c`
- Source commit: `42e54cafcab24d908ac9e51d0914343904346e02`
- Requested model/effort: `gpt-5.6-sol` / `high`
- Actual model/effort: `null` / `null` — this worker host supplied no execution metadata proving model or effort
- Usage: `null` — no request-scoped input, cached-input, output, reasoning, credit, or USD counters were exposed
- Measured wall: `459000 ms` from filesystem birth time of the first owned source file (`2026-09-09T07:07:39Z`) to the final source-bound receipt sample (`2026-09-09T07:15:18Z`). Read-only instruction review before the first mutation is not included because this worker had no start timestamp.

## Delivered behavior

- Responsive blue/white Rubik partner dashboard at 390/1440 layouts.
- Published terms precede enrollment consent and show cash kind, exact bps formatting, attribution window, hold, policy version, publication date, recurring behavior, and payout schedule.
- Explicit consent calls `enrollment.join`; successful enrollment reads the personal share kit from `share.read` and never auto-sends it.
- Own partner summary and history come from `partner.read`: available/held/adjustment/sent amounts, payment snapshots, immutable ledger reasons, exact historical policy version, due-date orientation, exceptions, and own transfer facts.
- Transfer copy says only that the fixture owner marked a transfer sent; it explicitly leaves bank credit unconfirmed.
- Read-only grant parity copy describes the permitted F1 core actions and states that wire MCP/A2A is not connected.
- Loading, empty, inline error, denied, retry, refresh, and fatal/new-session states are visible and keyboard reachable.
- Ordinary boot/history use only the partner context and work without a merchant actor. Fixture operator controls are absent in a partner-only session.
- Full fixture sessions expose operator actions only after explicit `open-operator-lab`. The separate merchant context can publish a future cash policy, prepare/approve an exact registry artifact, and mark only the current partner row sent using the returned artifact ID, revision, hash, and client idempotency behavior.

## Stable selectors

- State: `state-loading`, `state-error`, `state-denied`, `retry`, `fresh-session`
- Navigation: `nav-overview`, `nav-terms`, `nav-history`, `nav-share`
- Terms/enrollment: `program-terms`, `term-kind`, `term-rate`, `term-window`, `term-hold`, `term-version`, `term-effective`, `term-schedule`, `enrollment-form`, `enrollment-consent`, `enrollment-submit`, `enrollment-status`
- Summary/history: `partner-summary`, `summary-available`, `summary-held`, `summary-adjustment`, `summary-sent`, `refresh-partner`, `commission-history`, `commission-policy-version`, `payout-status`, `payout-history`, `read-only-parity`
- Share: `share-empty`, `share-kit`, `share-url`, `share-promo`, `share-copy`, `share-copy-url`
- Explicit lab: `operator-lab`, `open-operator-lab`, `operator-lab-controls`, `lab-policy-form`, `lab-policy-rate`, `lab-policy-window`, `lab-policy-hold`, `lab-policy-recurring`, `lab-policy-save`, `lab-registry-prepare`, `lab-registry-approve`, `lab-registry-sent`, `lab-artifact`, `lab-status`

## Verification

- `npm run build`: passed; 47 modules checked, C included in available functional entries.
- `node --check variants/c-partner/app/app.mjs`: passed.
- `node --check variants/c-partner/app/views.mjs`: passed.
- `git diff --check -- variants/c-partner/app`: passed.
- `/tmp/n3-c-purecheck.mjs`: passed. It checks terms-before-consent ordering, required selectors, historical V1/20% cash labeling, payout empty wrapper, absence of operator UI for a limited session, explicit lab gate, safe render with missing lab data, and controls after a successful lab load.
- Independent review finding fixed before handoff: lab activation now occurs only after `refreshLab()` succeeds; missing lab program data has a safe retry gate instead of a dereference.

## Limitations

- No browser, server, Docker, WebDriver, or production-provider check was run in this worker scope, as assigned. Root integration owns real HTTP E2E and browser evidence.
- Build scope reports “available source only; not whole-product acceptance” because variant D is outside this work unit.
- F1 uses fixture data and simulated transfer facts. It does not implement bank transfer, bank-credit confirmation, provider integration, or wire MCP/A2A.
- The measured wall excludes instruction reading before the first file mutation; full attempt wall remains unavailable.

Status: completed
