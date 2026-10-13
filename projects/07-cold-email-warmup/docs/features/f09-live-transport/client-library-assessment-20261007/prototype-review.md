# Independent N7 mail-library review

Source: `530a73fb5498ae873d48e4b05176946bee1734a4`; base `04ccbb65b0fb78dafecc1ab09106a09c5d267fe4`.
Plan SHA256: `db13c414fd1a881f72db70cf87527cf7280a16ccd72198e9d44e36f5ff812b0b`. Fresh reviewer used planner packet, frozen source and raw results only; no author report/chat/receipt oracle.

**ImapFlow FAIL; Nodemailer INCONCLUSIVE. Combined replacement is not recommended.** Seven wrapper tests pass (native exit0); they do not approve compatibility. Negative assessment is complete and can be published. No false PASS requiring frozen README/source correction was found.

| AC | Verdict | Evidence / limit |
|---|---|---|
| I1 | PASS | Read-only EXAMINE, numeric UID1:9 fixed authenticated UIDNEXT10/UIDVALIDITY7, sequence1 returning UID3, selected BODY.PEEK partials; readOnly mutation changes EXAMINE to SELECT and assertion fails. |
| I2 | PASS | Out-of-range and duplicate reject; no tagged completion rejects; changed UIDVALIDITY explicitly resets; sparse normal UID3 completes only after tagged OK. |
| I3 | PASS | Metadata partial8192/text32768 observed; normal bounded MIME/text and oversized/unsupported metadata rejection; no whole-message/attachment request. |
| I4 | FAIL | Advertised64MiB and partial-ignoring8MiB fail LiteralTooLarge via supported public cap before literal accumulation; RSS deltas2752512/2609152B; sent1377/33120B, elapsed345/289ms. Total receive invariant concretely fails on aggregate scenario1134545B; total pending<=128KiB is unproven. Child baseline/peak include rss,heapUsed,external,arrayBuffers; sampling alone is not allocation proof. |
| I5 | FAIL | Observed deadline/stalled TLS, greeting, auth, literal and trickled literal close/exit; positive numericIP/SNI and certificate negatives pass. No independently changed resolver/endpoint witness. No-LOGIN-fallback violates common gate R2; fallback lifetime bound R3 incomplete. |
| S1 | INCONCLUSIVE | Implicit/requiredSTARTTLS, verifiedTLS-beforePLAIN, exact UTF8 MIME/dot de-stuffing, one recipient/message/connection and bad certificate no-auth/no-body pass. Independently changed resolver/endpoint after pin witness missing. |
| S2 | PASS | DATA450/550 and disconnect after RCPT before354 nonaccepted with zero body; owned publicReadable never produced a byte for drop-pre. False marker proves no supplied MIME, true marker remains conservative. |
| S3 | PASS | Body/final drop unknown_delivery with one attempt/connection, body bytes observed; changing unknown to accepted makes the fixed assertion fail. |
| S4 | PASS | Only complete final250 accepted; truncated250 unknown; final450/550 rejected; MAIL/RCPT250 never alone publishes accepted. Public SMTP callback parser and classify guard inspected. |
| S5 | INCONCLUSIVE | StalledTLS/greeting/auth/final, slow-body and trickled-final deadline outcomes and exact native joins pass. Trickled greeting/auth and explicit abort before first MIME byte missing; exact cleanup fallback contract fails common harness R3. No full cancellation matrix PASS. |

Confirmed findings:

- **R1 high** — frozen/scenarios.json[11]: complete, received=1134545, peer.sentBytes=1134545, elapsed=459ms; this passing counterexample exceeds1048576B. public maxResponseSize resets per response (imap-stream.js187-190,277). Paths: imap.mjs:4, imap.mjs:16, test.mjs:34, fixture.mjs:64. Remedy: Retain explicit compatibility FAIL/reject adoption. A later receive cap would require a separately demonstrated supported public enforcement path; no parser/private-hook work is requested.
- **R2 high** — No loginMethod override is configured. With AUTH=LOGIN but no AUTH=PLAIN, public implementation chooses SASL LOGIN; with neither capability it executes LOGIN. Frozen fixture only advertises AUTH=PLAIN, so raw normal scenarios cannot rule these branches out. No targeted execution needed to establish reachable source branches. Paths: imap.mjs:4, node_modules/imapflow/dist/esm/imap-flow.js:1536, node_modules/imapflow/dist/esm/imap-flow.js:1545, node_modules/imapflow/dist/esm/imap-flow.js:1556, node_modules/imapflow/dist/esm/commands/authenticate.js:210. Remedy: Record additional compatibility FAIL in decision evidence. Public auth.loginMethod=AUTH=PLAIN prevents SASL-LOGIN selection, but alone cannot suppress imap-flow.js1556 LOGIN fallback with neither auth capability. Before claiming PLAIN-only compatibility require a supported public enforcement path and negative capability fixtures observing zero LOGIN/credential emission, or retain FAIL.
- **R3 medium** — Fallback watchdog is7000ms and await exited/closed has no second bounded exact-exit wait. All39 observed scenarios exit normally in<=675ms; these successes do not exercise or validate the prescribed cleanup fallback. Paths: test.mjs:19, test.mjs:21, test.mjs:22. Remedy: For any future full-gate PASS, cap graceful wait at5s and separately bound the exact child exit/close wait after SIGKILL to5s. Preserve failed/missing join outcome; a stuck owned child must stay coordinator-owned. Current negative assessment can be published with this limitation, without repairing frozen source.

All62 source/evidence/public-API digests match; plan and runtime hashes match; isolated HEAD is exact and worktree clean. Frozen39 scenarios have exact native exit/close0 and one accepted/closed peer each, zero final sockets/listeners/timers; their PIDs are absent. No reviewer child/socket/key/mutation was created. Both fixed guard assertions fail for frozen mutations; mutation files and owned key/public fixture directories are absent. Safe evidence scan finds no private PEM or encoded PLAIN canary.

No tests rerun: existing raw and supported public source decisively establish the negative verdicts. Product migration and all later integration/DB/cadence/live-provider gates remain unestablished. Requested profile: model-routing-econom, gpt-6.1-sol/high; actual model/effort, tokens and cost are null (host measurements unavailable); no savings claim.

Artifacts: review.json; hash-checks.json; joins-privacy.json; telemetry.json; final-seal.json.

Verdict: completed_negative_assessment
Status: completed
