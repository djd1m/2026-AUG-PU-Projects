# F01 algorithm binding

### Algorithm: identity-credential-bootstrap

REQUIREMENT: `AC-f01-foundation-auth-001`
REQUIREMENT: `AC-f01-foundation-auth-002`
REQUIREMENT: `AC-f01-foundation-auth-003`
REQUIREMENT: `AC-f01-foundation-auth-004`
REQUIREMENT: `AC-f01-foundation-auth-005`

Use docs/Pseudocode.md Identity and credential boundaries steps1–3 unchanged.
HTTP bounds→Origin→normalizedinput→atomicDBratebuckets→KDFadmission→exactArgon2→
transactionaccount/sessiongrant→HttpOnlySameSite cookie. Logout revokes digest
before clearing cookie. Session lookups join active account/tenant; use one pg
transaction client. Randomopaque32byte session;>=32byte sessionHMAC key fromruntime.
Every mailbox query includes serverderivedtenant plus validatedUUID. Bootstrap
migration creates tenant/account/session/authbucket/minimalmailbox metadata schema.
No credentials/consent/transport columns silently count as implemented F02.

### Algorithm: identity-verification

REQUIREMENT: `AC-f01-foundation-auth-006`

Verification binding: follow the unchanged conditions in `01_specification.md` for the claimed legacy verification AC, using the existing `05_completion.md` execution/acceptance procedure and historical `review-report.md`. Run only the stage-authorized gates; source-bound historical results remain attached to their original receipts. This document repair executes no runtime gates and grants no new acceptance.
