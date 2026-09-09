# N3 A merchant independent review
Reviewer family: codex
Spec revision: sha256:d9bce34cfcdb8f3321573a1570e4c13cf1fde520fee5c26d8112e2112268ed34
Status: in progress.
Start: 2026-09-09T06:22:03Z
Source commit: 78060c78a773d053824fc429cd247dea94401a7d plus dirty views.mjs operator display and new E2E source (hashes in final receipt).
Profile: compact-quality-first-v2; requested gpt-6-astra/high; actual model/effort null, usage/cost null (execution metadata unavailable).
Scope: read-only A UI/source and test review; no browser/session/container use.

## Decision

**Changes requested:** one HIGH payout-status defect and one MEDIUM policy-editor defect. No browser run was performed by this reviewer; the coordinator owns Firefox/session activity. Full browser acceptance remains pending coordinator evidence. H1 from the shared-core review was previously resolved and was not re-reviewed here.

## Findings

### A1 — HIGH: historical partner transfer falsely marks a new revision's unpaid row as sent

`variants/a-merchant/app/views.mjs:65` indexes every historical `artifact.transfers` entry using only `partnerId`. The map drives the sent badge at line72 and the send-form visibility/filter at lines78/83, without checking current revision or obligation IDs.

Independently reproduced with actual pure domain operations and rendering in an isolated Node process, without DB/browser writes:

1. Seed; prepare and approve August registry v1; mark Anna's eligible obligation sent.
2. Advance demo clock by seven days and invalidate source, making Anna's formerly held payment eligible.
3. Prepare the **same artifact** v2 and approve it.
4. Render `registryView` using the real resulting artifact and dashboard projection.

Observed: v2 contains one new Anna obligation worth `10000` minor, while Anna's existing transfer belongs to revision1. HTML nevertheless labels Anna's v2 row `Отправлено вручную` and omits Anna from the current transfer selector. This hides an unpaid obligation and prevents the operator from recording its settlement. Backend remains correct; the defect is the UI's interpretation of historical facts.

Fix: map transfers to the actual current row's obligations/revision, while preserving historical transfer display. Add a regression covering the mixed old-sent/new-unsent obligations for the same partner, including the selectable current row and truthful status.

### A2 — MEDIUM: selecting credit after reload displays cash settings and credit preview promises cash payout terms

`variants/a-merchant/app/app.mjs:39` selects `editingPolicy || program.policy`; `editingPolicy` is only in memory. Merchant `program.read` returns cash as its default policy. `bindProgram` at lines124–142 has no reward-kind change handler to select that kind's latest entry from `program.policies`. `views.mjs:60` always describes the preview as partner payout with the cash `program.payoutSchedule`, including after saving `kind:'credit'`.

Repro: save credit25% with window45/hold2, reload, open Rules and select subscription credit. The UI starts with cash20%/window30/hold7 and changing the kind does not load the persisted credit policy. Saving from that form can unintentionally overwrite the credit settings with cash values. Immediately after credit save the preview says payout by the fifth instead of explaining reduction of the subscription invoice.

Independent isolated source/domain/render check confirmed persisted credit2500bps, merchant default cash2000bps, and the credit preview rendering the cash payout schedule with no invoice-reduction explanation. Reload/change-handler behavior is established by the inspected client control flow; browser reproduction not performed by reviewer.

Fix: explicit current policy selection per reward kind, populated from server policies on load and kind changes; preview must distinguish cash transfer from subscription credit. Extend the existing cash-only policy browser case with credit save/reload/kind-switch and credit-specific terms.

## Criterion review

