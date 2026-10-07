# Independent N7 transport operator code review — A1

Verdict: **MUSTFIX** — one confirmed P1 defect. Review completed; candidate is not accepted.

Work-Unit-ID: n7-live-mail-operator-review-a1
Source-Root: /tmp/n7-live-mail-operator-source-a1-20261007
Source-Revision: 017a33b1bb2e0fc0796ed6186b419d9b6d907643
Baseline: 7acee11e69c5d7745d73aac603d5a85dbe63a63a
Launch-SHA256: b55b581034f3e88eceafbe3b75b9b6fb4f5200bbdaf64b433b8fd13ae6e3e892
Planner-SHA256: 8bab0dc3a359e38ecc1e2492fb688d6f7839b17dfa4b51ab0fc0b69ec56260fd
Validated-Plan-SHA256: 7c1fcd1e7f2a111529fa3e5cc43f8024f4cebbd5dfbdcaffac5133cc5737dc08
Finished-At: 2026-10-07T21:34:20.042851+00:00
Profile: model-routing-econom; requested independent gpt-6.1-sol/HIGH. Actual model/reasoning/usage/cost: null (host execution evidence unavailable). Elapsed: 180.711 seconds from preallocated launch; bounded attempt: 480 seconds.

Used preallocated clean objective/launch, accepted planner and independent plan-validation packet, frozen baseline/candidate, existing publisher/config/DB/runtime/base Compose contracts and raw machine check evidence only. No author chat, notes, authority notes, reasoning or receipt were read. Root/project CLAUDE and applicable rules were read. Source worktree omits shared policy/companion files; those were read from the repository instructions path. Companion preparation/handoff semantics apply; E2E preflight is not_applicable because this review ran no E2E or actual DB/provider operation. No deployment, installation, pull, image build, grant, mail, charge, push or secret read occurred. Source is unchanged; only pre-existing untracked node_modules symlink remains.

## N7-OP-001 — blocking FIFO input prevents fail-closed publication

P1 / mustfix, src/mailboxes/transport-operator.ts:11–13. The new reader opens with blocking `r` before checking descriptor `isFile()`. A FIFO without a writer blocks in open, before regular-file rejection. With valid action/IDs/revision/auth and ready DB, this keeps the old authority active indefinitely instead of forwarding invalid raw into the existing committed revocation transaction; no typed failure or pool cleanup occurs. Baseline stat-before-read rejected this non-regular input.

Independent bounded probe used the sealed built CLI with injected fake config/pool/publisher and an empty private FIFO. After 2.012 seconds it timed out with no stdout/stderr: fake publisher and cleanup were never reached. The supervising Python subprocess timeout killed and joined the child; FIFO was removed. The probe used no DB/network and left source unchanged. Evidence: fifo-probe.mjs and fifo-probe.raw.json in this review directory. Built operator SHA256 b92b36f9c3511bf8f891438c98eaa784b7367c0e52582e5771bd75b622955f5c matches the raw supplied build manifest.

Required correction: nonblocking `O_RDONLY | O_NONBLOCK` open followed by descriptor regular-file check and guaranteed close; retain 16KiB cap and invalid-raw publisher path. Add focused bounded FIFO test that verifies publisher receives invalid raw, nonzero typed result and pool cleanup. Do not change accepted publisher/config/runtime contracts.

## Contracts checked

- Baseline already has the CLI. Positional publish/revoke arguments and successful JSON `{"revision":"…"}\n` are preserved; no package/runtime/schema/crypto/UI changes.
- Auth is checked before pool/grant read and again in existing publisher. Invalid UUID/argv/revision stop early; stale CAS and tenant/mailbox mismatch preserve current authority. Existing eligibility transaction commits invalid-grant revocation before throwing; candidate correctly maps JSON null, unreadable/oversized/malformed ordinary files to invalid raw. FIFO is the exception above.
- Publisher retains global safety lock, mailbox/grant locks, metadata/current revision/fingerprint/expiry/allowlist checks, tenant isolation, scan invalidation and cancellation of queued/claimed sender or recipient jobs. No campaign start/resume added. Focused DB test witnesses committed invalid revocation, unrelated authority preservation and concurrent CAS with exactly one winner.
- Ordinary descriptor reads cap at 16384 bytes with an extra detection byte, verify regular descriptor and close in finally. CLI catches safe error codes only and hides raw paths/input/native DB messages. Pool close failure emits typed cleanup error and nonzero status.
- Compose adds explicit opt-in runtime-worker using exact `node dist/runtime/worker.js loop`, live poll/dispatch modes, private existing N7 network/DB dependency, zero worker host ports, existing five secret references and CPU/restart settings. Web and worker use the same required N7_ACCEPTED_IMAGE input; coordinator must bind it to reviewed immutable source/image before rollout. Worker has explicit disabled billing and no merchant env/mount dependency. Legacy poll-worker remains excluded by its existing profile.
- Health imports accepted config/DB modules, checks schema readiness, closes its pool and fails on error. Its 10-second timeout exceeds existing 2-second connection and 3-second statement limits. It witnesses readiness only; runbook truthfully separates process/restarts/runtime_due/fresh-poll progress and measured graceful shutdown. No fixture selector or worker HTTP port added.
- Runbook retains original release gates: off-host backup/preserved keys/migrations, exact owner-saved Gmail sender/private settings and live AUTH, scoped grants/consent/capacity, post-grant complete poll, SMTP receipt plus independent inbox receipt, ordinary reply ingestion and full follow-up suppression. These remain coordinator-owned external acceptance, not code-review passes. F11 and merchant setup remain excluded.

## Evidence and remaining checks

All five frozen source SHA256 values exactly match clean-objective.json (listed in findings.json/receipt.json); observed HEAD equals candidate and tracked worktree is clean. Planner hash matches the preallocated value. All referenced raw native-log SHA256 values in checks.json verified byte-for-byte.

Supplied native evidence reports final typecheck/lint/build exit0; focused operator units 4/4 and DB integration 1/1 pass. Auth-bypass and invalid-revoke mutations fail the focused guard (exit1); restored exact-source units pass. Earlier 86/86 unit run predates the final output/cleanup adjustment and is not represented as a final complete regression gate. Static Compose machine witness verifies disabled worker billing with live web billing and excluded legacy poll profile. No unchanged green suite was rerun. This review added only the justified fake-only FIFO probe.

Coordinator owns broader accepted F09/F10/suppression/full/security regressions on the corrected frozen candidate, source/image-bound rollout, encrypted off-host backup and owner Gmail save. Re-review the narrow correction with exact new hashes and related focused results. Root has been notified of the concrete finding and correction; no optional polish or source edit is requested.

Status: completed
