# Class checkpoint, 2026-09-09

Source checkpoint: 444d312. Public deployment unchanged from accepted F3 referral release. Access code is committed but NOT deployed/accepted.

Checks: backend154/154 (53.976s); existing public CJM49/49 (30.655s); existing public account + actual MCP/A2A2/2 (8.238s); isolated new access browser2/2 (91.031s, includes61second real admission wait); build123modules A–D PASS. Traceability/report revision/criterion scenarios, canon, source version and file ownership PASS. HTML lesson inspected in browser at1440 and narrow500 without horizontal overflow.

Browser attempt1failed on same-document email proof navigation, preventing registration; second journey then lacked its prerequisite account. App now reloads recognized hash navigation so boot captures and strips proof. Attempt2passed all four origins, explicit activation, login, desktop/mobile, Yandex PKCE stub consent/link/unlink, reset/replay, SSO contact verification, legacy security-only, unconfigured providers and preserved existing login. Providers are isolated stubs; no live emails/consent/payment acceptance claimed.

Two independent core P2findings fixed: verification guard on acceptInvite, account UPDATE lock before password-change session resolution. Dedicated regressions passed. A separate credential-lock race test caught old joined lock ordering and passed after account-first resolution. Existing100000visit-cap test fixture is now populated in5000row batches under unchanged production5second SQL timeout.

TAP evidence has trailing whitespace normalized only; verdicts, counts, errors and timings unchanged. Source hashes in checkpoint-source-sha256.json. Child receipts record requested models; actual child host metadata/usage remain unavailable in this checkpoint. Coordinator actual gpt-6-astra high, profile compact-quality-first-v2. No savings claim. Latest observed account-wide weekly quota15:42:43UTC:36%used,64%remaining; not feature-attributed consumption.

## Resume after class

1. Read frozen f3-access-onboarding01–05 docs, validation report, core review receipt and checkpoint source manifest; verify current Git.
2. Implement required access mutation checks against purpose/reuse/expiry/reset-version/no-email-autolink/state/PKCE/enforcement, restoring source after each. PKCE adapter mutation already has separate worker evidence.
3. Obtain final independent feature review against all12AC, including merged UI and same-document fragment handling; partial core review is not full acceptance.
4. Complete AC→test mapping, architecture/runtime/deployment documentation and review-contract/completion gates. Review five provider guides against final config.
5. Adapt/provision future public account E2E for verification-first registration: current tests/e2e/account.mjs and public-agent.mjs intentionally exercised OLD deployed UI/API before class and will need updates for new release.
6. Only then build/release access-compatible API/frontends and run public E2E. No DB host ports, random secrets, check free ports and exact network membership before starting containers. The ignored0600access.json was provisioned disabled; real Resend/Yandex credentials are not available. Do not disable public registration accidentally without an explicit operational rollout decision and valid mail configuration.
7. Persisted verification enforcement is sticky. Do not downgrade DB policy or revert to a pre-access backend after new identity states exist; use compatible forward fixes.

Current isolated access browser container/driver were stopped by their runner. No further feature started. Root docs/lessons/n3-demo-script.md and n3-p-replicator-prompts.md are user-requested course artifacts outside the otherwise project-local document scope.
