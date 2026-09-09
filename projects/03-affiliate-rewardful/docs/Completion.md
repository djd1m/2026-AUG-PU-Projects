# Completion — N3 F1

Feature acceptance: shared25 + A8 + B9 + C8 + D10 =60 criteria. Per-feature acceptance and actual executable mapping below. Final combined browser:49/49 (45 scenarios plus4 parent tests), full PostgreSQL44/44, current14 guard mutants killed; all4 frontend containers healthy and loopback only. Five demo HTML pages verified at1440/390. Combined browser/deployment receipt is recorded in docs/telemetry/p-replicator/20260908T204432Z-go-shared-core/evidence/final-batch.json after the last run. This mapping does not assert production readiness.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-shared-core-11 | tests/core-access.test.mjs | SC-US-001-1 SC-US-006-1 foreign tenant resource is denied across UI/MCP/A2A fixture contexts |
| AC-shared-core-12 | tests/core-access.test.mjs | SC-US-001-2 partner cannot read merchant registry or known other partner |
| AC-shared-core-13 | tests/core-access.test.mjs | SC-US-001-3 server checks selected membership, limited token cannot gain merchant through variant switch |
| AC-shared-core-21 | tests/core-events.test.mjs | SC-US-002-1 SC-US-006-3 concurrent business payment across processes and retry after restart accrues once |
| AC-shared-core-22 | tests/core-events.test.mjs | SC-US-002-2 recurring payment IDs accrue separately and frozen policy versions survive changes |
| AC-shared-core-23 | tests/core-events.test.mjs | SC-US-002-3 unverified and unknown events cannot claim identity; verified retry can |
| AC-shared-core-24 | tests/core-events.test.mjs | SC-US-002-4 explicit promo wins and invalid promo, self-referral and expired attribution explain zero reward |
| AC-shared-core-31 | tests/core-domain.test.mjs | SC-US-003-1 integer rounding preserves original reward under cumulative partial refunds |
| AC-shared-core-32 | tests/core-registry.test.mjs | SC-US-003-2 SC-US-004-1 selected month cash registry explains held, refunded and credit exclusions |
| AC-shared-core-33 | tests/core-events.test.mjs | SC-US-003-3 refund after simulated sent fact creates debt exception and never frees sent obligations |
| AC-shared-core-41 | tests/core-registry.test.mjs | SC-US-003-2 SC-US-004-1 selected month cash registry explains held, refunded and credit exclusions |
| AC-shared-core-42 | tests/core-registry.test.mjs | SC-US-004-2 SC-US-004-7 refund invalidates approval, exports including cached command and releases only unsent allocations |
| AC-shared-core-43 | tests/core-registry.test.mjs | SC-US-004-3 SC-US-004-6 export does not send; repeated send with new key preserves one fact; mixed partner sends survive |
| AC-shared-core-44 | tests/core-registry.test.mjs | SC-US-004-4 SC-US-004-5 same artifact snapshot is stable and competing approvals cannot share obligations |
| AC-shared-core-45 | tests/core-registry.test.mjs | SC-US-004-4 SC-US-004-5 same artifact snapshot is stable and competing approvals cannot share obligations |
| AC-shared-core-46 | tests/core-registry.test.mjs | SC-US-004-3 SC-US-004-6 export does not send; repeated send with new key preserves one fact; mixed partner sends survive |
| AC-shared-core-47 | tests/core-registry.test.mjs | SC-US-004-2 SC-US-004-7 refund invalidates approval, exports including cached command and releases only unsent allocations |
| AC-shared-core-48 | tests/core-registry.test.mjs | SC-US-004-8 historical CSV actual payment creates one reconciliation and never authorizes a second transfer |
| AC-shared-core-51 | tests/core-grants.test.mjs | SC-US-005-1 SC-US-005-3 SC-US-006-2 scoped deterministic task yields same persisted artifact for owner handoff |
| AC-shared-core-52 | tests/core-grants.test.mjs | SC-US-005-2 revoked grants reject cached task results and reads while owner keeps independent artifact rights |
| AC-shared-core-53 | tests/core-grants.test.mjs | SC-US-005-1 SC-US-005-3 SC-US-006-2 scoped deterministic task yields same persisted artifact for owner handoff |
| AC-shared-core-54 | tests/core-grants.test.mjs | SC-US-005-4 canceled task ignores late execution and never publishes into another task |
| AC-shared-core-61 | tests/core-access.test.mjs | SC-US-001-1 SC-US-006-1 foreign tenant resource is denied across UI/MCP/A2A fixture contexts |
| AC-shared-core-62 | tests/core-grants.test.mjs | SC-US-005-1 SC-US-005-3 SC-US-006-2 scoped deterministic task yields same persisted artifact for owner handoff |
| AC-shared-core-63 | tests/core-events.test.mjs | SC-US-002-1 SC-US-006-3 concurrent business payment across processes and retry after restart accrues once |
| AC-a-merchant-1011 | tests/e2e/a-merchant.mjs | SC-US-101-1 saved policy is visible and survives reload |
| AC-a-merchant-1012 | tests/e2e/a-merchant.mjs | SC-US-101-2 missing rate cannot publish and field remains repairable |
| AC-a-merchant-1021 | tests/e2e/a-merchant.mjs | SC-US-102-1 confirmed fixture payment displays its rule and reward once |
| AC-a-merchant-1022 | tests/e2e/a-merchant.mjs | SC-US-102-2 refund and replay of same payment preserve correction and stale registry guard |
| AC-a-merchant-1031 | tests/e2e/a-merchant.mjs | SC-US-103-1 registry approval exports exact version with exclusions |
| AC-a-merchant-1032 | tests/e2e/a-merchant.mjs | SC-US-103-2 manual send is separate and persists actor, date and evidence |
| AC-a-merchant-1041 | tests/e2e/a-merchant.mjs | SC-US-104-1 invitation opens enrollment terms and never a referral link |
| AC-a-merchant-1042 | tests/e2e/a-merchant.mjs | SC-US-104-2 owner opens revised deterministic agent artifact in A |
| AC-b-customer-2011 | tests/e2e/b-customer.mjs | SC-US-201-1 decline preserves product and explicit consent creates enrollment |
| AC-b-customer-2012 | tests/e2e/b-customer.mjs | SC-US-201-2 reads and unchecked submit cannot enroll |
| AC-b-customer-2021 | tests/e2e/b-customer.mjs | SC-US-202-1 verified friend payment creates held credit with source and policy |
| AC-b-customer-2022 | tests/e2e/b-customer.mjs | SC-US-202-2 self-referral and unpaid registration never add available bonus |
| AC-b-customer-2031 | tests/e2e/b-customer.mjs | SC-US-203-1 confirmed application changes invoice1500 to1200 once |
| AC-b-customer-2032 | tests/e2e/b-customer.mjs | SC-US-203-2 losing stale tab refreshes current balance after server conflict |
| AC-b-customer-2033 | tests/e2e/b-customer.mjs | SC-US-203-3 unknown keeps original reserve through reload and failed releases once |
| AC-b-customer-2041 | tests/e2e/b-customer.mjs | SC-US-204-1 share kit matches read-only agent output and copies disclosure |
| AC-b-customer-2042 | tests/e2e/b-customer.mjs | SC-US-204-2 read-balance grant cannot join or reserve and customer cannot buy owner tariff |
| AC-c-partner-3011 | tests/e2e/c-partner.mjs | SC-US-301-1 complete terms and participation status precede consent |
| AC-c-partner-3012 | tests/e2e/c-partner.mjs | SC-US-301-2 changed terms preserve historical commission policy |
| AC-c-partner-3021 | tests/e2e/c-partner.mjs | SC-US-302-1 explicit enrollment returns personal referral distinct from invitation |
| AC-c-partner-3022 | tests/e2e/c-partner.mjs | SC-US-302-2 repeat enrollment returns same participant and attribution |
| AC-c-partner-3031 | tests/e2e/c-partner.mjs | SC-US-303-1 history is own scoped with hold corrections and payout schedule |
| AC-c-partner-3032 | tests/e2e/c-partner.mjs | SC-US-303-2 owner send displays date but never asserts bank credit |
| AC-c-partner-3041 | tests/e2e/c-partner.mjs | SC-US-304-1 own read grant returns the UI source time and exact payout data |
| AC-c-partner-3042 | tests/e2e/c-partner.mjs | SC-US-304-2 known foreign partner and merchant registry remain forbidden |
| AC-d-agent-4011 | tests/e2e/d-agent.mjs | SC-US-401-1 consent creates only subject-scoped read and draft grant |
| AC-d-agent-4021 | tests/e2e/d-agent.mjs | SC-US-402-1 replay keeps logical task and one payable registry |
| AC-d-agent-4031 | tests/e2e/d-agent.mjs | SC-US-403-1 owner exports only approved exact snapshot and never sends |
| AC-d-agent-4022 | tests/e2e/d-agent.mjs | SC-US-402-2 refund recount changes same artifact and explains exact correction |
| AC-d-agent-4032 | tests/e2e/d-agent.mjs | SC-US-403-2 revoke denies cached agent read and owner continues exact revised artifact in A |
| AC-d-agent-4012 | tests/e2e/d-agent.mjs | SC-US-401-2 expired grant denies next step while owner read stays available |
| AC-d-agent-4041 | tests/e2e/d-agent.mjs | SC-US-404-1 partner repeat preserves same own task with no settlement side effects |
| AC-d-agent-4042 | tests/e2e/d-agent.mjs | SC-US-404-2 canceled T1 late response never completes selected T2 |
| AC-d-agent-4051 | tests/e2e/d-agent.mjs | SC-US-405-1 customer agent answer matches the actual B credit UI on same session |
| AC-d-agent-4052 | tests/e2e/d-agent.mjs | SC-US-405-2 read-only customer grant cannot reserve or apply credit |

