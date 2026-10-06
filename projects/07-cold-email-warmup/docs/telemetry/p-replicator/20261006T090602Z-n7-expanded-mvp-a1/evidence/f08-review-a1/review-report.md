# F08 independent acceptance review
Reviewer family: codex
Spec revision: sha256:a3ad1300fde78f396c850627e9fd833391d3a572214801315519b92ad197a0a8
Source revision: 00f6888fe753a546ac17f63eb1eda270e260600a
Baseline: a746ad2ce67cc70afd53306713f311045b1a0a92
Verdict: NEEDS_WORK

## Spec conformance table
| AC id | Verdict | Evidence |
|---|---|---|
| AC-f08-live-diagnostics-001 | not met | Own-session/Origin/tenant checks precede diagnostic effects; default durable authority revoked and DI unreachable through deployed HTTP/env. However configured operator capability is optional at CLI publication: High F08-R2 below. |
| AC-f08-live-diagnostics-002 | met | diagnostic-channel.ts validates every fresh DNS answer, numerical dial, original TLS servername, rejectUnauthorized and TLS1.2; diagnostics-unit actual TCP/TLS fixtures cover pin/rebinding/mixed DNS, wrong host/untrusted CA/downgrade and mandatory STARTTLS. a2 unit-terminal.log passes these unchanged guards. |
| AC-f08-live-diagnostics-003 | met | diagnostics.ts independent Promise.all results, finite EHLO/STARTTLS/AUTH PLAIN and CAPABILITY/AUTHENTICATE states, exact SMTP235/IMAP tag checks and no message verbs; actual465/587/993 fixtures and explicit a1 parent-witness.log establish protocol behavior. |
| AC-f08-live-diagnostics-004 | not met | Network deadlines, byte-before-decode limits, singleton admission and six actual HTTP network-phase cancellations have witnesses; cancellation during final DB wait can still publish and return success. High F08-R1 reproduced against actual store. |
| AC-f08-live-diagnostics-005 | met | begin/finish/publish/revoke use eligibilityTransaction FIRST global lock and post-lock DB clock; revision/attempt/authority/config/expiry fence and shared cancelMailbox cover replacement/stop/complaint. a2 store-final.log14 passes expiry waiter, both revoke orders, overlap, rollback and complaint/submitting witnesses. Cancellation gap is separately AC004. |
| AC-f08-live-diagnostics-006 | met | Existing crypto.ts tenant/mailbox/version AEAD unchanged, decrypt precedes diagnose; fixed result enums and no native-error/server-line persistence. AEAD substitution unit guards, tampered-envelope zero-connection integration, API/DB/DOM canaries and unchanged Argon2id covered by supplied suites/source. No JS zeroization claim. |
| AC-f08-live-diagnostics-007 | met | Persistent independent TLS/auth/mode/time projections and stale/disabled labels; actual Docker1.63 browser20 assertions at390/1440 cover keyboard/busy/reload/logout/capacity/unchecked consent. Pending/stale snapshots originated in PG but were injected into HTTP for rendering only, not live-eligibility proof. |
| AC-f08-live-diagnostics-008 | not met | Substantial real TLS/PG/schema12→13/mutation/regression/build/browser evidence exists, but R1/R2 are current required behavior gaps without guards; acceptance cannot be established by counts or structural completion alone. |

## Required corrections

### F08-R1 — High — cancellation is not fenced after final database waits
Source: projects/07-cold-email-warmup/src/mailboxes/diagnostic-store.ts:33–34,41–48; src/consent/transaction.ts:4–7. Requirement AC-f08-live-diagnostics-004 and refinement disconnected-client behavior.

run checks signal.aborted only before calling finish. finish neither receives nor rechecks the signal, although pool acquisition, FIRST global lock and subsequent queries can all wait. Thus a client disconnect after protocol completion but before the final lock is granted commits current success; run returns success and leaves the attempt current. This violates the explicit no-late-success cancellation contract. It does not imply mail sending, capacity or consent are granted.

Executed reproduction: /tmp/n7-f08-review-a1/cancel-final-lock.ts uses the unmodified actual DiagnosticStore, actual encryption/parsing and deterministic Pool/Channel seams. Allow begin, finish both protocol outcomes, hold the second FIRST-lock query, abort, release. /tmp/n7-f08-review-a1/cancel-final-lock.log records published=true, committedAfterAbort=true and returnedSuccess=true (exit0). This is a control-flow reproduction, not a claim of a real-PG/HTTP test. Existing diagnostics-disconnect-integration.test.ts cancels only dns/connect/tls/greeting/auth/trickle, so misses this interval.

Fix: carry cancellation into finalization and fence it after lock acquisition and after awaited persistence work before committing, rolling back and invoking the existing matching-attempt cleanup when cancelled before the defined commit boundary. Preserve FIRST-lock order and network-outside-TX. Add actual-PG ordered regression (with HTTP disconnect/server-abort barrier where appropriate) cancelling while finalization is blocked before global lock and before final commit; assert no current result, cleared matching attempt and reusable admission. Define the unavoidable after-commit ordering explicitly instead of claiming retroactive cancellation.

