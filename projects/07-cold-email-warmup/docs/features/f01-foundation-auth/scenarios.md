# f01-foundation-auth — derived contract scenarios

These newly authored Given/When/Then scenarios derive only the unchanged legacy clauses. They are a test plan, not executable tests or runtime PASS. The entire quoted paragraph remains normative; Examples instantiate it and never remove other assertions. Existing canonical/security BDD remain inherited. Use literal executable witnesses and their limits from `05_completion.md`; each composite gate still needs its source-bound runtime/review evidence.

## SC-f01-foundation-auth-001

Source: `01_specification.md` heading `AC-f01-foundation-auth-001`, legacy `AC-F01-1`. Exact acceptance paragraph:

> AC-F01-1: runnable Node22/TypeScript web/API+PostgreSQL16 isolated Compose; DB has
> no host port; loopback web port variable, health/readiness reflects migration/DB.

```gherkin
@AC-f01-foundation-auth-001 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f01-foundation-auth-001
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant startup, registration/session lookup, request authorization, KDF/password validation, atomic auth admission, identity verification gates operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: runnable Node22/TypeScript web/API+PostgreSQL16 isolated Compose
  And the unchanged contract assertion holds: DB has no host port
  And the unchanged contract assertion holds: loopback web port variable, health/readiness reflects migration/DB.
  Examples:
    | case | expected |
    | fresh startup | migrations precede readiness; DB unavailable503 then restored200; PG16 no host publication; Node22 isolated loopback web |
    | DB stopped then restored | migrations precede readiness; DB unavailable503 then restored200; PG16 no host publication; Node22 isolated loopback web |
```

## SC-f01-foundation-auth-002

Source: `01_specification.md` heading `AC-f01-foundation-auth-002`, legacy `AC-F01-2`. Exact acceptance paragraph:

> AC-F01-2: register creates tenant/account and usable7day opaque session; login/logout;
> only HMAC token digest persists, old/revoked/expired/inactive session rejected.

```gherkin
@AC-f01-foundation-auth-002 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f01-foundation-auth-002
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant startup, registration/session lookup, request authorization, KDF/password validation, atomic auth admission, identity verification gates operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: register creates tenant/account and usable7day opaque session
  And the unchanged contract assertion holds: login/logout
  And the unchanged contract assertion holds: only HMAC token digest persists, old/revoked/expired/inactive session rejected.
  Examples:
    | case | expected |
    | register then two login/logout cycles | one tenant/account and usable opaque7day session; only HMAC digest persists; all invalidated sessions rejected |
    | revoked expired inactive | one tenant/account and usable opaque7day session; only HMAC digest persists; all invalidated sessions rejected |
```

## SC-f01-foundation-auth-003

Source: `01_specification.md` heading `AC-f01-foundation-auth-003`, legacy `AC-F01-3`. Exact acceptance paragraph:

> AC-F01-3: no/forged/revoked cookie401, badOrigin403 with0writes; secondtenant mailbox
> fixture returns404; malformedUUID400; parameterized SQL cannot bypass tenant.

```gherkin
@AC-f01-foundation-auth-003 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f01-foundation-auth-003
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant startup, registration/session lookup, request authorization, KDF/password validation, atomic auth admission, identity verification gates operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: no/forged/revoked cookie401, badOrigin403 with0writes
  And the unchanged contract assertion holds: secondtenant mailbox fixture returns404
  And the unchanged contract assertion holds: malformedUUID400
  And the unchanged contract assertion holds: parameterized SQL cannot bypass tenant.
  Examples:
    | case | expected |
    | own ID | own200; foreign404; malformed400; absent-forged-revoked401; badOrigin403 and0writes |
    | foreign ID | own200; foreign404; malformed400; absent-forged-revoked401; badOrigin403 and0writes |
    | SQL malformed UUID | own200; foreign404; malformed400; absent-forged-revoked401; badOrigin403 and0writes |
    | forged or revoked cookie | own200; foreign404; malformed400; absent-forged-revoked401; badOrigin403 and0writes |
    | bad Origin | own200; foreign404; malformed400; absent-forged-revoked401; badOrigin403 and0writes |
```

## SC-f01-foundation-auth-004

Source: `01_specification.md` heading `AC-f01-foundation-auth-004`, legacy `AC-F01-4`. Exact acceptance paragraph:

> AC-F01-4: exact Argon2id v19 m65536/t3/p1/salt16/out32 only; password8–200Unicode
> chars<=800bytes, reject before KDF;2active/noqueue, excess503RetryAfter1 and finallyrelease.

