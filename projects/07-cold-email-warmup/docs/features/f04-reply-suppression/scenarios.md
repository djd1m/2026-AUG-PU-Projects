# f04-reply-suppression — derived contract scenarios

These newly authored Given/When/Then scenarios derive only the unchanged legacy clauses. They are a test plan, not executable tests or runtime PASS. The entire quoted paragraph remains normative; Examples instantiate it and never remove other assertions. Existing canonical/security BDD remain inherited. Use literal executable witnesses and their limits from `05_completion.md`; each composite gate still needs its source-bound runtime/review evidence.

## SC-f04-reply-suppression-001

Source: `01_specification.md` heading `AC-f04-reply-suppression-001`, legacy `AC-A1`. Exact acceptance paragraph:

> AC-A1: validate bounded header-only pages <=100, UIDs/UIDVALIDITY and normalized single sender/References/In-Reply-To. Match only OUR sent message within tenant+mailbox AND decrypted enrollment recipient exact normalized sender; no subject match. Missing/malformed incoming Message-ID may still create effect if references/sender match; wrong sender, foreign mailbox/tenant, unrelated ref stop0. Header size/array limits explicit; no body retained.

```gherkin
@AC-f04-reply-suppression-001 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-001
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the reply reader normalizes the bounded header page and matches its sender/References to our tenant/mailbox sent message for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: validate bounded header-only pages <=100, UIDs/UIDVALIDITY and normalized single sender/References/In-Reply-To.
  And the unchanged contract assertion holds: Match only OUR sent message within tenant+mailbox AND decrypted enrollment recipient exact normalized sender
  And the unchanged contract assertion holds: no subject match.
  And the unchanged contract assertion holds: Missing/malformed incoming Message-ID may still create effect if references/sender match
  And the unchanged contract assertion holds: wrong sender, foreign mailbox/tenant, unrelated ref stop0.
  And the unchanged contract assertion holds: Header size/array limits explicit
  And the unchanged contract assertion holds: no body retained.
  Examples:
    | case | expected |
    | 100headers /101oroversizedreference | boundedheaderonlynormalizedUIDvaliditysenderreferences; ownmailbox-tenantandexactdecryptedrecipientmatch stop1evenwithoutvalidID; othersstop0; nobodyretained |
    | missingmalformedMessageID | boundedheaderonlynormalizedUIDvaliditysenderreferences; ownmailbox-tenantandexactdecryptedrecipientmatch stop1evenwithoutvalidID; othersstop0; nobodyretained |
    | wrongsenderforeignref | boundedheaderonlynormalizedUIDvaliditysenderreferences; ownmailbox-tenantandexactdecryptedrecipientmatch stop1evenwithoutvalidID; othersstop0; nobodyretained |
```

## SC-f04-reply-suppression-002

Source: `01_specification.md` heading `AC-f04-reply-suppression-002`, legacy `AC-A2`. Exact acceptance paragraph:

> AC-A2: all page writes use shared advisory lock(7,1) FIRST. Observation unique(mailbox,validity,UID), additional valid normalized Message-ID ledger; authoritative ReplyEffect unique(mailbox,enrollment,reply), immutable once-only counter/event. Effect, enrollment replied, queued/claimed cancellation, observations and page cursor COMMIT atomically; submitting remains in flight. Factor client-level shared stop helper if needed, never nested lock transaction. Same/new/missing/malformed message-id/UIDVALIDITY replays do not double count. Concurrent page attempts cannot skip/reorder coverage or resurrect stopped state.

