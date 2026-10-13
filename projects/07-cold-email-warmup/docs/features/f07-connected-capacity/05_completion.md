# F07 — Implementation and executed checks

IMPLEMENT attempt f07-implement-a1 accepted by fresh independent f07-review-a1 at source10c8e946; integrated code revision7fbc1874. All8 AC met; review-contract0.
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1.
Spec SHA256: 8c55e447d6a5e9f8b98f5bbb0415102089ed300b31142dab42f73d44ac9d7712.
Source/build/actual image bindings and final results are in the terminal receipt
/tmp/n7-f07-implement-a1-receipt.md and evidence /tmp/n7-f07-implement-a1.
Permanent receipts,93-file runtime source reconciliation, archived raw logs and browser reports: `../../telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/f07-implement-a1/`. Independent report: `review-report.md`. F07 local acceptance does not complete expanded MVP or authorize live delivery.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-f07-connected-capacity-001 | tests/capacity-integration.test.ts | creates101st connected mailbox for free and expired TEST team without send |
| AC-f07-connected-capacity-002 | tests/capacity-integration.test.ts | global30 admission serializes competing tenants and duplicate requests |
| AC-f07-connected-capacity-003 | tests/capacity-integration.test.ts | complaint quarantine immediately releases capacity for another tenant |
| AC-f07-connected-capacity-004 | tests/capacity-integration.test.ts | sender and pool recipient need active lease at scheduling claim and final fence |
| AC-f07-connected-capacity-005 | tests/submission-integration.test.ts | R1 post-lock clock midnight concurrent waiters enforce new-day provider limit1 and reservations |
| AC-f07-connected-capacity-006 | tests/capacity-integration.test.ts | tenant pages remain bounded and foreign capacity actions cause no side effects |
| AC-f07-connected-capacity-007 | scripts/ui/f07-capacity.mjs | saturation visible keyboard activation |
| AC-f07-connected-capacity-008 | tests/capacity-integration.test.ts | real schema11 to12 upgrade preserves envelope states and has no automatic leases |

## Actual implementation and test scope

Schema12 adds singleton global30 and tenant-bound lease120s without backfill.
Explicit activate/renew/deactivate use first global advisory lock, singleton and
own mailbox row locks, then database clock. Shared cancelMailbox releases capacity
atomically, including complaint quarantine; independent consent revoke stays scoped.
Sender and pool recipient require unexpired capacity at scheduling/claim/final fence.
Unknown delivery, quota UTC, credentials/AAD and Argon2 rules are unchanged.

Connected records are commercially unlimited, both plan mailbox limits explicitly
null. Campaign limits3/10 remain. TEST price is100 minor RUB (1 RUB), duration30days;
existing canonical billing/payment/single-grant/expiry tests remain authoritative.
API pages25/max100 use exact PostgreSQL timestamp/id anchors and own cursor checks.
Cabinet uses page totals, explicit capacity actions and paged campaign chooser;
SessionClient epoch protects page responses. There is no automatic renewal or send.

Executed baseline checks: full unit40/40; full PostgreSQL126/126; typecheck/lint/build0.
Final focused PostgreSQL11/11 includes actual blocked lease-expiry, rollback, global
race and distinct-tenant complaint release. Final unit40/40 and typecheck/lint0.
Two independent isolated mutations removing missing-lease or expiry predicates fail
actual capacity tests; canary/runtime-secret scan passes with values suppressed.
Schema11→12 is tested in a separate temporary own PostgreSQL database, then dropped.
Docker Playwright browser actual PASS:10 checks, no page errors; pagination101,
waiting→release→retry active, deactivate, keyboard action, unchecked consent,
paged campaign chooser, unlimited label, DOM canary and session logout clearing.
Fresh read-only preflight binds actual source/container/build/image. Build SHA256
e2f695ace69688f62ed74f861c27c84e0adb9aa23aa1273f22e943561ace7828;
image sha256:f4836fdf94a42b6c4e2736713ea4efec87f5d3d6283849726c99c2b87da76b2d.
Browser r1/r2 failed before product checks because Docker fixture ownership denied
read; r3 uses observed UID1001. All failed receipts remain preserved.

Previous failed migration/keyset/fixture and browser file-permission attempts are
preserved in evidence. Installed selected completion gate is a source-linkage gate,
not runtime acceptance. Full project's future expanded/F06 pending coverage and
superseded F05 mailbox-test title remain separate coordinator-owned gaps.

## Acceptance and measurement boundaries

Fresh independent source-bound review, confirmed corrections and coordinator
integration are mandatory before accepting F07. No push, deployment, live email,
paid LLM or real payment was performed. Profile compact-quality-first-v2; requested
Sol6.1 high; actual model/effort/usage/cost null because host metadata unavailable.
Elapsed includes reading, implementation, checks and failed attempts; terminal
receipt records wall-clock boundary and remaining authorized steps. Savings unknown.
