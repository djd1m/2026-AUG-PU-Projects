# Refinement / test strategy

Before each feature read its Specification and Architecture sections together.
Tests must fail when the protected property is deliberately removed; green
unchanged suites are not rerun without relevant change or finding.

## Required layers

1. Unit: consent versions/revocation, template escaping and field whitelist,
   SSRF target validation, token purpose separation, quotas and unknown evidence.
2. PostgreSQL integration: two-tenant access, transaction rollback, unique event/job
   keys, 20 concurrent claims under budget 3, reply/suppression vs queued work.
3. Adapter integration: local SMTP/IMAP protocol fixtures, TLS failure, auth failure,
   ambiguous timeout, UIDVALIDITY reset, duplicate reply; no external sends.
4. Browser: real Docker Playwright, 390/1440, keyboard, save/reload persistence,
   consent default unchecked, preview, unavailable integration, pool waiting,
   reply pause, complaints, unsubscribe and badge/partner edges.
5. Full project: typecheck, lint, build, all unit/integration/browser suites,
   dependency security/license inventory and secrets diff scan.

## Failure modes

No consent, revoked consent after queueing, campaign changed after consent,
quota exhaustion across warmup+campaign, duplicate dispatcher, worker crash after
SMTP acceptance, stale IMAP, foreign Message-ID, malformed AEAD ciphertext,
private DNS resolution/rebinding, forwarded unsubscribe link, repeated opt-out,
untrusted complaint, forged paid flag, reordered payment events, self referral,
blocked cookies, n<30, unknown reputation and misleading demo labeling.

Mutation minimum: remove consent condition → sending guard test fails; remove
quota atomicity → concurrent test fails; bypass tenant predicate → isolation fails.
Restore original source then rerun affected checks. Mutations operate only in
isolated test copies with local fake transports.

## Evidence

Unique source-bound receipt per work unit, no reused paths. Record command,
exit code, source/build digest, environment, screenshot/check artifact. Read-only
companion preflight immediately before E2E. Browser runtime health is not product
E2E. Prototype CJM E2E does not establish backend acceptance.

Independent Astra reviewer reads current spec and exact source, checks all AC
and gives findings with reproduction and severity. One corrective pass addresses
confirmed issues; no demanded minimum finding count or optional polish loop.
