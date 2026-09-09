# Final bounded source review

RUN_ID: 20260909T085312Z-f2-auth-payments-agents
Commit reviewed: dd35d9c6d29453fd82fa5e8245f79fb52e03c8bb
Project: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful
Spec: docs/features/f2-commercial/01_specification.md
Spec SHA256: 6d666a880f34fb399f0bf89e1476c37e69c3d75cd4051211457b26cc08669161
The specification contains exactly10AC identifiers.

## Result

Four prior payment blockers resolved in reviewed source: dependency-free payments/schema removes cycle; previous-order and response binding enforce saved shop/test mode; payment transactions call identity.fresh; real refunds bypass fixture event quota. Application import executed successfully. Focused real HTTP MCP/A2A and real-clock suites passed8/8 (610.027058ms). Initial sandboxed combined test invocation failed to run transport suite; authorized loopback rerun passed. Coordinator reports full78tests passed; this reviewer did not independently rerun PostgreSQL suite.

Two UI findings require correction before acceptance:

1. **Issued invitation survives logout/account switch, and stale asynchronous completions can repopulate prior authority.** `shared/ui/account/app.mjs:39-48` signedOut clears issuedAgent but does not clear invitation-output.value; invite handler writes the reusable until-consumed bearer invitation at approximately389-393, and subsequent render/login does not clear it. UserA creates an invitation, logs out, then userB logs in on the same page: A's active invitation is visible in B's workspace, allowing B to join A's organization. Explicit logout should clear issued invitation output and other sensitive account-scoped DOM; membership/account changes should do so too. Preserve intended invitation-from-fragment through initial authentication separately from issued invitation output. Also action()/refresh/mint/invite have no context generation or cancellation guard; an operation started before logout/switch can complete afterward and overwrite issuedAgent/invitation/screen with old-account data. Guard asynchronous publication by captured account/context generation or abort pending operations on transitions. Add same-page A→logout→B secret-clearing and delayed mint/invite response tests. Source-path finding; no browser reproduction executed by this reviewer.

2. **Configured provider is described as connected without provider verification.** `shared/ui/account/app.mjs:268` says the test/live shop is connected, while `shared/payments/service.mjs:30-31` sets configured from enabled+tenant match only. Invalid/unreachable credentials yield the same connected label. Use wording distinguishing configured credentials from successful provider verification. No false LLM claim or CSV-as-bank-transfer claim was found.

## AC mapping

| AC-f2-commercial | Reviewed source / evidence | Assessment |
| --- | --- | --- |
| 11 | identity/password, service register/login/me; account cookie handler; identity.test, account-http.test | Hash-only session persistence and response privacy implemented; UI invitation retention finding affects overall account privacy. |
| 12 | identity membership/invite acceptance; application resolver/access; identity.test | Real/fixture and role/tenant ownership checks present. |
| 13 | identity version/share locks/fresh; HTTP Origin/body/rate boundary; identity.test/account-http.test | Prior expiry/rate blockers fixed; UI stale-response/logout retention needs fix. |
| 21 | payments/service durable order and external create; payment-integration.test | Saved input/policy/provider identity,23h fail-closed retry and unconfigured behavior present; configured UI wording needs fix. |
| 22 | service webhook order binding + adapter normalized contract; yookassa-adapter/payment-integration tests | Verify-before-dedup and saved shop/test/amount checks present. |
| 23 | domain/events and journal; payment-integration/real-clock tests | Refund-before-payment, duplicate serialization and fixture-cap fix present; focused quota test passed. |
| 31 | agents MCP SDK/A2A and public card; agent-transport/account-http tests | Official MCP client and A2A JSON-RPC contract verified; HTTPS/browser integration remains coordinator-owned. |
| 32 | identity agent resolution, application grant checks; transport tests | Revoke/expiry/scope/cached-read guards present; focused tests passed. |
| 33 | agent transport task.create/run/read/cancel + account task renderer | Shared persistent application task identity and replay semantics present; focused tests passed. |
| 41 | Coordinator full suite and ongoing A-D/account browser work | Pending coordinator browser/source-bound release evidence; this review does not claim provider sandbox acceptance. |

## Additional source SHA256

```
72db0e157041fa3e5fc0fc45e61c967b8abe2742e7c6a82ad1297882f40a6e59 shared/ui/account/app.mjs
b645220b0be6d015df415b2824f18ff7dfc6b58ad40754c0166af8e6d31e4ed3 shared/ui/account/helpers.mjs
08b4b62110cc044320f692d7b0de9f3dc2e0780186f094611754482afa53b7fa apps/api/account.mjs
8d129b72eba13b4afafb4dd7cc6b7f872ceb2437d467e2b39ec11cdde1f30afc shared/payments/service.mjs
9f95ad3ea45b95a8a48de2fcaa504f8932ee920bdd2a6f080f7a8856e6f31997 shared/payments/schema.mjs
970ec2df8bcce4472b496bccf9d4d3a700f82cc4d0aa3abd0f21a54d5c23f0b4 shared/domain/events.mjs
```

No root writes/database mutations by reviewer. Untracked tests/e2e/account.mjs was coordinator work and not modified. Actual model/effort/usage remain coordinator-owned metadata; no estimates/delegation/fallback.
