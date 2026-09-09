# Independent monetary pseudocode rereview v2 — N3a

Verdict: NEEDS WORK — one HIGH finding remains in historical transfer reconciliation.
RUN_ID: 20260909T174821Z-prd-a-1934
WORK_UNIT_ID: pseudocode-v2-review
Stage: VALIDATE / independent bounded rereview, planning only.
Profile: compact-quality-first-v2. Risk: XL (money, tax, restore).
Frozen revision: 30ff86ac1203a98838ee16f1566e0cc1e606593d.
Requested model / effort: gpt-6-astra / high.
Actual model / effort: null / null. Model evidence: null; host execution attestation unavailable. Requested routing is not attestation.
Fallback: null; no switch performed or evidenced.
Usage input/cached/output/reasoning tokens: null; host counters unavailable.
Cost: null; basis unavailable. Full review started_at / elapsed_wall_ms / active_wall_ms: null; no first-tool clock sample or complete wait accounting was captured. Coordinator may supply its own measured assignment interval; none is reconstructed here.

Owned output: this receipt only, written by same-directory temporary file and atomic rename. No implementation, source edits, git mutations, subagents, network mutations, deployment or financial actions. Terminal completion means this bounded review finished, not that the plan passed.

## Scope and method

Read root/project CLAUDE, model-routing/telemetry, complexity-router, swarm-file-evidence and relevant shared-resource/security-order/webhook/fail-closed rules. Reviewed current PRD, Specification, Pseudocode, Architecture, Refinement, test-scenarios and both requested prior receipts. No project-local .claude directory exists in this snapshot. All fourteen current algorithms were read, with focus on steps AND persisted logical fields; Architecture's mapping was cross-checked rather than treated as proof of closure.

D7 remains a proposed separate platform_leads scope pending owner review (Pseudocode:227; Architecture:76; test-scenarios:416–419). This review does not approve that scope, count it as full monetary dogfooding or invent a defect because owner review is pending. Current due-date and approved late catch-up semantics were included.

## PSEUDO-01..06 closure assessment

| Original issue | Disposition | Exact current evidence |
|---|---|---|
| PSEUDO-01 — persistent all-model payer/person/year reservation | CLOSED for the original reservation failure; historical NPD inclusion remains part of V2-01 below | Pseudocode:39–42 defines separate per-base TaxYTD and durable PayerYearGuard with active preparation, blockers, declared/covered NPD counters. Steps193–198 transact all models, keep reservations through expiry, check sequential as well as concurrent second preparations. Confirmation209 updates all-model income. Architecture92–93 declares unique guard and live row reservation. Specification433–436 plans cross-program/base/model cases. |
| PSEUDO-02 — observation and atomic reservation replacement | PARTIALLY CLOSED; tax reconstruction still NEEDS WORK | Pseudocode52 and207 explicitly allow observation without preparation under a closed RecoveryGate. Steps210–212 acquire sorted OLD/ACTUAL guards, block unrelated reservation stealing, atomically supersede/confirm without a commit gap. Payment145/refund159/freeze178/recovery257 all guard ordinary financial writes. Missing historical pre-transfer tax state is V2-01. |
| PSEUDO-03 — per-month refund convergence | CLOSED at document level | Pseudocode29–31 stores immutable Refund facts, RefundAllocationRevision and signed reallocation by basis month. Steps161–163 sort ALL refunds across batches, compare canonical targets with full prior signed history, append corrections and preserve frozen months. Steps180 and Architecture90 separate economic hash from audit-history hash. Refinement74/82 includes30/30 and50/50 permutations, including a positive correction. |
| PSEUDO-04 — membership after consent | CLOSED at document level | Pseudocode14–16/64–68 defines grants and identity-only sessions, trusted owner/operator issuance and own acceptance access;91–94 atomically inserts minimal partner Membership only after consent and synchronizes suspension/reactivation. Specification448 onward and test-scenarios388–398 include concurrent consent and existing-account delegation. |
| PSEUDO-05 — temporal eligibility | CLOSED at document level | Pseudocode21/23 stores versioned immutable EligibilityFact and selected registration facts/decision;94/107–109 defines event-time history, non-backdating, missing-history review and stable retries;147–149 preserves registration entitlement and updates eligible/first_paid_at explicitly even for rounded-zero commission. Architecture86–87 maps history and FK authority. |
| PSEUDO-06 — immutable calendar | CLOSED at document level | Pseudocode17/32/54 persists activation lock and copied period timezone;80 rejects later timezone change including paused programs;109 sets fallback lock;176 derives month/due date from fixed calendar. Specification428–431 and Refinement80/86 cover calendar boundary/date handling. |

