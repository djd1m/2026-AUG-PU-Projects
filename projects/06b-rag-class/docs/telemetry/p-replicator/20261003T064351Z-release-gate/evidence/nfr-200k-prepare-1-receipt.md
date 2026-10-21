Preparation complete. **200k runtime: NOT_EXECUTED.** HEAD remains `1070ac4d483742797c00c768ab02e25f7436b9c8`.

Only these files were written under `tests/artifacts/release-gate/`:

| File | Lines | SHA-256 |
|---|---:|---|
| `nfr-200k.mjs` | 310 | `00f7f822dc65d93e08b5203fa5bfb9586cec2ec26f870814461f548e0bd14c35` |
| `nfr-200k.test.mjs` | 122 | `51f2f609377c5c78ad035dd2bab571b0d712d428ea181089f4413335dab593cc` |
| `nfr-200k-offline-checks.json` | 216 | `8b63ed45d9442abea40c69bcb673c175fafa21064b5455958ee5b3d96c4d6186` |

The runner defaults to preparation/refusal. Future execution requires explicit ownership, an isolated database prefix, separate private owner/service URLs, runtime identity and matching source hashes. It checks migrated schema and empty business tables before seeding exactly 10 × 20,000 dense, distinct 1536-dimensional vectors in bounded batches.

Measurement uses canonical compiled `searchChunks`, includes its transaction boundary, separates initial samples, and records 50 warmups, 500 sequential raw timings and ceil-rank percentiles. EXPLAIN uses exported `SEARCH_SQL` with matching settings and rejects missing natural HNSW plans. Statement and overall deadlines are enforced; database lifecycle and cleanup remain coordinator-owned.

Validation on `/tmp/n8-node22`, **v22.20.0**:

- Both syntax checks passed.
- All **11 offline checks passed**, with **zero connection attempts**.
- Disabling the ownership guard made the unchanged negative-control assertion fail as expected.
- Default preparation and small smoke succeeded; unowned `--execute` refused with exit 1.
- Read-only imports confirmed canonical search identity and six-token fixture text.

The resource gate remains blocked: the readiness snapshot’s approximately 5.5 GiB free space does not meet the conservative 8 GiB initial budget. Actual execution still needs fresh resource preflight, coordinator watchdog/floor monitoring, an owned migrated database and runtime review.

Profile: **S / compact-quality-first-v2**. Recorded preparation duration: **615.7 seconds**. Exact model metadata, tokens and cost are unknown. Telemetry and check evidence are in the offline-checks JSON. No DB, Docker, network, provider calls, product/config/dependency edits, children or commit were performed.