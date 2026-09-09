# Foundation — refinement

All cases below are planned. Tests run only after implementation exists. A fake adapter proves concurrency/accounting; native Argon2 tests prove actual encoding/verification. Neither substitutes for the other.

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | Missing/empty secret, URL, password, identity | Refusal; no native work/token issuance | Boundary validation |
| Max size | 200 code points/800 bytes, then either bound exceeded | Boundary accepted; over-limit denied before KDF | Explicit code-point and byte counts |
| Concurrent access | 2 active +8 waiting +1 arriving | Only2 native tasks active; last rejected | Barrier-controlled queue test |
| Network failure | DB lookup/commit unavailable | unavailable; no success/token return | Propagate; rollback and release |
| KDF failure | Native Promise rejects while8 waiting | Slot released once; FIFO continues | finally accounting |
| Queue timeout | Waiter reaches5s | Never executes even after slot frees | Fake monotonic clock |
| Running cancellation | Abort during native work | Slot remains occupied until native completion | No false cancellation |
| Credential race | Disable user or change hash during paused verify | No new session | Recheck under row lock |
| Exact expiry | now==expires_at | Denied | Strict comparison |
| Corrupt stored hash | Unsupported version/extreme work factors | Dummy work and generic denial | Parse/cap before native verify |
| Applied history drift | Changed/deleted applied SQL | Refuse before newer SQL | Full inventory preflight |
| Concurrent migration | Two processes same DB | Serialized, one record/effect per file | Advisory lock |
| Least privilege | App tries user insert, DDL, journal write | SQL permission denied | Real nonowner DB role |
| Cookie delivery | No Domain, fixed root path, valid token | All secure attributes present | Serializer assertions |

## Testing Strategy

Unit: password boundary/encoding, config enumerations, cookie attributes, deterministic admission/cancellation/resource bookkeeping and session token/hash primitives. Critical assertions are behavior-based; avoid snapshots that mirror source text.

Integration: actual isolated PostgreSQL for migration transaction rollback, duplicate runners, checksum drift, foreign keys, DB-role privileges, credential state races, persistence of only HMAC, disabled/revoked/expiry checks and DB failure propagation. Use explicit test credentials; never silently skip missing database. `npm run test:integration` fails with an actionable message when required test configuration is absent.

E2E: built web starts in the isolated test namespace and HTTP health returns expected minimal contract. This slice has no browser auth journey; no enrollment/portal coverage is claimed.

Performance: deterministic2/8 capacity with blocked KDF, simultaneous database probe and no client retained while KDF waits/runs. Run native hash/verify smoke and record runtime version, elapsed time and peak RSS in evidence; these are observations, not promised production throughput.

## Test Cases

```gherkin
Scenario: credentials issue an identity-only session
  Given an enabled fixture user with a supported Argon2id hash
  When the correct password passes bounded native verification
  Then one session containing only the token HMAC is committed
  And resolution returns identity context without role or scope

Scenario: a race cannot issue a session for a disabled user
  Given credential verification is paused after releasing its database client
  When a separate connection disables the user and commits
  And credential verification resumes successfully
  Then the post-KDF recheck denies and no session row is inserted

Scenario: migration failure does not record partial application
  Given an unapplied SQL file creates a table then raises an error
  When the migration runner executes it
  Then the created table and its journal record are absent
  And an explicit corrected unapplied file can be run successfully
```

## Mutation checks

Required experiments in an isolated disposable implementation checkout: raise active limit from2 to3 (capacity test must fail); remove session revoked/expiry filter (lifecycle test must fail); remove post-KDF enabled recheck (race test must fail); bypass migration checksum comparison (drift test must fail); allow DB host port in compose fixture (infra check must fail). Preserve command, mutated snapshot, nonzero result, restoration and clean rerun. Never mutate donors or live databases. Missing/unreadable guard input must produce explicit failure rather than pass.

## Performance Optimizations

Use indexed identity/token lookups; no session cache. Admission limits resource use rather than concealing latency. Keep fixtures/test setup outside timed native measurements. Do not optimize Argon2 work factors based on one mocked test.

## Security Hardening

App credentials remain nonowner; no seeded public user or route. Process logs are captured with secret/password/token/identity sentinels to prove redaction. Source scans reject sibling-project runtime imports, secret defaults and auth endpoint creation outside scope. Test the session-issuance function through the actual app role, verify direct session INSERT is denied, PUBLIC cannot execute it, and an attacker-controlled schema/search_path cannot redirect its table references. Actual package/native compatibility and dependency audit remain implementation checks.

## Accessibility

The shell must have document language, page title and semantic main landmark. No interactive user journey exists here; complete CJM accessibility is deferred to UI implementation.

## Technical Debt and next dependency

Public request rate limiting, bounded body/CSRF/Origin, verified enrollment and program Membership must arrive together before mounting auth routes. The next slice can reuse internal auth services but must create grants/consent/membership atomically and independently validate scope isolation. No placeholder public API is permitted to masquerade as that path.
