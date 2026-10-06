RUN_ID: `20261006T090602Z-n7-expanded-mvp-a1`  
WORK_UNIT_ID: `f10-uidreset-contract-plan-a14b-cli`  
Launch-SHA256: `07ac6bb1e3d338432b278ee5889031090bda62cba06db614f6687a4bb4fe8324`  
Source-Revision: `6255b8f19a456103f062b0d1d5fd2313b914af94`  
Finished-At: `2026-10-06T18:35:20Z`  
Verdict: **plan ready**  
Profile: `model-routing-econom`  
Requested model/effort: `gpt-6.1-sol` / `high`  
Actual model/effort, token usage and cost: `null` — provider metadata unavailable.  
Substantive reading ended at `18:34:48Z`, before freeze `18:37:56.543077Z`; deadline `18:39:26.543077Z`.

This receipt completes the bounded read-only planning task. No files were written, tests executed, DB/network accessed, agents spawned, packages installed or settings changed. Implementation and acceptance remain pending.

**Confirmed defect.** In frozen `src/replies/imap.ts`, `imapRead` completes authenticated read-only EXAMINE, then throws `protocol_invalid` when current UIDVALIDITY differs from the expected generation. It discards valid UIDVALIDITY/UIDNEXT proof before FETCH. `ReplyStore.retry` preserves run/cursor/high-water/fixed-tail identity while incrementing attempt and resetting the attempt budget. Consequently, quantum retries against the old generation repeat the failure; restart preserves the trap.

The three hash-verified objective artifacts establish old UID1/cursor0/high0/tail0 failure, explicit retry, repeated failure after the original 30-second backoff, and persistence across restart. Errors have `signalAborted:false`. The fresh UID2 participant’s deliberate FETCH NO failure subsequently recovers through explicit retry. This is a two-participant accelerated diagnostic; `canonical330Pass:false`. It establishes neither canonical acceptance nor a product fix from prior timeout observations. Source comparison against `a8d4b6b2` shows only the two stated F09 test/fixture files changed.

**Minimum correction and ownership.** One future `gpt-6.1-sol/medium` implementer owns the following project-relative source changes and affected tests. The coordinator owns integration, source/build freezing and evidence. No executor was launched by this planner.

| File | Required change |
|---|---|
| `src/replies/adapter.ts` | Define private discriminated `ReadResult = {kind:'page'; page:HeaderPage} \| {kind:'uidvalidity_changed'; snapshot:Snapshot}`. Change `ReplyAdapter.read`, `LiveReplyAdapter.read` and `FixtureAdapter.read` consistently. Validate the result variant before caller use; a change proof must actually differ from requested validity and have the adapter’s permitted provenance. Fixture reads use their existing single source query to produce the equivalent result. |
| `src/replies/imap.ts` | Return `ReadResult`. Immediately after successful EXAMINE, return the change variant on validity mismatch, before applying the old horizon constraint or sending FETCH. For unchanged validity, retain horizon/coverage checks, bounded FETCH/parser behavior and failures; wrap successful pages in the page variant. |
| `src/mailboxes/transport-child.ts` | Carry the read union through the existing successful `{ok:true,result}` IPC response. A generation change is successful proof acquisition. Malformed/incomplete EXAMINE, tagged failures and cancellation remain failed operations. |
| `src/replies/worker.ts` | Handle both variants in **both** `poll` and `quantum`. A change result performs guarded capture and returns the resulting scanning state; it never becomes `PageInput`, triggers another snapshot, or fetches the new generation inline. Preserve the explicit incomplete hold, including an early full-poll status check before snapshot/capture. |
| `src/replies/store.ts` | Add an optional expected `RunIdentity` to `capture`. For capture against an existing run, check run/attempt/validity/cursor under its row lock and reject an incomplete run before replacement. Bind proof provenance to the expected source. Workers supply this identity for existing-run captures, including snapshot-detected resets and read-detected resets. Preserve existing capture/reset SQL and transaction semantics. |

`src/mailboxes/transport-lifetime.ts` already transports generic results with `serialization:'advanced'`, preserving Dates. Instantiate the read path with `ReadResult`; no new IPC request, error-message encoding or lifecycle behavior is necessary. Its confirmed-exit and exact slot-release behavior remains authoritative.

`src/replies/input.ts` remains the page-only boundary: generation-change proof never enters `parsePage`. `src/runtime/{worker,store}.ts` need no new reason, field or scheduling branch. Existing composition maps returned `scanning` to unsatisfied `ready`; only `complete` satisfies polling.

