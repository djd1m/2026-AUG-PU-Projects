# F02 algorithm binding

Canonical docs/Pseudocode.md Identity boundaries steps4–6; Consent steps1–2.
Validate input/tenant/origin→normalize operator-host→resolve public addresses→
create mailboxUUID→AEAD with mailbox/tenant/keyversionAAD→transactionpersist→
masked response. Public connector resolves again immediately before bounded I/O;
pin approvedaddress while verifying TLS servername. Save itself never callsSMTP.
Decrypt errors and adapter errors cross only typed errorcodes; no providertext.

Consent writer begins transaction and takes advisory xact lock(7,1) BEFORE reads.
Derive tenant from session; lock/check owned mailbox and referenced currentcampaign.
Grant explicit exactscope/version/recipientsnapshot/disclosureversion. Revoke
updates timestamp, withdraws corresponding membership and cancels queued/claimed
jobs, preserves submitting. Campaign edits invalidate only their consent. Future
F03 final submission must use this exported same-lock helper and current predicates.
