# I4b independent review

Reviewer family: codex
Requested reviewer: gpt-6-astra / high; sole executor, no delegation.
Actual model / effort / usage / cost: null, pending host capture for this review attempt.
Profile: compact-quality-first-v2; accepted substantive XL, author mechanical lower bound M retained.
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i4b-review
Attempt-ID: replicate-i4b-review-1
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Source exact SHA: 86db7ea8c8ef88e239f6559677effc66e61668c2
Implementation revision: deaeac071403c39b826b4c050d2bd2ffd9415f22
Baseline revision: 4ebca31b55235076a5812894148135b6c4bd699e
Review launch SHA256: c868fb1ad1b3c660f8890595dfa43954307cf87d41cc2131001b801be5122e2a

Verdict: **REQUEST_CHANGES — NEEDS_WORK**. One confirmed medium/P2 defect blocks I4b acceptance. Review delivery is completed; implementation acceptance is not.

## Finding I4b-R1 — medium / P2: reference lookup cannot resolve completion on PostgreSQL

Location: [web/replicate-generation.js](../../../web/replicate-generation.js), lines 32–35; consequence at lines 119–125. Reproduction: [tests/replicate-generation.integration.test.js](../../../tests/replicate-generation.integration.test.js), lines 154–159, both false and throw children.

The same SQL parameter $3 is first compared to job.output_key and then to canonical_evidence->>'output_key' / ->>'artifact_key'. The actual schema declares job.output_key **uuid** (db/002-generation.sql:18) and canonical_evidence **jsonb** (db/003-quality.sql:1). JSONB ->> returns **text**. The first comparison resolves $3 as uuid; the later comparisons require text = uuid, for which PostgreSQL has no implicit equality operator. This is a SQL type defect independent of whether any evidence rows exist; an EXISTS/OR condition does not avoid query type analysis.

The catch at line 40 hides the query error and returns null. Consequently every false/throw completion response takes line 121, replicate_completion_uncertain, even when actual jobs.complete has committed a successful output and immutable evidence. The real-PG test first asserts actual complete returned true, then simulates its lost/false response. Both cases reject instead of returning false after resolving the winner. The recorded stack reaches the worker at line 128 and test line 159. Raw SQLSTATE was swallowed and is absent from the log: the precise type diagnosis is from the query and committed schema, not a claim of a new SQL execution or captured server diagnostic.

Impact: the required winner-resolution branch is inoperative on real PostgreSQL; known-unreferenced cleanup/fenced-fail is likewise unreachable through this query. Existing preservation logic still releases descriptors in finally and avoids fail after completionAttempted, so this finding does **not** assert winner deletion or a second charge. Preservation alone does not satisfy the required DB recovery behavior. The false/throw tests stop at the rejected await, so their later assertCompletion checks did not run; the separate unavailable-lookup case did execute and verify winner files.

Minimal fix: keep the UUID comparison and explicitly convert the UUID parameter to text in **both** JSON comparisons. For example:

~~~sql
EXISTS(SELECT 1 FROM job WHERE output_key=$3::uuid) OR
EXISTS(SELECT 1 FROM generation_evidence
  WHERE canonical_evidence->>'output_key'=($3::uuid)::text
     OR canonical_evidence->>'artifact_key'=($3::uuid)::text) AS referenced
~~~

Do not remove evidence/global references, treat query errors as unreferenced, change the false-return oracle, or bypass actual jobs.complete. No protected schema/I1/I2/I3/I5 code change is needed.

Affected check and closure proof: parent must rerun the real Node22/PG16 worker integration suite on the corrected frozen source, retaining both existing false/throw cases unchanged. Both must return false, never call fail, and reach assertCompletion, including all three private-file hashes, one immutable evidence record and unchanged ticket/capacity/spend accounting. Retain the unavailable-reference case: it must still reject uncertain and preserve files. Also exercise a real-DB definitely-unreferenced false completion to prove the query returns booleans and guarded cleanup plus one fenced customer release occurs; retain global/evidence-only reference protection through actual completion-generated evidence, without direct evidence insertion or disabled triggers. Run the affected worker/config units and static check after correction. Record correction hashes and independent closure; the original failing log and overall_exit=1 remain history.

## Source and scope verification

Read i4b-slice-boundaries.md and i4b-implementation.md first, then applied root/project rules and companion handoff contracts. Reviewed only the eight owned product/test files, their bounded baseline-to-implementation diff, relevant accepted F07 worker contracts and protected collaborator interfaces. No historical quality/corpus resurvey.