**Trusted proof and quantum bound.** Proof originates only from the existing pinned/allowlisted TLS reader after authentication and a complete tagged, READ-ONLY EXAMINE with validated UIDVALIDITY and UIDNEXT. The child closes through its existing lifetime path before the result is consumed. Native proof has `imap_headers` provenance; trusted local fixture proof has `local_fixture` provenance. No HTTP/config-selected proof source is introduced.

Mutation uses the guard captured **before** that operation: tenant ownership, poll owner/source generation, current grant/mailbox revision and, for quantum, runtime owner/generation/lease/cancellation. Do not reacquire a newer guard to legitimize an old result. Expected run identity prevents a delayed proof from overwriting a superseding capture, cursor or retry attempt.

One scheduling quantum still performs at most one adapter protocol operation. A read already executes EXAMINE; returning its current-generation proof adds no connection or snapshot operation. Guarded capture is DB work, after transport settlement. The quantum then yields. Subsequent scan, tail snapshot and tail read each consume their own fair turn.

**State and compatibility requirements.**

- A genuine generation change creates a new run with cursor0, `high_water=proved UIDNEXT−1`, tail horizon NULL, attempt1 and pages0. It sets `scan_complete=false`; it does not advance `completed_at` or declare freshness.
- Same-generation continuation retains the committed cursor, original high-water, fixed tail and attempt budget. Increasing UIDNEXT cannot widen a fixed horizon; unchanged-generation UIDNEXT below the requested horizon remains failure.
- Coverage through high-water and a successful same-generation tail page remain necessary for completion. Preserve 100-header pages and 20-page/120-second attempts.
- Full `poll` retains its bounded multi-operation contract. It handles a reset racing initial/tail snapshots and the subsequent read, and returns after reset capture. Quantum retains one-operation scheduling and durable fairness.
- Incomplete work remains held until explicit authorized retry. Neither backoff, restart, reconciliation nor a changed server generation authorizes that transition. The existing operator command remains `local_test` only; native tests may use the trusted fixture operator seam. This plan adds no live-provider retry authority.
- FIRST `pg_advisory_xact_lock(7,1)` precedes eligibility reads/writes. No network runs inside a transaction. Atomic observations, semantic reply effects, stop and cursor commits remain unchanged.
- Unknown SMTP outcomes, quota, consent, final stop fence, physical ownership and exact cleanup proof remain unchanged. No schema, engine, persisted flag or dependency is needed.

The canonical generation-reset and semantic-stop clauses, F10 `02` polling steps4–5, `03` transaction boundaries and `04` retry constraints cover this correction. The missing private result variant is an implementation contract defect, not a product requirement gap. No normative rewrite is proposed. Broader live retry authority remains outside this correction.

**Independent fail-capable verification assignments.** Assertions must use literal expected values and server/DB observations independent of production constants.

1. **Native reset/retry witness:** extend `tests/f09-live-protocol.test.ts`, `tests/f09-transport-fixture.ts` and `tests/f10-runtime-protocol.test.ts`. Persist UID1/cursor0/high0/tail0; cause a real protocol failure and verify incomplete pause. Restore a valid UID2/UIDNEXT2 server. Before explicit retry, ordinary scheduling/restart performs no resumed scan. Authorized retry preserves old identity/horizon and increments attempt. After existing backoff, one native read returns actual UID2 proof with no FETCH; guarded capture establishes cursor0/high1/tailNULL and leaves freshness unchanged. Later quanta fetch new-generation coverage and complete the tail. Keep the separate fresh-UID2 FETCH NO/retry control.
2. **Full-poll compatibility:** extend the shared F09 `recoveryScenario`, exercised by `tests/f09-transport-integration.test.ts` and `tests/f10-runtime-protocol.test.ts`. Change UIDVALIDITY between a successful snapshot and read; verify typed reset capture, no old-generation page commit, and later recovery. Update native mismatch assertions from rejection to change-proof expectations; malformed framing and same-generation FETCH failures must still reject.
3. **Guard denial:** extend `tests/f09-live-transport.test.ts` and `tests/f10-runtime-integration.test.ts`. Delay proof completion, then independently replace runtime owner/generation, poll owner/source, grant revision, mailbox revision, or expire/revoke authority. Each case rejects capture without modifying the current run/poll state. Include foreign-tenant access and concurrent retry/run replacement.
4. **Rollback and semantic replay:** extend `tests/replies-integration.test.ts`. Inject DB failure before reset commit and assert no partial reset/poll update. Retain before/after page-commit crash witnesses. Reobserve old reply R under new UIDs alongside unseen S: observation identities may grow; semantic effects remain R=1/S=1 after replay. Old proof/page replay cannot overwrite newer state. Sending stays paused until complete proof.
5. **Same-generation/no-auto-retry:** extend `tests/f10-runtime-integration.test.ts` and reply integration tests. Larger UIDNEXT preserves the fixed tail; smaller valid UIDNEXT cannot silently reset it. Failure, timer, restart and drain do not call retry or clear incomplete state. Test full-poll entry as well as quantum.
6. **Mutations:** each targeted witness must turn red when restoring mismatch-as-error; fetching/relabeling on mismatch; adding a second snapshot operation; clearing fixed tail on retry; inventing completion from reset proof; bypassing run/source/runtime/grant/tenant guards; bypassing explicit retry; or breaking atomic rollback/semantic dedup. Preserve mutant/restored hashes and actual exits.

