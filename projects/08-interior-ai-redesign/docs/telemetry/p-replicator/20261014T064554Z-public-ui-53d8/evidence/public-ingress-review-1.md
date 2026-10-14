# Public ingress bounded source review

RUN_ID: 20261014T064554Z-public-ui-53d8
WORK_UNIT_ID: public-ingress-review-1
Attempt-ID: closure-1
Source-Revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Build-Revision: null
Launch-SHA256: 0130db95425207edefb0c057a3038bd629c4f2b58355aae1a2940f76108de83d
Finished-At: 2026-10-14T07:02:25.145784+00:00
Verdict: PASS for bounded plan/source review only; runtime/public-delivery acceptance remains pending.

Reviewed-source snapshot: public-ingress-review-1/source-snapshot.json
Snapshot-SHA256: 6ec5b5b1b054d18544dc07d8ff3c0469406104cda946641f6ba37b3f86ef01d8

## Scope and authority
Read-only independent review of the accepted public sslip HTTPS plan, exact proxy trust boundary, Docker topology and browser-image/driver configuration. User authorization supersedes historical local-only wording; paid inference/payment remain excluded. Product edits, package installs, container starts/restarts and public mutations were not performed by this reviewer. Only this receipt and its source snapshot were written. Root owns deployment and E2E acceptance.

Read root/project CLAUDE, model-routing/telemetry, complexity, project-work-companion, deployment/Compose/webhook rules and relevant project rules. Read requirement/architecture/pseudocode passages. Canonical root dz recall used bilingual public proxy/headers/rate query: returned unrelated job-consent lesson, not adopted as a new requirement. Applied existing lessons: test configuration seams, preserve exact socket identity for billing, bind evidence to actual source, never call pending checks pass.

## Findings and closure
1. Resolved: public overlay initially lacked explicit name required by compose-hygiene. Coordinator added `name: n8-interior-local`; reread confirms existing stack identity is retained.
2. Resolved scope hardening: E2E driver originally opted into any matching n8 IPv4 sslip hostname. Coordinator restricted hostname to `n8.77.83.87.178.sslip.io`; reread confirms restriction.
3. Recorded plan adjustment, not a defect: browser service memory is 2 GiB with 1 GiB shm, instead of dispatched 1 GiB memory. Coordinator justified three installed browser engines and will reconcile plan/telemetry. No DB/provider credentials are supplied to browser service.
No unresolved source blocker found in this bounded review. No finding quota was imposed.

## Evidence reviewed and independently checked
- `peer.ts` admits exactly one literal client IP only from normalized exact configured socket peer; missing/duplicate/list/invalid trusted values fail closed. All reserved raw and normalized headers are removed and rebuilt. Generic forwarding headers remain untrusted.
- `server.ts` passes validated config to the sole listener. `http.ts` uses trusted client for auth/share rate identity; mutation rate remains account based. `billing.ts` still uses `requestPeer`, the actual socket. Public live payments would fail the proxy-source check, which is intentional fail-closed behavior and outside current off-mode scope.
- Config trust is optional/default disabled, rejects CIDR/wildcard/list/whitespace and requires HTTPS. HTTPS canonical origin controls existing Secure/HttpOnly cookie behavior.
- Independent Node24/tsx in-memory assertions exited 0: exact mapped proxy/client separation; six malformed trusted-header cases; three untrusted peers; disabled trust; literal config normalization and invalid/HTTP rejection. No fixture/source files were changed.
- Read `PUBLIC-IP-1..4` tests. Coordinator log `public-peer-tests-1.txt` reports 4 files / 25 tests passed. `public-lint-1.txt` and `public-typecheck-1.txt` show expected commands and no diagnostic errors; original process exit codes are coordinator-owned, not reconstructed from empty logs.
- Independently ran `docker compose -f docker-compose.yml -f compose.public.yml config --format json` and parsed output without exposing credentials. Exit 0. Only proxy publishes TCP 80/443 on 0.0.0.0; web publishes no port; db/worker only default network; proxy only edge at 172.29.8.2; web default+edge; manual/off modes and exact public HTTPS origin wired. Correct `!reset []` removes inherited web publication.
- Caddy fixed header replaces incoming client values per [official reverse_proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers). Fixed socket address and isolated edge network agree with application trust config. Caddy TLS/admin persistence and loopback healthcheck examined; no Caddy active upstream health probe lacks the required header.
- Donors read: 01 compose.demo.yml, 03 config/public-web/Caddyfile, 06-rag-sales-chatbase compose.stand.yml. Their old external proxy networks/VPS are not reused on this host; standalone edge approach is justified.
- Browser Dockerfile extends the existing Node24 application image containing locked Playwright1.60.0 and installs Chromium/Firefox/WebKit with deps. E2E compose has separate project name, no service secrets, bounded memory, restricted privileges, explicit public opt-in and fresh evidence-root/attempt checks. Actual successful image build is not yet evidenced.

## Mandatory runtime gaps at handoff
Application/browser build receipts, image digest/source binding, mutation/full required regression evidence, external DNS/TLS/HTTP redirect/401/header-cookie/rate-spoof checks, read-only E2E preflight, real public 21-step journey, keyboard/390px/desktop/error preservation checks, Firefox/WebKit smoke, and final source/build reconciliation remain coordinator-owned pending work. This receipt is not a public-release or E2E PASS. Any later product changes require affected review/check closure against the new hashes.

## Telemetry and limits
Profile: compact-quality-first-v2; substantive tier L. Requested model: gpt-6-astra/high; actual model/effort: null because exact host execution metadata is not exposed to this agent. Usage/tokens/cost: null, unavailable; no estimated counters substituted. Initial review began before formal launch JSON; that launch explicitly records the gap and is not backdated. Formal closure elapsed: 447.986 seconds. Measured observation interval since first captured clock at 06:52:50 UTC: 575.146 seconds, a lower bound on full agent wall time; initial reading/coordination time is not reconstructable. Coordinator requested closure within original 15-minute budget while builds/deployment continue. No global model/Ruflo/daemon config changed by reviewer. Savings not established.

Status: completed
