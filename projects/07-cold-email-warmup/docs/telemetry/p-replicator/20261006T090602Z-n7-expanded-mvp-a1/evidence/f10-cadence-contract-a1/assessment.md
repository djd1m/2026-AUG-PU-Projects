# F10 cadence contract assessment
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f10-cadence-contract-a1
Source revision: 6495ab7c8dee4ef76788f9ce2e49539b10789e0b
Spec revision: sha256:410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8
Assessment frozen at: 2026-10-06T16:38:34.196649+00:00
Profile: compact-quality-first-v2; requested gpt-6-astra/high; actual model/effort/usage/cost null (host_not_exposed).
Verdict: TARGETED DESIGN RECONCILIATION NEEDED; not final code review or runtime acceptance.

## Decision
A durable pre-I/O round timestamp is needed to implement the accepted round-start anchor accurately, but adding that timestamp alone is not sufficient evidence that strict per-mailbox completion gaps<=30s will hold. Prefer one narrow reconciliation of the scheduling clause with the unchanged completion target before another claimed acceptance run. Do not relax30s/300s, cohort30active/100connected/three tenants, four IMAP slots, fairness, failure backoff or provider bounds. This assessment authorizes no changes and issues no PASS.

## Exact-source observations
1. src/runtime/store.ts claim samples post-lock DB time, writes last_served_at on EVERY quantum and advances mailbox service order. due_at is the original eligible deadline/age. Neither is an immutable full poll-cycle start.
2. src/replies/worker.ts quantum performs adapter.snapshot before ReplyStore.capture for a new round. src/replies/store.ts capture computes now INSIDE its later transaction and writes attempt_started_at. Therefore6495 RuntimeStore.finish using attempt_started_at+30s schedules from after initial snapshot I/O. Attempt start also belongs to the rescan120s/explicit-retry lifecycle, not scheduler cadence.
3. Empty/healthy incremental rounds still have several quanta: initial snapshot/capture, fresh tail snapshot/checkpoint, read/page completion. Four poll lanes yield between them. runRuntime also sleeps up to1s when claim returns none. Queue/transaction/cleanup/quantum delays matter even with native no-TSX execution.
4. The accepted02 Fair polling step5 says round start+30s and never completion+30s, while01 AC002 and04 require ACTUAL completion gaps<=30s, measured per mailbox.04 already states the target is conditional on declared healthy fixtures and cannot hold at maximum protocol duration for the entire cohort. It does not waive misses observed inside the declared healthy window.

Supplied short-native-v2.json has 30 mailbox rows, 30 numeric gaps, min44128ms/max46078ms, started=True and empty execArgv. Its bytes SHA256 is `83d7c3e32aa25c26beb76af6e4116db90df28382b183bec072cef76dfb8613d8`. This is supplied evidence for the previous completion+30 scheduling path, not a fresh run of6495 and not a full source/build-bound acceptance receipt. It demonstrates that adding a30s wait after completion leaves substantial extra elapsed work. The removed immediate-success-zero trial supplies no accepted proof and is not used to choose a measured budget here.

## Why the corrected anchor alone is insufficient
Let S_n be true pre-I/O start, D_n the elapsed full round through completion including inter-quantum waits, C_n=S_n+D_n, and Q_(n+1)>=0 the next-round scheduling delay after becoming eligible. Where the prior round finishes before its next due, exact start+30 yields:

C_(n+1)-C_n =30 + Q_(n+1)+D_(n+1)-D_n.

This exceeds30 whenever added queue/duration exceeds the previous round duration. Concrete feasible example: D_n=12s, Q_(n+1)=0.5s, D_(n+1)=13s gives31.5s. Thus an accurate timestamp fixes an implementation mismatch but cannot prove the completion criterion from the scheduling equation. This does NOT prove every start+30 implementation must fail every fixture: equal/faster successive durations can pass. Actual6495 completion distributions remain unmeasured by this task.

## Minimal concrete mechanism and schema implications
For faithful timestamping, add a nullable scheduler-owned poll_round_started_at to runtime_due (poll rows only), captured from post-lock DB clock at the first committed new-round claim BEFORE snapshot I/O. Keep it unchanged across snapshot/page/tail quanta and process restart. It is independent of due_at, next_check_at, last_served_at and reply_rescan.attempt_started_at. Do not repurpose the rescan timestamp and thereby change20pages/120s or explicit retry semantics.

