# N3 public HTTPS deployment review
Reviewer family: codex
Baseline revision: be41521f510e62eafe8858eace9817d5462c4035
Reviewed source: be41521f510e62eafe8858eace9817d5462c4035 plus dirty public deployment changes, bound by hashes below
Source manifest SHA-256: 267121a5f42d13242ed5a217b9ef7189e312b25cba36c156774600753dcbc9d3
Started: 2026-09-09T08:32:39Z
Implementation follow-up: 2026-09-09T08:35:56Z
Ended: 2026-09-09T08:37:23Z
Elapsed seconds: 284.845 (includes waiting for implementation; active time not measured)
Profile: compact-quality-first-v2
Requested model / effort: gpt-6-astra / high
Actual inherited reviewer model / effort: gpt-6-astra / high, supported by prior provider execution receipt described below
Current-stage usage / cost: null / null (not collected; prior whole-thread counts are not attributed to this stage)
Trace: projects/03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T082853Z-public-web-access
Outcome: no consequential findings in the bounded deployment source review.
Scope: user-authorized public HTTPS A–D and database isolation; read-only source and pure checks only. No browser, server, Docker, live DNS/TLS probes, deployment, or repository changes by reviewer.

## Conformance and evidence

Paths are relative to projects/03-affiliate-rewardful.

| Criterion | Verdict | Evidence |
|---|---|---|
| Four explicit public UI hosts without widening existing proxy routes | met, source | config/public-web/Caddyfile:2–25 contains exactly A–D host blocks and full n3-a/b/c/d-frontend-1:3000 upstream names. Candidate prefix comparison proved the entire existing Caddy file byte-identical; the only appended content is the project fragment. Runtime TLS and reachability are parent-owned. |
| API origin policy is exact and cannot be supplied through Host/forwarded headers | met, source/pure checks | shared/contracts/deployment.mjs:4 lists only the two local environments and four public HTTPS origins. apps/api/http.mjs:2 imports the exact Set; existing request origin check uses Set.has, not Host or suffix matching. Pure checks reject suffix lookalikes, wrong port, downgraded HTTP, path suffix, userinfo-shaped and null origins. |
| D→A handoff sends credential fragment only to configured A | met, pure check | shared/client/api.mjs:56 constructs a fresh URL from variantOrigin('A', location.origin) before attaching session/artifact fragment. Query and prior href cannot choose destination; unknown current origin throws. The selected public-origins handoff test passed (1/1), without running the server tests. |
| B embedding retains exact parent/child origin, source and schema checks | met, pure checks | variants/b-customer/app/embed.mjs:1 imports configured A origins; existing exactOrigin and exactValueMoment checks remain. apps/frontend/fixtures/embed-host.mjs:4 derives B from the same environment matrix. Pure mock-window checks reject wrong source, suffix origin, extra payload fields and wrong version; valid message triggers once; ready target is exactly public A. |
| CSP does not trust caller Host or widen frame authority to arbitrary domains | met, source | apps/frontend/server.mjs:34 constructs CSP from constant origin sets. frame-src permits configured B plus self; frame-ancestors configured A plus self. No wildcard, request Host, forwarded authority or caller query is interpolated. The existing self embedding allowance remains. API CORS still separately enforces request Origin. |
| Frontend runtime can resolve shared deployment contract in server and browser paths | met, source | apps/frontend/Dockerfile:4 preserves apps/frontend/server.mjs location and copies contracts both under /app/shared/contracts and /app/public/shared/contracts. Server relative import, shared client import, B app import and host fixture import resolve to their intended modules; browser dot-segment normalization reaches /shared/contracts. Parent owns build/runtime checks. |
| PostgreSQL is inaccessible through published host ports and stays separate from frontends/proxy | met, declared configuration | Root docker-compose.yml is unchanged: postgres has no ports, uses database only; database is internal:true with name n3-database. API alone joins database and frontend. Four variant Compose files add public only to frontend; none joins database or receives DB secrets. Live container/network state and external reachability were not inspected by reviewer. |
| Existing shared proxy behavior remains unchanged | met, candidate bytes | /tmp/n3-Caddyfile.candidate starts with exact /tmp/n3-caddy-before bytes, then only project fragment. No existing matcher, route, admin binding, upstream or global option changed. Parent must separately validate/reload and observe existing sites. |

## Focused checks

Passed independent checks:

