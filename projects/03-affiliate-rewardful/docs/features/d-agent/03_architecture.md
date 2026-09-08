# Architecture — d-agent

Distributed monolith in Docker. Canon: [runtime-contract](../../runtime-contract.md) and [Architecture](../../Architecture.md).

This unit owns `variants/d-agent/app/` and variant browser tests. Browser imports only shared/client, shared/contracts, shared/ui; never other variants, pg or server modules.

PostgreSQL shared by backend only on internal db network. No published DB ports, no default passwords, secrets from ignored generated file. Frontends on separate API network. Financial transactions lock tenant and use one checked-out pg client; role/subject/grant authorization precedes idempotency result. Shared money has one implementation.