All eight current SHA256 values match replicate-i4b-snapshot.json and git deaeac07 bytes:

| File | SHA256 |
| --- | --- |
| web/replicate-generation.js | 52a42dbfc5091735659f57574f86d72fad171fb6057ccbf930f676e749e4f89f |
| web/replicate-worker-config.js | 209846a9ac796abf142f452890e965dee71947468d3fa01d4eca92bd07d103d4 |
| scripts/worker.js | e03c8225e5194d0b9bb90beec07df4b44bd371a3f71e472cfd019e7585694bbf |
| web/provider-submissions.js | f3c0330adfa05a010ac07e731ac097cc9fe9f1d36aebe79195cab94ecae84590 |
| tests/replicate-generation.test.js | 9be9355860ffa0e4ffe656b239ae26b1b97032d66a282a83860cdcbb91a2711e |
| tests/replicate-generation.integration.test.js | 220f050a2797d20ca2689bd5cc51f374eb67906d3d9d23a6f094836ba0056ecc |
| tests/replicate-generation-fixtures.js | 7b60f56b257ee404fe107c3ba45b9b6256456e43edd2b1629f434c659e848d1b |
| tests/replicate-worker-config.test.js | 218aa6d5fb878536e5b8d9fcc54fffe94ecfce8ca6709a2fe0e812223ae769cb |

Snapshot SHA256: 09e5e9e146c5bb34fc97c3e56bb680db9d51e2e31b53ebda6b14e293813fea0e. Its author protected map contains 103 entries; this review does not claim a broad re-audit of all 103. Independently matched 15 critical files against both the map and baseline: web/jobs.js, replicate.js, replicate-media.js, replicate-evidence.js, replicate-quality.js, generation.js, config.js, media.js; db/002-generation.sql, 007-replicate.sql, 008-replicate-evidence.sql; scripts/maintenance.js; tests/generation.test.js, jobs.test.js, provider-submissions.test.js.

The provider-submissions diff changes only upload account_id projection, current nonsuperseded ticket timestamp lookup, and additive returned style/job_created_at/consumed_ticket fields. Existing workerLocked/finalAuthorize predicates and locks are unchanged. The deaeac07→86db7ea8 diff contains only PG evidence documents/logs. Launch and accepted spec hashes match the supplied independent values. Snapshot checks/implementation hashes and all 17 recorded log hashes match. Parent binding log reports Node v22.20.0, eight mounted files, matched=true; six inspected PG/binding/cleanup logs match pinned committed bytes.

## Other critical contracts reviewed

No other confirmed defect was found within this bounded scope:

- Configuration: explicit hosted dispatch, exact model/version/contract, five mandatory acceptance digests and spend UUID; bounded token is in a private WeakMap and nonenumerable transport property. Config/settings are frozen; only four fixed styles and accepted 512/512/30/7.5/0/1 settings with bounded seed are built. Ordinary web configuration remains unchanged. Hosted dispatch constructs no Python Engine; original fixture/controlnet paths and wider local seed support remain.
- Authority: real I1 authorize plus I2 literal committed CAS result and finalAuthorize control the only new-create path. Recovery reconstructs actual sanitized bytes, request/settings/seed and immutable binding before any GET, shares the original attempt/ticket/deadline, and never authorizes anew. No-ID submitting/ambiguous refuses replay. DB envelope matching/revocation/window/nonzero checks remain authoritative, with no reservation decrement.
- Trusted context: account→job→submission→envelope locking and post-envelope clock remain; upload owner, style, job creation and current original consumed ticket derive from DB. Refresh after authorize handles UTC ticket replacement. Existing submitted-ticket checks still enforce consumed/nonsuperseded identity. No image/network work occurs under these locks.
- Time and cancellation: one I2 budget is created from original DB remaining/deadline, conservatively subtracting initial context duration, and passed identically to I2/I3. Serialized 10s heartbeats abort on false/throw; external stop/deadline use the same abort signal. No fresh 180s recovery budget. Earlier failure uses existing fenced nonretryable jobs.fail; protected expiry/lifecycle handling remains.
- Artifacts/evidence: genuine I3 input preparation, opaque I2 observation and I3 import are used. Actual input/output/depth/config and geometry are verified before a new closed I5a output is constructed; original release/cleanup capability stays separate. Queue timestamps use DB values, local elapsed is monotonic, observed/submitting timestamp bounds are checked, vendor metrics and sources remain null. Actual jobs.complete remains atomic authority.
- Disposal: true completion releases; false/throw attempts a reference query before cleanup; unknown DB preserves and releases. The intended referenced/unreferenced split is blocked by R1. No evidence of weakened winner protection or protected predicates was found.

