Independent obligations derived before reading the implementation:

- FR-n6b-5/6, SC-US-005-1/2/3 and SC-US-006-1/2 require database-owned citations, deterministic refusals, persisted reasons, and one first-cited-answer event per bot.
- “Answer question” and ADR-003/004/010 require validation before reservation, the existing paid gateway, same-bot top-five retrieval, configured threshold filtering before generation, nonempty citations restricted to eligible hits, and removal of model-generated URLs.
- Refinement requires safe failures, no retries or connections held during provider calls, concurrent first-answer correctness, and transactional rollback. Live calibration remains a separate release gate.

**Finding F07-R1 — P2: model-generated addresses survive URL removal.**  
In [citations.ts:42](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-rag-answer-sandbox/projects/06b-rag-class/packages/rag/src/citations.ts:42), the first expression requires a scheme or `www.`, while the second recognizes only eight domain suffixes. Consequently, `//offers.example.shop/pay` and `offers.example.shop/pay` survive unchanged. With an otherwise valid citation, `answer.ts:62–63` accepts that text as `answered`, and `sandbox.tsx:44` displays it.

This violates ADR-003, Pseudocode step 11, and ANS-02’s requirement to remove model-generated URLs. React escaping prevents HTML execution but does not remove the invented address. The existing sanitizer test covers selected schemes and `.com`, so it misses this case. Correct the filtering and add fixed assertions for protocol-relative and bare addresses outside the current suffix list. This finding follows directly from source inspection; no probe was executed.

No other actionable findings emerged from the bounded review:

- Origin, session, UUID, bounded-body and question validation, and tenant ownership precede the gateway; body fields cannot select account/channel.
- Runtime passes `MIN_SIMILARITY` into retrieval filtering. Generation uses the existing attempt object; no new paid-provider bypass was found.
- Citation membership uses above-threshold hits. Database resolution checks bot/account provenance and supplies page URLs or PDF filename/page labels.
- Terminal logging has one call site. Log, conditional bot marker, and growth event share one transaction; persistence failure propagates without a second log. Provider awaits occur outside database transactions.
- UI source includes pending, error and recovery states, escaped text, database citations, and explicitly disabled future-publication CTAs. Browser behavior remains unverified.

Evidence and limits: independently recomputed **21/21 matching file hashes**, confirmed HEAD equals the supplied source revision, and verified the caller’s launch digest. The author manifest names an earlier revision; its file hashes match the reviewed source, establishing file-level continuity. Saved evidence reports successful typechecking and 155 distinct focused units, not a full-suite pass. The citation mutation is meaningful: disabling membership checking makes the unchanged assertion receive `null` instead of `invalid_citation`; restoration passes and restores the exact hash.

Authored PostgreSQL tests substantively assert ownership, provenance, charged failures, ten concurrent first answers, independent bots, connection release, and rollback/recovery. They remain unexecuted in this review. PostgreSQL/full-suite/build/UI gates remain pending separately. No edits, tests, simulations, network calls, or delegation were performed.

Verdict: REQUEST_CHANGES

Review completion is separate from feature acceptance. Fix F07-R1 and close the coordinator-owned gates before accepting F07.

Profile: compact-quality-first-v2  
Requested-Model: gpt-6-astra  
Requested-Effort: medium  
Actual-Model: unknown; native execution metadata unavailable  
Usage: null  
Cost: null  
Elapsed: approximately 178 seconds from recorded launch  
Telemetry-Path: projects/06b-rag-class/docs/telemetry/p-replicator/20261002T202425Z-rag-answer-sandbox/

Run-ID: 20261002T202425Z-rag-answer-sandbox  
Work-Unit-ID: rag-answer-sandbox-independent-review  
Attempt-ID: review-1  
Source-Revision: 8f088d8fbba3cf674cd62e7029d60d438df29c19  
Build-Revision: null  
Launch-SHA256: 2f20949e5f862f3711e3008d5f106f769afdcba92eac67f0b91bd40d75b8046b  
Finished-At: 2026-10-02T20:56:55Z

Status: completed