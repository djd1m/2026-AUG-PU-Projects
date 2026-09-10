# Integrated browser and agent-client acceptance

Runs the actual compiled Proofwall Next application, actual agent gateway, MCP SDK
Streamable HTTP client, A2A JSON-RPC requests, Firefox, and isolated PostgreSQL.
YooKassa and Resend are HTTPS HTTP fixtures; this is not actual provider acceptance.

The coordinator must finish the candidate build and authorize the dedicated database
before setting `AGENT_E2E_BUILD_READY=true`. Supply `AGENT_E2E_MAIN_SOURCE` as the absolute
P1 source directory, then run `node tests/agent-payments-e2e/run.mjs` from the checkout
containing these tests. Exact invocation:

```sh
AGENT_E2E_BUILD_READY=true AGENT_E2E_MAIN_SOURCE=/absolute/path/to/01-testimonials-senja node tests/agent-payments-e2e/run.mjs
```

Required local tools: Node 22, Docker, OpenSSL, Firefox and geckodriver. The source directory
is mounted read-only. The existing ignored
`.secrets/bridge-test.env` supplies the dedicated internal test database. No deployment
or live provider credentials are used.

A generated `/tmp/ap-e2e-*` directory contains ephemeral TLS keys, synthetic gateway/provider
credentials and runtime logs. Only the existing `proofwall-agent-payments-test_database`
network is attached to the application container. No database or application port is
published. The browser uses its own dynamically allocated loopback WebDriver/proxy and
private session. For snap Firefox, profile storage defaults to `/root/snap/firefox/common`;
set `AGENT_E2E_FIREFOX_PROFILE_ROOT` for another existing Firefox-accessible directory.
Geckodriver creates and deletes its own unique profile within it. Its proxy routes only synthetic Proofwall and hosted-payment origins.
The test preload routes only the expected YooKassa and Resend API paths to a Unix socket
with certificate validation; it refuses all other fetch destinations.

The scenario verifies actual browser signup/login, email delivery and explicit verification,
explicit grant consent, one-time bearer display, MCP/A2A order identity, grant-alone refusal,
explicit hosted first payment and saved-method consent, verified tariff settlement, replay,
independent limited mandate consent, autonomous renewal, gateway restart, valid foreign-resource
rejection and browser grant revocation. Private input controls are hidden in screenshots.

Renewal setup deliberately changes only the generated test account's first budget reservation
to the previous month and moves its tariff expiry into the final two days. That supplies the
otherwise time-dependent renewal precondition without changing production policy or clock.
The browser still issues the mandate and actual agent commands perform all authorization,
provider calls and settlement. This setup is recorded in `evidence/acceptance.json`.

Successful evidence includes exact source hashes, Next build ID, timing, scenario results,
PSP call counts and browser screenshots. It never includes passwords, grants or fixture keys.
Screenshots remain local ignored artifacts; structured evidence is committed. On failure,
`evidence/failure.json` names the observed failure without claiming acceptance.

This scenario exercises native Proofwall purchases without N3 attribution. Host N3 outbox
tests and the separately recorded ordinary human A–D browser suite cover that branch. This
artifact does not claim a single complete agent-to-N3 browser referral chain.

Recorded acceptance: **11/11 PASS**, two fixture payment create calls, 23.219 seconds.
See `evidence/acceptance.json` and `evidence/run.json`. Earlier failure artifacts are
preserved as retry history. The existing login accepts only query-free `next` paths;
the scenario asserts successful dashboard login, then reopens the original pairing URL.
Generated synthetic database records remain in the dedicated test database for inspection.
