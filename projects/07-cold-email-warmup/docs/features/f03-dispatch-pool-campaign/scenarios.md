# f03-dispatch-pool-campaign — derived contract scenarios

These newly authored Given/When/Then scenarios derive only the unchanged legacy clauses. They are a test plan, not executable tests or runtime PASS. The entire quoted paragraph remains normative; Examples instantiate it and never remove other assertions. Existing canonical/security BDD remain inherited. Use literal executable witnesses and their limits from `05_completion.md`; each composite gate still needs its source-bound runtime/review evidence.

## SC-f03-dispatch-pool-campaign-001

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-001`, legacy `AC-A1`. Exact acceptance paragraph:

> AC-A1: owned campaigns expose list/read/preview/edit/start/pause with tenant404,
> session401 and Origin403. <=5 steps, <=100 recipients/import, delay>=24h, known
> personalization fields; reject missing field, subject/address CRLF and unsafe
> source markup before jobs. Preview escapes values, delivery payload plain text.
> Existing F02 campaign snapshots remain meaningful: content/recipient changes
> increment version and invalidate consent atomically under lock(7,1).

```gherkin
@AC-f03-dispatch-pool-campaign-001 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-001
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: owned campaigns expose list/read/preview/edit/start/pause with tenant404, session401 and Origin403. <=5 steps, <=100 recipients/import, delay>=24h, known personalization fields
  And the unchanged contract assertion holds: reject missing field, subject/address CRLF and unsafe source markup before jobs.
  And the unchanged contract assertion holds: Preview escapes values, delivery payload plain text.
  And the unchanged contract assertion holds: Existing F02 campaign snapshots remain meaningful: content/recipient changes increment version and invalidate consent atomically under lock(7,1).
  Examples:
    | case | expected |
    | 5steps100recipients24h | valid bounded API persists; invalid400and0jobs; valuesescaped plain text; tenant404/session401/Origin403; content-recipient edit atomically bumpsversion andinvalidatesconsent under7,1 |
    | 6steps101recipients23h | valid bounded API persists; invalid400and0jobs; valuesescaped plain text; tenant404/session401/Origin403; content-recipient edit atomically bumpsversion andinvalidatesconsent under7,1 |
    | missing field or CRLF-script | valid bounded API persists; invalid400and0jobs; valuesescaped plain text; tenant404/session401/Origin403; content-recipient edit atomically bumpsversion andinvalidatesconsent under7,1 |
    | foreign IDs | valid bounded API persists; invalid400and0jobs; valuesescaped plain text; tenant404/session401/Origin403; content-recipient edit atomically bumpsversion andinvalidatesconsent under7,1 |
```

## SC-f03-dispatch-pool-campaign-002

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-002`, legacy `AC-A2`. Exact acceptance paragraph:

> AC-A2: explicit start requires current campaign-version/recipient consent for
> selected owned mailboxes and inserts durable unique(campaign,enrollment,step)
> jobs once. Store encrypted recipient address and keyed recipient hash, no
> plaintext contacts/credential dumps in logs. Pausing cancels queued/claimed.

```gherkin
@AC-f03-dispatch-pool-campaign-002 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-002
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: explicit start requires current campaign-version/recipient consent for selected owned mailboxes and inserts durable unique(campaign,enrollment,step) jobs once.
  And the unchanged contract assertion holds: Store encrypted recipient address and keyed recipient hash, no plaintext contacts/credential dumps in logs.
  And the unchanged contract assertion holds: Pausing cancels queued/claimed.
  Examples:
    | case | expected |
    | parallel explicit starts | one durable job percampaign-enrollment-step; encrypted address/keyedhash no plaintext logs; missingcurrent senderconsent0jobs; pausecancelsqueuedclaimed |
    | changed current consent | one durable job percampaign-enrollment-step; encrypted address/keyedhash no plaintext logs; missingcurrent senderconsent0jobs; pausecancelsqueuedclaimed |
    | pause | one durable job percampaign-enrollment-step; encrypted address/keyedhash no plaintext logs; missingcurrent senderconsent0jobs; pausecancelsqueuedclaimed |
```

