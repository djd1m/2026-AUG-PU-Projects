# Public HTTPS A–D deployment

Scope authorized by owner: publish all4 functional web tiers without SSH; databases remain inaccessible externally. L: public transport/configuration, unchanged financial domain.

Plan: existing Caddy80/443 routes exact n3-{a,b,c,d}.212.192.0.33.sslip.io hosts to unique frontend container names. Frontends join existing talk-ai-public plus n3-frontend in Compose. API stays loopback13030; DB has zero hostports and only internal n3-database. Existing Caddy routes preserved, config validated before reload, backup and source hash kept for rollback. DNS all4 resolves212.192.0.33.

Acceptance: valid HTTPS on all4 public names; actual49 browser tests on public origins incl B foreign frame, D→A exact artifact and mobile390; HTTP403 hostile origins; handoff origin pinned before credential fragment; docs/catalog URLs public; all44existing core tests plus public boundary tests; mutation gates including new mapping guard. Verify live DBnet onlyAPI+DB and no DBhostports; unrelated Caddy sites still respond. Independent review covers deployment diff.

No real financial operations/provider calls; no broad wildcard CORS, arbitrary Host authority, new DB ports or TLS bypass. Initial reconnaissance precedes the formal run timestamp. Account weekly quota monitored from actual rate_limits, not token sums.