## V2-01 — HIGH — Recovery recalculates a historical transfer from already-inclusive or later current balances

**Sources:** Pseudocode:39–41 (current YTD/guard plus TaxSnapshot fields),193–196 (ordinary prospective calculation),210–212 (historical reconciliation); Architecture:92/99/101 (same mapped state and claimed recovery contract); Specification:99/110–112/438–446; Refinement:84 (R1 only covers amounts absent from zero opening/counters).

Step211 calls CalculateAndPrepareTax rules to derive a corrected snapshot at the actual date, with an explicit exemption only from the ordinary active-reservation check. The referenced withholding formula uses current opening+paid base and current accumulated withholding (195); the NPD formula uses current declared+internal−covered income and then adds gross (196). Step211's per-counter inclusion evidence prevents a second counter increment, but it does not define the historical pre-transfer inputs to those formulas. Merely putting an old actual_date in TaxSnapshot does not reconstruct those inputs. TaxSnapshot records current guard/YTD versions, amounts and inclusion_evidence, but has no defined persisted pre-transfer balance/ordering evidence contract. Later transfers may already exist even if the observed transfer is included only in an approved opening balance, rather than in a surviving Confirmation.

**Counterexample A, NPD, all values in kopecks:** an observed transfer gross10000 was valid, taking the evidenced aggregate from239990000 to240000000. Following restore, declaration240000000 already includes it, while restored internal NPD counter=0 and covered=0. Step196 computes240000000+(0−0)+10000=240010000 and rejects it as exceeding the240000000 fixture limit. Evidence that the transfer is already included does not repair this preflight formula merely by making a subsequent counter delta zero. Conversely, if reconciliation adds the missing10000 internal counter, the declaration coverage must also account for that already-declared amount; otherwise the next preparation double-counts it. The coverage update is not specified in211.

**Counterexample B, withholding with later transfers, all values in kopecks:** use the document's synthetic13%/15% bands with threshold240000000. Immediately before observed transfer A, cumulative base239990000 and withheld31198700 are evidenced; A has gross/base20000, correct withheld2800 and net17200. A later transfer B adds base100000 and withheld15000. At reconciliation, current opening+paid base=240110000 and opening+withheld=31216500, already including A and B. Applying195 to current balances with A again gives3000, not historical2800. Even subtracting A from current balances still leaves B ahead of A and produces3000. Suppressing the later YTD increment avoids double storage but does not yield a correct historical snapshot or approved amount match. Independent integer document arithmetic reproduced these results; this is not a tax-law validation or application test.

**Impact:** valid externally completed transfers cannot reach a faithful Confirmation, or receive a historically wrong tax snapshot. Observations/reservations can stay unresolved and keep the restoration gate closed despite complete external evidence. This is a remaining PSEUDO-02 closure blocker, touching NPD baseline handling from PSEUDO-01.

**Bounded correction required:** separate (a) immutable accountant-approved reconstruction of balances immediately BEFORE the actual transfer, its rule/profile/date and stable ordering relative to later transfers, from (b) approved inclusion decisions and deltas for CURRENT counters. Define the input shape and persisted snapshot/evidence references for pre-transfer tax-base/withheld totals and NPD aggregate/internal/covered components. Historical calculation must consume that evidence, never current totals minus a guessed amount. Independently reconcile current guard total, NPD internal income, NPD declaration coverage, base and withheld counters exactly once; store explicit inclusion decisions for each. Unknown historical order/balances remain review. Preserve the existing sorted guard locks, all-or-nothing supersession/confirmation, uncertainty blockers and observation availability. This needs no new service or payout API.

