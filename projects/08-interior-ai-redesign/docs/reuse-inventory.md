# Reuse inventory

Source revision: `3b84e9ef`; files read before decision, SHA256 captured2026-10-02. Paths relative to repository. No secrets/env inspected. No donor is blindly copied. N5/N6 test passes do not prove N8 integration.

| File | SHA256 | Decision | Useful fragment | Security/compatibility delta |
|---|---|---|---|---|
| `projects/05-podcast-clips-opus/apps/web/src/server/auth.ts` | `699076bf660eee46cfc1a3e67258cfc438219eabe958ce9d4b319816b438ead3` | adapt | HMAC session + bcrypt dummy hashing | Remove N5 account enum dependencies; repeat cookie/CSRF/rate-limit and owner tests |
| `projects/05-podcast-clips-opus/apps/web/src/server/payments/yookassa.ts` | `eeaaef4bcd60f011b21fb20831c7f4f412cd9bbcd7ab8d6ca19914aa5cbaf4e5` | adapt | Provider response bounded validation, merchant/id/amount checks | Remove N5 plan semantics; bind ROOM20/90000/RUB; verify GET before ledger |
| `projects/06-rag-sales-chatbase/packages/db/src/index-jobs.ts` | `c6e6db2f96b016edc7d236f29796ee875aedfdbfc16f49737cb62161f61d8284` | adapt | Fence, idempotency, lease attempt bounds | Replace Redis delivery transport with Postgres SKIP LOCKED; credit reserve/refund are new invariants |
| `projects/06-rag-sales-chatbase/apps/worker/src/pdf/uploads.ts` | `298877a811cb0c8c4c033ea1522ac2c2c90a590bd639d1bc3299918ce184e38b` | adapt | UUID paths and bounded orphan cleanup | Keep originals for gallery; do not delete every successful job upload like PDF ingest |
| `projects/06-rag-sales-chatbase/packages/db/src/payments.ts` | `169c5dfd3f6ef0dd1bb277a56d71d9aaf97e61c23db45e44909fe93682ff86aa` | reject | Verified payment transaction reference only | Time plans and commission writes incompatible with credits/no-payout scope |

Storage/queue donor boundaries: N5 S3 and Redis require more services and conflict with required Postgres queue; reject whole subsystem reuse. N1–4 were inventoried by path as older product-specific approaches; N5/N6 contain the relevant consolidated patterns. No shared manifests or other project files are modified.
