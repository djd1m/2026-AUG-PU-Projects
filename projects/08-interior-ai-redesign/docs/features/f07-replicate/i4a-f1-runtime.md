# I4a F1 real PostgreSQL correction proof

2026-10-03, frozen product d7c0970c. Cached Node22/PG16, CPU2, readonly exact three-file overlays, private DB/no host ports. Runtime 10:21:40–10:23:21 UTC; summary overall_exit0, cleanup0. Corrected lifecycle 18/18 TAP, I1 16/16, old jobs 21/21. No provider calls, spend0.

New lifecycle test against baseline38d870e6 returned exit1 at the exact new cleanup-only case: its first independent workerContext assertion received submission_fence_expired rather than cleanup-specific submission_binding_mismatch. This proves that assertion detects the prior behavior; it does **not** independently reproduce the later erroneous reclaim because execution stops at that assertion. The corrected run executes the entire two-contender/reclaim/unique-release/immutable-state conjunction plus live-recovered-context refusal. Baseline provider module has only the exact new pure isCleanupOnly export appended for import compatibility; no baseline call site invokes it. Both overlay hashes are preserved in the baseline map. This is supplemental regression proof, not the later mandatory send-CAS mutation.

Receipts: docs/telemetry/n8-20261002-1740/replicate-i4a-f1-pg-{summary,baseline-map}.json and corresponding logs/runner. Original failed baseline retained. Integration/review still required; full F07 not accepted.
