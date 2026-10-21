# Public ingress capability correction closure

RUN_ID: 20261014T064554Z-public-ui-53d8
WORK_UNIT_ID: public-ingress-capability-closure-1
Attempt-ID: capability-closure-1
Source-Revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Build-Revision: null
Launch-SHA256: d993ba3d31098bdabc69b5b4f5676778bdaa400ce63c41948ef811b659af426d
Finished-At: 2026-10-14T07:09:22.991142+00:00
Verdict: PASS for narrow capability/network correction, including read-only runtime capability inspection.

Supersedes only overlay hash from public-ingress-network-closure-1.md; both earlier receipts remain unchanged. Current compose.public.yml SHA256:0f92b35203bf4c826d3799ae6ee85aeb6f35169c8d77aee478bae5d777491436

## Concrete finding and resolution
Coordinator observed the pinned official Caddy executable fail with EPERM under cap_drop ALL and attributed this to its NET_BIND_SERVICE file capability. The correction adds only `cap_add: [NET_BIND_SERVICE]`, retaining `cap_drop: [ALL]`, `no-new-privileges:true` and no privileged mode. The original EPERM/file-capability cause is coordinator-reported; reviewer did not independently reproduce the failing startup. The narrow capability permits binding privileged listening ports; no SYS_ADMIN or broad privileged container permission was introduced.

## Independent checks
- Read latest overlay. Normalized Compose JSON process exit0; assertions verified exactly cap_drop ALL, cap_add NET_BIND_SERVICE, no-new-privileges true, privileged false. Proxy/web remain distinct172.29.8.2/172.29.8.3; trustedProxyIP remains172.29.8.2.
- Read-only `docker inspect n8-interior-local-proxy-1`, retaining only selected nonsecret output: Running=true, Health=healthy, CapDrop=[ALL], CapAdd=[CAP_NET_BIND_SERVICE], SecurityOpt=[no-new-privileges:true], Privileged=false, sole network n8-interior-local_edge at172.29.8.2. Process/assertions exit0.
- Rechecked SHA256 of peer.ts, server.ts, config.ts, http.ts, billing.ts, Caddyfile and base docker-compose.yml against initial reviewed-source snapshot: all identical. No socket/client trust drift. No application tests repeated for unchanged code.
- `public-deploy-3.txt` shows proxy recreated/started. Deployment command was executed by coordinator, not reviewer.

Scope limits: no reviewer install/restart/deploy or product edit; only a fresh receipt was written. Coordinator now reports successful HTTPS ready200 and certificate evidence; TLS, application public request checks and browser journey acceptance remain separate evidence and are not claimed by this narrow capability receipt. No unresolved finding in assigned correction.

Profile:compact-quality-first-v2. Requested model: inherited Astra/high reviewer; actual model/effort and tokens/cost:null, host execution counters unavailable. Formal elapsed:89.484seconds. Initial capability inspection began at07:07:45UTC, slightly before formal launch07:07:53UTC; this chronology is disclosed, not backdated. Original five-minute correction budget retained; no global model/Ruflo/daemon changes.

Status: completed
