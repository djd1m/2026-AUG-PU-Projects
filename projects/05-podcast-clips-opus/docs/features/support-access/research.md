# Support access — reuse decision, not a repeated provider survey
Source baseline: `1f0befb75bd193c5282b273a6007f3997733cab5`; prior audit pin `f468e8dda0f714668de4207cd7bd8af417db1e56`.
Read audited [summary](../../research/support-oss-20261027/README.md), [email](../../research/support-oss-20261027/email-auth-reuse.md), [operators](../../research/support-oss-20261027/operator-reuse.md), [helpdesk](../../research/support-oss-20261027/helpdesk-options.md).
Exact baseline donor sources read via git show: N1 `apps/web/src/lib/n3-proof.ts`,
`password-reset.ts`; N6b `packages/db/src/metrics.ts`; N7 `src/dispatch/smtp.ts` and
`experiments/mail-library-prototype/smtp.mjs`. Paths are within each named project.
N1 lock/session/one-use/reset patterns ADAPT to N5; original session-bound verification is
explicitly adapted for another device only after same-account login while issuer stays active.
N3 guard/UX tests ADAPT from audited report, no broad auth transplant or referral outbox.
N6b membership/SSR/API pattern ADAPT; N4 compact cards/forms ADAPT, email allowlist REJECT.
N5 retains bcrypt/HMAC/tenant/credit/payment contracts; support reads only explicit DTO fields.
N7 production dispatch is custom SMTP, not Nodemailer. Its Nodemailer prototype is explicitly
INCONCLUSIVE overall; ADAPT bounded TLS/deadline/no-secret patterns, not a claim of production readiness.
Nodemailer official [SMTP](https://nodemailer.com/smtp) opened 2026-10-28 confirms createTransport,
required STARTTLS and timeout options. Use a small standard adapter; no custom campaign engine.
Libredesk official [Live Chat](https://support.libredesk.io/en/articles/livechat) and
[Context Links](https://support.libredesk.io/en/articles/context-links) opened 2026-10-28;
claims/settings/deep-link contract confirmed; no remote revoke/full deletion capability proven.
Stable vendor source pin from audit: `5668a2a2c503b9304404d8f3620131b2990cbb99` (v2.9.0).
First email-only-contact adoption can join history: verified current email gate is mandatory.
No sender/domain/support contact/Libredesk runtime configured; no actual mail, install or pilot.