## Reproduce final gates

`node scripts/build.mjs --all`

`docker compose -f docker-compose.test.yml run --rm --no-deps backend npm test`

`node --test --test-concurrency=1 tests/e2e/a-merchant.mjs tests/e2e/b-customer.mjs tests/e2e/c-partner.mjs tests/e2e/d-agent.mjs` (local provisioned Firefox WebDriver required).

`node scripts/mutation-check.mjs --all`

`node scripts/check-pipeline.mjs` runs all four packaged modes across project and all5 features. p-replicator1.13.2 incorrectly expands the project Completion path twice. This project wrapper changes only that variable in memory, checks the original source SHA256 and fails on package changes. It does not alter the installed package or skip a contour. A missing project criterion in a temporary copy returned exit1; see pipeline-negative-control.json.

F1 is accepted as a synthetic comparison stand. Real payment-provider credentials, provider sandbox/production, production identity, real MCP/A2A protocol interoperability, LLM execution and seven-day observation remain unverified.

## F2 extension — real accounts, provider integration and protocols

The earlier F1-only limitations above are historical. F2 adds real `/account` workspaces on all four hosts and actual MCP/A2A transports. YooKassa API integration is implemented but disabled until dedicated N3 merchant credentials are supplied and live acceptance is run. See [F2 completion](features/f2-commercial/05_completion.md) for candidate, evidence and current acceptance status. F1 fixture CJMs remain separate from the real workspace.