```gherkin
@AC-f04-reply-suppression-002 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-002
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the reply page transaction takes lock(7,1) FIRST, writes observations/semantic effects/cancellation/cursor and commits or crashes for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: all page writes use shared advisory lock(7,1) FIRST.
  And the unchanged contract assertion holds: Observation unique(mailbox,validity,UID), additional valid normalized Message-ID ledger
  And the unchanged contract assertion holds: authoritative ReplyEffect unique(mailbox,enrollment,reply), immutable once-only counter/event.
  And the unchanged contract assertion holds: Effect, enrollment replied, queued/claimed cancellation, observations and page cursor COMMIT atomically
  And the unchanged contract assertion holds: submitting remains in flight.
  And the unchanged contract assertion holds: Factor client-level shared stop helper if needed, never nested lock transaction.
  And the unchanged contract assertion holds: Same/new/missing/malformed message-id/UIDVALIDITY replays do not double count.
  And the unchanged contract assertion holds: Concurrent page attempts cannot skip/reorder coverage or resurrect stopped state.
  Examples:
    | case | expected |
    | concurrentduplicatepage | FIRST7,1; observationsledgersemanticuniqueffect,immutablecounter,replycancelcursor atomic; before rollback/afterpersist; submittinginflight; no skipped reordered coverage or resurrectedstate |
    | repeatedreplynewUIDvalidity | FIRST7,1; observationsledgersemanticuniqueffect,immutablecounter,replycancelcursor atomic; before rollback/afterpersist; submittinginflight; no skipped reordered coverage or resurrectedstate |
    | crashbefore-oraftercommit | FIRST7,1; observationsledgersemanticuniqueffect,immutablecounter,replycancelcursor atomic; before rollback/afterpersist; submittinginflight; no skipped reordered coverage or resurrectedstate |
```

## SC-f04-reply-suppression-003

Source: `01_specification.md` heading `AC-f04-reply-suppression-003`, legacy `AC-A3`. Exact acceptance paragraph:

> AC-A3: initial poll or UIDVALIDITY change creates durable run_id with captured UIDNEXT-1 high-water H, cursor0, state scanning and mailbox_poll scan_complete=false. Keep mailbox operational state (quarantine/revocation) intact; pause via poll evidence. Page range coverage supplied by trusted protocol reader accounts for sparse/expunged UIDs; validate strictly increasing coverage, all headerUIDs in range, same run/validity/current cursor. Second reset creates new paused run; stale workers cannot advance/finish old run. No fresh timestamp merely from page progress.

```gherkin
@AC-f04-reply-suppression-003 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-003
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the poll reader begins or resets the immutable rescan run, then applies the supplied trusted UID coverage for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: initial poll or UIDVALIDITY change creates durable run_id with captured UIDNEXT-1 high-water H, cursor0, state scanning and mailbox_poll scan_complete=false.
  And the unchanged contract assertion holds: Keep mailbox operational state (quarantine/revocation) intact
  And the unchanged contract assertion holds: pause via poll evidence.
  And the unchanged contract assertion holds: Page range coverage supplied by trusted protocol reader accounts for sparse/expunged UIDs
  And the unchanged contract assertion holds: validate strictly increasing coverage, all headerUIDs in range, same run/validity/current cursor.
  And the unchanged contract assertion holds: Second reset creates new paused run
  And the unchanged contract assertion holds: stale workers cannot advance/finish old run.
  And the unchanged contract assertion holds: No fresh timestamp merely from page progress.
  Examples:
    | case | expected |
    | initialpollorvalidityreset | immutable runID/H=UIDNEXT-1,cursor0,scan_completefalse; quarantineconsentpreserved; validateincreasingtrustedcoverage currentrunvaliditycursor; staleoldrun cannotadvancefinish; nofreshnessfromprogress |
    | empty sparseexpungedrange /secondresetstaleoldpage | immutable runID/H=UIDNEXT-1,cursor0,scan_completefalse; quarantineconsentpreserved; validateincreasingtrustedcoverage currentrunvaliditycursor; staleoldrun cannotadvancefinish; nofreshnessfromprogress |
```

## SC-f04-reply-suppression-004

Source: `01_specification.md` heading `AC-f04-reply-suppression-004`, legacy `AC-A4`. Exact acceptance paragraph:

> AC-A4: per-attempt max20 pages×100 headers and120s elapsed; future clock failsclosed. Persist attempt count/start plus run/H/cursor. Budget exhaustion without completed coverage yields rescan_incomplete, stays paused until explicit bounded operator retry; retry retains run/H/cursor and resets only attempt budget. Crash restart resumes committed cursor same run/H. Only all coverage throughH AND successful bounded tail poll under unchanged validity atomically set scan_complete=true,last_complete_poll=current post-lock clock. Failed/partial/future/stale evidence never authorizes dispatch.

