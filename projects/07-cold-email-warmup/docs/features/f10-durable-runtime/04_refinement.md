# F10 — ошибки, проверяемые границы и тестовый план

PLAN, f10-plan-r3 targeted F10-V1 correction. Все tests ниже FUTURE. Выполнение не заявлено. Изменённая01/02 требует свежей spec-bound independent VALIDATE до IMPLEMENT.

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | no active/consenting peers or no due jobs | waiting,0 sends, cancellable idle | no busy loop, typed reason |
| Max size |100 connected/30 active, multiple keyset pages | bounded page100 and peer30, global active≤30 | persistent cursor, no first-page restart starvation |
| Concurrent access |20 claimers, same tenant/mailbox/job/pair | single claim/job, stale generation denied | real PG FIRST lock, CAS, unique indexes |
| Network failure | stalled IMAP, SMTP before/after DATA, DB outage | bounded cleanup/backoff; post-DATA unknown retained | cancel actual child, fail closed on DB release |
| Suspended physical owner | actual SIGSTOP>120s | no expired-slot reclaim; socket limits unchanged | exact child exit/close proof only |
| Restart with orphan | no in-process close proof | cleanup_blocked; free slots/non-IO recovery continue | never infer termination from age; no fake recovery PASS |
| Incomplete UID rescan |20 pages/120s exhausted or changed generation | pause retained, no fresh completed_at | explicit existing retry transition; every page atomic |
| Quantum boundary | snapshot/page commit then crash | fixed horizon/cursor survive, no semantic duplicate | exact run/attempt/expected cursor plus due owner guard |
| Pacing versus retry | transient pre-DATA at attempt1, next attempt delayed60s | at most allowed attempts before120s, no spacing bypass | max retry delay/pacing/provider cooldown |
| Midnight | old queued pair and current-day reservation | current day pair uniqueness and quota, unknown history retained | final recheck after actual lock wait |
| Stop versus upkeep | deactivate/revoke racing renewal/reconciliation | no restored activity/consent or send | FIRST global lock and existing-row intent |
| Noisy tenant | large campaign queue plus other tenants | every eligible tenant selected, healthy measured rounds | durable tenant rotation independent of job volume |
| Slow rescan | four older long rescans A–D and later-due healthy E in same tenant with4 poll lanes | after first selected quanta E precedes any eligible A–D continuation; age preserved | persisted mailbox service_seq and actual per-mailbox selection/completion gaps, including restart |
| Peer conflict | earliest pair already allocated | next legal pair visited same bounded round | advance persistent cursor and continue |
| Unknown parent | parent submitting/unknown | zero reply jobs | reply only submitted initial and unique parent |
| Gate missing | live mode but no active grant | no external decrypt/DNS/socket operation | retained F09 authority checks |

## Testing Strategy

Unit: deterministic due order/backoff/pacing arithmetic and UTC pair key policy, independently asserted literal thresholds. Do not derive expected30/60/120/300/2/4 from production constants. Exercise stable ties and persistence semantics; mocking a clock alone does not prove physical lifetime.

Integration: real PostgreSQL migrations, transaction rollback, global lock ordering, owner CAS,20 concurrent workers/last3 quota tokens, tenant separation, lower provider cap, default10/ceiling30, before/after each stop writer, midnight wait and accepted/unknown reservation recovery. Each test namespace owns disposable DATABASE_NAME=n7f09_a1 or a new explicitly reserved disposable name; never truncate default/current application DB. Coordinator serializes heavy runs under CPU2 allowance.

Protocol/fault: actual local TLS SMTP/IMAP servers and accepted F09 child path. Verify peer-observed connections, SIGSTOP>120s, cancellation while awaiting snapshot/read/drain, child exit before release, DB unavailable at release, stale close proof CAS, restart orphan retention, and no further bytes after sealing. Rerun affected F09 protocol/lifetime regressions after modifying their callers or ownership composition. A closed mock is insufficient physical evidence.

End-to-end backend: run built CLI loop as a real subprocess with real PG/local TLS,100 connected/30 active across≥3 tenants. Run enough rounds to cover multiple30s polls,60s selection and a full300s pool deadline, with at least one graceful restart and one fault phase. Record per-mailbox completions, selections, allocations, original due ages, max gaps, reason counts, actual CPU/RAM and fixture latency. A restart outage remains in the report; healthy conditional target evaluated on declared healthy window while failure window remains visible. Parent witness must exercise runtime, not only assert constants or call one store tick. Tick exits boundedly; importing modules starts no worker.

Browser: not_applicable, no UI changes planned. If implementation adds UI, read companion readiness immediately before Docker Playwright1.63.0 checks and perform required390/1440+keyboard/persistence journeys. Host browser prohibited.

## Test Cases

SC-F10-001 happy/error — Given queued/claimed/submitting/unknown plus partially scanned UID state, When a built worker drains then restarts or dies after submitting commit, Then safe queued work progresses, expired owner callbacks fail, unknown is never resent and cursor/pause survive. Assert no new claims after drain start and measured15s conditional cleanup; absent exit proof yields cleanup_blocked, not a forced release.

