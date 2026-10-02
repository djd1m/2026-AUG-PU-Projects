# F03 algorithm binding

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

Tests inject clock, barriers and test adapter at typed seams. Stop writer commits
on shared lock before/after final transition, with real concurrent connections.
Do not substitute independent in-memory booleans for PostgreSQL authority.