```gherkin
@AC-f04-reply-suppression-004 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-004
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the rescan applies its attempt budget, handles explicit retry/restart and attempts same-validity tail completion for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: per-attempt max20 pages×100 headers and120s elapsed
  And the unchanged contract assertion holds: future clock failsclosed.
  And the unchanged contract assertion holds: Persist attempt count/start plus run/H/cursor.
  And the unchanged contract assertion holds: Budget exhaustion without completed coverage yields rescan_incomplete, stays paused until explicit bounded operator retry
  And the unchanged contract assertion holds: retry retains run/H/cursor and resets only attempt budget.
  And the unchanged contract assertion holds: Crash restart resumes committed cursor same run/H.
  And the unchanged contract assertion holds: Only all coverage throughH AND successful bounded tail poll under unchanged validity atomically set scan_complete=true,last_complete_poll=current post-lock clock.
  And the unchanged contract assertion holds: Failed/partial/future/stale evidence never authorizes dispatch.
  Examples:
    | case | expected |
    | 20pages100each /120selapsed /futureclock /explicitretry /committedrestart | budgetexhaustionrescan_incomplete stayspaused; explicitretrypreservesrunHcursor resetsattemptonly; restartcommittedcursor; completeH+successfulsamevalidityboundedtail atomically markscompletepostlocktime; failedpartialfuturestaleblocks |
```

## SC-f04-reply-suppression-005

Source: `01_specification.md` heading `AC-f04-reply-suppression-005`, legacy `AC-A5`. Exact acceptance paragraph:

> AC-A5: realPG crash BEFORE page COMMIT rollback observation/effect/cursor, AFTER COMMIT retained; old replyR effect1 and unseenS0→1 after replay with sameH. Deterministic actual lock races reply before final=>0 adaptercalls, afterfinal=>max1inflight/later0 using production ingestion writer. Verify concurrent duplicate page/effect, validity reset during old page/tail, sparse/empty pages, exact20pages and120s boundaries. F03 final freshness guards remain unchanged and prove paused sends0.

```gherkin
@AC-f04-reply-suppression-005 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-005
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the realPG crash/concurrency/stop-barrier verification drives production page ingestion and final dispatch for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: realPG crash BEFORE page COMMIT rollback observation/effect/cursor, AFTER COMMIT retained
  And the unchanged contract assertion holds: old replyR effect1 and unseenS0→1 after replay with sameH.
  And the unchanged contract assertion holds: Deterministic actual lock races reply before final=>0 adaptercalls, afterfinal=>max1inflight/later0 using production ingestion writer.
  And the unchanged contract assertion holds: Verify concurrent duplicate page/effect, validity reset during old page/tail, sparse/empty pages, exact20pages and120s boundaries.
  And the unchanged contract assertion holds: F03 final freshness guards remain unchanged and prove paused sends0.
  Examples:
    | case | expected |
    | Ralready1 Sunseen0 crashBEFORE orAFTER /replybefore-versusafterfinal /duplicatepage-resetduringtail | beforepageCOMMITrollback and replay R1S1; afterCOMMITretainscursorandR1S1; samerunH; actualsharedstopbefore0calls/aftermax1later0; sparseempty20pages120s andfreshnessguardnegative tests |
```

## SC-f04-reply-suppression-006

Source: `01_specification.md` heading `AC-f04-reply-suppression-006`, legacy `AC-A6`. Exact acceptance paragraph:

> AC-A6: additive migration only (006), type/lint/build, fullunit/realPGregression, meaningful dedup or page-atomicity mutation red/restoredgreen, secret/header/body canary checks and source/image hashes. Fresh independent Astra review and unique terminal receipt. Store/interfaces documented for B. No public ingestion endpoint, fabricated freshness or live IMAP connection; A exposes trusted internal store only, B provides local durable source/worker.