**Existing AC mapping — all seven remain unchanged.**

| AC / scenario | Correction-related evidence |
|---|---|
| 001 / SC-F10-001 | Restart/drain retains cursor and incomplete hold; stale callbacks reject; child cleanup remains exact. |
| 002 / SC-F10-002 | Reset yields a fair turn; same-tenant A–D/E ordering, every-mailbox cadence and durable service order remain mandatory. |
| 003 / SC-F10-003 | One operation per quantum; fixed 2SMTP/4IMAP/1 per protocol/mailbox, six-child limit and attempt bounds remain mandatory. |
| 004 / SC-F10-004 | Reset never supplies freshness; atomic reply stop and final current-state/quota/pacing fences remain mandatory. |
| 005 / SC-F10-005 | Semantic replay cannot duplicate pool work; pair/day and parent/thread uniqueness regressions remain mandatory. |
| 006 / SC-F10-006 | Genuine failures retain due age and 30/60/120/300 backoff; incomplete holds remain explicit. |
| 007 / SC-F10-007 | Exact parent witness and all source-bound build, PG, protocol, mutation and canary gates remain mandatory. |

After implementation, freeze the new source/build/config and run typecheck, lint, build, unit/full PG suites, affected F09 native/full-poll/PG/lifetime regressions and affected F07 regressions. Explicitly include protocol files outside the integration glob. Run the full frozen **330-second** `tests/expanded-mvp-04.test.ts` witness, title `persistent fair workers serve every eligible mailbox`, with the fixed 100-connected/30-active/≥3-tenant cohort, restart/fault phases, full 300-second pool deadline and every participant’s cadence/resource evidence. Short diagnostics cannot substitute.

Current physical-ownership mutations, all current material/cadence mutations and full canary checks remain mandatory. Use a coordinator-reserved disposable PG namespace and existing isolation/resource rules. Fresh independent `gpt-6.1-sol/high` review receives this planner context, exact candidate and raw source-bound evidence with `fork_turns=none`, excluding author/coordinator history. This plan is not acceptance; F06 delivery gaps and F11–F15 remain pending.

**Context manifest.** Paths in `normative_files` are relative to `normative_repository`; every entry uses the shared immutable revision. All 14 packet digests, packet/launch digests and objective digests were verified.

