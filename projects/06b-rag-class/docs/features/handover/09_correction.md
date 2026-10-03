# F14 F-1 correction, attempt correction-1

F-1 is closed. The legacy referral matcher expectation now includes `/handover/:path*`. A fixed test calls the actual middleware with `NextRequest` for `/handover/token?ref=Abcdef_12345` and asserts `private, no-store`, `no-referrer`, `noindex, nofollow`, absent `Set-Cookie`, and absent `n6b_ref` response cookie. Landing first-touch, no-overwrite, demo, invalid-ref and development assertions are retained. Reversing only the matcher correction and removing only the added test reproduces the exact pre-edit test-file SHA256; no other legacy assertions changed.

Run-ID: 20261003T042338Z-handover
Work-Unit-ID: handover-correction
Attempt-ID: correction-1
Source-Revision: ac2a4490b0c7a3251f2105252577f546f2f6b605
Build-Revision: none
Launch-SHA256: 80b67fee0ff764b2ae81fa115b85201f89297eccdcf272d3a51610fc44314778

## Verification

From the project root:

```sh
PATH=/tmp/n6b-f06-node22/bin:$PATH node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/referral-cookie.test.ts
```

Actual Node: v22.22.3. Actual exit: **0**. Result: **1 file passed; 12 tests passed; 0 failed**. Evidence: `tests/artifacts/handover/correction-1-focused-test.txt`, `correction-1-focused-test-exit.txt`, and `correction-1-checks.json` in the same directory. The bounded diff was inspected; no child/reviewer was launched under the explicit no-children brief.

The saved coordinator unit/contract run records 633 passed and one failed, with 10 passed and one failed in the original referral seam. Replacing that seam's results with this corrected 12/12 run establishes **635 distinct passing tests by union**, including the added privacy test, and resolves the sole recorded unit failure. This is not a monolithic final full-suite green run. The original full-gates exit remains historical evidence and is not rewritten. The brief excludes a full unit rerun and a new mutation for this pure test-contract correction.

Coordinator evidence separately records 293 real-PG tests passed and a meaningful DB-guard baseline GREEN → behavioral RED → exact restore GREEN. Those results were not rerun by this correction. Typecheck, build identity, production UI and overall F14 acceptance remain coordinator-owned gates outside this attempt; no feature acceptance or runtime claim is made.

## Exact source identity

All original **22/22** implementation file hashes match both before and after the focused run. `implementation-source-hashes.json` remains byte-identical; exact file SHA256 including its terminal LF:

`0c1ea7f83dedd9fd498141157982df546363ecf67b19ca325fad76dd76d1d4fe`

`tests/artifacts/handover/final-source-hashes.json` contains the original 22 entries plus the corrected legacy test, **23 entries total**. Per-file values are SHA256 of exact file bytes. The updated test SHA256 is:

`a1ac5cadc460a2151919c3c245a341360fee3dcd0a6a5a0190d72cfb62cf5810`

Canonical serialization is UTF-8 JSON with lexicographically sorted keys, compact comma/colon separators, `ensure_ascii=False`, no BOM and no terminal newline. The saved file adds exactly one LF. Canonical map-only SHA256:

`fd34ec81afe159fbadbabd23c6f8571384825d0954c2c817b22eaf4613fb2431`

Exact saved map-file SHA256, including terminal LF:

`8800e312a8aee2f8e0dc48d3ba7add398c065f4d6ab4071e5c3344d93e4e66af`

## Scope and telemetry

Profile: compact-quality-first-v2. Mechanical ROUTE: S, exit 0; substantive scope is a bounded test correction inside the existing XL ownership feature. The owner brief explicitly excludes new mutation/full-suite repetition, product edits, network, Docker, ports, global configuration, donors, children, commit and push. Only the allowed test, this document, correction-1 evidence and final source map were written. Shared run/events/work-record and coordinator runtime artifacts were not modified by this worker. Existing coordinator launch and active attempt precede implementation.

Requested model/effort: gpt-6.1-sol/high. Native actual model/effort and fallback are unavailable inside this worker and require coordinator reconciliation; requested configuration is not proof of actual execution. Input/cache/output/reasoning usage, cost and active duration are null because native counters/wait intervals are unavailable. No savings claim is made. E2E preflight: not_applicable, focused local unit test only. Launch time, actual finish and inclusive wall duration are recorded in `correction-1-checks.json` and the final receipt.

The final CLI answer is the substantive receipt for `docs/telemetry/p-replicator/20261003T042338Z-handover/evidence/correction-1-receipt.md`; this worker does not manually write TRACE.

Status: completed
