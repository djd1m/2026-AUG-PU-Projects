# N3 C partner independent review
Reviewer family: codex
Spec revision: sha256:03af9e0e338d19fc2c86dfa5e2d4da7525d358f8bd00f8f8fe545052c59268a8
Status: source review complete; one MEDIUM recovery finding requires correction.
Started: 2026-09-09T07:11:55Z
Source: /tmp/n3-c-ui-work at 2f9cd978bdf1bbc2c5f1bcd963752e9d2942a30c plus untracked C app files; hashes recorded below.
Profile: compact-quality-first-v2; requested gpt-6-astra/high; actual model/effort, usage/cost null (execution metadata unavailable).
Trace: projects/03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T070308Z-go-c-partner in coordinator main project.
Read-only worktree; no browser/server/Docker activity.

## Decision

**Changes requested for one MEDIUM error-recovery defect.** No financial-integrity, wrong historical-rate, implicit merchant-read or other-partner data-exposure defect was found in this bounded review. The prior operator-gate correction is present: boot calls only partner reads; ordinary history refresh remains partner-only; merchant reads occur after the explicit operator-lab action, and limited partner sessions render no lab.

Inputs: C PRD and all eight specification criteria, shared runtime contract and relevant previously reviewed projections/access/enrollment/registry code, C app/views/HTML/CSS. No browser/Compose integration acceptance inferred from these sources.

## C1 — MEDIUM — failed initial operator-lab load breaks ordinary inline Retry

In `variants/c-partner/app/app.mjs`, the `open-operator-lab` callback sets `labActive = true` before `await refreshLab()`. If the first merchant program.read fails, `labProgram` is still undefined. The catch displays inline Retry, whose handler invokes `loadAndRender()` and only refreshes partner data. It then renders active lab state, and `views.mjs` dereferences `lab.program.policy`, throwing because the lab data never loaded.

Independent isolated reproduction used the actual extracted `bindHistory` code with failing refreshLab and the real history renderer:

1. Initial lab state inactive, no labProgram.
2. Invoke the explicit lab-open click callback; refreshLab rejects.
3. Confirm labActive remains true.
4. Invoke real historyView with available=true, active=true, program undefined; it throws on policy access.

The user may reload or reclick the original lab-open button while that old DOM remains, but the advertised inline Retry cannot recover and navigating back to history can reproduce the error. This is a concrete error-recovery defect, not an authorization bypass.

Fix: commit `labActive=true` only after successful lab-data load, or restore inactive state on failure. A defensive renderer/loading state for absent lab.program also prevents malformed active state from crashing. Add a failure→retry or failure→ordinary-history regression; avoid automatically adding merchant reads to the generic partner refresh as the fix.

## Spec conformance

`met` refers to support for the specific F1 behavior established by source/pure checks and previously accepted shared-core invariants. It does not certify real browser, keyboard, live deployed transport or protocol interoperability. C1 is an additional error-state/NFR blocker even though the eight happy/security-path criteria below are supported.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-c-partner-3011 | met | termsView renders cash kind, exact current percentage, window/hold, payout schedule, policy version/publication date and explicit enrollment status; isolated renderer verified current25% and publication label with no enrollment on read. F1 session-backed terms do not assert production public publication. |
| AC-c-partner-3012 | met | commissionRows looks up each payment's frozen policyVersion in partner.policies; isolated server state with current25% rendered old commission as V1/20%, with its own immutable refund entries. |
| AC-c-partner-3021 | met | Explicit checked consent triggers enrollment.join; share.read follows successful server enrollment and returns own link/text/disclosure. Pure check confirms personal referral URL differs from enrollment URL. |
| AC-c-partner-3022 | met | Shared enrollment dispatch returns existing actor enrollment on repeat; pure repeated dispatch produced one enrollment and identical enrollment ID. Shared facade idempotency/replay behavior remains unchanged. |
| AC-c-partner-3031 | met | partner.read provides own cash entries, summary, hold dates, corrections and dueDate; renderer consumes this projection without recomputing money. Isolated history contained Anna's refund and no Ilya ID, limited session lab absent. Schedule explicitly presents target before fifth and no bank guarantee. |
| AC-c-partner-3032 | met | Transfer rows show stored amount/date/revision/evidence and explicit bank-unconfirmed wording; isolated prepare/approve/send then partner-read render verified evidence and bank unknown. Refresh path obtains fresh partner projection. |
| AC-c-partner-3041 | met | Same partner.read projection includes actor, clock and sourceVersion; valid own read grant passes shared authorization. C UI explains fixture parity and discloses unavailable real wire MCP/A2A; no duplicate financial calculations. |
| AC-c-partner-3042 | met | Pure own-grant authorization rejected known other partner ID, enrollment and registry access; normal UI boot/history never fetches merchant data. Explicit lab separately requires membership-backed merchant actor and is hidden without one. |

