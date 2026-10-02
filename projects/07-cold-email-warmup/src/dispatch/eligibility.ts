// Shared claim/scheduler predicate; final transport guard belongs to F03b.
export const freshMailbox=`m.state='verified_test' AND m.credential_envelope IS NOT NULL
 AND EXISTS(SELECT 1 FROM mailbox_poll p WHERE p.mailbox_id=m.id AND p.scan_complete
 AND p.completed_at<=$1 AND p.completed_at>$1::timestamptz-interval '60 seconds')`;
export const poolEligible=`${freshMailbox} AND EXISTS(SELECT 1 FROM pool_member pm JOIN consent c ON c.id=pm.consent_id
 WHERE pm.mailbox_id=m.id AND pm.tenant_id=m.tenant_id AND c.tenant_id=m.tenant_id AND c.mailbox_id=m.id
 AND c.scope='pool' AND c.scope_version=1 AND c.revoked_at IS NULL)`;