```gherkin
@AC-f04-reply-suppression-006 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-006
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized reply-source verification procedure checks additive migration, full unit/PG/build gates, dedup/page mutation and source/image/canary receipts for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: additive migration only (006), type/lint/build, fullunit/realPGregression, meaningful dedup or page-atomicity mutation red/restoredgreen, secret/header/body canary checks and source/image hashes.
  And the unchanged contract assertion holds: Fresh independent Astra review and unique terminal receipt.
  And the unchanged contract assertion holds: Store/interfaces documented for B.
  And the unchanged contract assertion holds: No public ingestion endpoint, fabricated freshness or live IMAP connection
  And the unchanged contract assertion holds: A exposes trusted internal store only, B provides local durable source/worker.
  Examples:
    | case | expected |
    | additivemigration006 /dedup-pageatomicitymutant /secret-header-bodycanary | migrationadditive,type/lint/build,fullunitPG,meaningfulRED/restoredGREEN,sourceimagecanary,freshAstraunique receipt andBinterfaces required; no publicingestion/fakefreshness/liveIMAPA |
    | missingreceipt | migrationadditive,type/lint/build,fullunitPG,meaningfulRED/restoredGREEN,sourceimagecanary,freshAstraunique receipt andBinterfaces required; no publicingestion/fakefreshness/liveIMAPA |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.

## SC-f04-reply-suppression-007

Source: `01_specification.md` heading `AC-f04-reply-suppression-007`, legacy `AC-B1`. Exact acceptance paragraph:

> AC-B1: existing opaque32byte hashed unsubscribe capability, purpose implicit dedicated table, bound expiry30days/job/mailbox/enrollment/digest. GET validates and shows accessible confirmation with zero business mutations; POST HTML confirmation or RFC one-click form performs idempotent generic success with no login/PII disclosure. Forged/expired/wrong-purpose reject400; no tenant/address selected from client payload. Rate-limiter security counters are the only GET writes, explicitly not business-state changes.

```gherkin
@AC-f04-reply-suppression-007 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-007
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the public unsubscribe handler validates the bound capability and processes GET confirmation or HTML/RFC one-click POST for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: existing opaque32byte hashed unsubscribe capability, purpose implicit dedicated table, bound expiry30days/job/mailbox/enrollment/digest.
  And the unchanged contract assertion holds: GET validates and shows accessible confirmation with zero business mutations
  And the unchanged contract assertion holds: POST HTML confirmation or RFC one-click form performs idempotent generic success with no login/PII disclosure.
  And the unchanged contract assertion holds: Forged/expired/wrong-purpose reject400
  And the unchanged contract assertion holds: no tenant/address selected from client payload.
  And the unchanged contract assertion holds: Rate-limiter security counters are the only GET writes, explicitly not business-state changes.
  Examples:
    | case | expected |
    | validGET /HTMLorRFCPOST /forged-expired-wrongpurpose /clientselectedtenant | opaque32bytehash purposeboundjobmailboxenrollment30day; GETaccessible0businesswrites; POSTidempotentgenericnoPII; invalid400; onlyratelimitersecuritycountsGETwrites |
```

## SC-f04-reply-suppression-008

Source: `01_specification.md` heading `AC-f04-reply-suppression-008`, legacy `AC-B2`. Exact acceptance paragraph:

> AC-B2: POST takes same lock FIRST, validates capability at current post-lock time and atomically UPSERTs tenant suppression/cancels recipient pending enrollments; repeated/concurrent requests idempotent. Pool token additionally withdraws intended recipient mailbox globally from pool through existing consent/membership writer under SAME transaction, not sender quarantine; token binds recipient via immutable job. Thus pool unsubscribe actually stops future peer sends and campaign unsubscribe applies tenant-wide. Preserve in-flight boundary. All future jobs consult effective suppression/membership.

```gherkin
@AC-f04-reply-suppression-008 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-008
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the unsubscribe POST transaction takes lock(7,1) FIRST, revalidates post-lock expiry and applies suppression/cancellation/pool withdrawal for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: POST takes same lock FIRST, validates capability at current post-lock time and atomically UPSERTs tenant suppression/cancels recipient pending enrollments
  And the unchanged contract assertion holds: repeated/concurrent requests idempotent.
  And the unchanged contract assertion holds: Pool token additionally withdraws intended recipient mailbox globally from pool through existing consent/membership writer under SAME transaction, not sender quarantine
  And the unchanged contract assertion holds: token binds recipient via immutable job.
  And the unchanged contract assertion holds: Thus pool unsubscribe actually stops future peer sends and campaign unsubscribe applies tenant-wide.
  And the unchanged contract assertion holds: Preserve in-flight boundary.
  And the unchanged contract assertion holds: All future jobs consult effective suppression/membership.
  Examples:
    | case | expected |
    | parallelPOST /capabilityexpireswhilewaiting /pooltokenrecipient /campaignrecipient | FIRSTlockcurrentpostlockexpiry; tenant-wide suppression andcancelatomicUPSERT; poolrecipientgloballywithdrawn via samewritertransaction, sendernotquarantined; submittinginflight; futurejobsconsultsuppressionmembership |