- Pure deployment matrix rejection of lookalikes, non-default public port, HTTP downgrade, trailing path, userinfo-shaped and null origins; valid public/local mappings stay within the same environment.
- Pure B embedding event-origin, event-source and exact-schema negatives, accepted valid event, and pinned ready target. No browser or listener socket was used.
- `node --test --test-name-pattern='D handoff' tests/public-origins.test.mjs`: 1 passed, 0 failed. This selection ran only the globals-based handoff check; API/CSP server tests were deliberately not run by reviewer.
- Exact byte comparison of old Caddy prefix and appended fragment.
- `git diff --check`: passed at the sample.

The parent reported other public-origin/HTTP tests passing and is running full builds and public E2E. Those reports are not represented here as reviewer-executed runtime checks. No financial core code changed in the reviewed deployment delta; no financial re-review or production payment call was performed.

## Findings

None found in this bounded source review. This receipt approves the reviewed source properties only. Live DNS resolution, certificate issuance, deployed image hashes, browser flows, external DB reachability and existing-site health remain runtime evidence to be attached by the integration owner.

## Immutable source evidence

Source manifest SHA above is SHA-256 of the JSON object mapping the following relative paths to SHA-256 values, with sorted keys and compact separators.

- shared/contracts/deployment.mjs: 6b9b5a952059a7720e8c03f9890c26aac442177ceb48a708532c054a50f12558
- apps/api/http.mjs: 1b123dfcd5de6891b41da6894e959aa535d2eee454477be3a71eca2f43ff6fa4
- apps/frontend/server.mjs: 8f5100e903efec90017c8c00edb65052eeb86b9bc3cf13e5955aeb7fc931f344
- apps/frontend/Dockerfile: a3f08604138c3e0ccb95a02579d0dad69cf4266ee8319f77d1c7a405842d13a9
- shared/client/api.mjs: 81b17aaf9ecff37f82b6f416b1e46b233d7a818dd7ab90936b2b9bf016e6eb1a
- apps/frontend/fixtures/embed-host.mjs: be851a3fdcd9cc793f9223ead2548f95d822aeeecbf5c8f06a7a78dc3169a13d
- variants/b-customer/app/embed.mjs: 4a55855d3e1d80c4b9fc5be4fe2ad0b57d16dbdb03800797002833ad82b6de39
- config/public-web/Caddyfile: f171e95bfbbb4085eb60bb32f490561ce512efd3064641fd8e9ee9983f580083
- docker-compose.yml: bbac6c0cae8c1c6cc6c15d5745e2f10766d9f89b003edfa94619d1511f9574b5
- tests/public-origins.test.mjs: 8672aca24df301a254c32a8443c1a39221955242a90567ea01f132b7a601ea88
- variants/a-merchant/docker-compose.yml: c70eec20cd4c473a8090c593fcfd5ee145f38142bcd67b55c70abfe81cddafaf
- variants/b-customer/docker-compose.yml: 8481bc056bfb123d4a307bd2ff516eb5af89f178a00f0dfdfc8e0be25d1e6f95
- variants/c-partner/docker-compose.yml: 0f1fe62a9f6302fa17dd6cdb63ac791bfb177872f1f08291a160978299ba6ac6
- variants/d-agent/docker-compose.yml: 94a049d131ff408a1a300afeb9ae85eebddafab7e33c026146da658802356007

External Caddy snapshots:

- Before SHA-256: 1ba3a228f5900bbc6c7f4988188764941314add580b4751f4cd0bbb89971d0b5
- Candidate SHA-256: a0766011ce8e7599ac1422a60261943ae7303918360da9008e3e293e8c1146de
- Project fragment SHA-256: f171e95bfbbb4085eb60bb32f490561ce512efd3064641fd8e9ee9983f580083

## Telemetry basis

Prior execution evidence: docs/telemetry/p-replicator/20260908T204432Z-go-shared-core/evidence/reviewer-provider-usage.json, collected 2026-09-09T07:34:06.891645+00:00, lists actual_models=[gpt-6-astra], actual_efforts=[high] for this inherited reviewer thread. It refers to provider log /root/.codex/sessions/2026/09/09/rollout-2026-09-09T06-06-03-01a084c5-fd0d-7511-92bd-c37a65c33d63.jsonl with then-source SHA d5905abc534c7ef6d4b107919f6ff28e5e6ee316944673579bcce3f7dc618f64. This receipt supports the inherited profile, but its earlier whole-thread usage totals exclude the current public review and are not assigned to it. Current-stage counters/cost and active interval union remain null pending parent collection.
