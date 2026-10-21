# Public ingress network collision closure

RUN_ID: 20261014T064554Z-public-ui-53d8
WORK_UNIT_ID: public-ingress-network-closure-1
Attempt-ID: network-closure-1
Source-Revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Build-Revision: null
Launch-SHA256: a263151d94652de43f5a0c915b353db22417c3986144b1861da70e46fa0753b3
Finished-At: 2026-10-14T07:07:10.001587+00:00
Verdict: PASS — bounded network configuration correction; public TLS/E2E are separate pending evidence.

Scope: independent read-only review of `compose.public.yml` after Docker dynamically assigned web the address reserved for proxy. Coordinator fixed `web.networks.edge.ipv4_address` to `${N8_WEB_EDGE_IP:-172.29.8.3}`; proxy remains `${N8_PROXY_IP:-172.29.8.2}`. No product files, runtime, or previous receipt were changed by reviewer.

Current compose.public.yml SHA256: 0f92b35203bf4c826d3799ae6ee85aeb6f35169c8d77aee478bae5d777491436

## Checked evidence
- Read corrected overlay and compared seven source hashes to `public-ingress-review-1/source-snapshot.json`: peer.ts, server.ts, config.ts, http.ts, billing.ts, Caddyfile and base docker-compose.yml all unchanged.
- Independently normalized actual Compose configuration through `docker compose -f docker-compose.yml -f compose.public.yml config --format json`; process exit0. Parsed in memory and disclosed only topology/selected nonsecret fields.
- Assertions passed: proxy172.29.8.2 and web172.29.8.3 are distinct and inside172.29.8.0/24; exact application trustedProxyIP remains proxy172.29.8.2; proxy joins edge only; web joins default+edge; DB and worker join default only; web/DB/worker publish no ports; stack name remains n8-interior-local.

## Security conclusion
Explicit distinct addresses remove the observed allocation conflict without broadening proxy trust. Caddy still reaches web by service DNS on their shared edge network. The server sees the Caddy source socket as172.29.8.2, independent of web's destination address172.29.8.3. Browser-provided forwarding headers remain stripped, auth/share rate identity uses the separately sanitized client field, and payment source verification still uses actual socket. No socket/client invariant drift found. Base DB configuration/volume naming are unchanged; DB uptime was reported by coordinator but was not independently rechecked in this narrow source scope.

No app test repeat was necessary: app code is hash-identical to reviewed source; affected Compose topology was revalidated. Coordinator reports234/234 tests, audit0, build exit0 and second deployment exit0; those claims are not independently promoted to runtime PASS in this receipt. External TLS, deployed network inspection and browser E2E stay with coordinator evidence.

Profile: compact-quality-first-v2. Requested model: inherited Astra/high reviewer role; actual model/effort, token usage and cost:null (host metadata unavailable). Formal closure elapsed:65.495seconds, including reading/checking/receipt creation; below5minute budget. No global model/Ruflo/daemon changes. Previous receipt remains immutable. No unresolved finding in assigned scope.

Status: completed
