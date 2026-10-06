# F02 algorithm binding

### Algorithm: encrypted-mailbox-save

REQUIREMENT: `AC-f02-mailboxes-consent-001`
REQUIREMENT: `AC-f02-mailboxes-consent-002`
REQUIREMENT: `AC-f02-mailboxes-consent-003`

Canonical docs/Pseudocode.md Identity boundaries steps4–6; Consent steps1–2.
Validate input/tenant/origin→normalize operator-host→resolve public addresses→
create mailboxUUID→AEAD with mailbox/tenant/keyversionAAD→transactionpersist→
masked response. Public connector resolves again immediately before bounded I/O;
pin approvedaddress while verifying TLS servername. Save itself never callsSMTP.
Decrypt errors and adapter errors cross only typed errorcodes; no providertext.

### Algorithm: serialized-consent

REQUIREMENT: `AC-f02-mailboxes-consent-004`
REQUIREMENT: `AC-f02-mailboxes-consent-005`

Consent writer begins transaction and takes advisory xact lock(7,1) BEFORE reads.
Derive tenant from session; lock/check owned mailbox and referenced currentcampaign.
Grant explicit exactscope/version/recipientsnapshot/disclosureversion. Revoke
updates timestamp, withdraws corresponding membership and cancels queued/claimed
jobs, preserves submitting. Campaign edits invalidate only their consent. Future
F03 final submission must use this exported same-lock helper and current predicates.

### Algorithm: mailbox-consent-verification

REQUIREMENT: `AC-f02-mailboxes-consent-006`

Verification binding: follow the unchanged conditions in `01_specification.md` for the claimed legacy verification AC, using the existing `05_completion.md` execution/acceptance procedure and historical `review-report.md`. Run only the stage-authorized gates; source-bound historical results remain attached to their original receipts. This document repair executes no runtime gates and grants no new acceptance.
