# Implementation contract — agent-purchase

Implementation canon under approved modular architecture. First provider: YooKassa TEST only.

## Package and ownership

Portable package path `packages/agent-payments`, npm name `@course/agent-payments`, private until separate publication. TypeScript, ESM compiled dist, Node >=22, PostgreSQL adapter with externally supplied pg Pool. No framework or Proofwall imports. Public exports from package root and provider/transport subpaths.

Core unit owns only packages/agent-payments/** in its isolated worktree. Coordinator owns P1 host app/services/migrations/tests/manifests/docs and integration. No other project source changes.

## Public concepts

Money uses integer minor units string plus currency. Merchant, buyer and resource are scoped server IDs. Agent grant separate from financial mandate; hash bearer tokens at rest. Order view independently reports payment, fulfillment, attribution and nextAction. All money operations through one engine.

Core unit must freeze an exported TypeScript contract file first and notify coordinator before host coding: engine construction with store/provider/host/clock, trusted-human issue/revoke grant and mandate, token-authenticated offer/create/execute/status, trusted-human approve-order, provider reconcile and transactional fulfillment port. PostgresStore migrations are package-owned; public module supplies migration helper. Host fulfillment receives exact PoolClient from UnitOfWork. Core owns generic orders, reservations, method refs and mandates; host owns identity/pairing UI and legacy checkout adapters.

## Provider and host boundaries

Host injects verified identity and authoritative offers; no tools can invoke human approval API. Host owns attribution preparation and current eligibility; required N3 must acknowledge before provider create. ProviderPort returns hosted action, saved-method result or unknown status; validates merchant/TEST/account/currency/amount and metadata. Saved method never exposed to agent. New adapter does not read global production credentials at import.

Host controls renewal price/window/calendar policy and maps verified result into existing tariff/commission handler. Bridge orders enqueue N3 and never create native commission as well. One event owner, project-first legacy lock order. Manual human purchases remain possible without agent grant/mandate. Manual spend reduces agent headroom without making agent cap a cap on humans.

## Feature activation

Agent endpoints disabled unless AGENT_PAYMENTS_ENABLED=true; non-money discovery/health may exist. Separate agent gateway never owns DB/PSP credentials. Existing human route response shape and consent requirements unchanged. New module emits no live charges. No default grant or enabled recurring policy.

## Delivery

Core first provides contract and reference tests, then Postgres concurrency and provider fixture tests. Coordinator integrates only committed, source-hashed receipt from isolated worktree. Exact contracts are frozen before a second implementation writer uses them; breaking amendment requires message and hash refresh.
