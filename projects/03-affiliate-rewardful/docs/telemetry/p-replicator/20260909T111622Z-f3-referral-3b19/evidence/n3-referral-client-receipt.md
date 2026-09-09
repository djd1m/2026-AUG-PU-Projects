# F3 referral client/UI worker receipt

- RUN_ID: `20260909T111622Z-f3-referral-3b19`
- WORK_UNIT_ID: `referral-client-ui`
- PROJECT_ROOT: `/tmp/n3-referral-client/projects/03-affiliate-rewardful`
- Canon: `docs/features/f3-referral-funnel/02_pseudocode.md`
- Canon SHA-256: `53e90ae6f51d79d50c88cefbe68aece9323f3935d50d9cea484784be1dc0d4e9` (verified)
- Profile: `compact-quality-first-v2`
- Stage: COMPLETE
- Actual model: `gpt-5.6-sol`, effort `high` (coordinator-confirmed host turn metadata)
- Usage/cost/weekly quota: unavailable in worker execution metadata (`null`); no estimates substituted
- Fallback: none
- Subdelegation: none

## Immutable source boundary

- Input commit SHA: `d54a65b44db63a0147cb79c1516f3935ab2915f5`
- Output commit SHA: `5c630c67ca28e21a2dc0752e4bd8ae9cd6de5dcf`
- Output tree SHA: `95649c02a58947eacbb12bdb3decc9b6ed00d69b`
- Commit: `5c630c6 feat(referrals): add merchant tracker client and panel`
- Duration/active time: `null` (worker host supplied no attributable elapsed counter)

Owned output SHA-256:

- `shared/client/referral-tracker.mjs`: `df436a66f3c79e1a36ae70b8c980a9af1add23eef52f6a15c564deeda89aa1ee`
- `shared/integrations/merchant-client.mjs`: `88e9519e29f2809c01548b9f49e69e9161dcc6b7608a11abc86f2683538081f4`
- `shared/ui/account/referrals.mjs`: `07c6bb4c958ceafc24d4f061b0bb02f8520c8c1cdad10de59961a44fe03de5e9`
- `tests/referral-client.test.mjs`: `b209da18a48d816b6020af88ff84ff20c3717b733982bc62d6f473a178227325`
- `tests/referral-panel.test.mjs`: `cc39f05d91d455ca5be1f9cf9a67449b197544498c2aef29068beb2af5d0a5d3`
- `docs/integrations/referral-funnel.md`: `f7aa620ae72cd770fd80bace213251720e749e61a81cf2c820acd7d2c7ddc5a2`

## Delivered behavior

- Self-contained `captureReferral(config, browser=globalThis)` is safe to serve through `captureReferral.toString()` as a classic script. It accepts the core's canonical ISO `n3_ref_expires`, stores `token.expiryMilliseconds`, enforces configured HTTPS origin, retains the first live receipt, never slides expiry, strips both reserved query fields, performs no request, and reports blocked storage.
- Merchant backend client uses three fixed private routes, bearer only in the header, HTTPS production origin, literal loopback HTTP only in code-owned `isolated-test` mode, `redirect:'error'`, 8-second abort and 1 MiB streamed response bound. Exact request shapes exclude browser authority fields. Cookie parsing returns only a non-authoritative token.
- Account controller implements settings/key/revoke/status flows, one-time secret rendering, truthful owner/test/live/MRR state, partner personal metrics, and local generation guards that prevent late key/status publication after clear or membership change. Previous owner URL/instruction DOM is removed on partner switch.
- Guide supplies browser tracker and server integration examples for verified signup, authoritative invoice lookup, idempotent checkout, verified/refund-aware fulfillment, expired/promo/no-cookie paths, provider-not-configured handling and pilot limitations. No browser connector-key example is present.
- Frontend-design instructions were applied by reusing the existing account helpers/classes and restrained Russian account aesthetic; no dependency or account-shell redesign was introduced.

## Validation

- `node --test tests/referral-client.test.mjs tests/referral-panel.test.mjs` — PASS, 11/11 tests, 0 failed.
- `npm run build` — PASS, 87 modules checked and all four functional entries recognized.
- `git diff --cached --check` before commit and `git diff d54a65b..HEAD --check` after commit — PASS.
- Scope audit — exactly the six dispatched owned files committed; pre-existing untracked `node_modules` symlink remains untouched.
- Browser/VPS/database/provider/live acceptance — not run by this bounded worker; coordinator owns integration browser and external gates.

Status: completed
