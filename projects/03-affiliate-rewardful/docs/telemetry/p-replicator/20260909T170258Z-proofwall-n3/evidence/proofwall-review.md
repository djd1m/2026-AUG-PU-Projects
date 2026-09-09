# Independent P1 bridge review

Verdict on reviewed commits: CHANGES REQUESTED. Two concrete findings were sent immediately to the integration owner, who has assigned bounded fixes. No additional money-loss, tenant-escape, or proof-replay blocker was substantiated in this static pass.

Run: 20260909T170258Z-proofwall-n3. Work unit: bridge-p1-review. Profile: compact-quality-first-v2 / XL payment-security review. Requested model: gpt-6-astra high; actual model and reasoning configuration must be taken from parent invocation metadata, unavailable from this child tool surface. Usage/cost: null (no counters available). Independent readonly review; no subdelegation. Exact start timestamp was not captured by this child, so duration is null rather than estimated; parent invocation telemetry can supply it.

## Source identity

Worktree /tmp/proofwall-n3-bridge, base a16c0be, source commits b8f8f83a4d5c6c14ed12338030b25bab554f8bda and 07969894872d18bd59d89277c787a9d6cfef3469.
All 35 paths in /tmp/proofwall-n3-source-shas.json matched their hashes at 2026-09-09T19:15:44.920373+00:00. Manifest SHA256: 3a7db0de04137dff97ce1a1e19e4e5f251eb40ac4e498bbc5261abf9f8196080.
Canonical P3 02_pseudocode.md SHA256 independently confirmed cecb418a726335f79bfae2b13d96a027d7885d45a4323c5ad85435f5f3b1c6eb. The sole dirty next.config.mjs is the declared root-owned build fix and is outside the 35-path manifest. This verdict does not cover subsequent fixes until reinspection.

Read root/P1 CLAUDE, applicable security and model routing rules, the five P1 bridge feature documents, canonical P3 wire/transaction contract, implementation receipt, all new P1 production files and associated test additions, changed SSO/native payment paths, and supporting role/session/transaction helpers.

## Findings

### P2 — canceled first purchase cannot be restarted through the existing free-account UI

apps/web/src/lib/n3-checkout.ts:17–20 returns the historical intent for the persisted request key even when its state is canceled. Lines 51–52 special-case completed, then return any saved provider redirect without excluding canceled.
apps/web/src/app/dashboard/[slug]/billing-block.tsx:27–29 stores this key in sessionStorage and reuses it after reload. The only explicit new-key control at lines 72–75 is conditional on paidUntil being non-null.

Trigger: a referred free customer starts the first purchase, that payment is canceled, and the customer returns to retry in the same tab. The trusted canceled webhook makes the old intent terminal, but every visible Pay click still selects its stored request key and redirects to the canceled provider payment. Reloading preserves the key; a customer who has never paid has no restart button. Opening another browser context is an accidental workaround, not product recovery.

Required correction: expose a new-purchase action for terminal cancellation (or return a precise canceled result and rotate the key only following that confirmed terminal result). Preserve reuse of unresolved/ambiguous invoices and do not blindly rotate after transport failures. Add cancellation-to-new-invoice recovery coverage, including free-account UI. Owner informed before report.

### P2 — signup acknowledgement is not fenced to the proof version

services/worker/src/n3-outbox.ts:44–46 updates n3_email_proofs.bound_at using only account_id and payload.email. The signup business key is accountId:proofId (apps/web/src/lib/n3-proof.ts:57), but acknowledgeN3 never checks the proof id. Its job type also omits business_key.

Trigger at the supported persistence boundary: an old signup job for email A completes after the current proof has been replaced by a different proof id for email A. For example an account email moves A→B→A while old delivery is pending. The old acknowledgement marks the newer proof bound even though that proof's durable job has not been acknowledged. The existing lease fence protects job ownership, not proof-version ownership.

Reachability limit: no current HTTP account-email-change route was found. This is a concrete missing canonical proof-version invariant and an admissible database state, not a demonstrated current browser account-takeover exploit. The existing checkout email join does reject a simple A→B mismatch. Fix should match the exact proof id from authoritative returned outbox data/business_key, along with account and email, without trusting only the passed job object. Test stale proof version as well as existing stale lease case. Owner informed before report.

## Other reviewed invariants

- Proof uses account→session locks and wall-clock session recheck after lock wait; token hash, exact account/email/session, expiry, single active issuance and one-use update prevent replay. Issuance serializes account and IP admissions, with 60-second cooldown and 5/account/hour, 30/IP/hour checks. GET landing does not verify or bind; verification POST uses exact Origin and bounded body.
- Signup attribution is captured server-side in the registration transaction from a separate fixed-tenant cookie namespace. Proof consumption, verification fact and signup outbox insertion share one transaction. Explicit promo is not silently discarded or replaced by cookie fallback.
- Unknown equal-email SSO identities fail closed, including passwordless collisions and concurrent insertion recovery. Existing exact external identity is the only alternate successful identity lookup.
- Native invoice persists before N3/provider IO. Project lock and partial unique unresolved index reuse concurrent pending checkout. UUID request key and invoice idempotency remain durable across ambiguous creation; 23-hour ambiguity refuses blind creation. Checkout checks project owner at both RLS and service boundaries. Prior completed invoices recover directly.
- Bridge provider verification uses independently fetched payment/refund data and checks object id, persisted metadata linkage, configured shop, test mode, RUB and expected payment amount. Refunds independently resolve their original payment, check amount and cumulative local maximum, and record manual entitlement review. Browser webhook metadata is not used to award entitlement/commission.
- Settlement queues before entitlement mutation and commits outbox, unique payment claim, native checkout recovery and entitlement together. Project locks serialize distinct extensions; completed checkout status prevents repeated extension. A queue admission exception rolls back event claim and tariff together.
- Bridge-owned verified payments return before the legacy native referral conversion path. Legacy conversion now derives owner from the persisted upgraded project rather than webhook-supplied account metadata.
- New tables are service-only with RLS enabled and no owner grants. checkout_sessions INSERT privilege remains owner-role/RLS scoped, using persisted owner mapping.
- Queue global advisory admission lock enforces the pending 10000 cap, and existing identical jobs are accepted before the cap check. Worker has batch 10, max 4 requests, nonoverlapping poll, 60-second leases, job-id/token/expiry acknowledgement fencing and bounded exponential retries without discard ceiling. Shared N3 transport requires exact HTTP 200 envelope, 8-second overall deadline, no redirects and 1 MiB body bound.
- Status queries explicitly scope account. New UI renders strings through React without unsafe HTML; private connector config stays in server modules. Existing dashboard RLS query remains before rendering.

## Verification and limits

Independent checks performed: source manifest 35/35 match; canonical contract hash match; git diff --check on a16c0be..0796989 passed; static review of all new production code and tests. No database, network, secrets, container, deployment or code mutation was performed. No additional tests were needed merely to repeat implementation checks in this readonly scope.

Implementation receipt reports web 811 tests, worker 34 tests, DB 18 tests, typecheck/build and three killed mutations; those are author/parent evidence, not rerun results from this reviewer. Root owns actual browser and cross-service E2E. Real provider TEST charge/refund, actual mailbox receipt, installed production configuration and deployment are not established by this review.

Report written at: 2026-09-09T19:17:22.809119+00:00
