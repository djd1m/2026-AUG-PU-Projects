# F03a product implementation receipt

RUN_ID: 20261002T211800Z-f03
WORK_UNIT_ID: n7-f03a-sol
Attempt-ID: implement-a1
Source-Revision: ada9d9b361492777ea8514487fef39546ae60024
Spec-Path: docs/features/f03-dispatch-pool-campaign/01-specification.md
Spec-SHA256: e215f1e53e89b42dccc35e8835209cba31b055f075212b82599fa61368af42be
Launch-SHA256: a0fad0929ea48191bbbcd7bb3e264516781f196147d45e74239a698244195579
Implementation-Revision: 4942969afd095a61fe30b2fd25925f55fe1693ae
Build-Revision: sha256:cf0a7adfb9c98a273256c9526543d7e5995379eec1218f57e6e3d6c7e927535a
Source-Snapshot-SHA256: e929d50be1586e77d54bf312a1323ee41befcf744af31794b6a4a0e1d479d14c
Finished-At: 2026-10-02T21:38:23.872586+00:00
Verdict: pass — six F03a author ACs; independent review pending; whole F03 pending B

| AC | Result and substantive evidence |
|---|---|
| A1 | PASS. Session401/Origin403/foreign404 for owned campaign routes. Complete snapshot validation,5-step/100-recipient/24-hour limits; missing keys/subject, source markup and header CRLF reject. Escaped preview and plain queue payload. Legacy F02 content/version/recipient snapshot authoritative; migration backfills fixed-subject legacy step. Unit bounds and realPG owned API tests. |
| A2 | PASS. Current selected owned mailbox campaign consent required; replay creates0 jobs. Unique versioned enrollment and enrollment-step keys. Enrollment ciphertext excludes address; purpose-prefixed F02 AEAD rejects tenant/ID/credential-domain substitution; separate external recipient HMAC key startup fails closed. Identical edit preserves version; changed edit atomically revokes/cancels. |
| A3 | PASS. RealPG30 eligible count; quarantine/disconnected/withdrawn excluded; absent/incomplete/future/stale polls fail closed. One tenant waiting creates0. Aggregate exposes count/status only; foreign campaigns/mailboxes404. Stable unordered pair/day creates one initial; submitted parent fixture permits one reply, submitted reply never parents another. |
| A4 | PASS. Exact shared F02 lock first; real connection blocker verified; SKIP LOCKED common queue.20 contenders with provider remaining3 claim exactly3. Lease45s; expiry recovery retains exactly3 reservation records; submitting/unknown untouched. Sender rotation asserted. F02 cancellation trigger clears claimed reservation while preserving irreversible charges. No transport calls. |
| A5 | PASS. Durable enrollment/poll/suppression/message-ID seams; internal DispatchSeams writers share lock. No user route manufactures poll evidence. Synthetic local DB poll fixtures only in tests. Suppressed recipient creates0 jobs; claim checks current enrollment/suppression. Actual IMAP producer/reputation still absent, so production freshness stays blocked. |
| A6 | PASS.12/12 unit tests;20/20 realPG tests including full F01/F02 regressions; freshness/quota/consent/tenant mutants fail and restored F03 suite6/6. Type/lint/build and audit/secret/source-image checks pass. No transport/submission tests claimed. |

Exact checks and exits:

- Initial host `npm run typecheck`:127, dependencies absent. No success inferred.
- `bash scripts/check-f03a-heavy.sh`:1 overall; constituent npm ci/typecheck/lint/build, Docker build, unit12/12 and F02 PG passed. Initial PG16/20: F03 rotation fixture clock moved backward; corrected only fixture. Unchanged F01 rate test crossed UTC-minute boundary; final harness ran it within its minute bucket, without auth changes.
- `bash scripts/check-f03a-final.sh`:0; typecheck0,lint0,Docker build0 (including application build), full `npm run test:integration`0 (20/20), freshness mutation wrapper0 with underlying mutated test1, restored F03 test0 (6/6), `npm audit --audit-level=high`0 (zero vulnerabilities). sol-a-final-checks.txt.
- Additional `bash /tmp/n7-f03a-run/mutations.sh`:0. Quota/consent/tenant mutated test exits1 each; sources restored locally and in own container; restored F03 test0 (6/6). sol-a-extra-mutations.txt and sol-a-mutation-{quota,consent,tenant}.txt. Mutation cases now reproducible through scripts/check-f03a-mutation.py; freshness initial raw evidence in sol-a-mutation.txt.
- `python3 scripts/check-f03a-secrets.py`:0; own project and ONLY n7f03a logs, all runtime key domains and contact/credential canaries suppressed/absent. sol-a-secret-scan.txt.
- Source/image SHA256 comparison:0,39 matching files on Node22.20.0, zero local drift and zero image mismatches; repeated after mutation restoration. sol-a-source-snapshot.json and sol-a-image-check.json. Dockerfile/compose locally hashed, not present inside application image.
- `git diff --check`:0. No root/other project/auth algorithm/F02 crypto/network/historical evidence edits; caller launch/manifest/run/events preserved untracked.

Isolation: n7f03a, loopback18703 checked free before start, own network/volume and /tmp/n7-f03a-runtime, no DB host port. CPU2 and available RAM checked. Actual heavy lock intervals21:30:54–21:32:08,21:33:47–21:34:44, plus exact final mutation start/release in sol-a-extra-mutations.txt (release21:36:27). Lock released after every phase. Existing n7f01/n7f02 untouched. Host Node20 only installed checked lock/build tools; runtime tests and image use Node22.20.0.

Reuse: F02 eligibilityTransaction, versioned AEAD, typed errors and tenant/session routing reused internally. Bounded N5 queue-runtime donor SHA2b52eff62e9ef7607bade321e1c30c4363511662 / SHA25658bb6eda462cc395d3fecc5c183e30c55da84ec7c4ee0ab467576d48d9eb19f2 rejected for queue/S3/video/watchdog coupling. No donor code copied, no dependencies added. Full decisions: docs/features/f03-dispatch-pool-campaign/reuse-a.md. Durable seam/accounting handoff: implementation-a.md.

Profile compact-quality-first-v2; substantive XL under unchanged owner-approved plan, mechanical route lower bound S exit0. Requested gpt-6.1-sol/high; actual model/effort/usage/cost null pending host proof, no fallback or model switch claimed. Parent supplied process start21:19:13.628UTC; elapsed to this receipt=1150244ms. Active time unknown because all infrastructure wait boundaries were not measured. Earlier erroneous future progress timestamp explicitly corrected; never used as measured elapsed. Own evidence sol-a-evidence.json; caller telemetry untouched. No comparable savings claim.

F03b final transition/day rollover/irreversible sink/outcomes/retries remains separate. F04 actual IMAP/reply/unsubscribe and F06 UI/browser remain pending. No real SMTP/IMAP, external transport, LLM, charge, deploy or push. Parent owns final manifest integration and fresh independent review; whole F03 remains pending B.

Status: completed
