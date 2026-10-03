# Cohort — N7

A local MVP for an opt-in mailbox pool and personalized sequences: accounts,
encrypted mailbox settings, separate consents, shared quotas, reply/unsubscribe/
complaint stops, manual observations, public reports, TEST billing and attribution.

**Mail uses local adapters; billing is TEST only.** Live SMTP/IMAP, real charges
and production deployment are not activated. No AI replies. Reputation stays
unknown without observations; improved deliverability is not promised.

[Русский](README.md) · [English guide](README/eng/README.md) · [Quickstart](README/eng/01_quickstart.md)

F01–F05 and F06 product acceptance have independent reviews. Evidence includes
real PostgreSQL, shared Docker Playwright Chromium at 1440/390 and Firefox/WebKit
at 390, tenant isolation, stop races, idempotency and native unsubscribe. The final
report layout passed 218 browser checks. Final unit count is 39; the earlier
accepted full PostgreSQL set contains 115 tests and was not rerun for CSS alone.

[Completion and PR status](docs/Completion.md) · [Acceptance evidence](docs/acceptance-traceability.md)
· [Pipeline walkthrough](docs/pipeline-walkthrough.md) · [Deployment checkpoint](docs/deployment-checkpoint.md)

Canonical architecture/product documents are in docs/. The inherited toolkit
requires the full monorepo. Local software acceptance is not a live email pilot.