**Required planned acceptance fixtures:** retain R1 absent-from-opening and add (1) NPD transfer already in declaration but absent from restored internal counter, asserting correct historical eligibility and unchanged economic known total after internal+coverage reconciliation; (2) withholding A-before-B threshold example above, asserting2800 historical withholding and no second current-base/withheld increment; (3) mixed independent inclusion flags per counter, including some amounts already present and others absent; (4) historical balance/order unknown, with no Confirmation and reservation retained. Run each via missing/existing preparation and year-crossing paths, duplicate/concurrent reconciliation and failure immediately before commit. Assert one Confirmation, unchanged original due_date, correct historical TaxSnapshot and current counters, and no intermediate transfer window. These are additions to the test PLAN, not requests to run nonexistent app tests now.

## Day-5 and late catch-up assessment

Specification69–73 and Pseudocode176–177 preserve original due_date=5th and chronological missed-month close. Pseudocode193 explicitly allows owner-approved late catch-up preparation for a current/future planned date;197 sets expiry to that planned day. Ordinary confirmation208 still accepts only actual_date=due_date, so even an approved catch-up is recorded through observe/evidenced reconciliation, keeping late status and original due_date212. This is coherent as an explicitly exceptional completion path; it depends on resolving V2-01 for faithful tax reconstruction. Architecture101's ordinary prepare/confirm sentence should be read with the explicit exception in193. No automatic rescheduling or early readiness is authorized. Existing Refinement86 covers actual4/5/6 dates; the approved catch-up path should be represented in the amended recovery fixture as well.

## Document checks and limitations

- Exact requirement-name check:36 unique Specification FR/NFR and36 unique Pseudocode REQUIREMENT claims, equal sets. An initial overly narrow reviewer regex omitted the digit-containing N1 category; corrected regex includes A–Z and0–9 and passes. This was a probe correction, not a document defect.
- Scenario linkage:51 canonical SC,48 algorithm claims, only SC-US-012-1/2/3 UI-only exclusions, no dangling algorithm SC.
- Independent integer document probe: both30/30 orders converge September0/October−1; both50/50 orders converge September−1/October0. Reverse50/50 history includes October−1, September−1, October+1, exercising signed correction. These corroborate the written formula; no production hash implementation exists to test.
- No runtime, build, database, concurrency, mutation, browser, provider sandbox, benchmark or restore test was run. Future mandatory checks are not waived. No current legal/provider capability claim is independently made; analysis uses the frozen document's synthetic rules.
- Source drift and ownership checks bind this review to the hashes below. Review completeness is bounded; no minimum finding quota was applied. No cost-saving claim.

## Input SHA-256

- `PRD.md`: `c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8`
- `Specification.md`: `7457c9f705230ad34b7b55ec32774e1aba3276f683be7c5af55f3825af8fe23e`
- `Pseudocode.md`: `37a0f6bf97b7d3f03c9d1ac7a0123deff33e8117f58de1e6749cd1ba2831ca9f`
- `Architecture.md`: `1620e4c6f6164934fc86713f6a2e1fb2c399ffe09abe90fc8f161c67a859a20f`
- `Refinement.md`: `ad876b61b80ea4d83dcb29b8ddcf0665439a3d0ab922b79c7b08f9fb81c19bf9`
- `test-scenarios.md`: `cc14007c1b6e1cc28bcccdfa3a1d01efcc08faad76a59b60f13bd526e7b73451`
- `telemetry/p-replicator/20260909T174821Z-prd-a-1934/pseudocode-v1.md`: `862174376be0081d1b814609a5eda343b81108e495916ff08f7e972854740271`
- `telemetry/p-replicator/20260909T174821Z-prd-a-1934/architecture-v2.md`: `8af30e5125c04d99813fa5e7020adc3be6734894b076b83204a5feb1ad70a024`

Receipt finalized_at: 2026-09-09T19:05:23.058730+00:00
Full assignment duration remains null here; coordinator-owned timing is authoritative if available.

Status: completed