SC-F10-002 happy/error — Given30 active across3 tenants and100 connected with one waiting activation, When several fair poll rounds and restart run, Then each active participant's measured healthy completion gap≤30s and selection round≤60s; lease120s refreshes, freed capacity admits waiting fairly. Concurrent deactivate must remain deleted; one stale provider is reported and cannot monopolize other tenants. F10-V1 adversarial case: same tenant A–D have older due_at and enough successful5s page quanta to exceed a30s window; later-due healthy E is eligible before their first claims. After A–D each receive one quantum, E must be selected before any A–D second quantum. Record each mailbox selection/completion/max-gap, not aggregate averages, and require E healthy completion<=30s and fair selection<=60s under the declared fixture window. Restart after first claims/yields retains the same order and original due_at; successful pages, transport_busy and provider failures all consume the selected turn while next_check_at only gates re-entry. No exclusion of E or extra lanes is permitted.

SC-F10-003 happy/error — Given all physical slots occupied including a suspended child, When expiry passes and competitors claim, Then physical global2/4 and mailbox1 limits hold, no orphan reclaim occurs. Resume/abort and confirm exit releases exact slot; DB failure delays release; a stale proof cannot release a newer operation. Rescan page yield never sets scan_complete without the existing complete proof. Repeat the SC-F10-002 A–D/E case under competing workers and restart; assert each selected quantum durably advances mailbox service_seq once before I/O, claimed rows cannot overlap, and continuation cannot jump E by retaining older due_at. Preserve20pages/120s and fixed physical slots; exhausted rescan stays held until the existing explicitly authorized retry, never a scheduler timer.

SC-F10-004 happy/error — Given mixed campaigns/pool, provider cap3, current UTC day and pending stop, When20 workers compete through final fence on both sides of midnight and stop commit, Then shared quota and current consent/freshness win, same mailbox starts≥60s apart, stop-before gives0 calls and after allows only in-flight. Proven pre-DATA retry does not override pacing/120s; ambiguous state has0 resubmissions.

SC-F10-005 happy/error — Given a preexisting first pair,≥2 opt-in tenants and one pending reply, When concurrent pool rounds/restart and midnight occur, Then cursor visits another legal peer, pair/day≤1, initial+reply≤2, no duplicate queued backlog, each eligible participant receives opportunity≤300s or an exact waiting reason. No-consent/same-tenant/stale/unknown-parent variants create0 matching jobs.

SC-F10-006 happy/error — Given noisy tenant plus quota exhaustion, slot congestion and separate provider failure, When scheduler continues and DB is briefly unavailable, Then finite queues/children remain bounded, independent participants progress, backoff is30/60/120/300 and original age survives. DB outage stops new admission; observation totals retain all blocked/overdue entries.

SC-F10-007 happy/error — Given frozen candidate/spec and trusted fixtures, When CLI/config/compose tests and full regression gates run, Then exact parent witness and all criterion tests execute, disabled modes call no external endpoint, fixture options cannot be selected by env/HTTP and TEST billing stays unchanged. Missing grants/proof/tests cannot be reported ready.

## Mutation obligations

Each material guard must fail with a targeted temporary mutation and pass after exact restoration: bypass tenant predicate; remove consent/freshness check; weaken current-day/shared quota; allow pacing bypass; release expired occupied slot; drop generation/source guard; return on first pair conflict; mark yielded/incomplete scan complete; replace mailbox service_seq ordering with oldest due_at or reset mailbox sequence on yield/restart (the A–D/E witness must turn red). Test expected values are independent of implementation constants. Mutation harness must preserve diff/source hashes and restore bytes; coordinator owns whole-suite final gate. Do not call an unexecuted mutation PASS.

## Performance Optimizations

Use specified due indexes, LIMIT1 claim, finite keyset scans and one operation/page quantum. No new cache/queue engine. Measure lock wait and scheduler overhead before any broader optimization. A full active cohort in max-duration IMAP operations cannot mathematically guarantee30s cadence; actual healthy fixture latency and max gap establish the conditional claim. Do not increase slots or silently narrow cohort to obtain a pass.

## Security Hardening

Keep global FIRST lock for all new eligibility writers, existing F09 TLS/pinning/AEAD, no I/O in transaction, immutable grant/config snapshot and final current-state recheck. Scan process output/DB/audit for credential canaries, body and raw provider text. Cancellation paths must remove listeners/timers after operation settles and avoid orphan promises. RuntimeDue authority is never transport permission. No paid API or external SMTP/IMAP access in these tests.

## Accessibility

No new user surface in F10. Existing waiting/paused explanations may use current typed projections; any future UI addition triggers existing browser and accessibility gates rather than a docs-only exemption.

## Technical Debt and independent review targets

The corrected01/02 design needs fresh independent semantic validation, particularly: (1) who may invoke explicit ReplyStore.retry and that rescan_incomplete is not silently auto-resumed; (2) F10-V1 correction: persisted per-mailbox service_seq selection/claim ordering and A–D/E restart witness must establish within-tenant fairness; (3) how all-slot orphan crash affects the parent persistent recovery promise; (4) current-day pair uniqueness when old initial/reply jobs cross midnight; (5) DB timeouts, cancellation and all callbacks fit conditional15s drain. These are named review questions, not findings declared fixed by architecture prose. Any required01/02 change returns to coordinator for a separately owned corrective revision and fresh spec-bound validation. No general orphan attestation platform is authorized: until exact previous isolated-container termination proof exists, F09 fail-closed slots remain blocked.

Inherited F06 AC011 executable documentary witness is UNVERIFIABLE; AC012 PR delivery remains not met (historical GitHub403). F10 does not erase these gaps. F11–F15 and external live pilot are separate pending slices; safe local runtime does not prove AI, arrival SLO or7day live performance.
