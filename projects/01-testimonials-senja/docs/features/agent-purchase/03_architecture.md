# Architecture — agent-purchase

Canonical architecture: [modular module](modular-architecture.md). Existing host: [P1 Architecture](../../Architecture.md), [N3 bridge](../n3-affiliate-bridge/03_architecture.md).

Module embedded in backend with dedicated tables; separate MCP/A2A gateway container has no DB/PSP access. Core and transports imported through public exports only. Product adapter owns 990 RUB, 30-day entitlement, account verification and N3 binding. No new cross-project container network.

## External Dependencies

YooKassa hosted checkout/saved-method API are documented in [research](../../research/agentic-payments-build-vs-buy.md). Provider capabilities confirmed by docs; actual TEST saved method remains unverified until acceptance. MCP SDK is already used in N3 and must be tested with target client. No LLM execution required inside payment policy.

## Human compatibility

Agent permissions cannot become preconditions for existing UI. New payment path is opt-in and off by default until accepted. Existing billing mutation owner remains unique; all shared edits require human regression evidence.
