**Verdict:** NEEDS_WORK

Bounded independent revalidation of original N7-V01..V06 only. Five findings are
closed for design readiness; N7-V03 retains one explicit acceptance-scenario gap.
Its deduplication and rescan algorithm corrections are sound as written. This is
not a backend vulnerability finding: no backend exists and none was executed.

Source-Revision: b04706cae67edcdc29e1384eca20c3ca439c0981
Run-ID: 20261002T173314Z-n7-replicate-a1
Work-Unit-ID: n7-revalidation-v01-v06
Attempt-ID: revalidate-1
Profile: compact-quality-first-v2; substantive ROUTE XL semantic safety review.
Requested model/effort: gpt-6-astra/high. Actual model/effort/usage/cost: null;
no host runtime proof was exposed. Caller reconciliation remains necessary.

The mechanical router returned T/exit0 for the two documentation outputs; that
lower bound does not downgrade the XL subject matter. Existing owner autonomy
applies. No children, source changes, commits, pushes or external actions occurred.

Before reading original findings or correction evidence, obligations were derived
from corrected Specification and Architecture and recorded in the review dialogue:

| Obligation | Corrected contract used as independent oracle |
|---|---|
| Disclose direct-peer SMTP information while protecting private tenant data and requiring distinct consent | Specification.md:34–65; Architecture.md:44–51 |
| Serialize all eligibility/stop writers with final conditional submission; distinguish both commit orderings | Specification.md:215–224; Architecture.md:84–91 |
| Deduplicate semantic reply effects independently of UID and Message-ID; require sender/reference match and complete durable rescan | Specification.md:227–238; Architecture.md:93–97 |
| Define exact freshness, rescan/retry, auth/KDF, reply/quota and evidence bounds | Specification.md:194–202,225–261; Architecture.md:97 |
| Provide positive controls and explicit negative security and concurrency acceptance branches | Specification.md:15–18,31–32,45–47,101–103,120–121; Architecture.md:50–52 |
| Require usable local canonical payment success and single grant; unavailable is only a negative case | Specification.md:138–152; Architecture.md:78–82 |

All source references below are relative to this docs directory at the pinned
revision. Original finding references describe the historical report, preserved
unchanged. Correction-handoff.md:9–21 was treated as a claim to verify, not proof
of closure by itself.

**N7-V01 — closed (design and prototype-copy scope).**
Original requirement: validation-report.md:19–25. Specification.md:56–65 now
expressly discloses sender address, routing headers and test body, separates
private campaigns/contacts/credentials and dashboard/API enumeration, and binds
disclosure to pool consent. Architecture.md:44–51 and ADR.md:19–21 agree.
plans/mvp-xl-plan.md:98,114–117 explicitly corrects the impossible former AC.
tests/security-scenarios.md:158–166 supplies the two-tenant message fixture plus
foreign-access denial. Each of cjm/cohort-desk.html:17–19,
cjm/partner-studio.html:17–19 and cjm/operator-review.html:17–19 places identical
disclosure inside the warmup checkbox label, separate from campaign consent.
Current HTML digests match the existing focused browser evidence for all three
variants and both widths. No privacy-preserving relay is implicitly promised.

**N7-V02 — closed (design scope).**
Original requirement: validation-report.md:27–35. Specification.md:215–224 and
Architecture.md:84–91 require lock(7,1) FIRST for every eligibility/stop writer
and the final conditional transaction. Pseudocode.md:80–103 specifies current
state/lease, consent/version, enrollment/suppression, pool recipient, quarantine,
poll, quota/date and live/test gates; zero affected rows means zero adapter calls.
Pseudocode.md:59–61,115–120,141–146 applies the discipline to the affected writers.
tests/security-scenarios.md:110–156 enumerates ten stop writers in BOTH orderings,
including recipient withdrawal and reduced quota. A stop after submitting commit
may allow the one already in-flight attempt; network I/O holds no DB lock.
plans/mvp-xl-plan.md:97 and ADR.md:16–18 agree. All three HTML files at lines19
and26 carry the queue/in-flight caveat; no socket-time recall is promised.

**N7-V03 — unresolved: pre-page-commit crash acceptance branch missing.**
Original requirement: validation-report.md:37–43, specifically line43 requests
a fixture with a crash before page commit. The substantive identity defect is
corrected: Pseudocode.md:15–18,112–129 and Specification.md:227–238 separate UID
observations, optional stable Message-ID and unique(mailbox,enrollment,reply)
effects. Expected sender plus own sent-message reference is required even with
missing/malformed Message-ID. High-water/cursor persistence, budget pause and
successful same-validity tail poll gate are explicit. No remaining algorithmic
counterexample to those corrected rules was established.

