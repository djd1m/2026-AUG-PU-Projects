# Independent N7 transport operator corrective review — A2

Verdict: **ACCEPT** for the frozen scoped code candidate. N7-OP-001 is resolved; no remaining findings. This is code-review acceptance, not a deployment or live-mail claim.

Work-Unit-ID: n7-live-mail-operator-review-a2
Source-Root: /tmp/n7-live-mail-operator-source-a1-20261007
Source-Revision: d469734a0d180479da819781408220ddaecd7039
Prior-Candidate: 017a33b1bb2e0fc0796ed6186b419d9b6d907643
Baseline: 7acee11e69c5d7745d73aac603d5a85dbe63a63a
Launch-SHA256: edbbaa9f0820cb10f755dff50e4fbccbc20e38283004961bf6cd1aa1a51c680c
Planner-SHA256: 8bab0dc3a359e38ecc1e2492fb688d6f7839b17dfa4b51ab0fc0b69ec56260fd
Validated-Plan-SHA256: 7c1fcd1e7f2a111529fa3e5cc43f8024f4cebbd5dfbdcaffac5133cc5737dc08
Finished-At: 2026-10-07T21:38:57.060223+00:00
Profile: model-routing-econom; requested independent gpt-6.1-sol/HIGH. Actual model/reasoning/usage/cost: null (host evidence unavailable). Measured elapsed: 101.411 seconds from preallocated A2 launch; attempt bound: 480 seconds.

Review retained the clean planner/reviewer context and prior independent A1 review. Read new preallocated objective/launch first, then frozen corrective source and allowed raw machine checks/logs. Author chat, notes, reasoning and receipt remained excluded. Root/project instructions and applicable review/companion policy were already read during A1; no unnecessary reread. Source unchanged; tracked worktree clean with only pre-existing untracked node_modules symlink. E2E preflight not_applicable: source review plus injected fake-only file probe, no DB/provider operation.

The exact two-file correction adds Node fs constants and opens with O_RDONLY | O_NONBLOCK before the existing descriptor isFile check. A no-writer FIFO now opens without waiting, is rejected as non-regular, and its handle closes in finally. CLI catches that read failure as invalid raw, retains the existing publisher's committed revocation path and performs pool cleanup. Regular-file reads retain the exact 16KiB cap/extra-byte detection. No accepted publisher/config/runtime/schema/crypto/package/UI contract changed; positional argv and JSON revision success output remain unchanged.

The focused new FIFO regression runs the injected CLI in a supervised child with no DB/network. It asserts publisher called once with {}; result1; empty success output; invalid_input_authority_revoked; and pool closed once. Its 2-second deadline uses SIGKILL and execFile completion joins the child before finally removes temporary input. Raw mutation log shows restoring blocking open makes this test fail at 2042.322ms (suite exit1), while byte-exact corrected restoration passes all5 operator units, including FIFO at461.100ms. Existing focused DB integration passes1/1, preserving committed invalid revocation, tenant isolation, cancellation and concurrent CAS semantics. Typecheck, lint and build each report native exit0.

Independently reran the original A1 fake-only FIFO reproduction against the corrected sealed build. It completed in 0.165871 seconds under the same2-second deadline, emitted FAKE_PUBLISHER_REACHED, FAKE_POOL_CLOSED and CLI_EXIT1; child exited and was joined, temporary FIFO removed. This probe deliberately throws an ordinary fake publisher error, so its safe generic stderr is expected; typed committed-invalid semantics are covered by the candidate's focused test and unchanged real publisher integration. Evidence: fifo-probe.mjs and fifo-probe.raw.json. No unrelated green suite was rerun.

All five candidate source hashes exactly match the preallocated objective, including three unchanged files from accepted A1 Compose/runbook/integration assessment. Frozen HEAD matches and only CLI/unit test differ from prior candidate. All supplied raw native-log hashes and every supplied build-file hash match byte-for-byte; planner hash still matches the original preallocated packet. Exact source hashes are sealed in findings.json and receipt.json.

The prior review's Compose/runtime/readiness/billing independence/runbook assessment stands: exact loop command; no worker/database host ports; same required accepted image input for web/worker; five existing secrets; explicit disabled worker billing with no merchant dependency; config/schema-only health; separate measured runtime progress and graceful-stop witnesses. No correction touched those files or contracts.

Coordinator retains broader general/F09/F10/suppression/security regressions on this candidate and all production gates: immutable reviewed image, off-host encrypted backup/preserved keys/migrations, exact owner Gmail save and working AUTH, scoped grants/capacity/consent, fresh poll, SMTP and separate inbox receipt, normal reply stop across full follow-up window. No deployment, provider traffic, real grant/mail/payment, installation, image pull/build, secret read or push occurred in this review. Source is accepted for the code-review gate; broader checks and live release remain separately coordinator-owned.

Status: completed