### F2 criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-f2-commercial-11 | tests/identity.test.mjs | real registration, persistent login, tenant isolation, fixture isolation and logout |
| AC-f2-commercial-12 | tests/identity.test.mjs | one-use role-bound invitations, concurrent acceptance, partner cannot take merchant authority |
| AC-f2-commercial-13 | tests/account-http.test.mjs | real cookie HTTP protects CSRF, keeps tokens out of responses, and connects scoped MCP/A2A to PostgreSQL |
| AC-f2-commercial-21 | tests/payment-integration.test.mjs | lost create response keeps durable order and retries same provider idempotence key without another payment |
| AC-f2-commercial-22 | tests/payment-integration.test.mjs | forged and mismatched provider objects never reserve dedup; later authentic delivery succeeds with frozen policy |
| AC-f2-commercial-23 | tests/payment-integration.test.mjs | real durable checkout survives retry; verified duplicate and refund-before-payment accrue and reverse once |
| AC-f2-commercial-31 | tests/e2e/public-agent.mjs | public HTTPS official MCP Client and A2A share durable authorized state |
| AC-f2-commercial-32 | tests/identity.test.mjs | agent token scopes, durable task replay, revocation and password rotation invalidate credentials |
| AC-f2-commercial-33 | tests/agent-transport.test.mjs | A2A card and durable application task mapping: replay, changed input, current get, terminal cancel |
| AC-f2-commercial-41 | tests/e2e/account.mjs | real account UI desktop/mobile signup login invite scopes agent transport and durable organization across A–D |

## F3 referral funnel extension

Current status and source-bound verification: [F3 completion](features/f3-referral-funnel/05_completion.md). This feature connects verified merchant signup and billing; the first live merchant installation remains unverified.

### F3 criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-f3-referral-funnel-11 | tests/referral-service.test.mjs | referral configuration validates destinations; key is hash-only, scoped, rotated and revoked |
| AC-f3-referral-funnel-12 | tests/e2e/referral.mjs | separate merchant UI: real redirect and first-party receipt through verified signup, authoritative checkout and provider-verified commission |
| AC-f3-referral-funnel-13 | tests/referral-service.test.mjs | verified binding has promo precedence, strict inputs, stable retries and no secret or email leakage |
| AC-f3-referral-funnel-14 | tests/referral-service.test.mjs | default 30 and published 60/90 day visits freeze server expiry independently of later policy |
| AC-f3-referral-funnel-21 | tests/referral-payment.test.mjs | lost connector create response retains idempotency; foreign credentials cannot query order or redirect binding |
| AC-f3-referral-funnel-22 | tests/referral-payment.test.mjs | connector orders freeze durable signup attribution; late renewal survives cookie expiry and refunds remain idempotent |
| AC-f3-referral-funnel-31 | tests/referral-payment.test.mjs | test commission does not consume one-time live commission; metrics count unique live customers and survive clawback |
| AC-f3-referral-funnel-32 | tests/e2e/referral.mjs | owner referral panel works on all A–D origins at desktop and mobile, key response cannot reappear after logout |
| AC-f3-referral-funnel-41 | tests/referral-payment.test.mjs | literal 5000-order cap refuses extra provider work while an existing connector retry stays available |
| AC-f3-referral-funnel-42 | tests/referral-payment.test.mjs | additive migration preserves old checkout rows and their legacy payment/refund interpretation |