The exact coverage gap is observable in the acceptance text:
Specification.md:101 and tests/security-scenarios.md:229–232 say the rescan
**commits then crashes/restarts after a page**. test-scenarios.md:136–139 gives
generic cursor replay, without a before-commit fault or rollback assertion.
Neither catalog selects a crash after page effects/cursor work but before their
transaction commits. Pseudocode.md:121–124 requires this atomicity in prose;
that is not the explicitly requested fault-injection acceptance branch.
The correction-scenarios.json entry for SC-US-006-3 repeats the after-commit case.

Minimal remaining correction: extend the existing rescan scenario with explicit
before-commit and after-commit cases. For the former, require no partial durable
page effects/cursor advance after the crash, replay from the last committed cursor
under the same high-water, one total semantic effect for the previously observed
reply, and zero dispatch until full coverage plus tail poll. Keep the existing
after-commit case. This requires no new engine or broader audit; executing the
fixture belongs to later backend implementation. Full V03 closure is withheld
only for this original requested acceptance branch.

**N7-V04 — closed (design scope).**
Original requirement: validation-report.md:45–51. Specification.md:197–202,225–261
defines invalid-config refusal; poll30s, age<60s and future rejection; rescan
20×100 headers/120s; three total proven pre-DATA attempts within120s with5s/30s
delays; one warmup reply and one pair thread/UTC day; final-transition quota date
and min(user,provider,30); auth email/IP fixed windows; KDF2/zero queue/503; and
evidence7/28day comparability limits with denominator30. Pseudocode.md:32–36,
65–68,83–103,121–129,158–161 consumes those bounds. Explicit examples cover auth
limits and unrelated-key success (tests/security-scenarios.md:33–54), reply ceiling
(:168–176), UTC rollover (:196–204), retry cutoff (:206–223), freshness/future and
rescan limits (:256–275), and evidence thresholds (:312–333). These are acceptance
oracles, not measured production capacity or achieved performance.

**N7-V05 — closed (design scenario coverage for the original security paths).**
Original requirement: validation-report.md:53–59. tests/security-scenarios.md:5–70
requires real registration/session use, logout/login/logout and rejection of both
old cookies, no/forged/revoked session, wrong Origin, auth/KDF boundaries and
injection/oversize denial. Lines72–98 enumerate ciphertext tamper, cross-tenant
and cross-mailbox AAD substitution, unknown key version and error canary redaction.
Lines100–156 add independent consent scope and both stop-race orderings;
235–254 supplies sender/foreign-reference/missing-ID branches; 277–310 supplies
GET-no-write, forged/wrong-purpose token, unauthenticated complaint and all three
unsubscribe message classes. Existing positive complaint remains at
test-scenarios.md:162–170. Template alternatives are bound to Examples at
test-scenarios.md:95–110 and tests/security-scenarios.md:178–194; attribution and
partner threats are enumerated at test-scenarios.md:262–277,329–344, with the
previously missing When restored. V03's separate crash branch remains unresolved
as stated above; this closure does not claim complete backend test execution.

**N7-V06 — closed (design scope).**
Original requirement: validation-report.md:61–67. Specification.md:143–152,
Architecture.md:78–82, ADR.md:22–23, plans/mvp-xl-plan.md:63–68 and
Completion.md:42–45 consistently require successful local fake billing.
Pseudocode.md:179–190 supplies independent durable provider state, operator-only
simulation, immutable price/attribution, canonical-state fetch and idempotent
grant. tests/security-scenarios.md:335–363 requires exactly one TEST entitlement
and attributed conversion plus redirect, amount/currency/metadata mismatch,
duplicate and reordered-state negatives. test-scenarios.md:202–210 preserves
unavailable as negative only. No live charge is required or authorized.

Checks and evidence limits:

- Observed HEAD and all five handoff SHA256 values match; serialized launch SHA256
  is 3dbc74898d4cffe6c541b17207651501abab647c5435211ee58d9ac993b897f7.
- Three current HTML hashes match cjm-copy-browser/checks.json:5–17 under this
  run's evidence directory. Existing static and six Chromium copy checks at
  :19–64 are inherited evidence, not rerun results. cjm-copy-sol-receipt.md:18–32
  binds the source snapshot and states browser/backend limitations. Six screenshot
  files exist; no fresh visual inspection or browser execution is claimed.
- Direct semantic reading and focused crash/commit search performed; unchanged
  structural suites were not rerun. Their historical success is recorded at
  correction-handoff.md:16–21. The 54-ID equality is not semantic closure proof.
- check-look-trace exit2 remains the named source-journey limitation from
  revalidation-handoff.md:36–37; it is not promoted to a pass.
- E2E preflight: not_applicable, documentation-only revalidation with no backend.
  No backend, DB concurrency, SMTP, payment, browser or full-suite run occurred.
  Implementation and runtime acceptance remain future work under Completion.md.

This review is complete; acceptance of all six original corrections is not.
The only retained original finding is the narrow V03 scenario gap above. The
original report and historical null native-usage fields remain untouched.
Timing, output digest and terminal status are in
telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/revalidation-astra-receipt.md.
