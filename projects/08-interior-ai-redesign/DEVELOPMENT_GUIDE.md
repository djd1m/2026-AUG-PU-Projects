# N8 — development guide

N8 реализован как один TypeScript workspace с модульными domain, database и adapter packages, Next web и отдельным worker. Нормативные требования остаются в `docs/Specification.md`; 65 AC и их literal test mappings находятся в `docs/features/*/05_completion.md`.

## Setup

```sh
npm ci
npm run setup:local
npm run typecheck
npm run lint
npm test
npm run build
```

Перед любым Compose startup из корня репозитория выполните `bash scripts/check-port-conflicts.sh projects/08-interior-ai-redesign`. Полный локальный runbook находится в [INSTALL.md](INSTALL.md). Database port не публикуется, web по умолчанию доступен только на `127.0.0.1:3088`; public deploy и paid calls не входят в разрешённый scope.

Фактические scripts: `build`, `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `setup:local`, `migrate`, `start:web`, `start:worker`. `test:e2e` требует точного production build и read-only companion preflight. Image 8 имеет source-bound 21/21 pass; после любого source/build изменения этот receipt нужно обновить.

## Architecture and boundaries

- `packages/domain`: pure validation, geometry, scene, budget, billing and sharing contracts;
- `packages/db`: PostgreSQL repositories, transactions, CAS, fences and immutable ledgers;
- `packages/adapters`: bounded files/codecs and fixed provider endpoints;
- `apps/web`: composition, guarded HTTP routes and owner UI;
- `apps/worker`: job lifecycle, parser/export cleanup and heartbeat.

Domain public exports не импортируют Next, PostgreSQL, filesystem или concrete providers. Все owner/project/file relations проверяются на сервере; cookie mutations требуют exact Origin. Money uses checked integer minor units, quantities use Decimal semantics, unknown remains null/explicit.

Runtime defaults are `N8_AI_MODE=manual` and `N8_PAYMENTS_MODE=off`. Live OpenRouter configuration must supply an allowlisted model, current rates, bounded tokens, spend caps, verified provider hard limit and operator enable. The observed Gemini ID is a candidate, not a pinned quality result. ЮKassa live additionally requires HTTPS and real merchant configuration. Tests use local HTTP fixtures/injection and make no paid calls.

Space accepts manual rooms, private raster references and bounded self-contained GLB. Synthetic GLB fixtures exercise parsing/viewing; no actual Scaniverse device sample has been accepted. Pinterest works as saved public HTTPS link or uploaded image, without server fetch/API board import. Retail adapters intentionally return blocked/manual-required after observed 401 and must never add CAPTCHA/proxy bypass.

## Workflow

Read root and project `CLAUDE.md`, applicable local rules, source requirement and architecture before changes. Route by risk, preserve the existing RUN_ID/receipts, use one implementation pass followed by independent review and concrete fixes, then stop after required checks pass. Unknown model/usage counters remain `null`; do not infer them.

Before coding a feature, read its reuse receipt. Each records the local N1–N7 search, inspected donor revision, external dependency/license, compatibility and use/adapt/reject decision:

- `docs/features/foundation/reuse.md`
- `docs/features/space/reuse.md`
- `docs/features/design/reuse.md`
- `docs/features/procurement/reuse.md`
- `docs/features/billing/reuse.md`
- `docs/features/sharing/reuse.md`

Do not import runtime code from sibling projects. Coordinator owns shared manifests, lockfile and migrations. Every delegated writer needs explicit paths, AC, checks, timebox, stop condition and a fresh terminal receipt.

## Testing

Vitest tests actual functions, HTTP handlers, PostgreSQL transactions/barriers, filesystem codecs and offline provider adapters. Meaningful mutations must fail the intended guard and restore the original bytes. Final image 8 passed the exact 21-check production journey, the 10-client/1000-measure API benchmark at p95 47.754862 ms, and before/after restart persistence. The pure 200-line benchmark passed 1000 matching hashes with one explicit unknown at p95 7.602620 ms. A later source/build change requires fresh bound receipts; the earlier full regression was 228/228 before two late fixes, followed by the affected 13 sharing tests and actual-browser hydration closure rather than a claimed second 228-test run.

Preserve these mandatory risks: cross-owner 404, exact Origin/pre-body rate, immutable shell, parser/resource bounds, revision CAS, no paid redispatch after uncertain dispatch, Decimal packaging/unknown scope, verified payment replay/refund hold, private share revocation, CSV formula safety and redacted readiness/logging.

## Troubleshooting

- `409 VERSION_CONFLICT`: reload current server state and preserve the user draft; do not bypass CAS.
- `AI_CONFIG_INVALID` or non-ready startup: keep manual mode or correct every required live field; never use guessed rates/caps.
- `PARSER_BUSY`, timeout or resource rejection: show the typed recoverable reason; do not weaken limits.
- `blocked/manual_required` retailer result: ask for a manual snapshot and official link; do not scrape around 401.
- uncertain AI spend or payment verification: reconcile from provider evidence and current fence/event identity; do not release or replay blindly.

Evidence index: `docs/telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/`, feature implementation/review receipts, [Completion](docs/Completion.md) and [Final Summary](docs/Final_Summary.md).
