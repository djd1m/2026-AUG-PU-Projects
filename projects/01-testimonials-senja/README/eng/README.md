# Proofwall — documentation

Customer testimonial collection, a public Wall of Love, and an embeddable widget.

🇷🇺 [Документация на русском](../ru/README.md)

## Contents

| Document | Who it is for |
|---|---|
| [01. Quick start](01_quickstart.md) | Bring the stack up in five commands |
| [02. User guide](02_user_guide.md) | Project owner: collection, moderation, Wall of Love, widget, plans, partner programme |
| [03. Administrator guide](03_admin_guide.md) | Deployment, ports, secrets, backups, observability |
| [04. API reference](04_api_reference.md) | Routes, request bodies, response codes |
| [05. Architecture](05_architecture.md) | System composition, tenant isolation, data boundaries, decisions |
| [06. Troubleshooting](06_troubleshooting.md) | Real cases from development |
| [07. Changelog](07_changelog.md) | MVP features and commits |

## The system in brief

A distributed monolith in a monorepo: Next.js 15, PostgreSQL with row-level tenant isolation,
MinIO for video and photos, a separate speech recognition service. Deployment is via
Docker Compose behind Caddy.

Only Caddy is published to the outside. Storage ports are never published — that is an
architectural invariant, not a setting.

## Checks before handover

```bash
bash ../../scripts/check-port-conflicts.sh .   # the database is not published, ports are free
bash scripts/check-env-wiring.sh               # variables reach the services
bash scripts/check-cjm.sh "$BASE_URL"          # the customer path runs end to end
npm test                                       # 408 checks across 35 files
```
