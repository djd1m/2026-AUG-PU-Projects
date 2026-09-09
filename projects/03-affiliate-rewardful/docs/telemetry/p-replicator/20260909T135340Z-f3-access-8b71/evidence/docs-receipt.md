# Terminal receipt — access-docs-1

- Run: `20260909T135340Z-f3-access-8b71`
- Work unit: `access-docs-1`
- Worktree: `/tmp/n3-access-docs`
- Branch: `codex/n3-access-docs`
- Base: `920d8506a6daf0884d92dca63809833512934e01`
- Commit: `ecbd37c64f3ed187482c5bea992b602da0019576`
- Scope: five provider setup guides only; no runtime, index, architecture, deployment, credentials or external account mutation.

## Artifacts

- `projects/03-affiliate-rewardful/docs/integrations/yookassa.md`
- `projects/03-affiliate-rewardful/docs/integrations/yandex-kassa.md`
- `projects/03-affiliate-rewardful/docs/integrations/cloudpayments.md`
- `projects/03-affiliate-rewardful/docs/integrations/resend.md`
- `projects/03-affiliate-rewardful/docs/integrations/yandex-id.md`

All artifacts are 119–177 lines, below the repository 500-line limit. Commit contains exactly these five paths. Pre-existing untracked `projects/03-affiliate-rewardful/node_modules` was neither changed nor staged.

## Source-bound contract inputs

- Approved plan: `docs/plans/f3-access-and-provider-setup.md`.
- Specification SHA256 verified: `cd341f862dfb710a859fe42600cd4856f939d20f0a4646d5415a0e2b887175a8`.
- Canonical pseudocode SHA256 verified: `fe9ff7a721ea4df3ffcac856f5215dc1690e655aa7eaf5ada1130dcee7418742`.
- Read architecture, refinement, completion and validation report under `docs/features/f3-access-onboarding/`.
- Inspected current N3 contract in `apps/api/server.mjs`, `apps/api/http.mjs`, `apps/api/account.mjs`, `shared/payments/yookassa.mjs`, `shared/payments/service.mjs`, `shared/ui/account/helpers.mjs`, `docker-compose.yml`, `docs/f2-operations.md` and `docs/runtime-contract.md`.
- Reuse donors inspected: project 01 `docs/yookassa-setup.md`, `apps/web/src/lib/email.ts` and `apps/web/src/lib/password-reset.ts`; no account, credential or secret was copied.

## Official sources checked 2026-09-09

YooKassa / historical Yandex.Kassa:

- https://yookassa.ru/about/
- https://yookassa.ru/developers/using-api/interaction-format
- https://yookassa.ru/developers/using-api/webhooks
- https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing
- https://yookassa.ru/developers/payment-acceptance/receipts/54fz/basics
- https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/basics
- https://yookassa.ru/developers/solutions-for-platforms/split-payments/basics
- https://yookassa.ru/developers/solutions-for-platforms/split-payments/payments
- https://yookassa.ru/developers/payouts/overview
- https://yookassa.ru/developers/payouts/getting-started/activation/process
- https://yookassa.ru/developers/solutions-for-platforms/safe-deal/basics

CloudPayments:

- https://developers.cloudpayments.ru/
- https://developers.cloudpayments.ru/pages/widget.html
- https://developers.cloudpayments.ru/en/

Resend:

- https://resend.com/docs/dashboard/domains/introduction
- https://resend.com/docs/knowledge-base/what-if-my-domain-is-not-verifying
- https://resend.com/docs/dashboard/domains/dmarc
- https://resend.com/docs/dashboard/api-keys/introduction
- https://resend.com/docs/knowledge-base/how-to-handle-api-keys
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/send-test-emails
- https://resend.com/docs/dashboard/emails/email-suppressions

Yandex ID:

- https://yandex.ru/dev/id/doc/ru/
- https://yandex.ru/dev/id/doc/ru/register-client
- https://yandex.ru/dev/id/doc/ru/register-auth
- https://yandex.ru/dev/id/doc/ru/codes/code-url
- https://yandex.ru/dev/id/doc/ru/user-information

All linked official documentation pages above opened successfully through web retrieval during this work unit. Runtime N3 callback URLs were not treated as externally accepted before the coordinating implementation/deployment.

## Checks

- `sha256sum` matched both required frozen document hashes.
- Contract scan confirmed canonical `N3_ACCESS_CONFIG_FILE`, `mail:{enabled,apiKey,from}`, `yandex:{enabled,clientId,clientSecret}`, `verificationRequired:false`, YooKassa event names, rotation/rollback and test/live coverage.
- Exact Yandex callback assertion found four individual HTTPS callback lines, one each for A, B, C and D.
- Secret-pattern scan found no credential-shaped API key, client secret or shop secret.
- Relative links `yookassa.md` and `resend.md` resolve in `docs/integrations/`.
- Markdown code fences are balanced in all five guides.
- `git diff --cached --check`, post-commit `git diff HEAD^ --check`, and commit path inspection passed.
- Build/backend/browser tests were not run because this work unit changes documentation only; the coordinating feature owner owns source-bound runtime gates.

## Limitations and honest acceptance boundary

- No YooKassa/CloudPayments/Resend/Yandex credentials were available or used. No provider dashboard, DNS zone, consent screen, mail delivery, payment, refund, split or payout was changed.
- YooKassa guide binds one dedicated shop to one N3 tenant per deployment and only `payment.succeeded`/`refund.succeeded`; native notifications use authenticated API read-back. Fiscal receipt composition is not implemented and production acceptance remains pending.
- Historical Яндекс.Касса is documented as ЮKassa. Split payments, safe deal and payouts are separate provider products and remain unimplemented in N3. No provider approval duration is promised.
- CloudPayments remains docs-only: no N3 adapter, config contract or webhook endpoint exists, so the guide explicitly forbids routing provider traffic to an invented route.
- Resend provider acceptance, mailbox delivery and N3 email ownership verification are separate signals. Mandatory verification is enabled only after actual delivery readiness and remains sticky once persisted.
- Yandex ID external acceptance remains pending real application credentials and consent. Guide lists exact four callbacks, `login:info`/`login:email`, PKCE/state/browser proof, collision refusal, explicit link and SSO recovery constraints.
- Actual worker model/usage/quota counters and exact active duration were not exposed as execution metadata to this work unit; values are `null`, not estimated. The coordinator owns run-level telemetry.

Status: completed
