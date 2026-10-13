# UI payment fixture readiness correction

Run `n8-20261002-1740`, work unit `n8-ui-payment-fix`, attempt
`n8-ui-payment-fix-1`; baseline `b2423353b53fc7986ce7c3df2902a76439dddb2a`.

The confirmed browser failure occurred because `runOne()` advances the shared
checkout queue. A preceding intent can consume that pass, or the normal server
worker can own the requested intent's lease. Signaling immediately then fails
with `Run asynchronous checkout creation first`.

`scripts/ui/fixture-driver.js` now delegates payment actions with an intent ID to
the adjacent `payment-ready.js` helper. It rereads that exact fixture intent
before and after queue passes and signals success only when its status is
`pending` and its own provider ID is attached. It adapts the F03b integration
helper's target-specific reread; unlike that donor's progress assertion, a false
worker result waits briefly because an active target lease is normal here.

The helper performs at most 100 worker passes, uses a monotonic 10-second
readiness deadline, and sleeps at most 50 ms between passes. It does not edit
leases, retry timestamps or provider bindings. Missing, terminal, wrong-mode and
exhausted intents fail explicitly; read/worker errors propagate. Existing
dedicated database/storage/origin guards remain in the driver, and the helper
checks the nonproduction fixture mode and UUID before any injected test callback.
The existing no-ID queue-advance action is preserved.

| Acceptance criterion | Evidence |
|---|---|
| Older claimable intent and temporarily leased target | Regression simulates older progress followed by two no-progress passes; no signal until target readiness |
| Signal only the requested intent | Every readiness query and the single signal assert the target ID; preceding intent remains pending |
| Missing and terminal intent | Explicit rejection before worker/settlement, including terminal transition during a pass |
| Bounded exhaustion | 100-pass cap with a frozen test clock; deadline during worker work and readiness reads rejects late success |
| Strict fixture guards | Runtime/mode/UUID, dedicated DB and storage rejection tests; guard code unchanged |
| Regression detects old behavior | Temporarily replacing the helper with one-pass signaling fails `Success requires target readiness, not another intent`; original bytes restored |

Final checks: `node tests/ui-payment-fixture.test.js` passes all 10 tests;
`npm run build` and `git diff --check` exit 0. PATH starts with
`/tmp/n6b-f06-node22/bin`; Node reports `v22.22.3`. Commands, exit codes,
timestamps and raw-log hashes are in `checks.json`. Raw logs remain outside git
under `/tmp/n8-ui-payment-fix`.

These tests are local helper simulations, including injected queue/clock/signal
operations. They do not claim browser, real PostgreSQL race, GPU or provider
acceptance. The readiness deadline controls retries and eligibility to signal;
it does not cancel an already-running database/worker operation. Actual browser
E2E and independent review remain with the parent coordinator. Production
web/payments/provider/ledger files and manifests are unchanged.

`source-snapshot.json` binds the corrected source and all covered baseline
comparisons to a SHA-256 build revision. `progress.json` records stage boundaries,
the initial local-config failure and correction, model/usage gaps and duration.
The parent owns the existing aggregate run and work record; this worker does not
rewrite them. No delegation, Docker, network, installs, secrets, other-project
edits, global settings or commits were used.