## SC-f03-dispatch-pool-campaign-003

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-003`, legacy `AC-A3`. Exact acceptance paragraph:

> AC-A3: pool aggregate counts only current opted-in, eligible, freshly polled,
> non-quarantined mailboxes; reports waiting with fewer than two distinct tenants.
> No cross-tenant directory/API disclosure. Deterministic templates and stable
> unordered pair/day key; one initial plus at most one reply, unique parent reply,
> reply cannot enqueue reply. All pool jobs use the shared dispatcher queue.

```gherkin
@AC-f03-dispatch-pool-campaign-003 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-003
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: pool aggregate counts only current opted-in, eligible, freshly polled, non-quarantined mailboxes
  And the unchanged contract assertion holds: reports waiting with fewer than two distinct tenants.
  And the unchanged contract assertion holds: No cross-tenant directory/API disclosure.
  And the unchanged contract assertion holds: Deterministic templates and stable unordered pair/day key
  And the unchanged contract assertion holds: one initial plus at most one reply, unique parent reply, reply cannot enqueue reply.
  And the unchanged contract assertion holds: All pool jobs use the shared dispatcher queue.
  Examples:
    | case | expected |
    | one eligible tenant | waiting0jobs forless2tenants; only opted-in fresh nonquarantined aggregate; no foreigndirectory; stablepairday and uniqueparentreply max2messages usingcommonqueue |
    | two tenants and replay pairday | waiting0jobs forless2tenants; only opted-in fresh nonquarantined aggregate; no foreigndirectory; stablepairday and uniqueparentreply max2messages usingcommonqueue |
    | already replied parent | waiting0jobs forless2tenants; only opted-in fresh nonquarantined aggregate; no foreigndirectory; stablepairday and uniqueparentreply max2messages usingcommonqueue |
```

## SC-f03-dispatch-pool-campaign-004

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-004`, legacy `AC-A4`. Exact acceptance paragraph:

> AC-A4: atomic claim under shared lock first + SKIP LOCKED reserves common
> warmup/campaign quota, min(user,provider,30), default10. Twenty contenders with
> remaining3 obtain<=3 reservations. Lease45s; expired claimed can be recovered
> without duplicate quota, submitting/unknown never recovered for resend. Claim
> alone has zero transport calls. Mailbox selection rotates among eligible senders.

```gherkin
@AC-f03-dispatch-pool-campaign-004 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-004
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: atomic claim under shared lock first + SKIP LOCKED reserves common warmup/campaign quota, min(user,provider,30), default10.
  And the unchanged contract assertion holds: Twenty contenders with remaining3 obtain<=3 reservations.
  And the unchanged contract assertion holds: Lease45s
  And the unchanged contract assertion holds: expired claimed can be recovered without duplicate quota, submitting/unknown never recovered for resend.
  And the unchanged contract assertion holds: Claim alone has zero transport calls.
  And the unchanged contract assertion holds: Mailbox selection rotates among eligible senders.
  Examples:
    | case | expected |
    | 20contenders quota3 | atmost3commonreservations; FIRSTlock+SKIPLOCKED andminuserprovider30default10; claim0transport; expiredclaimed recovers once; neverresend submittingunknown; eligible sendersrotate |
    | claim45s expiration | atmost3commonreservations; FIRSTlock+SKIPLOCKED andminuserprovider30default10; claim0transport; expiredclaimed recovers once; neverresend submittingunknown; eligible sendersrotate |
    | submittingunknown recovery | atmost3commonreservations; FIRSTlock+SKIPLOCKED andminuserprovider30default10; claim0transport; expiredclaimed recovers once; neverresend submittingunknown; eligible sendersrotate |
    | equalclock rotation | atmost3commonreservations; FIRSTlock+SKIPLOCKED andminuserprovider30default10; claim0transport; expiredclaimed recovers once; neverresend submittingunknown; eligible sendersrotate |
```