The lifecycle must distinguish continuation, genuinely new round and a crash after durable reply completion but before RuntimeStore.finish. Bind the scheduler round to the reply run identity in the guarded capture transaction (nullable poll_round_run_id alongside the timestamp is a small explicit option). New claim must not erase an unresolved round just because the reply store currently says complete; first reconcile whether that completed run belongs to the recorded scheduler round. First-snapshot failure/busy preserves or explicitly closes the same scheduler round under owner/generation CAS; it must not manufacture completed_at. On matching completion, atomically schedule the next eligibility and retire its round metadata; a stale worker cannot clear a replacement. An additive migration and RuntimeClaim projection/guarded capture-finish plumbing are required for this approach. Existing row count stays bounded; no new scheduler platform or process-local timing authority.

This timestamp is useful diagnosis and restart identity, not a reason to defer the cadence policy decision. To preserve strict completion semantics, represent next required completion as previous actual durable completed_at+30s and allow the next round to become eligible EARLIER by enough headroom for fair admission plus all protocol quanta/DB/cleanup. A precise candidate policy is next_ready=max(previous completion, next_completion_deadline-B), with B a declared conservative healthy-workload lead covering these costs; service_seq still decides fair order, one mailbox never overlaps, and failing/busy paths keep their existing backoff. B is NOT established by this assessment: min/max observed round costs, queue waits and jitter are required before claiming that a selected B fits30s. If no sufficient bound can be justified, continuous fair readiness after success is a testable local policy candidate, not a previously validated solution; it requires the same explicit contract correction and actual physical/resource/cadence acceptance. Do not silently adopt the removed zero-delay experiment or infer success from it.

The smallest justified next action is a focused PLAN correction of02 step5 defining completion deadline versus readiness/headroom, plus the logical timestamp/identity lifecycle and affected architecture mapping/test scenarios, followed by fresh independent semantic validation.01 AC002 threshold need not change. A pre-I/O timestamp-only implementation could proceed as an existing-contract bug fix with targeted restart tests, but must be described as anchor repair only; it cannot substitute for the strict cadence evidence. Repeatedly changing which old timestamp supplies+30 without resolving the readiness policy is not a completion-gap proof.

## Validation and bounded next evidence
A scheduling-clause change from mandatory start+30 to earlier readiness changes accepted algorithm semantics: targeted independent requirements VALIDATE is needed even if01 specification bytes and AC thresholds stay unchanged. Bind that verdict to new algorithm/architecture hashes, not just unchanged spec SHA. Preserve the existing validation history. A timestamp-only mapping clarification does not require weakening or rewriting AC, but still needs source-specific review of its lifecycle and tests.

Then run the smallest native real-PG/local-TLS30-active diagnostic recording each mailbox's actual pre-I/O start, every quantum selection, durable completion, queue waits and original due age across repeated cycles and restart. Measure all actual gaps without shifting completion timestamps, subtracting queue time, averaging away misses or excluding slow cohort members after the run. Confirm physical4IMAP/1permailbox, service_seq fairness, no rescan budget/reset change and no pool300s regression. A short diagnostic does not replace the required full multiple-round300s/restart/fault acceptance run. Unknown delivery, grants, global FIRST lock, quotas, backoff and exact-close ownership stay unchanged.

## Limits and handoff
No files in the worktree were written, no runtime tests executed and no full feature review performed. Read only the eight listed frozen source paths plus supplied cadence evidence. Remaining uncertainty is actual6495 pre-I/O/complete distributions and usable healthy headroom under the fixed cohort; the mathematical start-versus-completion distinction is established independently of those measurements. Coordinator owns the next bounded contract correction/validation and Sol implementation; no new owner permission is implied for the existing authorized local scope.

## Frozen input hashes
- `docs/features/f10-durable-runtime/01_specification.md`: `410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8`
- `docs/features/f10-durable-runtime/02_pseudocode.md`: `fab8c4f63782f59e07fb19b073bed73fe41e0d5822da1c4cd39887591c6902ae`
- `docs/features/f10-durable-runtime/04_refinement.md`: `34f8cc017558c31cd92fc022fe32f4ef084c6c632dcf57f251ba4f876d95ce4c`
- `src/runtime/store.ts`: `8ba108e03716f91218a8b22ef216c777741e4851072cd6d0f695a92998729e93`
- `src/runtime/worker.ts`: `cb56a41c61e77350d24416443b31c2d55eecb352a2309753a6771b23deaf22e3`
- `src/runtime/loop.ts`: `066be7b57d5ecca7ad8d4625d01381b52e297cbcc244cc4d155a030e5c842d95`
- `src/replies/store.ts`: `ff63fa842177199069eeaf06749156f7a8601728416c7ad1ad1fbbb736761fe4`
- `src/replies/worker.ts`: `757d8a9e87f5817d50813f8575423532ec7d7ea8ca184424705fd92ae9906fb8`
