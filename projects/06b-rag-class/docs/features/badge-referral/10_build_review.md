# F10 focused build correction review

Verdict: ACCEPT_WITH_CAVEATS

No confirmed source defects in the bounded correction. Exact production rebuild remains a coordinator gate; this review does not establish build or runtime acceptance.

## Scope and independently checked obligations

Read Specification SC-US-016-2 and Architecture service/runtime boundaries before inspecting the instrumentation diff against HEAD. Pseudocode “Boot config check” requires missing/empty/invalid limits to prevent startup, with exit 1 and a named variable/consequence. Architecture places web/backend and PostgreSQL access in the Node service; the TLS-proxy “Edge” diagram label is not the Next Edge runtime.

The only reviewed correction is `apps/web/src/instrumentation.ts:5-9`: replace a negative early return with a positive `process.env.NEXT_RUNTIME === 'nodejs'` block enclosing both existing dynamic imports and `enforceBootConfig(() => loadWebConfig())`.

- Node branch retains the same awaited imports, callback and failure propagation. `loadWebConfig` still validates the closed required-variable list and limits; `checkConfig` rejects missing/empty values and non-positive/non-integer limits; `enforceBootConfig` reports ConfigError and exits 1. No catch, fallback, bypass or deferred validation was introduced.
- Edge branch contains no executed Node imports. Both literal dynamic imports are lexically confined to the positive Node runtime branch, making the exclusion explicit to compilation. Whether the exact production compiler successfully excludes their dependency graph still requires the pending rebuild.
- No static loader, require/eval workaround, package relocation or changed configuration semantics was introduced.

The original 17 F10 files were identity-checked, not re-reviewed. Prior independent review remains `08_review.md` (ACCEPT_WITH_CAVEATS).

## Source identity

HEAD: `4a4f602cda39954900365d3ba7085db7c4d732b3`.
Independently recomputed all 18 file hashes in `tests/artifacts/badge-referral/final-source-hashes.json`: 18/18 match. Its original 17 entries exactly match `implementation-source-hashes.json`.

- Instrumentation SHA256: `cdc8f1fdaec73555cdfdf0c2fcedb305154561032bd19649577969d0290aeae6`.
- Sorted files-map snapshot SHA256: `1a5bd1939c4851e85402f5a1669d35a61835c14a2f00e6d72ffb8be54f9a26a5`.
- Final artifact SHA256: `f5b64ee8a36a79c8fd7f8b1d3a5f251983abc258f4d49fd14167493f3fc97eb6`; matches launch snapshot identity.
- Launch SHA256: `0d2c9dff45565222e2400c15cd63a05d36a778ea4208c5f42dcd34f2cfb39116`; matches supplied identity.
- Build revision: none.

## Evidence boundaries and telemetry

Source inspection and hash comparison only; no tests, probes, build, Docker, network, children, product edits or commits. The brief reports prior 532 unit / 225 PostgreSQL checks and post-correction 97 boot/config checks plus typecheck passed; these were not rerun or independently certified here. Exact production rebuild is pending and is not claimed passed. E2E readiness: not_applicable, source-only review.

Profile: compact-quality-first-v2; inherited feature tier M (fresh SPARC exception to L). This bounded review preserves the boot invariant and does not change the feature route. Requested model/effort: gpt-6-astra / medium. Actual native model/effort, tokens and cost: unknown; no authoritative execution counters available. No model switch or fallback claimed.

Run-ID: 20261003T000534Z-badge-referral
Work-Unit-ID: badge-referral-build-review
Attempt-ID: build-review-1
Source-Revision: 4a4f602cda39954900365d3ba7085db7c4d732b3
Build-Revision: none
Launch-SHA256: 0d2c9dff45565222e2400c15cd63a05d36a778ea4208c5f42dcd34f2cfb39116
Finished-At: 2026-10-03T00:53:06.799012+00:00
Elapsed from recorded launch to report: 116.282 seconds; active duration unknown.
Telemetry: `docs/telemetry/p-replicator/20261003T000534Z-badge-referral/`; coordinator-owned and unmodified. Final CLI output is intended for `evidence/build-review-1-receipt.md`; no manual trace write.

Status: completed
