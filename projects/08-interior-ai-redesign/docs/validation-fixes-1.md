# Independent validation1 — bounded corrections

Parent-authorized document-only correction attempt; no owner scope expansion. Original source07d47977 and immutable NEEDS_WORK receipt retained. These are candidate resolutions pending fresh independent review, not self-approved closure.

| Finding | Concrete correction | Scenario coverage |
|---|---|---|
|1 HIGH refund hold | Monotonic review/hold; provider refund→payment→intent/account verification; account serialization covers reserve/start/retry and final cached/public/private export authorization; no automatic unhold/money reversal | PAY-04/05, BADGE-01, JOB-02/04 |
|2 HIGH attempt capacity | Admission reserves first nonrefundable capacity ticket atomically with job/credit; retry/UTC start ticket; exhausted post-admission job fails/release-once;60s queue/180s attempt/360s absolute job deadlines independent of heartbeats | JOB-01–05, PERF-01/02 |
|3 HIGH coarse AC mapping |41 stable individually named ACs, existing growth scenarios retained; explicit parameter matrices require every named mismatch/edge rather than a representative; return-URL/fence scenarios now mapped | every AC row in Criterion scenarios |
|4 MEDIUM quality evidence | Immutable generation_evidence and append-only quality_review bind output/model/config/input/depth/seed/timing/source/hardware and reviewer/time/corpus; privileged CLI only, fixture/missing/changed bytes denied | GEOM-01–03, PUBLIC-01/03 |
|5 MEDIUM conversion/consent | First committed verified payment claims account first-paid marker, no partner means no later backfill; refunded first never promotes second; explicit unchecked30d tracking-cookie consent with independent manual code | ATTR-01–03, PARTNER-02 |
|6 LOW gate summary | Current look-origin0 linked to historical1; no-widget declaration explicitly added; remaining2 values preserved as unavailable/not-applicable | validation-report.md and docs-fix-1-gates.json |

## Decisions and tradeoffs
Conservative admitted tickets may consume quota without running inference; this intentionally prevents over-admission and keeps the ceiling an upper bound on compute. Counts do not claim every reserved ticket actually ran. Ticket consumption and credit refund are separate invariants.

Hold linearizes under the account lock. A request/attempt authorized before the hold may complete bounded work; no later authorization starts another inference or delivers badge-free cached bytes. Rejecting all public held-account media is permitted. All queued held jobs release their reservations. No operator unhold is included in MVP; financial resolution remains separate.

Any otherwise valid accepted public fixture for HTML-only tests must be explicitly a backend test seam unavailable in production; it cannot be used as a real quality receipt. The source design does not allow fixture publication or automatic quality approval.

## Check boundary
Only related documentary gates ran. Source/gate identity consistency is mechanical, not semantic approval. No product code, deployment, live payment, model weight download, browser run or external spend was performed in this correction unit.
