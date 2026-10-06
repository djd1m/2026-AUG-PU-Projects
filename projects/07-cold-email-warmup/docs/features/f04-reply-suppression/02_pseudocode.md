# F04 delta algorithms

### Algorithm: reply-page-effects

REQUIREMENT: `AC-f04-reply-suppression-001`
REQUIREMENT: `AC-f04-reply-suppression-002`

Ingest: validate bounded typed headers/range outside transaction → eligibilityTransaction lockFIRST → verify tenant/mailbox/run/validity/expected cursor and attempt budget using post-lock clock → persist observations/message ledger → find own sent References and exact recipient → INSERT unique semantic effect RETURNING → only returned effect invokes shared client-level stop/counter → update cursor/page count → optional injected crash BEFOREcommit → COMMIT → optional AFTERcommit crash. Duplicate/old page has no new effects; stale run rejects. Header ledger must not suppress correct semantic processing merely because another incoming message reused an ID; semantic effect is authority.

### Algorithm: rescan-high-water-budget

REQUIREMENT: `AC-f04-reply-suppression-003`
REQUIREMENT: `AC-f04-reply-suppression-004`

Begin/reset: lockFIRST, capture trusted UIDVALIDITY and UIDNEXT-1 in immutable run. Mark poll incomplete without changing mailbox quarantine/consent. Next page validates coverage, including empty sparse ranges. Budget exhaustion leaves incomplete; explicit retry starts new attempt retaining run/H/cursor. Finish only with fully coveredH and successful bounded tail under same validity; tail page effects and poll completion atomic, post-lock timestamp. New reset supersedes old in-progress run, stale callback cannot clear pause. No adapter IO under lock.

### Algorithm: public-stop-consumers

REQUIREMENT: `AC-f04-reply-suppression-007`
REQUIREMENT: `AC-f04-reply-suppression-008`
REQUIREMENT: `AC-f04-reply-suppression-009`
REQUIREMENT: `AC-f04-reply-suppression-010`

Optout: read token hash GET for confirmation; all business changes exclusively POST. At POST lockFIRST → validate bound capability/expiry → tenant suppression and pending cancellation → pool recipient withdrawal if pool job → generic result. Complaint: authenticate operator and rate limit → lockFIRST → event dedup → suppression/quarantine/cancel all atomic. Pool withdrawal revokes target participant membership globally and does not expose its tenant.

### Algorithm: bounded-poll-worker

REQUIREMENT: `AC-f04-reply-suppression-011`

Poll loop: process gate disabled/local_test → durable fixture adapter obtains bounded validity/coverage headers with typed timeout → A state machine apply → same-validity tail completion → next due30s. An empty local fixture is explicit fixture evidence, never represented as a real IMAP success. No HTTP feed of user-chosen completedAt.

### Algorithm: reply-stop-verification

REQUIREMENT: `AC-f04-reply-suppression-005`
REQUIREMENT: `AC-f04-reply-suppression-006`
REQUIREMENT: `AC-f04-reply-suppression-012`

Verification binding: follow the unchanged conditions in `01_specification.md` for the claimed legacy verification AC, using the existing `05_completion.md` execution/acceptance procedure and historical `acceptance.md`. Run only the stage-authorized gates; source-bound historical results remain attached to their original receipts. This document repair executes no runtime gates and grants no new acceptance.
