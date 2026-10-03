# F06 B1–4 — Docker browser author handoff

Status: failed

Run `20261003T023900Z-f06`, unit `n7-f06b-sol`, attempt `b1`. One isolated writer, no agents. B5/B6 canonical docs, PR and fresh Astra review belong to coordinator. This result does not establish local MVP acceptance.

Blocking defect **F06B-BLOCK-001**: `src/web/client.ts:27` calls the stored native `fetch` as `this.transport(...)`. Chromium's native Window.fetch rejects that receiver with `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`. The catch turns it into `ApiError('network_error')`. Registration succeeds and redirects to the cabinet, but no `/api/app` request reaches the bridge. The cabinet displays the network error and every business section is inaccessible. Production source remains unchanged, following the owner's explicit STOP instruction.

Diagnostic execution `sol-b-diagnostic-4/checks.json`, `transport_diagnostic`, proves on the same real page/session/origin:

- Direct `fetch('/api/app')`: HTTP 200, safe response field names captured, no identity/header/cookie values logged.
- Object method holding native `fetch`: TypeError, Illegal invocation, before a request.
- Imported actual `/assets/client.js` SessionClient: `network_error`.

`sol-b-diagnostic-4/failure.png` shows the actual 1440×900 failure; visually inspected. It contains no credential form. Bounded correction should address the native transport receiver while preserving injected transport, session epoch/abort/401 fences. Corrector must exercise the native transport in an actual browser, rebuild the changed image, bind new source/build receipts, and request fresh independent review. This author did not make the correction or run remaining business tests.

All relative evidence links below resolve under `docs/telemetry/features/20261003T023900Z-f06/` in this project. Exact trace: `sol-b-receipt.md`; machine summary: `sol-b-run.json`; events: `sol-b-events.jsonl`; source: `sol-b-source.json`; final audit: `sol-b-audit.json`.

| Acceptance | Actual evidence | Verdict / remaining |
|---|---|---|
| B1 existing Docker browser, source/build/preflight/mutex | Four executions with individual `preflight.json`, `exit.json`, immutable copied scripts; Chromium 153.0.8010.12; existing Playwright 1.63.0; own UI mutex and network detached in finally | **Failed**: Chromium1440 registration works, cabinet bootstrap blocks. Chromium390, Firefox/WebKit390 full smoke not executed. Keyboard/focus/labels/reduced motion/overflow not asserted. |
| B2 real full business path and local fixture | Actual UI registration201 and auth/me200; no business mocks. Operator fixture script authored and syntax checked | **Not executed**: mailbox/edit/unchecked consents/waiting/campaign/preview/start/pause/evidence/share/revoke/partner/checkout; poll/send/reply/complaint/unsubscribe/provider success and messages. No local messages were produced by B. |
| B3 tenant/session/state/privacy matrix | Central native transport failure reproduced with real page `evaluate`, no response.json CDP reliance | **Not executed**: tenant foreign404/no DOM leak/zero effects; old cookie401; late response; expired401; R1 passive/explicit two tabs; empty/loading/invalid/unavailable/blocked desktop/mobile. |
| B4 performance/operational/security/review | CPU2; own PostgreSQL no ports; web loopback18709; 93 host and92 image source files identical; accepted build digest; runtime-value secret scan pass; no rebuild/backend rerun | **Not executed**: >=100 authenticated10-concurrent API samples; no p95 estimate. Browser credential API canary not exercised. Independent Astra review pending coordinator. |

Scope route before implementation: existing mechanical route `route.txt` is L (exit1). Harness-only explicit file probe is S, which does not lower the accepted scope. Substantive XL preserved for authentication/privacy/consent/billing/browser. Owner's bounded local autonomy applies; no live SMTP/IMAP, real charge, paid LLM, deployment or shared proxy action. All scripts remain below500 lines; no dependencies/framework/lock/schema/production source changes.