```json
{
  "run_id": "20261006T090602Z-n7-expanded-mvp-a1",
  "work_unit_id": "f10-uidreset-contract-plan-a14b-cli",
  "launch_sha256": "07ac6bb1e3d338432b278ee5889031090bda62cba06db614f6687a4bb4fe8324",
  "source_revision": "6255b8f19a456103f062b0d1d5fd2313b914af94",
  "source_worktree": "/tmp/n7-f10-restart-fix-20261006-a12",
  "normative_repository": "/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-replicate",
  "normative_revision": "dfb3219e58a86dbf0a16b68e4fb6f26def99a4da",
  "approved_f10_plan_revision": "e5fad0bd750f0ec40cbd4c1b898f159c1bb20da8",
  "independent_requirements_validation": "2f24e06cc8460450c88d2103c38221fa85f32b48",
  "planner_packet": {
    "path": "projects/07-cold-email-warmup/docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/sol-coordinator-handoff-20261006/planner-only-review-packet.json",
    "sha256": "c56fa1bef6b60a4f413320469fe4ee7314439e4aa5d1c48e5ea9328c5f4682e5"
  },
  "normative_files": {
    "projects/07-cold-email-warmup/docs/features/f10-durable-runtime/01_specification.md": "410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8",
    "projects/07-cold-email-warmup/docs/features/f10-durable-runtime/02_pseudocode.md": "c08da0230b35a07f749f186ce0c54d363662c1c70e3e95e617e321974e456fdb",
    "projects/07-cold-email-warmup/docs/features/f10-durable-runtime/03_architecture.md": "7ba1644e010feb420901d5b24e5a41fd2ec959a237f5f72b85d4fb31f6b12df1",
    "projects/07-cold-email-warmup/docs/features/f10-durable-runtime/04_refinement.md": "a28d4e29ae8e54ae487caaa285938059b67c215546443baa66e1d7b4c70e1300",
    "projects/07-cold-email-warmup/docs/features/f10-durable-runtime/05_completion.md": "913b45a0e49dbfc95e98d33db485c382d1e935f77f3559c2fd1e4835e2278b27",
    "projects/07-cold-email-warmup/docs/features/f10-durable-runtime/validation-report.md": "22eabfaba1f78ec1f9c74d5b0eb8763c2d28babcd00be98b5d86e88b57e1400d",
    "projects/07-cold-email-warmup/docs/ADR.md": "6baf1874848d3c4bceb8eab65ccfc12ccd6bf6920c9a9a19a2e6bcc7a32880a4",
    "projects/07-cold-email-warmup/docs/decisions-owner.md": "cf47d55af1d5ad4cd5f34c7531f1d2004dfdc98076e7459c76af8b93f3e709d8",
    "projects/07-cold-email-warmup/docs/plans/expanded-mvp-plan.md": "cb9449fb233471275dd6ee67a496d8d04f38ddedf637bdfe4588dfc9689fb13d",
    "projects/07-cold-email-warmup/docs/features/expanded-mvp/01_specification.md": "dddb2cbdb5b3f7f54c7d63571ed7429b7abac1d42e6f8eb6ff8079dddc69979a",
    "projects/07-cold-email-warmup/docs/features/expanded-mvp/ai-policy-v1.md": "d3d7c9d4614134f1dca9078ed797e3f8ee94a7bc613856bb54f2f2628b566512",
    ".claude/commands/feature.md": "6908fa6c8ba770f829378a021d5f7e9a9bc79a15bdd67b278d8c6a765968b291",
    ".claude/skills/sparc-prd-mini/SKILL.md": "b663793d1e1d1de028f91f2e266a191811bb610f97a12be7f95d62327589d53a",
    ".claude/skills/requirements-validator/references/feature-report-contracts.md": "df263cbce17fb5d9dec6514561c66f6283b3f19e2fc85056f0531bac615be0f1"
  },
  "additional_canonical_files_at_normative_revision": {
    "projects/07-cold-email-warmup/docs/Specification.md": "9faaacfa11f4c6351f936d26e1ee74839eadab6b47289a7d1890ba5878dd211c",
    "projects/07-cold-email-warmup/docs/Pseudocode.md": "4cfb8ac0df218e1e16eefa418d76414d9c928ecc4da63ec0c05cc3578bcc4011",
    "projects/07-cold-email-warmup/docs/Refinement.md": "a06f2b4a277d23e822f6f13cc28ab06dbe0da84e9d71a56a003ed44487208d9c"
  },
  "objective_files": {
    "/tmp/n7-f10-verify-a13/diagnostic-classification-v1.json": "f2bd536e9633109f17277fae06af15a0e77b75fda68ecaa6da8a1d2c24eb36e0",
    "/tmp/n7-f10-verify-a13/child-error-v2.jsonl": "a83e8a01db833edaa5659a8a9034dc722779b13517bb1e583a7042d33364a570",
    "/tmp/n7-f10-verify-a13/diagnostic-summary-v3.json": "e823316a0c802eef6793512059965a035487ee0884ca93b1e84746f5cf847e73"
  },
  "review_context": "planner requirements, architecture, invariants, tests, exact frozen candidate and raw evidence; no author history or prior review dialogue",
  "requested_model": "gpt-6.1-sol",
  "requested_effort": "high",
  "actual_model": null,
  "actual_effort": null,
  "usage": null,
  "cost": null,
  "acceptance": "pending implementation, mandatory gates and independent review"
}
```

Status: completed