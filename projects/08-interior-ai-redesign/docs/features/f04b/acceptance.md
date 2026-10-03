# F04 software acceptance

Accepted local software source: `8030270f023d83c9cdd597c4578517a1b58b4b35`.
Frozen UI build: `19ea9d39d31aab8b2a7ce005b79e091fadce203d1272c0c44bf1396aa228c00a`.

## Evidence

- Backend/gallery/share/publication source and real Postgres checks: F04a/F04b immutable runtime receipts. F04b initial 27/27 Docker checks include66 unit and PG suites9/21/7/17/7/6, source-bound mutations/startup. Later corrections changed targeted browser/session frontend and test fixtures; their specific regressions/builds are separately retained.
- Four original independent Astra findings closed in F04b-fix; payment readiness, upload observation and delete-handler ordering corrections each separately reviewed. Final actual logout-control product race corrected by Sol6.1high and accepted by fresh Astrahigh: [review](../../telemetry/n8-20261002-1740/n8-ui-logout-review-receipt.md).
- Actual existing shared Chromium via own isolated HTTPS app: [UI6 receipt](../../telemetry/n8-20261002-1740/n8-ui-e2e-6-receipt.md),42/42 checks at1440/390,321280ms,exit0. The [named matrix](../f04b-fix/ui-e2e-6/screenshots/results.json) covers consent/attribution, verified fixture credits, styles/jobs, comparison keyboard, gallery/history/expiry, two-account isolation, publication consent/revoke, branded download and explicit native-share outcomes, network/idempotency errors, account-switch/stale401/logout races, budget/credit/hold states. Separate actual disabled-provider server2/2 checks passed,2832ms.
- Fresh companion preflights were validated before both actual browser runs;92host/83container/176client hashes verified. Server secrets stayed in owned application container; sharedbrowser has no appmounts or serversecret environment.
- Owned network, containers, volume and privateenvironment removed after separate [restore check](../../telemetry/n8-20261002-1740/n8-f06-restore-1-receipt.md); sharedbrowser retained. All failed attempts1–5 remain immutable.

## Boundaries and next gate

This accepts F04 local software, including actual application browser behavior. Synthetic room outputs do not prove geometry or inference performance; injected WebShare promise outcomes do not prove OS/social posting. Fixture settlement is not real YooKassa test/live-provider acceptance. No deployment, charge, GPU rental, weights download or external publication occurred.

`/next f04-product-ui` completed the software roadmap entry. F05 remains blocked on actual CUDA, safe pinned weights/dependency compatibility and a licensed room corpus. F06 documentation/restore preparation proceeds independently, while full delivery retains its F05 dependency. No gate was waived and no all-MVP acceptance is claimed.
