# Architecture — b-customer

Distributed monolith in Docker. Canon: [runtime-contract](../../runtime-contract.md) and [Architecture](../../Architecture.md).

This unit owns `variants/b-customer/app/` and variant browser tests. Browser imports only shared/client, shared/contracts, shared/ui; never other variants, pg or server modules.

PostgreSQL shared by backend only on internal db network. No published DB ports, no default passwords, secrets from ignored generated file. Frontends on separate API network. Financial transactions lock tenant and use one checked-out pg client; role/subject/grant authorization precedes idempotency result. Shared money has one implementation.

## F1 embedding contract

The parent-owned fixture host at A `/_fixtures/embed-host.html` embeds B `/?embed=1&parentOrigin=<exact-parent-origin>`. The shared/contracts/deployment.mjs matrix permits exact localhost/127.0.0.1 ports13031/13032 and the corresponding public HTTPS n3-a/n3-b.212.192.0.33.sslip.io origins. The parent origin parameter must match an explicit A origin; it never grants authority from an arbitrary URL or suffix. The child destination is the B origin from the same configured environment. Referrer-Policy is no-referrer, so this explicit allowlisted parameter avoids depending on document.referrer.

Messages have exact schemas: child→parent `{type:'n3.ready',version:1}` or `{type:'n3.dismissed',version:1}`; parent→child `{type:'n3.value-moment',version:1,event:'widget_published'}`. Both receivers check exact origin, event.source, version, keys/types. Every sender uses an exact targetOrigin. No identity, token, grant, credit amount or financial command travels through postMessage. The child establishes its own isolated fixture session using the regular HTTP facade; no automatic enrollment on readiness/read/value moment.

Host CSS deliberately targets buttons and fonts to prove iframe isolation. Its publish/edit actions are synthetic host fixtures, not Proofwall production integration. UI tests must verify rejection of malformed/source-mismatched messages, no-enrollment-on-read, decline preserving the host, CSP/frame loading and explicit cross-origin HTTP access. Actual external MCP/A2A remains separate.
