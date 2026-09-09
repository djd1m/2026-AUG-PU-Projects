# Identity security review

RUN_ID: 20260909T085312Z-f2-auth-payments-agents
Workunit: identity-security-review (read-only)
Completed observation: 2026-09-09 09:07:56 UTC.
Root project: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful
No root writes or database changes. No moving payment/UI source reviewed.

## Blockers

1. **Session can expire during a lock wait and still mint fresh agent authority.** `shared/identity/service.mjs:141-149` resolves user/session once, then awaits tenant lock and further SQL before inserting credential and returning token. Session expiry from `session()` (`:28-32`) is not checked again. Controlled query-boundary clock reproduction advanced time by one second during the tenant-state query after a session with one millisecond remaining had resolved; actual createIdentity/mintAgent returned success and called INSERT agent_credentials after source expiry. Output: `{"sourceSessionExpired":true,"agentCredentialInserted":true,"mintSucceeded":true}`. This was a controlled SQL-interface substitute, not a real PostgreSQL race test. The same missing final-expiry pattern exists in invite/me/acceptInvite, and invitation expiry is only filtered before its lock/tenant wait (`:128-138`). Remediation: centralized final session-expiry assertion after waits and immediately before protected publication/commit; invitation expiry rechecked after tenant lock. Add deterministic SQL-backed lock/clock tests proving mint and invite acceptance roll back when expiry passes during the wait. The main application executor already rechecks session expiry around execution/publication; identity methods should meet the same contract.

2. **Unauthenticated rate state has unbounded retention.** `shared/identity/service.mjs:14-20` inserts `auth_attempts` for each new syntactically valid login/register email. Nonexistent-account login attempts therefore create durable rows; expired rows are never deleted, and no table cap/retention/index policy exists in `shared/identity/schema.mjs:23-25`. Repository search found no other references providing cleanup. HTTP request limits bound the growth rate, not retained size. Related in-memory HTTP limiter `apps/api/http.mjs:7-12` calls 2048 a cleanup threshold but continues inserting unlimited live keys; it has no size ceiling. Remediation: enforce bounded/periodic deletion of expired durable rows (indexed until_at), impose a safe admission/storage bound for new keys when capacity is exhausted, and reject/coarsen new in-memory rate keys at a fixed capacity. Test many distinct nonexistent emails and fresh IP keys plus expiry reclamation, proving bounds without turning capacity overflow into bypass.

## Consequential plan challenge

The identity/checkout specifications require validation before KDF, short transactions, current authority on commands/cached results, and stable durable checkout identity before external calls. Existing identity version/share locks and the login post-KDF version recheck support logout/password-change linearization. However, locks stop concurrent revocation writes; they do not stop wall-clock expiry. The plan's authority invariant needs the late-expiry guard above on all identity side effects, and eventual checkout authorization/result publication must preserve that distinction around network waits. No blocker was inferred in unseen payment implementation. Credential/account rows are protected by SHARE locks while tenant commands run; fixture SQL explicitly joins fixture tenants and real resolution explicitly joins real tenants. Cached task.create now requires same grant and underlying scope. No additional concrete privilege escalation was found in these inspected paths.

## Source snapshot SHA256

```
6d013eeab6df44c81c3721ead1f1acec0ec14dbc59644d56b36b4ca16c7b7ad4 shared/identity/password.mjs
72de18b88f8c45307e8551e7db6c50cea5c2641a1746c8937135de3a4ee3f88d shared/identity/schema.mjs
9af5d7172b34236a613e83a32861dd66e443b8f4fdfaf3aabe574e7b0c3eea97 shared/identity/service.mjs
c2744f016cc27a2dc7f884258d1f4a9da3f9be952d3bf2bf0e3c784ac804144e shared/identity/state.mjs
e8e734419ceb263d43cb5185f7ae330488a4be4c3e364a88ddde8bbaed1ccc14 shared/application/index.mjs
b996ca1fe12fa2e3e6671f519aadadfbd73488ada4ffae46c5a6d4a6d799072d shared/application/access.mjs
08b4b62110cc044320f692d7b0de9f3dc2e0780186f094611754482afa53b7fa apps/api/account.mjs
5dccf78a4e512d4be7fa82d2ace8ba5826fbf6397a7f7af772b4f830b95b030b apps/api/http.mjs
8a8e0083a02193f549a07e2610781c1bf76c7087bbfdef531d2d50d405b2f703 tests/identity.test.mjs
```

Tests were inspected; SQL-backed regression suites were not executed by this read-only reviewer. Actual model/effort, usage/cost and full elapsed time remain coordinator-owned metadata; unavailable here, not estimated. No delegation or fallback.