```gherkin
@AC-f01-foundation-auth-004 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f01-foundation-auth-004
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant startup, registration/session lookup, request authorization, KDF/password validation, atomic auth admission, identity verification gates operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: exact Argon2id v19 m65536/t3/p1/salt16/out32 only
  And the unchanged contract assertion holds: password8–200Unicode chars<=800bytes, reject before KDF
  And the unchanged contract assertion holds: 2active/noqueue, excess503RetryAfter1 and finallyrelease.
  Examples:
    | case | expected |
    | password7chars or801bytes | invalid rejected before KDF; exact v19 m65536/t3/p1 salt16out32; only2active/noqueue; excess503RetryAfter1; finally releases on failure |
    | valid8..200Unicode | invalid rejected before KDF; exact v19 m65536/t3/p1 salt16out32; only2active/noqueue; excess503RetryAfter1; finally releases on failure |
    | third simultaneous KDF | invalid rejected before KDF; exact v19 m65536/t3/p1 salt16out32; only2active/noqueue; excess503RetryAfter1; finally releases on failure |
    | adversarial PHC | invalid rejected before KDF; exact v19 m65536/t3/p1 salt16out32; only2active/noqueue; excess503RetryAfter1; finally releases on failure |
```

## SC-f01-foundation-auth-005

Source: `01_specification.md` heading `AC-f01-foundation-auth-005`, legacy `AC-F01-5`. Exact acceptance paragraph:

> AC-F01-5: atomicDB fixedUTC windows login email5/15min+trustedIP10/min,
> registerIP5/hour; attempts count; exceeded429RetryAfter. Ignore untrustedforwardedIP.

```gherkin
@AC-f01-foundation-auth-005 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f01-foundation-auth-005
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the relevant startup, registration/session lookup, request authorization, KDF/password validation, atomic auth admission, identity verification gates operation runs for <case> against authoritative persistent state
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: atomicDB fixedUTC windows login email5/15min+trustedIP10/min, registerIP5/hour
  And the unchanged contract assertion holds: attempts count
  And the unchanged contract assertion holds: exceeded429RetryAfter.
  And the unchanged contract assertion holds: Ignore untrustedforwardedIP.
  Examples:
    | case | expected |
    | email attempt6 in15min | over-limit429RetryAfter; admitted boundary5/10/5; rejected attempts persist; separate keys progress; only trusted socket IP counted |
    | IP attempt11 in1min | over-limit429RetryAfter; admitted boundary5/10/5; rejected attempts persist; separate keys progress; only trusted socket IP counted |
    | register6 in1hour | over-limit429RetryAfter; admitted boundary5/10/5; rejected attempts persist; separate keys progress; only trusted socket IP counted |
    | window reset | over-limit429RetryAfter; admitted boundary5/10/5; rejected attempts persist; separate keys progress; only trusted socket IP counted |
    | spoofed forwarded IP | over-limit429RetryAfter; admitted boundary5/10/5; rejected attempts persist; separate keys progress; only trusted socket IP counted |
```

## SC-f01-foundation-auth-006

Source: `01_specification.md` heading `AC-f01-foundation-auth-006`, legacy `AC-F01-6`. Exact acceptance paragraph:

> AC-F01-6: build/typecheck/lint/authunit+realPGintegration pass; secretcanary scan;
> record direct/transitive dependency licenses and donor adaptation exactsource.

```gherkin
@AC-f01-foundation-auth-006 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f01-foundation-auth-006
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the original verification or delivery procedure is evaluated for <case> with actual commands, receipts and independent review
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: build/typecheck/lint/authunit+realPGintegration pass
  And the unchanged contract assertion holds: secretcanary scan
  And the unchanged contract assertion holds: record direct/transitive dependency licenses and donor adaptation exactsource.
  Examples:
    | case | expected |
    | all required commands succeed | accept only successful build,typecheck,lint,authunit,realPG,canary plus complete direct/transitive licenses and exact donor adaptation; any missing gate prevents acceptance |
    | one required check nonzero | accept only successful build,typecheck,lint,authunit,realPG,canary plus complete direct/transitive licenses and exact donor adaptation; any missing gate prevents acceptance |
    | missing license or donor digest | accept only successful build,typecheck,lint,authunit,realPG,canary plus complete direct/transitive licenses and exact donor adaptation; any missing gate prevents acceptance |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.