`met` below describes the reviewed F1 behavior supported by source/previous accepted core tests and local rendered checks; it does not certify the coordinator's pending complete browser run. Accessibility/browser observations remain separately unverifiable here.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-a-merchant-1011 | not met | Cash save/render and frozen policy references exist, but saved credit policy is not correctly reloadable/selectable and credit preview uses cash terms; A2. Existing E2E covers only cash25%. |
| AC-a-merchant-1012 | met | `policyInput` requires explicit nonempty rate, validates exact decimal conversion to bps1..10000 and days; invalid form keeps editable fields and alert. Shared server validates again. E2E asserts missing-rate submission leaves policy count unchanged. |
| AC-a-merchant-1021 | met | Laboratory submits stable fixture payment via shared API; payment history shows provider object ID, rule version, reward and available date; source/history amounts come from server. E2E asserts actual payment count/version/reward and visible event ID. The available date could benefit from an explicit 'доступно с' label. |
| AC-a-merchant-1022 | met | Replay uses exactly the original fixture payment body; refund has a stable distinct ID; shared business-key handling preserves negative ledger. UI refreshes server adjustment; E2E asserts refund total remains after replay and registry becomes stale. |
| AC-a-merchant-1031 | met | Exact artifact id/revision/hash sent for approval/export; source mismatch hides export and offers same-artifact recompute; rows/exclusions and hash are rendered. Browser test captures CSV bytes and asserts hash, exclusions and zero transfers after export. A1 separately affects later manual-row status. |
| AC-a-merchant-1032 | not met | Export itself does not create transfer; dirty operator fix correctly displays actor/date/evidence. However A1 can label a new unpaid current row sent solely due to a historical transfer. |
| AC-a-merchant-1041 | met | Within the explicitly agreed same-session F1 preview, copied path is `/join`, not `/r/...`; preview displays current cash terms without automatic enrollment. The cross-session/public invitation limitation below must be reflected truthfully; public publication is deferred in A PRD. |
| AC-a-merchant-1042 | met | `connect` consumes provided session/artifact, clears fragment, and A reads exact persisted artifact through server auth; no replacement bootstrap for provided token, foreign/denied artifact triggers fatal recoverable error. E2E constructs revised fixture task artifact and asserts actual A-rendered id/hash. Actual D UI/wire interoperability remain deferred. |

## Nonblocking scope and evidence gaps

- Enrollment link carries no tenant reference. A new browser/session opening `/join` creates its own seeded tenant and therefore sees default20%, even if owner published25%. Existing E2E follows link in the same session. Because public publication is explicitly outside F1 and `/join` is agreed to be a preview, this is a scope/copy caveat rather than a demand to add public access: label link as same-session preview and avoid claiming it publishes this tenant's conditions to another recipient/browser.
- Error handling: initial fatal state offers Retry/New demo; most mutations preserve recoverable error feedback and restore busy buttons; registry refresh has explicit retry. Native inputs/buttons, label nesting, visible focus styles, status/alert regions, and responsive CSS are present. Actual keyboard journey, focus retention after whole-shell rerender, mobile usability and overflow cannot be certified from source. Browser test currently uses pointer actions and does not establish keyboard navigation.
- The browser E2E source covers cash policy, payment/refund/replay, registry/CSV, manual transfer, same-session invitation, network-error retry, mobile390 overflow, and revised artifact handoff. It does not cover A1 or credit policy handling in A2. It intercepts Blob creation for CSV content, which demonstrates generated file bytes rather than OS download persistence.
- This review did not mutate server/domain source, touch Firefox/WebDriver, or start containers. Only pure-domain state in memory and `/tmp` receipt writes were used.

## Source binding

Base commit `78060c78a773d053824fc429cd247dea94401a7d`. Initial reviewed dirty view change adds operator display to transfer history; the accrued metric label was already `до вычета коррекций` in read source. New E2E file was untracked at review time. SHA256 snapshots:

| File | SHA256 |
|---|---|
| variants/a-merchant/app/app.mjs | ae2f4b2b9f97bc43a8249ac1ae3caedc0d1a600efadeb99c0939b3e265a77b8a |
| variants/a-merchant/app/views.mjs | 6ea8a3c7a193eceafa2b6de938b8087cfdbb0adaa4b9aad3c15b6c158a7c864f |
| variants/a-merchant/app/index.html | 8dbf3f171fc82e95d9277718c727058100eeef71292cf3ae39bdc1605ed0e56f |
| variants/a-merchant/app/styles.css | b6a0998fa16d2079b6d0083af5ba95d036584509563ae2adefe410c4b0ff417a |
| shared/client/api.mjs | 9837f4ee6fbe373b448115de614fad226bb6f93ae5adb0fb8f25757dd1343787 |
| shared/ui/ui.mjs | 92872d3e8c12c2422daf9d872457156d754c682859ce1cf99eeec6641a705ac6 |
| apps/frontend/server.mjs | d55cf324c7f5765b5d6ce143c0bb9d5f04e28621b63f617772b357163d454daf |
| tests/e2e/a-merchant.mjs | 80c0eb26649a3596c4eb11ff0a481fbe9800a533f3698046e9271432d215d92d |

Both findings were sent promptly to coordinator. No full shared financial review was duplicated. Actual model/effort, tokens, cost and active time remain null; no fallback observed; savings not established.

Completed: `2026-09-09T06:24:25Z`. Recorded elapsed: **142 seconds (2m22s)**. Coordinator browser results were not yet received at completion. Findings apply to recorded source snapshots; fixes require a bounded follow-up.

## Bounded fix follow-up

Started `2026-09-09T06:28:11Z`. Source: dirty working tree after `78060c78a773d053824fc429cd247dea94401a7d`; requested model/effort `gpt-6-astra/high`, actual model/effort and usage/cost null (metadata unavailable). No browser/session/container use.

**A2 resolved by source review and isolated renderer check.** The kind selector now loads the latest matching entry from `program.policies`, selected kind persists under a tenant/run-specific storage key, and refresh reselects current server policy. Subscription credit preview explains invoice reduction and explicitly disclaims a cash payout. Independent renderer assertion with credit25%/window45/hold2 passed and rejected a marker cash-payout schedule. The extended browser test now covers credit30% save/reload and switching back to cash25%; its execution remains owned by coordinator.

**A1 send-selector defect resolved, row-label defect remains in the source sampled by this follow-up.** The transfer map now filters exact revision AND hash, making the new Anna obligation selectable. Independently ran `node --test tests/a-registry-view.test.mjs`: exit0, 1 test file passed, no skips/failures, Node-reported147.645783ms. Read its actual seed→v1send→advance7→v2prepare/approve assertions. However `views.mjs:72` still renders `registryBadge(visibleStatus)` for an unsent current row. The aggregate artifact status can be `partially_sent` solely because a historical revision had a transfer; thus the entirely unpaid v2 Anna row now says 'Отправлен частично'. The focused test only excludes `badge state-sent` and does not reject this false partial-send badge. Coordinator was notified immediately. A row-specific approved/draft/stale status is required before fully closing A1.

Invitation text now clearly limits the link to the current-session F1 preview and discloses separate initial conditions in another browser, resolving the earlier copy caveat without creating public publication scope.

Follow-up source SHA256:

- `variants/a-merchant/app/app.mjs`: `19dadc1c8cc12ad53f62bee534410566058fbdb09ba4c72444832d268bdca906`.
- `variants/a-merchant/app/views.mjs`: `1b738eef55a1221371915af5ff02873dbbdd129a068e5c15b7fe9a4363448bce`.
- `tests/a-registry-view.test.mjs`: `e95c81e06947c2e766fb104c90e7facd7a8932d408667087fad7f25c808fbf56`.

Criterion update: AC-a-merchant-1011 now met within reviewed F1 scope; AC-a-merchant-1032 remains not met pending truthful row label. Other criterion verdicts unchanged. This follow-up does not claim browser E2E/keyboard/mobile acceptance or independently rerun the coordinator's reported mutation result.

Follow-up completed `2026-09-09T06:29:14Z`; recorded elapsed **63 seconds**. Active time/model usage unavailable. Any later row-label edit supersedes the sampled views hash and requires a short recheck.