## SC-f03-dispatch-pool-campaign-005

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-005`, legacy `AC-A5`. Exact acceptance paragraph:

> AC-A5: add durable poll/suppression/enrollment seams needed by final guards; absent
> poll or incomplete scan stays blocked. Tests may inject explicit local complete
> poll fixtures; production must not manufacture freshness or reputation. This
> slice exposes no public endpoint to fabricate real polling evidence.

```gherkin
@AC-f03-dispatch-pool-campaign-005 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-005
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: add durable poll/suppression/enrollment seams needed by final guards
  And the unchanged contract assertion holds: absent poll or incomplete scan stays blocked.
  And the unchanged contract assertion holds: Tests may inject explicit local complete poll fixtures
  And the unchanged contract assertion holds: production must not manufacture freshness or reputation.
  And the unchanged contract assertion holds: This slice exposes no public endpoint to fabricate real polling evidence.
  Examples:
    | case | expected |
    | absentpoll | firsttwoblock; fixtureonly explicitlylocal; durable suppression-enrollment seams consulted; no user endpoint fabricates realfreshness/reputation |
    | incomplete scan | firsttwoblock; fixtureonly explicitlylocal; durable suppression-enrollment seams consulted; no user endpoint fabricates realfreshness/reputation |
    | explicit trusted complete TESTpoll | firsttwoblock; fixtureonly explicitlylocal; durable suppression-enrollment seams consulted; no user endpoint fabricates realfreshness/reputation |
    | public fabricated freshness | firsttwoblock; fixtureonly explicitlylocal; durable suppression-enrollment seams consulted; no user endpoint fabricates realfreshness/reputation |
```

## SC-f03-dispatch-pool-campaign-006

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-006`, legacy `AC-A6`. Exact acceptance paragraph:

> AC-A6: unit + realPG prove validation, idempotence, isolation, shared pool privacy,
> quota concurrency and leases; meaningful guard mutation, full affected F01/F02
> regression, typecheck/lint/build/securityscan. No transport implementation claimed.

```gherkin
@AC-f03-dispatch-pool-campaign-006 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-006
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the original verification or delivery procedure is evaluated for <case> with actual commands, receipts and independent review
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: unit + realPG prove validation, idempotence, isolation, shared pool privacy, quota concurrency and leases
  And the unchanged contract assertion holds: meaningful guard mutation, full affected F01/F02 regression, typecheck/lint/build/securityscan.
  And the unchanged contract assertion holds: No transport implementation claimed.
  Examples:
    | case | expected |
    | unit realPG quota lease isolation privacy | all focused outcomes plus meaningfulguardmutation RED/restoredGREEN and fullaffected regression/type/lint/build/security required; no transport acceptance in planning slice |
    | finalmutation not RED | all focused outcomes plus meaningfulguardmutation RED/restoredGREEN and fullaffected regression/type/lint/build/security required; no transport acceptance in planning slice |
    | failed F01F02regression | all focused outcomes plus meaningfulguardmutation RED/restoredGREEN and fullaffected regression/type/lint/build/security required; no transport acceptance in planning slice |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.

## SC-f03-dispatch-pool-campaign-007

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-007`, legacy `AC-B1`. Exact acceptance paragraph:

> AC-B1: fresh transaction takes same lock(7,1) FIRST and conditionally updates
> claimed→submitting after job/lease owner, current sender consent/version,
> enrollment/suppression, campaign state/version, mailbox/quarantine, pool recipient
> eligibility, complete poll age0<=age<60s and operator test/live gate checks.
> Move prior UTC-day reservation atomically to current day or defer when full.

```gherkin
@AC-f03-dispatch-pool-campaign-007 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-007
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: fresh transaction takes same lock(7,1) FIRST and conditionally updates claimed→submitting after job/lease owner, current sender consent/version, enrollment/suppression, campaign state/version, mailbox/quarantine, pool recipient eligibility, complete poll age0<=age<60s and operator test/live gate checks.
  And the unchanged contract assertion holds: Move prior UTC-day reservation atomically to current day or defer when full.
  Examples:
    | case | expected |
    | stop before final | FIRST7,1 rechecks alljobleaseconsentversion enrollment-suppression campaign-mailbox-poolgate predicates; only completeage0..less60 qualifies; movequota currentUTCday or defer |
    | leaseowner invalid | FIRST7,1 rechecks alljobleaseconsentversion enrollment-suppression campaign-mailbox-poolgate predicates; only completeage0..less60 qualifies; movequota currentUTCday or defer |
    | pollage59.999or60orfuture | FIRST7,1 rechecks alljobleaseconsentversion enrollment-suppression campaign-mailbox-poolgate predicates; only completeage0..less60 qualifies; movequota currentUTCday or defer |
    | UTCmidnightfull | FIRST7,1 rechecks alljobleaseconsentversion enrollment-suppression campaign-mailbox-poolgate predicates; only completeage0..less60 qualifies; movequota currentUTCday or defer |
```

