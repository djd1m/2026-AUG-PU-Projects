# N3 B customer independent review
Reviewer family: codex
Spec revision: sha256:1685b59ca5fd0eda908165ff21256698ac1abb4ce87228466cb502fad68c6a13
Source: a750f7b3f2a3d047c0064fd81af917dc0e4e910d plus recorded dirty embedding host/CSP/Compose snapshot.
Started: 2026-09-09T06:52:05Z
Status: source review complete; initial findings resolved in recorded dirty snapshot. Browser acceptance remains separate.
Profile: compact-quality-first-v2; requested gpt-6-astra/high. Actual model/effort, usage/cost: null (provider execution metadata unavailable).
Trace: projects/03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T064002Z-go-b-customer.
Read-only main worktree, no browser/WebDriver/server/docker activity; receipt written only under /tmp.

## Decision

**No open finding remains in the latest reviewed B source snapshot.** Two MEDIUM UI findings were sent to the coordinator early and fixed during this review. The receipt preserves the original findings and source changes rather than treating the initial candidate as clean. This is a bounded source/pure-check review, not a live-browser or full-product acceptance receipt.

Read inputs: B PRD; all nine specification criteria and current embedding architecture; applicable shared runtime contract and previously reviewed core; B app/views/embed/CSS/HTML; relevant shared API, UI and credit projections/actions; parent fixture host; current frontend CSP and B Compose. The earlier A/shared financial review was not duplicated.

## Findings and disposition

### B1 — MEDIUM — losing reservation request left stale available balance and enabled reserve UI (resolved)

Original `variants/b-customer/app/app.mjs:97` reserve operation refreshed only after success. Original `run` catch at line150 only called `showOperationError`; `INSUFFICIENT_CREDIT`409 from another tab's successful reservation left the local300available display unchanged. Backend prevented overspend, but AC-b-customer-2032 explicitly requires the losing caller to receive current balance.

Fix inspected: on confirmed ApiError409, `run` performs a read-only `refreshCustomer` and render, then preserves the original conflict feedback. It does not retry the mutation. Failed refresh explicitly says balance could not be updated. Unknown transport failures are not treated as confirmed failure/release.

Independent check executed the actual extracted `run` function body with controlled dependencies:409 caused one read refresh and one render, retained the original error, and restored the button. A following transport timeout caused neither an automatic refresh nor a mutation retry/resolve. This is a controller isolation check, not a browser simulation or concurrency DB test.

### B2 — MEDIUM — consent terms omitted reward percentage (resolved)

Original `variants/b-customer/app/views.mjs:32` invitation showed policy version, window, hold and credit type, but never `program.policy.bps`; generic shared terms also omit rate. The customer could consent without seeing the current reward percentage, contrary to the meaningful terms required by SC-US-201-1.

Fix inspected: the visible pre-consent conditions now include `${program.policy.bps / 100}%` of confirmed payment. Independent actual-render check on seed policy2000bps confirmed `20% от подтверждённой оплаты` before enrollment. The original negative assertion encountered the coordinator's newly fixed source and failed as expected; it is not recorded as a regression failure of the final candidate.

Also inspected the coordinator's related input-bound fix: both button label and submitted reserve amount are bounded by available credit and invoice remainder after existing reserves. Isolated rendering with180000available and150000invoice displayed1500RUB as the reservable amount. Server remains authority for credit calculations and validates the command again.

## Spec conformance

`met` means the reviewed F1 implementation supports the criterion by source/pure checks and previously accepted shared-core evidence. This table does not silently substitute for the coordinator's required real browser/embedding/concurrency evidence.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-b-customer-2011 | met | Standalone publish or validated parent value-moment enables offer; current version/rate/window/hold/credit kind shown before explicit checkbox consent. Decline keeps synthetic product card and host editing/publishing code available; parent hides only the iframe. B2 fixed. Actual browser CSS/CSP isolation remains pending separately. |
| AC-b-customer-2012 | met | Initial connect and refresh call program.read/credit.read; readiness and value-moment change display state only. enrollment.join occurs only on explicit form submit with checked consent. No postMessage contains enrollment/identity/financial instructions. |
| AC-b-customer-2021 | met | Fixture event uses confirmed credit-kind payment via explicit operator context; then reads server-held credit and history with payment ID/policy version/available date. Existing credit seed and pure core state checks preserve typed ledger. |
| AC-b-customer-2022 | met | Copy explains clicks/registration do not earn credit; self-referral fixture supplies customer's own ID and server attribution rejects reward. No UI click/value-moment calls payment or awards credit. Shared confirmed-event/self-referral rules previously reviewed. |
| AC-b-customer-2031 | met | Reserve uses server available/invoice bounds; pending is shown distinctly; explicit fixture resolution controls leave success/failure/unknown separate. Pure check: initial300credit and1500invoice, success yields1200invoice exactly once. |
| AC-b-customer-2032 | met | Shared tenant transaction prevents concurrent over-reservation; B1 fixed to refresh loser409 without mutation replay. Pure duplicate-reserve denial and actual controller conflict refresh passed; real multiprocess DB concurrency was covered in earlier shared suite, not rerun here. |
| AC-b-customer-2033 | met | Pending/unknown retained as active reservations, no automatic terminal result; stable shared facade idempotency key remains on transport failure. Pure state check verifies unknown holds300, confirmed failure restores300 once, success applies once, conflicting terminal outcome rejects. |
| AC-b-customer-2041 | met | share.read only after server enrollment; own server referralURL/text/disclosure rendered and copied on explicit action; no automatic external send. UI/MCP parity remains F1 shared-use-case semantics, not real MCP protocol. |
| AC-b-customer-2042 | met | B normal commands use customer; read-only grant allowlist cannot include enrollment/reserve, checked in previously accepted shared authorization tests. No owner tariff purchase in B. Synthetic operator lab is labeled separately and supplies merchant actor explicitly; it is not production customer privilege isolation. |

