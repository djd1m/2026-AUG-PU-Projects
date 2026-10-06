# F09-R1 narrow correction A4
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f09-review-fix-a4
Baseline-source: 35039ad32e933d7a4d0bf0f7621f7722e5774ef6
Source: e043bb270a8dec50d2e090379ffff5f655a3461f
Result-source: e043bb270a8dec50d2e090379ffff5f655a3461f
Spec-SHA256: 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9
Launch-SHA256: a153b2e62e09ab3a08276606c113281885f9af64cf83d04b25c0c78043d3cf88
Started-At: 2026-10-06T14:10:02.332726+00:00
Finished-At: 2026-10-06T14:17:23.605228+00:00
Duration-seconds: 441.272502
Deadline: 2026-10-06T14:18:02Z
Profile: compact-quality-first-v2
Requested-model: gpt-6.1-sol
Requested-effort: high
Actual-model: null (host_not_exposed)
Actual-effort: null (host_not_exposed)
Usage: null (host_not_exposed)
Cost: null (host_not_exposed)
Verdict: confirmed F09-R1 correction verified; ready for fresh narrow independent review, not whole-project delivery

Scope: three allowed files only: src/dispatch/smtp.ts, tests/f09-live-protocol.test.ts, tests/f09-transport-fixture.ts. transport-channel.ts unchanged. No grant/schema/authority/UI/dependency/global/canon/telemetry modifications, push/provider/spend/deploy.

Fix: existing TransportBudget.phase now covers whole command write/drain plus all multiline response lines for EHLO, STARTTLS, MAIL, RCPT and DATA command. Greeting receives a whole reply budget. AUTH initial response, optional334 challenge, response write/drain and final235 share one10s budget. Total90s and final-DATA30s, bodyStarted outcome classification, socket cleanup and native TLS guards remain unchanged.

Real regression: TLS peer continuation/challenge arrives6s and final response12s. Final affected tests12/12 passed,39796.004ms, including literal parent ambiguous SMTP and UID reset preserve recovery safety and existing classification/IMAP/TLS/backpressure/resource tests. EHLO elapsed10012.018ms returns pre_data_transient/no_data_submitted, commands only EHLO; AUTH elapsed10018.004ms returns same proof, commands EHLO/AUTH/AUTH_RESPONSE. MAIL/DATA0, sockets0 after cleanup. Application timers are conditional on scheduling; no unsuspended OS hard-real-time claim.

Mutation: exact old35039 SMTP bytes restored temporarily against independent EHLO and AUTH guards. Both tests red(0/2), exit1: EHLO accepted12034.203ms and AUTH accepted12023.071ms with MAIL/RCPT/DATA. Harness0, restored byte SHAbe65ba01ba2349c52de66806d337b285321a868d0b6c1f80bd1e45ed4e020887 verified. Original reviewer probe/result preserved untouched; copied reviewer-original-* are historical inputs, not newly executed probe claims.

Actual check exits:
{
  "affected-protocol-parent.exit": "0",
  "mutation-old-phase.exit": "1",
  "diff-check.exit": "0",
  "affected-final.exit": "0",
  "typecheck-final.exit": "0",
  "lint.exit": "0",
  "typecheck.exit": "0",
  "build.exit": "0",
  "lint-final.exit": "0",
  "mutation-run.exit": "0",
  "build-final.exit": "0"
}

Type/lint/build all0 on final source, diff check0. Source/build inventories: source-manifest.json and build-manifest.json. Source manifest SHA=12f79eff577af1d4e3f06181ecc16fc98152e90442cfe16d1e325b29e0f40524; build manifest SHA=53fd7dc35be75e492e7d5568779f2469002e3782db650dada795ef3e5732c82a. secret-canary-scan.json0hits in11logs, including actual runtime secrets and plaintext/base64 fixture credentials; values never emitted.

Composition: unchanged-components.json exact baseline/candidate bytes match channel, slot/lifetime/child ownership, IMAP/store/adapter, submission/message and untouched PG/physical/unit tests. Prior A3 source-bound147PG/57unit/physical123.55s/mutation results remain unchanged component inputs per coordinator instructions; no broad unchanged suites repeated for comfort. Changed default protocol fixture behaviors were retested by affected TLS/IMAP/parent suite. Historical failed A1/A2 and independent NEEDS_WORK review preserved; this attempt fixes only confirmed R1.

Runtime: Node22.20, existing read-only node_modules, heavy mutex. Local disposable database n7f09_a1 with current_database guard in parent fixture; default n7 untouched. No active own test process remains; all affected commands completed. Browser not_applicable: UI unchanged.

Remaining: fresh narrow independent Astra review of exact candidate/spec and R1 timing evidence; coordinator owns review/canon/telemetry/integration. No outstanding author implementation or affected checks.

Status: completed
