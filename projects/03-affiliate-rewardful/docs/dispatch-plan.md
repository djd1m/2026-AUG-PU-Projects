# F3 access onboarding dispatch

**Пишущий фан-аут:** ДА
**Канон:** docs/features/f3-access-onboarding/02_pseudocode.md
**Хеш канона:** fe9ff7a721ea4df3ffcac856f5215dc1690e655aa7eaf5ada1130dcee7418742
**Проверка канона:** ВЫПОЛНЕНА
**Координатор пишет:** ДА
**Разрезы файлов:** НЕТ
**Проверка владения:** ВЫПОЛНЕНА

## Единицы

| Единица | Что пишет |
|---|---|
| auth-adapters | Reused Resend/Yandex HTTP primitives and provider contract tests |
| provider-docs | Five new source-dated provider setup guides |

## Владение

| Файл | Владелец |
|---|---|
| shared/identity/providers/** | auth-adapters |
| tests/access-providers.test.mjs | auth-adapters |
| shared/ui/account/** | координатор |
| tests/access-ui.test.mjs | координатор |
| docs/integrations/yookassa.md | provider-docs |
| docs/integrations/yandex-kassa.md | provider-docs |
| docs/integrations/cloudpayments.md | provider-docs |
| docs/integrations/resend.md | provider-docs |
| docs/integrations/yandex-id.md | provider-docs |
| shared/identity/schema.mjs | координатор |
| shared/identity/service.mjs | координатор |
| shared/identity/access-schema.mjs | координатор |
| shared/identity/access.mjs | координатор |
| shared/identity/email-access.mjs | координатор |
| shared/identity/oauth-access.mjs | координатор |
| shared/identity/access-helpers.mjs | координатор |
| shared/identity/access-config.mjs | координатор |
| shared/application/index.mjs | координатор |
| shared/infrastructure/schema.mjs | координатор |
| shared/referrals/service.mjs | координатор |
| shared/contracts/deployment.mjs | координатор |
| apps/api/access.mjs | координатор |
| apps/api/account.mjs | координатор |
| apps/api/http.mjs | координатор |
| apps/api/server.mjs | координатор |
| apps/frontend/server.mjs | координатор |
| docker-compose.yml | координатор |
| docker-compose.test.yml | координатор |
| tests/access-email.test.mjs | координатор |
| tests/access-oauth.test.mjs | координатор |
| tests/access-http.test.mjs | координатор |
| tests/access-policy.test.mjs | координатор |
| tests/referral-service.test.mjs | координатор |
| tests/helpers/access-fixture.mjs | координатор |
| tests/helpers/access-browser-server.mjs | координатор |
| tests/e2e/access.mjs | координатор |
| tests/e2e/account.mjs | координатор |
| tests/e2e/public-agent.mjs | координатор |
| tests/account-http.test.mjs | координатор |
| scripts/run-access-e2e.mjs | координатор |
| scripts/access-mutation-check.mjs | координатор |
| scripts/provision-account-e2e.mjs | координатор |
| scripts/check-deployment.mjs | координатор |
| package.json | координатор |
| package-lock.json | координатор |
| docs/features/f3-access-onboarding/** | координатор |
| docs/telemetry/** | координатор |
| docs/dispatch-plan.md | координатор |
| docs/source-versions.md | координатор |
| docs/plans/f3-access-and-provider-setup.md | координатор |
| docs/README.md | координатор |
| docs/demos/** | координатор |
| docs/Architecture.md | координатор |
| docs/runtime-contract.md | координатор |
| docs/f2-operations.md | координатор |
| docs/Completion.md | координатор |

Implementation starts after independent VALIDATE. One isolated worktree per writer, maximum2concurrent children; UI starts after adapter slot frees. Coordinator alone operates browser/VPS, manifests, integration and telemetry. Each terminal receipt is checked before integration; any additional file needs explicit ownership first. Existing referral feature is accepted; its source history remains in Git, not re-executed.

2026-09-09: after terminal UI receipt and cherry-pick, coordinator owns integration fixes to shared/ui/account/** and access-ui tests. Large existing referral-cap fixture setup is chunked under the same production5second statement limit; tested100000 visit cap is unchanged.