### F08-R2 — High — diagnostic CLI omits the required configured operator capability
Source: projects/07-cold-email-warmup/src/mailboxes/diagnostic-operator.ts:6–12; src/config.ts:48–58. Contract: docs/features/f08-live-diagnostics/03_architecture.md, Components, diagnostic-operator entry: use existing operator-token-file validation/digest and require configured operator capability; AC-f08-live-diagnostics-001 requires explicit independent operator authority.

loadConfig intentionally permits operatorTokenDigest=null when OPERATOR_TOKEN_FILE is absent. The new CLI never tests that field and proceeds to publishAuthority using ordinary app database configuration. Configured operator capability is therefore optional despite the accepted architecture. This concerns the missing configured-capability gate, not a claim that an OS/DB administrator can be prevented from directly modifying their database. Coordinator confirmed there is no superseding accepted authority decision.

Reproduction: invoke the CLI with otherwise valid app configuration, OPERATOR_TOKEN_FILE unset, current expected revision and a revoke or valid publish input; source follows through to publishAuthority. Independently executed /tmp/n7-f08-review-a1/operator-null-capability.cjs transpiles the unmodified entrypoint and runs its actual control flow with isolated config/database module seams: null operatorTokenDigest still invokes publishAuthority and emits authority_committed_revision. /tmp/n7-f08-review-a1/operator-null-capability.log records the bypass (exit0). No real DB mutation or external grant was made.

Fix: require the already-validated configured operator capability before any authority action, keeping token contents out of argv/output and honoring existing local file/process authority. Add actual CLI negative regression with unset capability and assert no revision/state mutation; retain missing/invalid/expired-input committed-revoke behavior for authorized operator calls and existing stale-revision/rollback witnesses.

## Evidence assessment and limits

Read root/project CLAUDE, applicable local security/testing/style/secret rules, scoped accepted specification/pseudocode/architecture/refinement/capability contract and READY validation; inspected candidate diff and actual protocol/store/operator/API/UI/test code. Applied project-work-companion delivery evidence instructions. Review did not modify source, docs, tests, git, dependencies or containers and performed no external/provider/spend/deployment action.

Confirmed HEAD00f6888fe753a546ac17f63eb1eda270e260600a, exact specification SHA, clean git status, git diff --check exit0 and every entry in /tmp/n7-f08-verify-a2/source-manifest.json matches the review tree. Independently executed only the two narrow defect reproductions above; production TLS/PG/browser suites were inspected as supplied evidence, not re-run or presented as reviewer execution.

Inspected /tmp/n7-f08-verify-a2/unit-terminal.log:54/54 includes actual10s phase stalls and cleanup; this precedes store-only cleanup. /tmp/n7-f08-verify-a2/store-final.log:14/14 exercises final affected PG/HTTP/CLI source. /tmp/n7-f08-implement-a1/integration.log:132/132 full PG precedes later diagnostic-only changes, with affected reruns retained; parent-witness.log explicitly runs the literal parent test outside integration glob. mutations.json plus mutation logs record three real failing hostname/cap/revision guards and restoration. a1 failed receipt remains failed; a2 completion closes its missing witness work, not the newly found defects. a2 receipt's55-second sealing overrun is disclosed; no claim that its receipt met budget.

Actual combined image sha256:3791cac50f5b6c2c87dd5cd3975f8141a1dd846b405361ca7456623121ec0b37 has source7abaa2d283323a76063caa55e6bcdb3c0947d0e4eced6067df543764657817da and build25ae41625b7a1092811636b50c5c685a27c363367654e75ecc61945896baf49e. a2 preflight ready immediately precedes browser20/20; pending/stale rendering limitation preserved above. Coordinator exact-image lint/typecheck exit0 with transferred typescript-eslint8.48.0 closes the old local dependency-symlink limitation; inspected /tmp/n7-f08-coordinator-final/exact-image-{lint,typecheck}.log. Dependency audit/provenance final inventory remains coordinator-owned; it cannot override these source defects.

Full frozen-project Phase12 exit0 (nine features, zero gaps/inconclusive) and completion exit1 (exactly nine previously scoped debts: future expanded seven + F06 B5/B6) are /tmp/n7-f08-coordinator-final/{phase12,completion}.txt. Those whole-project debts are not additional F08 findings. Structural F08 rows passing do not negate R1/R2. No whole-expanded or external-provider acceptance is claimed.

Requested model/effort: gpt-6-astra/high. Actual model/effort/tokens/cost: null, native host attestation/counters unavailable. Generic Codex/GPT role strings are not model attestation. Profile: inherited XL, fresh independent bounded security/acceptance review. RUN_ID20261006T090602Z-n7-expanded-mvp-a1; WORK_UNIT_IDf08-review-a1. Review delivery is completed, product acceptance is NEEDS_WORK. Next responsible owner: /root/n7_expanded_coordinator, one bounded author correction pass for R1/R2, affected real-PG/CLI regression and fresh focused review; parent autonomous goal remains active.