## Embedding checks

Executed pure receiver/sender checks against actual `embed.mjs`:

- Wrong origin, wrong source window, extra token key, wrong version and disallowed parent origin all rejected.
- Exact allowed parent/source/value-moment accepted once in the controlled receiver check.
- Ready/dismissed send exactly type+version to the exact allowed targetOrigin, without token/grant/credit fields.

Source inspection of parent confirms corresponding exact child origin/source and exact two-key message checks; value-moment contains only type/version/event, and iframe query carries only embed flag/allowlisted parent origin. CSP explicitly includes permitted localhost/127.0.0.1 variants and uses self scripts; no wildcard token transport or arbitrary frame origin introduced. B Compose connects only frontend network, has no DB network/secret and binds loopback by default. These are configuration/source observations, not a fresh deployed-container/network/CSP browser check.

## Independent checks and limits

1. Pure embedding receiver/sender checks passed.
2. Actual template render checks passed for visible20% consent and invoice-bounded reserve label.
3. Actual extracted controller `run` passed confirmed409 refresh, error preservation, restored button and no implicit resolution on timeout checks.
4. Pure shared credit-state assertions passed for duplicate over-reserve denial, unknown retention, failure release-once, successful1200invoice and terminal conflict denial.

No browser/WebDriver, running server or Docker command used. No new full PostgreSQL/concurrency suite was executed. Actual clipboard permission in a cross-origin frame, keyboard operation, mobile layout, host CSS isolation, CSP frame loading, cross-origin HTTP and live denied/loading/retry states require coordinator browser evidence. B uses native labeled controls/status/alert regions and responsive CSS, but those source properties alone do not certify accessibility.

No test files or repository source were written by this reviewer. Requests and pure checks used only memory; report is under `/tmp`.

## Source binding

Base `a750f7b3f2a3d047c0064fd81af917dc0e4e910d`; initially dirty host/CSP/B Compose. B fixes arrived concurrently and were reread. SHA256 paths are project-relative:

| File | SHA256 |
|---|---|
| variants/b-customer/app/app.mjs — final sampled fixes | 1869372145b1d7f436f13d2f7bf8477079c9d54636ece96b74b3ef255c65b932 |
| variants/b-customer/app/views.mjs — final sampled fixes | 068eb81ef96b2f85392733bf90a4f3e5fff594ca5e009d7eb293df0f47b96659 |
| variants/b-customer/app/embed.mjs | e77270d91b0571bd27354e6fc46fbbc0d6265e6b46af6b0df7ecff94a86f9c00 |
| variants/b-customer/app/index.html | f9c95f938ba0cca8e405775be33733edf9608eee60def53d7d42a115a68cedf9 |
| variants/b-customer/app/styles.css | 9aa50c09dff4203734e01e5c222708ae02f31bc36fedc215e9699cf8fd5b4b23 |
| apps/frontend/fixtures/embed-host.html | ee7aa929382327724c8922f6665c3cd0fabdf2fbe2f742185d37167b8ce40043 |
| apps/frontend/fixtures/embed-host.mjs | 2024342ab8a4dc1084a1b4586d7de37e165d03a17bd9b902f3cb5830389a3d81 |
| apps/frontend/server.mjs | 1a1c2a095ac3036576078b055881375fe84425f59a94797113c943da473b5bdd |
| variants/b-customer/docker-compose.yml | 1c2bbdeaff2fba9b4ba5abc59f4dad56acb7bbab7007bbf329f060d35d3d2cc3 |

Original pre-fix B app SHA: `b19226961ad6ee15aead39957b758b5b675c6367a57fd9907067d5a82a47f939`; views SHA: `a70e8b5cfc68993e18c1e4de85847c6ff0ca95e8eb5bc9f103cee79cb76b626f`.

Requested Astra high is not proof of actual provider model. No actual model/effort/usage counters are exposed; values remain null. No model fallback observed; savings not established.

Completed: `2026-09-09T06:55:15Z`. Recorded elapsed: **190 seconds (3m10s)**. Active time/usage unavailable. Live browser results were not received by completion; no browser pass inferred.

## Coordinator browser acceptance

Accepted B standalone F1 after actual Firefox desktop/mobile390 and foreign-origin iframe. All9AC exercised; B12/12 tests (11 scenarios), sequential A+B25/25, PostgreSQL40/40, 8 listed mutants killed. Build45modules. API/A/B healthy; PostgreSQL no ports/internal backend-only network. UI snapshot2f9cd97; test setup repair recorded separately. Two initial review findings fixed; first browser attempt had two harness assumptions and nested iframe pointer scroll failure; initial A regression intermittently reused old handoff, fixed bootstrap wait in setup. An attempted JSON-viewer storage reset failed and was replaced, not counted as passing. No production payments or real MCP/A2A wire interoperability. Full evidence: `../../telemetry/p-replicator/20260909T064002Z-go-b-customer/evidence/`.