```

## SC-f04-reply-suppression-009

Source: `01_specification.md` heading `AC-f04-reply-suppression-009`, legacy `AC-B3`. Exact acceptance paragraph:

> AC-B3: operator-only authenticated complaint intake, no generic unsigned provider webhook. Durable event dedup bound to operator,event,tenant,mailbox and recipient; same transaction suppression +sender quarantine+cancellation. Unauthenticated401, forged/foreign/malformed0businesswrites. Operator auth is separate process-configured secret or explicit trusted internal CLI, never ordinary user authority. If HTTP API used, constant-time verification and Origin as applicable; no credentials in logs.

```gherkin
@AC-f04-reply-suppression-009 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-009
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the complaint intake authenticates the operator, validates/deduplicates the event and commits suppression/quarantine/cancellation for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: operator-only authenticated complaint intake, no generic unsigned provider webhook.
  And the unchanged contract assertion holds: Durable event dedup bound to operator,event,tenant,mailbox and recipient
  And the unchanged contract assertion holds: same transaction suppression +sender quarantine+cancellation.
  And the unchanged contract assertion holds: Unauthenticated401, forged/foreign/malformed0businesswrites.
  And the unchanged contract assertion holds: Operator auth is separate process-configured secret or explicit trusted internal CLI, never ordinary user authority.
  And the unchanged contract assertion holds: If HTTP API used, constant-time verification and Origin as applicable
  And the unchanged contract assertion holds: no credentials in logs.
  Examples:
    | case | expected |
    | validoperatorcomplaintreplay /unsignedorordinaryuser /foreignmalformedevent | operatorsecretortrustedCLI separateauthority; dedupboundpayload; atomicsuppression+senderquarantine+cancel; unauthorized401and0businesswrites; constanttimeHTTP authOriginwhereapplicable0credentialslogs |
```

## SC-f04-reply-suppression-010

Source: `01_specification.md` heading `AC-f04-reply-suppression-010`, legacy `AC-B4`. Exact acceptance paragraph:

> AC-B4: public token/complaint requests atomic30/min per socket/trusted configured IP (no arbitrary forwarded headers), invalid requests count; duplicate POST still stable; secure no-store/referrer policy/token-safe logging. Test31st429/Retry-After and concurrency, expired/wrong-purpose GET/POST, crawlerGET0businesswrites, real stop races before/after final and pool-global withdrawal.

```gherkin
@AC-f04-reply-suppression-010 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-010
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the public token/complaint handler applies trusted-IP admission and GET/POST token/security policies during concurrent requests and stop barriers for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: public token/complaint requests atomic30/min per socket/trusted configured IP (no arbitrary forwarded headers), invalid requests count
  And the unchanged contract assertion holds: duplicate POST still stable
  And the unchanged contract assertion holds: secure no-store/referrer policy/token-safe logging.
  And the unchanged contract assertion holds: Test31st429/Retry-After and concurrency, expired/wrong-purpose GET/POST, crawlerGET0businesswrites, real stop races before/after final and pool-global withdrawal.
  Examples:
    | case | expected |
    | concurrentrequest31 /forgedexpiredwrongpurpose /crawlerGET /before-afterstops | atomic30permintrustedIP invalidcount;31st429RetryAfter; forwardednottrusted; repeatedPOSTstable; GET0businesswrites; no-store/referrerpolicytokensafelogging; poolglobalwithdrawal andactualraces |
