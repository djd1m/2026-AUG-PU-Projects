# F03b durable dispatch handoff

B uses forward-only migration005; historical001–004 and A claim_order history stay intact.
SubmissionStore.submit(id,leaseOwner) uses a NEW F02 eligibilityTransaction, whose first
operation after BEGIN is lock(7,1). Conditional claimed→submitting requires matching
live owner/45s lease, due time, retry budget, current sender state/complete poll,
current consent/version, campaign/enrollment state and absence of suppression;
pool requires both current members, distinct tenants and complete fresh polls.
Fresh means 0<=age<60s. Only explicit startup DISPATCH_MODE=local_test is enabled;
absent config disables dispatch, live/unknown settings refuse startup.

Quota remains derived from send_job.state/reserved_day. Final guard counts OTHER
current-day reservations against min(user,provider,30), then moves this job's
reservation to current UTC day within the same transaction. This avoids counting
the current token twice, and defers full-day claims by releasing them into queued
at the next UTC day. claim_order is never reset. Production has no poll producer;
recordPoll is an internal fixture/F04 seam, not an HTTP freshness authority.

Commit is the irreversible in-flight boundary. Adapter runs after commit with no
DB client or lock held. Stops before commit produce zero calls; stops after commit
may leave one attempt, and future claims still apply all current guards. API job
inspection explicitly explains this boundary. SMTP accepted/local sink state is
submitted, never delivery or real external reputation.

Socket-free SubmissionAdapter receives rendered TestMessage only, no credentials.
Default local adapter accepts into durable local_test_message after final commit;
message rows contain actual sender/recipient, TEST subject/body, Message-ID,
plain body plus mandatory unsubscribe URL and List-Unsubscribe/one-click headers.
Reply messages bind In-Reply-To and References to the persisted parent Message-ID.
Each unsubscribe URL uses 32 random bytes; only SHA256 is the durable lookup key
in unsubscribe_token, with job, sender tenant/mailbox, enrollment, recipient keyed
digest and30-day expiry. The raw token is visible only in authorized message data.
F04 owns public GET/POST consumers, authorization/rate policy and real IMAP polls.
No public consumer, external SMTP, IMAP or F06 cabinet is added here.

SubmissionStore.messages(tenant) permits own sent messages OR intended pool peer
fixture messages only. Private campaign content never appears through the peer
predicate. Session-derived GET /api/dispatch/messages and GET
/api/dispatch/jobs/:id preserve authentication; foreign jobs yield404. There is no
HTTP tick, fault/barrier route or user-controlled live mode. Operator-only CLI
npm run dispatch:tick is bounded and requires local_test startup config.

Typed outcomes: accepted, permanent with no_data_submitted proof,
pre_data_transient with no_data_submitted proof, ambiguous. Only trusted pre-DATA
transient outcomes schedule5s then30s, max3 total before120s; retries re-enter claim
and final guards. Invalid proof/exception is ambiguous. Proven failures release
quota; ambiguous retains it. Terminal failure outcomes cannot be claimed even if
a paused campaign is later restarted. recoverAbandoned changes submitting older
than120s to SQL unknown (API unknown_delivery), retaining quota; it never queues
or fabricates proof. A caller crash after final commit follows that path.

F04 shared durable effects: DispatchSeams.stopEnrollment(tenant,id,'replied'),
suppress(tenant,recipientDigest,'unsubscribe'), and complaint(tenant,mailbox,digest?)
use the same lock first. Complaint suppression/enrollment cancellation, mailbox
quarantine and existing F02 cancelMailbox are atomic. F04 must call these same
writers after verifying observation/token authority. Existing F02 consent, edit,
pause, mailbox eligibility/limit writers are reused without new lock namespaces.

Verification commands/evidence and exact source/image digests live in the bound
sol-b-receipt.md. Independent B review is parent-owned and required for whole F03
acceptance. Author tests do not substitute for that review.
