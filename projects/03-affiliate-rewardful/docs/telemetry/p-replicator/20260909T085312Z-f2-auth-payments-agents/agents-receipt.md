# Agent transport workunit receipt

RUN_ID: 20260909T085312Z-f2-auth-payments-agents
WORK_UNIT_ID: agent-transport
Profile: compact-quality-first-v2; inherited XL feature approval.
Commit: be7a5271a89ff44147c55766c6b73d1a5d9fc6b6
Worktree: /tmp/n3-f2-agents
Project: /tmp/n3-f2-agents/projects/03-affiliate-rewardful
Ownership: shared/agents/*, tests/agent-transport.test.mjs only.

Factory createAgentHandler({authenticateAgent,executeAgent,origin}) provides /mcp, /a2a and /.well-known/agent-card.json. Requires canonical HTTPS origin; loopback HTTP permitted for local tests. Bearer only, no browser cookie authentication. Static public card exposes no account data.

MCP uses official @modelcontextprotocol/sdk 1.30.0, stateless Streamable HTTP with JSON responses and protocol 2025-11-25. Actual SDK Client initialized, listed permitted tools, called registry.prepare, replayed it and rejected revoked credentials. Only safe grant actions/task operations are exposed. MCP mutation keys and A2A message keys include grant identity.

A2A v0.3.0 JSON-RPC message/send, tasks/get and tasks/cancel map to existing persisted application task APIs. Input consists of a single data part {kind:registry|partner|credit,input:{...}}. Stable messageId creates/run keys; current task reread prevents cached pending snapshots. Context/task authority injection is rejected. Terminal cancellation and completion races return -32002. Unknown methods/unsupported streaming/push, invalid params, missing auth and unavailable tasks receive appropriate bounded JSON-RPC/HTTP errors. No background scheduler, streaming, OAuth, LLM or sending/approving/exporting payments is claimed.

Validation:
- node --test tests/agent-transport.test.mjs: 7/7 pass, last run duration_ms 543.841084.
- npm run build: pass; 64 source modules, four available functional variant entries.
- git diff --check: pass.
- Mutation: removed final A2A reauthentication; node --test --test-name-pattern='revocation during execution' tests/agent-transport.test.mjs failed with expected403/actual200. Restored source; 7/7 pass.
- Earlier subprocess mutation attempts returned nonspecific runner failures and are not the evidence used for guard acceptance.

Testing boundary: actual local HTTP server, official MCP SDK client, existing domain dispatcher/authorization and seed. Persistence and credential repository are in-memory substitutes. Root must run SQL-backed identity/credential/revoke/restart integration, full regressions and A-D E2E after integration. A2A tests use JSON-RPC HTTP client, not an official A2A SDK. Dedicated merchant sandbox not relevant to this workunit.

Critical integration notes sent to root: authorize task.create underlying action before cached publication; guard-bound cached task results must match active grant. executeAgent must reauthenticate each action/read and cached result. No token/error details may be exposed. Node modules were installed by root; only a local untracked symlink exists in this worktree (not committed).

Primary documentation inspected:
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://a2a-protocol.org/v0.3.0/specification/
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/package.json
- Installed SDK source protocol constant confirms 2025-11-25 and actual client interoperation.

Telemetry: coordinator owns feature trace. Actual model/effort, token counts, cost and start timestamp unavailable in this child's exposed metadata; null rather than estimates. Parent spawn metadata may supply actual model/effort and elapsed time. Last observed UTC time during validation: 2026-09-09 09:04:19 UTC. No fallback or delegation performed. No quantitative savings claim. Weekly quota counter unavailable here.
