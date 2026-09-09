# Architecture

Distributed monolith remains in each project, separate PostgreSQL and HTTPS bridge. N3extends shared/payments/{schema,service}.mjs, apps/api/referrals.mjs, shared/integrations/merchant-client.mjs and shared UI test-payment visibility if needed. Proofwall adds service-only verification/intents/outbox migration, lib/n3-* modules, explicit auth proof routes/page, checkout/webhook integration and existing worker polling. APIs never share database privileges. Root owns deployment/config/manifests and cross-projectE2E; P1worker owns only delegated P1source/tests.

No general app_service insert grant on checkout_sessions; no email proof column writable by existing broad authenticated account permissions. Existing payment lifecycle preserved with project-row serialization and invoice-level idempotence. Final deployment resolves pending N3access prerequisite before switch.

Owner clarification2026-09-09: projects01and03 must not share or join Docker networks for integration. The product monetization chain alone connects them through public server HTTPS APIs: referral receipt → verified signup → native merchant payment → verified N3 commission. No container DNS names, shared database credentials or cross-project SQL. Per-project database/storage isolation networks are local infrastructure only.
