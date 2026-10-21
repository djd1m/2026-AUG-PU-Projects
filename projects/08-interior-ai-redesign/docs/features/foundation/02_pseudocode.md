# foundation — algorithms

Logical data/ports/API source: ../../Pseudocode.md (exact current hash af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59). No second model list/schema.

### Algorithm: Authenticate
REQUIREMENT: `FR-foundation-1`
REQUIREMENT: `AC-foundation-1`
REQUIREMENT: `AC-foundation-2`
REQUIREMENT: `AC-foundation-3`
REALISES: SC-US-001-1, SC-US-001-2, SC-US-001-3
INPUT: registration/login/logout request, credentials or session token. OUTPUT: cookie/session or 401.
1. Call GuardRequest; normalize email, validate bounds; password hashing outside DB transaction. Use donor constant-work dummy hash for missing account; reject password >72 UTF-8 bytes explicitly before bcrypt.
2. Register atomically unique canonical email + session; duplicate email returns the same neutral registration response without usable session. Login compares hash and active status; issue random token, persist hash/expiry only.
3. Authenticate every request by unexpired, unrevoked Session joined to active Account; IF missing RETURN 401. Logout sets revokedAt; rotate token on login, set cookie flags.
COMPLEXITY: O(1) indexed lookups plus bounded password hash cost.


### Algorithm: ProjectCommand
REQUIREMENT: `FR-foundation-2`
REQUIREMENT: `AC-foundation-4`
REQUIREMENT: `AC-foundation-5`
REALISES: SC-US-002-1, SC-US-002-2
INPUT: actor, project command, expectedVersion. OUTPUT: owned project/list or error.
1. GuardRequest and EnforceBounds; query only actor-owned rows. Create under account lock checks project count; initial version=1, private state.
2. On edit lock owned Project; IF archived RETURN 409; IF version mismatch RETURN 409. Rename/region change increments version; changed region/store makes dependent data effectively stale through context mismatch, never rewrites immutable snapshots.
3. Archive command acquires the spend global mutex BEFORE Account/Project locks because it may release holds; sets state archived, revokes ShareLinks, prevents future dispatch; queued jobs are failed before dispatch with reservation/credit release. Running/uncertain jobs cannot be assumed canceled at provider; completion is suppressed, costs retained/reconciled.
COMPLEXITY: O(page size + affected queued jobs/links); archive uses indexed set-based operations, not a lifetime-count bound.


### Algorithm: GuardRequest
REQUIREMENT: `NFR-foundation-1`
REQUIREMENT: `AC-foundation-6`
REQUIREMENT: `AC-foundation-7`
REQUIREMENT: `AC-foundation-8`
REQUIREMENT: `AC-foundation-9`
REQUIREMENT: `AC-foundation-10`
REQUIREMENT: `AC-foundation-11`
REQUIREMENT: `AC-foundation-12`
REALISES: SC-US-016-1, SC-US-016-2, SC-US-016-3, SC-US-019-1, SC-US-020-1, SC-US-020-2, SC-US-021-1
INPUT: request, required access level. OUTPUT: ActorContext or typed error.
1. Pre-body-only transport/header/peer guard: authenticate cookie, exact Origin/owner/header checks and atomic auth/public IP or account rate gate; RETURN ActorContext without consuming the body. JSON route then reads bounded256KiB/10s JSON outside DB transaction and validates schema. Upload route owns its sole actual-byte-bounded stream read; GuardRequest never parses multipart/file bytes. Authenticated mutations require exact configured Origin as CSRF defense (including register/login/logout); deny missing/foreign Origin, no permissive CORS. Webhook uses its own verification; no cookie-authorized exemption.
2. Read Session/Account for protected routes; all repository access includes account/project predicate. Project-scoped supplied relation IDs must resolve under that same scope; missing/foreign→404.
3. The pre-body gate uses atomic UPSERT RateBucket under unique subjectHash/kind/window, counts all attempts then rejects above cap with429; subject derives direct peer/trusted proxy chain, not arbitrary forwarded headers. Log only requestId/code/latency/hashed IDs.
COMPLEXITY: O(1) indexed checks.


