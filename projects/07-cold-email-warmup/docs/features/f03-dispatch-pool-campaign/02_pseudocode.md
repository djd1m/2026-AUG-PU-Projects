# F03 algorithm binding

### Algorithm: planning-pool-reservation

REQUIREMENT: `AC-f03-dispatch-pool-campaign-001`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-002`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-003`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-004`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-005`

Use canonical Pseudocode sections Consent/cohort and Preview/reserve/dispatch
without weakening predicates. F03a implements durable planning/claim only;
F03b adds final authority and socket-free local sink. Both use the SAME exported
eligibilityTransaction helper from F02. Never hold its transaction over I/O.

Validate entire campaign before any insert; serialize edit/start/pause; bind
versions and recipient snapshot; encrypted enrollment addresses + keyed digest.
Pool scheduler selects distinct tenants with affirmative current disclosure and
fresh complete poll; create pair/day initial idempotently and one parent reply.
Claim is a reservation, not permission; recover expired lease once without quota
leak. Final transition must re-evaluate actual current state and UTC date.

### Algorithm: final-submit-outcomes

REQUIREMENT: `AC-f03-dispatch-pool-campaign-007`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-009`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-010`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-011`

Bind the canonical Preview/reserve/dispatch final transition and outcomes procedure: recheck every current predicate and UTC quota under the same FIRST lock, commit submitting before bounded local sink I/O, retain Message-ID/unsubscribe rendering, and classify only proved pre-DATA failures for bounded retry. Unknown outcomes retain quota with zero automatic resend. Exact guards, clock boundaries and operator-only test seams remain those of legacy AC-B1/B3/B4/B5 in `01_specification.md`.

### Algorithm: dispatch-race-verification

REQUIREMENT: `AC-f03-dispatch-pool-campaign-006`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-008`
REQUIREMENT: `AC-f03-dispatch-pool-campaign-012`

Tests inject clock, barriers and test adapter at typed seams. Stop writer commits
on shared lock before/after final transition, with real concurrent connections.
Do not substitute independent in-memory booleans for PostgreSQL authority.

Verification binding: follow the unchanged conditions in `01_specification.md` for the claimed legacy verification AC, using the existing `05_completion.md` execution/acceptance procedure and historical `acceptance.md`. Run only the stage-authorized gates; source-bound historical results remain attached to their original receipts. This document repair executes no runtime gates and grants no new acceptance.
