# Identity/program/partner dispatch

**Пишущий фан-аут:** да
**Координатор пишет:** да
**Разрезы файлов:** нет
**Проверка владения:** ВЫПОЛНЕНА
**Канон:** packages/db/src/onboarding-contract.ts
**Хеш канона:** 9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511
**Проверка канона:** ВЫПОЛНЕНА

## Единицы

| Единица | Что пишет |
|---|---|
| identity-core | New SQL, domain, bootstrap and core tests |
| identity-ui | Client forms, pages and CJM A styles |
| координатор | Frozen contract, HTTP, runtime and shared integration |

## Владение

| Файл | Владелец |
|---|---|
| packages/db/src/onboarding-repository.ts | identity-core |
| packages/db/src/admission-repository.ts | identity-core |
| apps/web/src/lib/onboarding/identity.ts | identity-core |
| apps/web/src/lib/onboarding/service.ts | identity-core |
| apps/web/src/lib/onboarding/policy.ts | identity-core |
| apps/web/src/lib/onboarding/partner.ts | identity-core |
| scripts/bootstrap-pilot-owner.ts | identity-core |
| packages/db/tests/onboarding-test-helpers.ts | identity-core |
| apps/web/tests/onboarding-identity.test.ts | identity-core |
| apps/web/tests/onboarding-policy.test.ts | identity-core |
| apps/web/tests/onboarding-service.test.ts | identity-core |
| packages/db/src/onboarding-contract.ts | координатор |
| packages/db/src/index.ts | координатор |
| apps/web/src/lib/auth/config.ts | координатор |
| apps/web/tests/auth-config.test.ts | координатор |
| apps/web/src/lib/onboarding/runtime.ts | координатор |
| apps/web/src/lib/http/body.ts | координатор |
| apps/web/src/lib/http/csrf.ts | координатор |
| apps/web/src/lib/http/admission.ts | координатор |
| apps/web/src/lib/http/errors.ts | координатор |
| apps/web/src/lib/http/handler.ts | координатор |
| apps/web/src/lib/http/input.ts | координатор |
| apps/web/tests/onboarding-http.test.ts | координатор |
| apps/web/tests/onboarding-http-routes.test.ts | координатор |
| tests/onboarding-browser.py | координатор |
| tests/workspace.test.ts | координатор |
| scripts/run-foundation-integration.mjs | координатор |
| scripts/onboarding-mutation-check.mjs | координатор |
| compose.yaml | координатор |
| .env.example | координатор |
| package.json | координатор |
| package-lock.json | координатор |
| docs/dispatch-plan.md | координатор |
| docs/source-versions.md | координатор |
| CLAUDE.md | координатор |
| .claude/feature-roadmap.json | координатор |

| packages/db/migrations/003_onboarding_schema.sql | identity-core |
| packages/db/migrations/004_onboarding_helpers.sql | identity-core |
| packages/db/migrations/005_onboarding_enrollment.sql | identity-core |
| packages/db/migrations/006_onboarding_policy.sql | identity-core |
| packages/db/migrations/007_onboarding_partner.sql | identity-core |
| packages/db/migrations/008_onboarding_reads.sql | identity-core |
| packages/db/migrations/009_onboarding_admission.sql | identity-core |
| packages/db/migrations/010_onboarding_bootstrap.sql | identity-core |
| packages/db/src/onboarding-codecs.ts | identity-core |
| packages/db/tests/onboarding-enrollment.integration.test.ts | identity-core |
| packages/db/tests/onboarding-policy.integration.test.ts | identity-core |
| packages/db/tests/onboarding-partner.integration.test.ts | identity-core |
| packages/db/tests/onboarding-admission.integration.test.ts | identity-core |
| packages/db/tests/onboarding-roles.integration.test.ts | identity-core |
| apps/web/src/app/page.tsx | identity-ui |
| apps/web/src/app/globals.css | identity-ui |
| apps/web/src/app/login/page.tsx | identity-ui |
| apps/web/src/app/join/page.tsx | identity-ui |
| apps/web/src/app/onboarding/page.tsx | identity-ui |
| apps/web/src/app/programs/[id]/setup/page.tsx | identity-ui |
| apps/web/src/app/programs/[id]/partner/page.tsx | identity-ui |
| apps/web/src/components/onboarding/api.ts | identity-ui |
| apps/web/src/components/onboarding/shell.tsx | identity-ui |
| apps/web/src/components/onboarding/login-form.tsx | identity-ui |
| apps/web/src/components/onboarding/join-form.tsx | identity-ui |
| apps/web/src/components/onboarding/membership-list.tsx | identity-ui |
| apps/web/src/components/onboarding/program-setup.tsx | identity-ui |
| apps/web/src/components/onboarding/partner-assets.tsx | identity-ui |
| apps/web/src/components/onboarding/policy-form.tsx | identity-ui |
| apps/web/src/components/onboarding/invite-form.tsx | identity-ui |
| apps/web/src/components/onboarding/member-list.tsx | identity-ui |

| apps/web/src/app/api/auth/csrf/route.ts | координатор |
| apps/web/src/app/api/auth/signup/route.ts | координатор |
| apps/web/src/app/api/auth/login/route.ts | координатор |
| apps/web/src/app/api/auth/logout/route.ts | координатор |
| apps/web/src/app/api/auth/me/route.ts | координатор |
| apps/web/src/app/api/enrollments/bind/route.ts | координатор |
| apps/web/src/app/api/enrollments/preview/route.ts | координатор |
| apps/web/src/app/api/enrollments/accept/route.ts | координатор |
| apps/web/src/app/api/partners/accept/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/policy/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/activate/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/enrollments/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/enrollments/[grant]/revoke/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/members/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/members/[membership]/revoke/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/partners/[partner]/status/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/assets/[asset]/revoke/route.ts | координатор |
| apps/web/src/app/api/programs/[id]/partner-assets/route.ts | координатор |

Only new SQL migrations after002 and onboarding-prefixed test/repository splits may be proposed by core. Exact paths are added here before creation. Core confirmed DTO SHA before UI launch; only the listed UI files now belong to identity-ui. UI may add named component splits after coordinator records ownership. Coordinator also owns all run/events, lifecycle reports, provenance and source receipts. Each writer has its own worktree; no donor runtime writes. Foundation prior dispatch is preserved in this run.