## Independent checks

Executed only pure module/controller/template checks, with no browser, running server, Docker or DB activity:

- Current25% vs historical V1/20%, publication label, no automatic enrollment, own refund history and absence of Ilya ID: passed.
- Limited-partner history has no operator-lab control: passed.
- Pure prepare/approve/send followed by own history rendered saved evidence with bank-unconfirmed wording: passed.
- Repeated enrollment returned one ID/record and distinct personal vs enrollment link: passed.
- Own read grant succeeds; foreign partner, grant enrollment and registry read denied: passed.
- Actual lab-open handler failure plus real active-lab renderer: reproduced C1.

No test sources or repository files were changed. Pure checks use domain state in memory, so they do not replace the project's PostgreSQL transactional concurrency evidence. Parent owns Compose/browser E2E; live HTTP, clipboard, keyboard focus, viewport390/1440 and error/retry interaction remain to verify there. Native labeled inputs/buttons, focusable explicit operator panel, visible shared focus rules, aria status/loading and escaped error output exist in source.

## Source binding and telemetry

Worktree `/tmp/n3-c-ui-work`, base `2f9cd978bdf1bbc2c5f1bcd963752e9d2942a30c`, C app untracked at read time. The same app/views hashes were rechecked after pure tests:

| File | SHA256 |
|---|---|
| variants/c-partner/app/app.mjs | 5113cf88a727937492e2e3baf01725777f959d82d4710ff25ffcb45a2b5701c7 |
| variants/c-partner/app/views.mjs | 45fbe08d4da589bdbffad6c416545198d309a5f5e1236f4f17121715c1e9a3f8 |
| variants/c-partner/app/index.html | 4d5800221e063c9f2fe3e054cf1746e515d34d4d273be8eb1169ca8dc33cd0f7 |
| variants/c-partner/app/styles.css | 889bf0c0ea8fc85f8e54891775730eb07d2bec1c9d31442c567aeb3d11799fff |

Actual model/effort and token/cost/active-time counters unavailable; requested Astra high is not evidence of actual execution model. No fallback observed. Savings not established. C1 was sent promptly to coordinator; later fixes require a bounded source-bound recheck.

C1 exact source locations: `app.mjs:132` sets active before awaited load at133; generic retry at86 enters partner-only loadAndRender at63; `views.mjs:81` dereferences absent lab.program.

Completed: `2026-09-09T07:14:06Z`. Recorded elapsed **131 seconds (2m11s)**. No browser result received or inferred; active time/model usage unknown.

## C1 follow-up — resolved

Source: main commit `d0d7403e7fe1cad3d348032eeee512ee11dab762`. Started `2026-09-09T07:16:23Z`; completed `2026-09-09T07:16:35Z`; recorded elapsed **12 seconds**. Actual model/effort and usage/cost/active time remain unavailable/null; requested Astra high unchanged. No browser/server/Docker activity.

**C1 is resolved; no open C source-review finding remains.** The explicit lab callback now awaits successful `refreshLab()` before activating lab state (`app.mjs:132–133`). The renderer also handles absent `lab.program?.policy` by displaying an explicit reload gate rather than dereferencing missing data (`views.mjs:81`). Ordinary inline Retry still invokes only partner reads, preserving the privilege boundary.

Independent isolated recheck executed the actual extracted open-lab handler and real history renderer: first failing lab fetch leaves inactive state; ordinary partner history renders its explicit lab-open gate safely; deliberately malformed active/missing-program state renders a safe retry message; a later successful explicit lab-open attempt activates the lab. All assertions passed. This checks the relevant control flow/rendering, not a browser journey; root's actual failure→retry browser test remains separate.

Source SHA256:

- `variants/c-partner/app/app.mjs`: `093229cedd92fa5483c9888ce8d9bb1f7d3cdd41895859092706cd7556d066c9`.
- `variants/c-partner/app/views.mjs`: `e168141ee9709470a56c69f2d4d5fcdb73e1ca8794d5efcb0e5304d834011808`.

`git diff d0d7403 -- variants/c-partner/app` was empty (project paths supplied from repo root), binding source checks to that commit. The eight Spec conformance verdicts remain met within their stated source/F1 scope. Browser/keyboard/deployment/protocol limits remain unchanged.
