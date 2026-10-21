# Implementation and reuse

Adapt existing N8 loadConfig, pure LiveConfig/requireLive and createOpenRouter. PgJobs/ledgers/credits/schema untouched. Optional pair propagated through bare Compose environment, only when provided. Local N6/N8 provider patterns and primary OpenRouterTeam/docs researched; no SDK/dependency/framework added.

Checks and actual artifacts: ../../telemetry/p-replicator/20261014T165824Z-gemini-live-audit-bc87/evidence/. Scoped12 tests, typecheck and lint passed. Full regression/build results remain completion gates. Private environment model/rate/caps/period prepared; secrets unchanged.