## SC-f03-dispatch-pool-campaign-008

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-008`, legacy `AC-B2`. Exact acceptance paragraph:

> AC-B2: commit is irreversible boundary; no lock held across adapter I/O. Every
> stop case SC-US-003-4/5 has explicit before/after-barrier realPG race: revocation,
> version, pause, both pool withdrawals, reply, suppression, complaint/quarantine,
> mailbox eligibility and lowered limit. Before=>0calls; after=>at most one current
> attempt, later0. F04 consumes these real shared stop writers, not separate locks.

```gherkin
@AC-f03-dispatch-pool-campaign-008 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-008
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: commit is irreversible boundary
  And the unchanged contract assertion holds: no lock held across adapter I/O.
  And the unchanged contract assertion holds: Every stop case SC-US-003-4/5 has explicit before/after-barrier realPG race: revocation, version, pause, both pool withdrawals, reply, suppression, complaint/quarantine, mailbox eligibility and lowered limit.
  And the unchanged contract assertion holds: Before=>0calls
  And the unchanged contract assertion holds: after=>at most one current attempt, later0.
  And the unchanged contract assertion holds: F04 consumes these real shared stop writers, not separate locks.
  Examples:
    | case | expected |
    | each ten stopwriter cases before versus after commit | beforeconditional0rows0calls; afteratmost1inflightlater0, forrevocation/version/pause/senderwithdrawal/recipientwithdrawal/reply/suppression/complaint/quarantine/mailboxdisable/loweredlimit; actual sharedPGwriter barriers |
```

## SC-f03-dispatch-pool-campaign-009

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-009`, legacy `AC-B3`. Exact acceptance paragraph:

> AC-B3: local isolated durable sink records actual rendered test messages with
> sender/headers/test body and body unsubscribe plus List-Unsubscribe one-click
> headers. Message-ID stored for later reference matching. Peer fixture sees only
> disclosed test content; private campaign/contact/credential APIs remain protected.
> Live transport/sending stays disabled; SMTP accepted means submitted, never inbox.

```gherkin
@AC-f03-dispatch-pool-campaign-009 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-009
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: local isolated durable sink records actual rendered test messages with sender/headers/test body and body unsubscribe plus List-Unsubscribe one-click headers.
  And the unchanged contract assertion holds: Message-ID stored for later reference matching.
  And the unchanged contract assertion holds: Peer fixture sees only disclosed test content
  And the unchanged contract assertion holds: private campaign/contact/credential APIs remain protected.
  And the unchanged contract assertion holds: Live transport/sending stays disabled
  And the unchanged contract assertion holds: SMTP accepted means submitted, never inbox.
  Examples:
    | case | expected |
    | warmupinitial | durable TESTsink hassenderheadersbodyvisibleunsubscribe andoneclickheaders withstoredMessageID; onlydisclosedpeercontent; privateAPIsprotected; livesendingdisabled; SMTPacceptanceonlysubmitted |
    | warmupreply | durable TESTsink hassenderheadersbodyvisibleunsubscribe andoneclickheaders withstoredMessageID; onlydisclosedpeercontent; privateAPIsprotected; livesendingdisabled; SMTPacceptanceonlysubmitted |
    | campaignstep | durable TESTsink hassenderheadersbodyvisibleunsubscribe andoneclickheaders withstoredMessageID; onlydisclosedpeercontent; privateAPIsprotected; livesendingdisabled; SMTPacceptanceonlysubmitted |
    | intendedpeer versus foreignreader | durable TESTsink hassenderheadersbodyvisibleunsubscribe andoneclickheaders withstoredMessageID; onlydisclosedpeercontent; privateAPIsprotected; livesendingdisabled; SMTPacceptanceonlysubmitted |
```