```

## SC-f04-reply-suppression-011

Source: `01_specification.md` heading `AC-f04-reply-suppression-011`, legacy `AC-B5`. Exact acceptance paragraph:

> AC-B5: bounded poll worker every30s with disabled default or explicit local_test fixture protocol adapter; reads only headers, <=100/page, operation<=30s, same durable A run/coverage/tail contracts, no DBlock over adapter IO. Local source independently durable and operator-controlled, can deliver real fixture headers/failures/validity reset; no public force-fresh endpoint. Resume incomplete requires explicit operator retry. Expose tenant-scoped status cursor/completion/rescan mode and local-test provenance, unknown real verification. RealTLS/allowlist adapter contract reused from F02; live network remains gated off under current authority.

```gherkin
@AC-f04-reply-suppression-011 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-011
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the gated poll worker reads the independently durable local fixture with bounded I/O and applies its coverage/tail/status state for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: bounded poll worker every30s with disabled default or explicit local_test fixture protocol adapter
  And the unchanged contract assertion holds: reads only headers, <=100/page, operation<=30s, same durable A run/coverage/tail contracts, no DBlock over adapter IO.
  And the unchanged contract assertion holds: Local source independently durable and operator-controlled, can deliver real fixture headers/failures/validity reset
  And the unchanged contract assertion holds: no public force-fresh endpoint.
  And the unchanged contract assertion holds: Resume incomplete requires explicit operator retry.
  And the unchanged contract assertion holds: Expose tenant-scoped status cursor/completion/rescan mode and local-test provenance, unknown real verification.
  And the unchanged contract assertion holds: RealTLS/allowlist adapter contract reused from F02
  And the unchanged contract assertion holds: live network remains gated off under current authority.
  Examples:
    | case | expected |
    | disableddefault /localdurableheaders-failure-validityreset /operation30s /incompleteexplicitretry | gatedlocalTESTonlyevery30s <=100headerpage <=30sIO outsideDBlock; Aimmutablecoverage-tail-state; statustenant-scopedcursorrescanTESTprovenanceunknownrealverification; no forcefreshHTTP; F02TLSallowlistlivegate intact |
```

## SC-f04-reply-suppression-012

Source: `01_specification.md` heading `AC-f04-reply-suppression-012`, legacy `AC-B6`. Exact acceptance paragraph:

> AC-B6: end-to-end local operator seed/poll→actual persisted reply→pending stop and local unsubscribe/complaint HTTP flows with realPG; fullregression, relevant negative guards/mutation, sourcebuild/receipts/freshAstra. Preserve renderer body+oneclick headers all3kinds. Cabinet browser remains F06, not faked. EntireF04 done only A+B6/6.

```gherkin
@AC-f04-reply-suppression-012 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f04-reply-suppression-012
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized local end-to-end procedure seeds/polls an actual reply, drives unsubscribe/complaint HTTP and evaluates full regression/mutation/source/fresh-review gates for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: end-to-end local operator seed/poll→actual persisted reply→pending stop and local unsubscribe/complaint HTTP flows with realPG
  And the unchanged contract assertion holds: fullregression, relevant negative guards/mutation, sourcebuild/receipts/freshAstra.
  And the unchanged contract assertion holds: Preserve renderer body+oneclick headers all3kinds.
  And the unchanged contract assertion holds: Cabinet browser remains F06, not faked.
  And the unchanged contract assertion holds: EntireF04 done only A+B6/6.
  Examples:
    | case | expected |
    | actualoperatorseed→poll→persistreply /unsubscribePOSTandcomplaint /renderthreelettertypes | realPGstopflows plusfullregressionnegativeguardmutation/sourcebuild/freshAstrareceipts; bodyoneclickheadersall3; F06browsernotfaked; completeF04onlybothAandB6of6 |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.
