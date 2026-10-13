# F09-R1 independent targeted correction review

## Independent obligations

Read canonical `Refinement.md:85–86` and `Specification.md:161–170` before the previous review or corrected client. They require branding on the initial visible bubble, including while the panel is collapsed; closing the chat must not remove required Free branding. SC-US-009-1/2 and FR-n6b-9 leave the decision to the server, including fail-closed unknown plans and removal only for eligible paid plans with active removal. SC-US-009-3 requires restoration of hidden branding and a tamper event using an observer plus a two-second repeat. `Pseudocode.md:253–256` additionally requires deleted-element restoration inside the shadow root and at most one impression per page load. No F10 behavior is added to this review's obligations.

## Identity and scope

Run-ID: 20261002T223848Z-widget
Work-Unit-ID: widget-r1-independent-review
Attempt-ID: correction-review-1
Source-Revision: 39464ac3c4ac77afd43bf1c15859398b7dd42b12
Source-Snapshot-SHA256: 00f9a5a25dc0506e7df3f2bad58457c407474f0206e777f90b8912456c2f3954
Build-Revision: none
Launch-SHA256: 6c9508b976d29cd34779d38c07ace1c27a2fb69b20c4fbe4a2e9db95710afbc5

Reviewed `08_review.md`, the complete corrected `apps/widget/src/index.ts`, the correction-only diff and existing correction evidence. The coordinator supplied continuity verification for all 19 entries in `tests/artifacts/widget/correction-1-source-hashes.json`; only the widget entry changed. Independently read and hashed the current widget: `c6a052d4becb9f8b4ab40d58c272b08437a8f1eceeed2ccd7c6083910f1601bd`, matching that manifest. This attempt does not claim a fresh review of the other 18 files.

## Finding closure

**F09-R1 closed at source level. No new concrete defect found in this targeted correction.**

| Obligation | Source reasoning |
|---|---|
| Initial collapsed Free badge | Lines 70–72 append the badge to `root`, as a sibling of `panel` and `toggle` (line 56). Config immediately sets the server decision and creates/restores the badge (119–120). The panel's initial `hidden` and `[hidden]` rule no longer hide the badge subtree. |
| Badge after close | Lines 98–105 change only panel visibility, toggle state/text and focus. The badge remains in the visible root. Restoration does not force the panel open. |
| Observer and periodic restoration | Lines 74–97 check the new parent, deletion, text/link attributes, inline style, hidden state, computed display/visibility/opacity, root integrity and stylesheet integrity. Repair restores the actual badge ancestor and stylesheet, recreates the badge under root, and posts tamper. MutationObserver covers shadow descendants and the 2000 ms interval also checks stylesheet changes and detached roots. Removing panel-specific repair is consistent with the panel no longer being a badge ancestor. |
| Impression once | Lines 6–8 retain the page-global, per-bot Set. Lines 67–68 require a connected required badge and record the ID before sending the event; line 94 runs after restoration. Initial collapsed display can now report an impression. Open/close, observer callbacks, interval checks, and badge replacement do not clear the Set or duplicate the same bot's impression. This establishes at-most-once sending, not guaranteed network delivery. |
| Paid-removal absence | `required` starts false, is assigned only from validated server config, and creation at line 120 is conditional. Restoration exits immediately when false; impression is also gated. A normal initial eligible paid-removal load creates no badge and sends no badge impression/tamper. Server policy is unchanged and relies on the prior review. |
| Adjacent behavior | The correction leaves config validation, privacy/input readiness, question request/response rendering, citation safety, toggle/close accessibility and focus behavior intact. CSS is unchanged. No new API or F10 handling appears in the correction. |

## Evidence and limits

Inspected existing correction logs/metadata: typecheck exit 0, widget production-build hook exit 0, 11,932 output bytes and 3,756 gzip bytes against the 30,720-byte limit. These are prior executor results, not reruns here. The initial gzip metadata assertion failure remains disclosed in `correction-1-checks.json`: Python gzip defaults differed from the helper; Node22 measurement corrected the evidence without a product change. The original review and mutation history are preserved; unchanged server mutations were not rerun.

No tests, probes, browser/DOM execution, Docker, network, children, product changes, commits, donor N6 reads, or TRACE/telemetry writes were performed. Only this named report is written. Actual foreign-origin UI under restrictive CSP/hostile CSS at 390/1440 still needs initial collapsed Free visibility, after-close visibility, tamper repair in both panel states, one impression and paid-removal absence. Full unit/real-PG regression, full production build and immutable image evidence remain coordinator gates. Pending planned gates are not a source defect and are not claimed passed.

## Verdict and accounting

**ACCEPT** for the bounded F09-R1 source correction. This is not full feature acceptance or deployment approval.

Profile: `compact-quality-first-v2`. The existing correction route is M (recorded exit 0); the feature's substantive L checks remain preserved. Requested reviewer: `gpt-6-astra`, medium; requested coder: `gpt-6.1-sol`, high. Actual native model/effort, fallback, token usage and billing: null/unconfirmed by available execution metadata; coordinator must reconcile. No model switch or savings is asserted.

First local clock observation: 2026-10-02T23:17:49Z; terminal receipt supplies actual finish and observed elapsed time (launch-to-first-observation overhead unavailable here). Active time and usage/cost remain null. Coordinator telemetry: `docs/telemetry/p-replicator/20261002T223848Z-widget/{run.json,events.jsonl,work-record.json}`. Applied project-work-companion for source-bound delivery; E2E preflight is `not_applicable` because this assignment allows source review only. The 180-second attempt limit includes instruction reading, review and report preparation.

Status: completed