## SC-f03-dispatch-pool-campaign-010

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-010`, legacy `AC-B4`. Exact acceptance paragraph:

> AC-B4: typed proved pre-DATA transient failure only: max3 total attempts within
> 120s, delays5/30, all current guards and quota rechecked. Ambiguous timeout/crash
> after submitting=>unknown_delivery, quota retained, zero automatic resend.

```gherkin
@AC-f03-dispatch-pool-campaign-010 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-010
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: typed proved pre-DATA transient failure only: max3 total attempts within 120s, delays5/30, all current guards and quota rechecked.
  And the unchanged contract assertion holds: Ambiguous timeout/crash after submitting=>unknown_delivery, quota retained, zero automatic resend.
  Examples:
    | case | expected |
    | proved transientattempt1or2or3 | delays5then30,max3TOTALwithin120 and recheckquota/allguards; attempt4forbidden; ambiguousunknown_delivery retainsquota0automaticresend |
    | elapsed120s | delays5then30,max3TOTALwithin120 and recheckquota/allguards; attempt4forbidden; ambiguousunknown_delivery retainsquota0automaticresend |
    | ambiguousDATA or crash | delays5then30,max3TOTALwithin120 and recheckquota/allguards; attempt4forbidden; ambiguousunknown_delivery retainsquota0automaticresend |
```

## SC-f03-dispatch-pool-campaign-011

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-011`, legacy `AC-B5`. Exact acceptance paragraph:

> AC-B5: deterministic clock boundaries include midnight with provider lower limit,
> 59.999/60/future poll time, lease expiry,120s retry ceiling. State inspection and
> operator test tick are scoped to local test mode; server authority remains intact.

```gherkin
@AC-f03-dispatch-pool-campaign-011 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-011
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant campaign edit/start/preview, pool schedule/claim, final submit and adapter outcome, stop barrier verification operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: deterministic clock boundaries include midnight with provider lower limit, 59.999/60/future poll time, lease expiry,120s retry ceiling.
  And the unchanged contract assertion holds: State inspection and operator test tick are scoped to local test mode
  And the unchanged contract assertion holds: server authority remains intact.
  Examples:
    | case | expected |
    | lease45s | deterministicexactclockfailsclosed atboundaries; operator inspection/tick localTESTonly; serverauthority never fromordinaryuser |
    | poll59.999-60-future | deterministicexactclockfailsclosed atboundaries; operator inspection/tick localTESTonly; serverauthority never fromordinaryuser |
    | midnightlowerlimit | deterministicexactclockfailsclosed atboundaries; operator inspection/tick localTESTonly; serverauthority never fromordinaryuser |
    | retry120s | deterministicexactclockfailsclosed atboundaries; operator inspection/tick localTESTonly; serverauthority never fromordinaryuser |
    | usertesttick | deterministicexactclockfailsclosed atboundaries; operator inspection/tick localTESTonly; serverauthority never fromordinaryuser |
```

## SC-f03-dispatch-pool-campaign-012

Source: `01_specification.md` heading `AC-f03-dispatch-pool-campaign-012`, legacy `AC-B6`. Exact acceptance paragraph:

> AC-B6: full realPG races/outcome tests, mutation for final guard, regressions,
> typecheck/lint/build/security and fresh independent review; F04 unsubscribe and
> IMAP runtime, F06 full cabinet UI remain tracked, never claimed complete here.

```gherkin
@AC-f03-dispatch-pool-campaign-012 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f03-dispatch-pool-campaign-012
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the original verification or delivery procedure is evaluated for <case> with actual commands, receipts and independent review
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: full realPG races/outcome tests, mutation for final guard, regressions, typecheck/lint/build/security and fresh independent review
  And the unchanged contract assertion holds: F04 unsubscribe and IMAP runtime, F06 full cabinet UI remain tracked, never claimed complete here.
  Examples:
    | case | expected |
    | realPGbefore-afterstoprace | alloutcomes andfinalguardRED/restoredGREEN,fullregression,type/lint/build/security andfreshreview required; F04unsubscribeIMAP andF06cabinet remain separatelytracked |
    | finalguardmutant | alloutcomes andfinalguardRED/restoredGREEN,fullregression,type/lint/build/security andfreshreview required; F04unsubscribeIMAP andF06cabinet remain separatelytracked |
    | failedbuildsecurityreview | alloutcomes andfinalguardRED/restoredGREEN,fullregression,type/lint/build/security andfreshreview required; F04unsubscribeIMAP andF06cabinet remain separatelytracked |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.