Reproduction after a separately bound correction: from this worktree run `timeout 660s python3 projects/07-cold-email-warmup/scripts/ui/f06-run.py <fresh-attempt-name>`. It acquires `/tmp/codex-ui-e2e.lock`, records actual acquire/release in `/tmp/n7-f06b-sol-run/progress.md`, attaches only `n7f06a_network` if absent, copies uniquely named scripts into `/opt/browser/n7-f06b-20261003T023900Z-<fresh-attempt-name>`, writes read-only READY immediately before actual execution, connects engines to `ws://127.0.0.1:9320/`, and records evidence in a new `sol-b-<fresh-attempt-name>` directory. Current runner intentionally rejects changed source/image binding: the correction owner must allocate new expected source/build/image receipts and align those explicit inputs first. It is not a claim that the unexecuted harness paths already pass.

Script responsibilities: `f06-browser.mjs` owns HTTP bridge preserving Host/Origin/cookies without logging them, browser lifecycle/report, exact safe HTTP/console metadata; `f06-journey.mjs` contains real business UI/actions and100-sample measurement; `f06-security.mjs` contains isolated tenants/two tabs/session checks and real transport response holding; `f06-fixture.mjs` imports the actual accepted image dist modules inside own web process; `f06-run.py` carries safe fixture IDs over stdin/stdout and never passes runtime secrets into browser; `f06-audit.py` reads keys within process, suppresses values and checks exact source/build/runtime/network/secret evidence. The bridge and contexts close; shared browser server stays alive for reviews.

Fixture prerequisites planned, **not executed**: own fresh TEST accounts (`n7-f06b-…@example.test`), real UI mailbox/campaign creation, trusted `seedFixture` + `PollWorker.poll`, `DispatchStore.claim` + `SubmissionStore.submit` using the local sink, actual reply headers matching emitted message ID, `SuppressionStore.complaint`, and `LocalProvider.simulate` + `BillingService.reconcile`. No DB migration, truncation, direct production state spoofing, business API mocks, browser operator credentials, SMTP or real payment. `expire` is a bounded trusted own-tenant session expiry fixture. Browser fixture code still needs actual execution/validation after the blocker.

Failed executions preserved:

| Execution | Command | Exit | Outcome |
|---|---|---|---|
| attempt-1 | runner command above with `attempt-1` | 1 | Actual register201; harness waited for success feedback (`Данные обновлены.`). Product bootstrap failure prevented that state. |
| attempt-2 | same with `attempt-2` | 1 | Narrow harness change to await first real card instead of success text; actual cabinet network-error DOM/screenshot retained. |
| attempt-3 | same with `attempt-3` | 1 | Safe bridge path/method/requestfailure instrumentation; no `/api/app` from SessionClient. Host authenticated direct request independently200 (~7ms single diagnostic request, **not benchmark**). |
| diagnostic-4 | `timeout 90s python3 …/f06-run.py diagnostic-4` | 1 | Actual native receiver and accepted imported client defect proven. STOP. |

Each launch has preflight commands-as-data, source/spec/build/image, environment/input names, exact script checksums, authorized effects and evidence destination. Three retries, no model escalation. HTTP/console failures are classified separately without altering original results in `sol-b-audit.json`: anonymous initial `/api/auth/me`401 is expected; no pageerrors observed. Zero browser business requests is a failure, not a passing error-free journey.

Lightweight final checks: `node --check` for four mjs modules; Python AST parse for both py helpers; exact source/image/build verification; runtime secret canary scan over project and own web logs; no network attachment left. A's previously accepted38 unit/115 PostgreSQL/type/lint/build/mutation results are inherited only, not new B passes. Token/cost/actual-model counters unavailable; requested `gpt-6.1-sol/high`, actual null awaiting host proof; profile `compact-quality-first-v2`. Timing in machine run includes reading, authoring, coordination, retries and handoff. No savings claim.