## Recorded checks and their limits

No tests, Docker, network/provider calls, credential reads, installs, other model/CLI tasks, commits, pushes, run-events or global configuration changes were performed by this reviewer. Commands in this report describe evidence or future proof; they were not executed here.

| Evidence | Recorded result | Interpretation |
| --- | --- | --- |
| replicate-i4b-pg-worker-pg16.log | 14 pass / 4 TAP fail; exit 1 | Two real false/throw failures plus their enclosing subtest and root; not four independent defects |
| replicate-i4b-pg-authority-pg16.log | 16 pass / 0 fail | Prior I1 actual PG passed on parent overlays |
| replicate-i4b-pg-lifecycle-pg16.log | 18 pass / 0 fail | Protected lifecycle actual PG passed |
| replicate-i4b-pg-evidence-pg16.log | 16 pass / 0 fail | Protected evidence actual PG passed |
| replicate-i4b-pg-summary.json | overall_exit=1; cleanup exit 0 | Original failed outcome retained; cleanup success is not worker success |
| replicate-i4b-worker-freeze.log | 24 pass / 0 fail | Final affected worker/config unit run |
| replicate-i4b-local-final.log | 41 pass / 0 fail | Earlier combined unit run, not a full final-source regression |
| replicate-i4b-build-freeze.log / checks.json | exit 0 | Recorded final static check |
| Frozen recovery mutation logs | baseline 0 / mutant 1 / restored 0 | Meaningful fixed zero-GET oracle, separate from I6 |

Real-PG tests use createProviderSubmissions, createJobs, migrated PG16 schema and actual private files. Only HTTP/download boundaries and specifically named completion-response/query failures are doubled. No direct evidence insertion or trigger disabling appears in the owned suite. Cases cover actual reclaim contenders, immutable ticket/deadline/spend, reconstruction mismatch before GET, no-ID no replay, hold before/after CAS, deletion, stale/lost heartbeat, missing/zero envelope and actual private evidence/bytes. Unit SQL stubs explain why the invalid reference query could pass local tests; they do not establish PostgreSQL query validity.

Frozen mutation production/restored hash is 52a42dbfc5091735659f57574f86d72fad171fb6057ccbf930f676e749e4f89f; unchanged oracle hash is 9be9355860ffa0e4ffe656b239ae26b1b97032d66a282a83860cdcbb91a2711e; recorded mutant hash is 27d85a6a950b173d95163b5878d49694faa8b8c515c158186fde078cad1aa58e. Both green logs pass all five mismatch children; the mutant fails all five at the unchanged zero-call assertion with actual 3. The disposable mutant bytes are not present for independent rehash, so its identity relies on recorded telemetry; production/oracle/restored binding matches current frozen files. Earlier mutation history is preserved separately.

The combined 41-unit run records worker hash 34f6ba94a345615ae916ee9d434499be63a4e81c8715d2f6d2d6f4972f710661, different from the final worker. Later affected 24-unit and frozen mutation evidence cover timing corrections; do not promote the earlier 41 to a final full regression. Historical per-check hash gaps remain disclosed in checks.json.

## Handoff

Review scope is delivered to the parent through this report and replicate-i4b-review-receipt.md. Companion E2E status: not_applicable — source/evidence review only; no browser or live-provider claim. Parent owns a bounded R1 correction, affected exact-source proof and independent closure. This reviewer made no product correction and started no continuation task.

I4c remote cleanup, I6 actual send-CAS mutation, I7 full regression, I8 actual shared-Docker browser and separately authorized real paid/quality pilot remain mandatory future gates, not I4b implementation findings. I4b cannot be accepted while its actual PG suite fails. No optional polish or old corpus audit is requested.

Measured review times, report digest and host measurement gaps are in the receipt. Author runtime metadata records gpt-6.1-sol/high for the author attempt; it does not establish this reviewer's actual model. Review actual model/effort/usage/cost remain null pending host. No numerical savings claim.
