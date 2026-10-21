# F14 independent F-1 correction review — review-2

Verdict: **ACCEPT_WITH_CAVEATS**. **F-1 closed**. The bounded correction satisfies the matcher and privacy regression obligations without weakening the existing first-touch tests. No new finding was established within this narrow scope. This verdict does not accept all of F14 or its outstanding production UI gates.

Run-ID: 20261003T042338Z-handover
Work-Unit-ID: handover-correction-review
Attempt-ID: review-2
Source-Revision: ac2a4490b0c7a3251f2105252577f546f2f6b605
Build-Revision: none
Launch-SHA256: f95684ab8737edbae8548ad6ddde95122bade551b5cce4c27e91a3ef613c8f79
Profile: compact-quality-first-v2; bounded independent REVIEW inside the existing XL ownership feature.

## Obligations and actual source

Canonical Specification FR-n6b-11 / SC-US-011-1 requires landing first-touch attribution with a 30-day cookie. FR-n6b-14 / SC-US-014-1..4 defines the sensitive, one-use account handover; Refinement Security Hardening requires no-store public pages. The explicit handover no-referrer/noindex/nofollow header contract is in the accepted F14 plan, section 6; those exact header strings are not verbatim FR14 text.

The actual `apps/web/src/middleware.ts` sets `private, no-store`, adds `no-referrer` and `noindex, nofollow` for `/handover/`, and returns for every non-root path before referral-cookie processing. Its exact matcher is `['/', '/b/:path*', '/handover/:path*']`. The referral helper retains the 30-day TTL and refuses to overwrite any existing cookie. Thus the F-1 oracle must preserve root attribution while proving that a valid ref cannot create a cookie on the handover page. This is a middleware unit boundary, not proof of deployed framework/header/stream behavior.

The medium F-1 in `08_review.md` identifies precisely the stale two-route matcher expectation. The corrected `apps/web/tests/unit/referral-cookie.test.ts` now asserts all three exact routes and invokes actual middleware with a `NextRequest` for `/handover/token?ref=Abcdef_12345`. The new test checks `private, no-store`, `no-referrer`, `noindex, nofollow`, null Set-Cookie and absent n6b_ref. The ref satisfies the real 12-character validator, so this test cannot pass merely because of invalid input. Root first-touch cookie attributes/TTL, no-overwrite/no-renewal, demo, invalid-ref and development/read-cookie assertions remain intact.

Independent read-only reversal of just the matcher edit and added test yields the recorded original test SHA256 `756ed80665dd1926ffcc1007a58eaf132272b9d179a616b9ca05e8d84776c630`. This supports the correction report's preservation claim without trusting its conclusion alone.

## Source identity verified

HEAD matches Source-Revision. Independent exact-byte hashing found:

- Original implementation map: 22 entries, all 22 current files match; all original entries retained unchanged in the final map.
- Original map file SHA256: `0c1ea7f83dedd9fd498141157982df546363ecf67b19ca325fad76dd76d1d4fe`.
- Final map: 23 entries, all 23 current files match; sole added entry is `apps/web/tests/unit/referral-cookie.test.ts`.
- Final map file SHA256: `8800e312a8aee2f8e0dc48d3ba7add398c065f4d6ab4071e5c3344d93e4e66af`.
- Corrected test SHA256: `a1ac5cadc460a2151919c3c245a341360fee3dcd0a6a5a0190d72cfb62cf5810`.
- Launch file SHA256 matches the caller-known Launch-SHA256 above.

Map-file hashes include the terminal LF. Files are `tests/artifacts/handover/{implementation-source-hashes,final-source-hashes}.json`. The snapshot, rather than HEAD alone, binds this verdict.

## Saved execution evidence inspected; nothing rerun

All paths below are relative to `tests/artifacts/handover/`.

| Evidence | Observed result and interpretation |
| --- | --- |
| `correction-1-focused-test.txt`, `correction-1-focused-test-exit.txt`, `correction-1-checks.json` | Recorded Node v22.22.3; actual focused Vitest log 12 passed / 0 failed, exit 0. Command: `PATH=/tmp/n6b-f06-node22/bin:$PATH node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/referral-cookie.test.ts`. Reviewer did not execute it. |
| `final-full-regression.txt`, `full-stage-exits.json` | Original unit run: 633 passed / 1 failed; sole failure is the stale referral matcher, with 10 passing tests in that seam. Original stage exits: typecheck 0, unit 1, integration 0, critical mutation 0, build 0. Historical aggregate failure remains valid history. |
| Original unit log plus corrected source/focused log | Replacing the old seam with the corrected seam gives 633 - 10 + 12 = **635 unique passing unit tests by source-bound union**. The corrected 12 contain the previous 10 passes, the fixed failure, and one added privacy test. This is not a monolithic final full-suite green run. |
| `final-full-regression.txt` | Original real-PG regression: 293 passed in 28 files. These saved results apply to the unchanged original implementation snapshot. |
| `pg-mutation-result.json`, `pg-mutation-baseline.log`, `pg-mutation-red.log`, `pg-mutation-restored-green.log`, `mutate-critical-guard.mjs` | Fixed claimed-keep-access test baseline exit 0; removing the unclaimed guard gives exit 1 with behavioral AssertionError at handover.int.test.ts:110 (expected gone, received accountId); exact restoration gives exit 0. Before/after source SHA256 both `bc32b496bee50a0e52bfe76fe034734513db439b50e947e786a29df99721f798`. This is a meaningful saved semantic failure, not a setup/network/timeout error. No mutation executed by reviewer. |

## Caveats, ownership and execution receipt

Only F-1 is closed. The coordinator owns corrected runner/type evidence, production image identities and actual production UI checks. At inspection, `corrected-image-build.txt` showed completed runner export and `corrected-typecheck.txt` showed the tsc invocation without a terminal exit receipt; neither is promoted here to a complete final production gate. UI remains pending, including both keep-access branches and runtime cookie/header/body-stream behavior. No broad new review or forced findings were added.

Applied skill: `../../.claude/skills/project-work-companion/SKILL.md`, delivery/evidence stage. E2E preflight: not_applicable, because this is a bounded read-only review of saved evidence. Existing run, events, work record and native telemetry remain coordinator-owned; the pre-existing review-2 launch binds this attempt. No manual TRACE write, product edit, tests, probes, network, Docker/port operations, donor access, children, commit or global change occurred. The reviewer writes only this report; the full final CLI answer is the receipt for `docs/telemetry/p-replicator/20261003T042338Z-handover/evidence/review-2-receipt.md`.

Requested model/effort: gpt-6-astra/high. Brief reports execution fallback gpt-6.1-sol/high; native actual model/effort and fallback metadata are not exposed inside this attempt, so independently verified actual fields remain unknown pending coordinator reconciliation. No model switch is claimed. Input/cache/output/reasoning tokens, cost and active duration are null; no native counters or authoritative wait intervals were supplied. Savings are not established.

Launch time: 2026-10-03T05:11:57.502963+00:00. Hard budget: 240 seconds, including reads, report and final receipt.
Report-Written-At: 2026-10-03T05:15:27.371663+00:00
Elapsed-to-report-seconds: 209.869
Final receipt records the actual attempt finish separately.

Status: completed
