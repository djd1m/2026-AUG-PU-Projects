# F3 referral funnel dispatch

**Пишущий фан-аут:** ДА
**Канон:** docs/features/f3-referral-funnel/02_pseudocode.md
**Хеш канона:** 53e90ae6f51d79d50c88cefbe68aece9323f3935d50d9cea484784be1dc0d4e9
**Проверка канона:** ВЫПОЛНЕНА
**Координатор пишет:** ДА
**Разрезы файлов:** НЕТ
**Проверка владения:** ВЫПОЛНЕНА

## Единицы

| Единица | Что пишет |
|---|---|
| referral-core | New referral service/schema/helpers and dedicated service tests |
| referral-client-ui | New tracker, merchant backend helper, account panel and integration guide/tests |

## Владение

| Файл | Владелец |
|---|---|
| shared/referrals/** | referral-core |
| tests/referral-service.test.mjs | referral-core |
| tests/helpers/referral-fixture.mjs | referral-core |
| shared/client/referral-tracker.mjs | referral-client-ui |
| shared/integrations/merchant-client.mjs | referral-client-ui |
| shared/ui/account/referrals.mjs | referral-client-ui |
| tests/referral-client.test.mjs | referral-client-ui |
| tests/referral-panel.test.mjs | referral-client-ui |
| docs/integrations/referral-funnel.md | координатор |
| shared/application/index.mjs | координатор |
| shared/domain/events.mjs | координатор |
| shared/domain/registry.mjs | координатор |
| shared/domain/projections.mjs | координатор |
| shared/domain/referral-attribution.mjs | координатор |
| shared/payments/service.mjs | координатор |
| shared/payments/schema.mjs | координатор |
| shared/infrastructure/schema.mjs | координатор |
| apps/api/http.mjs | координатор |
| apps/api/account.mjs | координатор |
| apps/api/referrals.mjs | координатор |
| apps/frontend/server.mjs | координатор |
| shared/ui/account/app.mjs | координатор |
| shared/ui/account/index.html | координатор |
| shared/ui/account/style.css | координатор |
| tests/referral-payment.test.mjs | координатор |
| tests/referral-http.test.mjs | координатор |
| tests/helpers/referral-payment-fixture.mjs | координатор |
| tests/helpers/referral-merchant.mjs | координатор |
| tests/e2e/referral.mjs | координатор |
| scripts/referral-mutation-check.mjs | координатор |
| scripts/run-referral-e2e.mjs | координатор |
| docs/features/f3-referral-funnel/** | координатор |
| docs/telemetry/** | координатор |
| docs/dispatch-plan.md | координатор |
| docs/source-versions.md | координатор |
| docs/plans/f3-access-and-provider-setup.md | координатор |
| docs/f2-operations.md | координатор |
| docs/runtime-contract.md | координатор |
| docs/Architecture.md | координатор |
| docs/README.md | координатор |
| docs/Completion.md | координатор |
| .claude/feature-roadmap.json | координатор |
| package.json | координатор |
| package-lock.json | координатор |

Implementation dispatch follows independent VALIDATE only. Each writer uses a separate worktree. Coordinator alone uses browser/VPS and integrates receipts. Core owns the additive referralMigration tables; coordinator owns checkout connector columns in shared/payments/schema.mjs and appends referralMigration after existing migrations. Source dispatch snapshots live under current run/evidence/. Any additional file requires an ownership entry before creation; no overlapping directory fallback.

2026-09-09 handoff: after terminal referral-client receipts and cherry-pick, coordinator owns integration guide corrections requested by final reviewer. Other client files retain their completed worker attribution.
