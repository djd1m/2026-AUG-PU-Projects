# Isolated real Proofwall browser bridge

This harness runs actual P1 Next/worker and N3 application routes. Only YooKassa and Resend are emulated. Root owns all compose files, credentials, migrations, builds, container startup and scheduling. The runner never calls Docker.

Runtime contract:

| Runtime | Command | Required configuration |
|---|---|---|
| N3 backend | `node /bridge/n3-runtime.mjs` | Actual source `/app` or `BRIDGE_N3_SOURCE`; own existing PG env/secret; `BRIDGE_OUTPUT_DIR`; synthetic `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`; TLS/preload below |
| P1 web | `node /bridge/p1-runtime.mjs` | Actual built source `/app` or `BRIDGE_P1_SOURCE`; own P1 DB/storage env; normal bridge config; `PAYMENTS_STUB=false`; `BASE_URL=https://proofwall.aicoding.space`; synthetic YooKassa/Resend credentials |
| P1 worker | Actual worker entrypoint | Own P1 database/storage config and bridge config; same P1 preload; no N3 SQL credentials |
| Host | `node scripts/run-proofwall-e2e.mjs` | `BRIDGE_BOOTSTRAP_FILE`; `BRIDGE_EVIDENCE_DIR`; synthetic provider/mail credentials; trusted `BRIDGE_FIREFOX_PROFILE` and `BRIDGE_FIREFOX_PROFILE_ROOT`; host TLS/CA/socket paths |

Both product backends use `NODE_OPTIONS=--import=/bridge/preload.mjs`, with `BRIDGE_ROLE=p1` or `n3`. Mount this helper directory read-only at `/bridge`. Set `BRIDGE_CA`, `BRIDGE_TLS_KEY`, `BRIDGE_TLS_CERT` to explicit paths; only public CA is shared between products. Worker only needs CA, not an ingress private key. Host provider certificate covers `api.resend.com`, `api.yookassa.ru`, `yoomoney.ru`; P1 certificate covers `proofwall.aicoding.space`; N3 certificate covers `n3-a.212.192.0.33.sslip.io`.

Set container `BRIDGE_SOCKET_ROOT=/bridge-sockets`; host must use a short path, e.g. a `/tmp` symlink to the root-owned runtime directory (Unix socket path limit). Socket groups each contain `https.sock`:

| Group | Writer | Allowed consumers |
|---|---|---|
| `n3` | N3 backend | P1 web/worker, host browser proxy |
| `n3-control` | N3 backend | Host only |
| `p1` | P1 web | Host browser proxy |
| `p1-webhook` | P1 web | Host fake provider only |
| `providers` | Host | P1 web, N3 backend, host browser proxy |

Mount individual directories, not the entire socket root across every runtime. No Docker network is shared across products. P1 webhook socket alone emulates the trusted provider source IP and is absent from the browser proxy. Ordinary P1 ingress overwrites forwarded IP headers with a non-provider IP.

N3 writes private `BRIDGE_OUTPUT_DIR/bootstrap.json` with `tenantId`, `connectorKey` and synthetic fixture login information. Root transfers only the required bridge connector fields into P1 configuration. This directory is never mounted into P1. `ready.json` marks completion of N3 setup. The host runner writes `runner-ready.json` after its external emulators are ready, then waits up to 120 seconds for real P1/N3 services. Host ports are loopback-only and configurable using `BRIDGE_BROWSER_PROXY_PORT` (19143), `BRIDGE_CONTROL_PORT` (19144), `BRIDGE_DRIVER_PORT` (4573).

Firefox must have the public test CA imported into its isolated profile. The runner uses `acceptInsecureCerts:false`; all server requests verify the CA and hostname. No private app endpoints or mail/API provider origins are allowed through the browser CONNECT proxy.

Root-scheduled validation:

```
node --test tests/helpers/proofwall-bridge/transport-contract.test.mjs
node scripts/run-proofwall-e2e.mjs
```

The transport contract test needs the host's isolated CA/provider certificate environment and creates a temporary local TLS socket. The browser runner needs provisioned product runtimes; syntax checks alone cannot prove browser acceptance.

Evidence includes actual signup/proof, native payment return, independent P1/N3 provider verification, durable worker relay, exact test commission, zero live payout, duplicate callbacks, partial refund and explicit P1 manual review. It excludes real mail/provider operations, live money, public DNS/Caddy, outage browser retry, and remaining A–D regression coverage. Root must attach source/build/compose identity and run existing regression gates separately.

Implementation receipt: source files and syntax checks prepared in the isolated `codex/n3-bridge-browser` worktree. Database, TLS runtime, browser and deployment acceptance remain pending root execution. Telemetry: parent run `20260909T170258Z-proofwall-n3`, work `bridge-browser-implementation`; actual model/usage/duration require host metadata.
