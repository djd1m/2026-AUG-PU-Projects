# Verification contract

Apply these gates to the exact source/build under review.

1. Confirm separate plan and implementation ROUTEs at their applicable stages;
   retain substantive risk rationale even when the mechanical lower bound is low.
2. Confirm preparation scope, exclusions, AC, donor provenance/compatibility, and
   a source-backed forecast or `insufficient_data` with numeric fields `null`.
3. If approval is explicitly required, prove it covers the applicable plan, team,
   roles, requested models, and skills. Do not manufacture an approval requirement
   or request approval again merely because work paused.
4. Apply preflight immediately before actual E2E, not universally before code.
   Accept a reasoned `not_applicable` for docs-only/not-yet-E2E stages. Missing
   source, build, input, or allowed environment prevents `ready` and blocks an E2E
   claim, but a blocked/inconclusive preflight may honestly leave a future build null.
5. Confirm RUN_ID and attempt history survive pause/resume. A required native
   checkpoint must be fresh and valid; a caller without one uses a reasoned handoff.
   Reconcile changed source and rerun affected checks.
6. Require all mandatory AC to pass with fresh, unique, source-bound terminal
   receipts. Missing, empty, stale, partial, failed, symlinked, duplicate, or
   unreadable evidence cannot pass. Accepted-scope pending work blocks delivery;
   explicit out-of-scope pending work remains disclosed without blocking it.
7. Run fixed tests against four temporary validator mutations that independently
   disable ROUTE, preflight, checkpoint, and receipt guards. Verify each mutation
   changes bytes and makes the fixed guard test fail.
8. Run an independent semantic forward-test over the ten coordinator-owned cases:
   clean start, approval stop, incompatible donor, unknown forecast/usage, ready
   preflight, blocked preflight, pause/resume, stale source/approval, false delivery,
   and missing portable dependency. Evaluate decisions and artifacts, not wording.
9. Copy the skill to a different local repository whose path contains spaces and
   invoke it from another cwd. Runtime references must be relative or explicitly
   rooted; a missing dependency is a blocker, not an installation request.
10. Diagnose only through the existing `project-telemetry` analyzer. Preserve null
    actual-model/usage values, corrupt-input warnings, and limitations; do not claim
    savings without a comparable baseline.
11. Compare changed and untracked paths against the approved allowlist. This skill's
    tests cover its directory; the integration coordinator performs the repository
    scope guard, including vendor/core/global/product paths.

The deterministic validator is deliberately narrower than semantic acceptance.
An independent reviewer owns the forward-test oracle; it is not embedded here.
No shared mutable resource is introduced, so a concurrency test is not applicable.
