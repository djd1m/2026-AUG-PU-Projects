# N8 Phase 2 — architecture / consequential security validation

Architecture verdict: NEEDS WORK — targeted contract corrections before implementation; the review work itself completed.

## Receipt and source identity

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-architecture-1`
- TRACE_PATH: `/tmp/n8-validator-architecture-20261013/projects/08-interior-ai-redesign/docs/validation/validator-architecture.md`
- Repository: `/home/2026-AUG-PU-Projects`; selected project: `projects/08-interior-ai-redesign`.
- Baseline git revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`; reviewed documents are untracked, so file hashes below are authoritative.
- Coordinator launch timestamp: `2026-10-13T21:23:55.952Z`, from original `docs/validation/receipts-architecture.json`; first observed execution timestamp `2026-10-13T21:24:21Z`.
- Requested model/effort: `gpt-6-astra` / `high` per assignment. Actual model/effort: `null`; execution metadata is not exposed to this child. No asserted model switch or fallback. Tokens/cost: `null`, host counters unavailable.
- Profile: `compact-quality-first-v2`; stage VALIDATE; bounded independent consequential architecture lens. Substantive product risk XL (payments, spend, ownership); no implementation, container start, live payment, paid inference or publication performed. E2E readiness preflight: `not_applicable`, document review only.
- Root CLAUDE, model routing/telemetry, complexity router, relevant security/shared-resource rules, requirements-validator, project-work-companion and Phase 2 six-lens contract were read. Selected project CLAUDE does not exist.
- `dz recall` against canonical `--project /home/2026-AUG-PU-Projects` returned no matching patterns; no memory-write claim. An initial recall against the project directory also returned none and was corrected to the canonical root.

| Reviewed normative source | SHA-256 |
|---|---|
| Architecture.md | `765968d146d03c3524e999e8a1771272e310773b99c4e6bb21ff9916a26e5f99` |
| Pseudocode.md | `1f53f758a978135b9ee29806c1544b5af1793dbaa22bbff4c3f43bbccb844ad7` |
| Specification.md | `fcfefeb2285784120c5614162f394d47ae895d6022eeca7371d8ed24f3a20fa1` |
| ADR.md | `ef72f365b4004ed8856687a4d1153967a8a3e52de5a3838bae47e66cca3a3bbc` |
| Refinement.md | `117df54fc7fa7bfda66ce576c756dfe0d23556097034ed0b801046c5ccf39c67` |

After coordinator notification, also read `webhook-contract.md`, `long-job-contract.md`, `model-cost-contract.md`. These accurately distinguish planned checks from runtime evidence. The webhook contract already requires a single custom ingress and acknowledges that its refund distinction awaits this review. The job contract adds a proposed 120-second deadline. Their addition does not resolve the normative algorithm gaps below.

## Scope, score and sound decisions

This is the `validator-architecture` lens: target constraints, completeness, implementability and safety across boundaries. It does not repeat INVEST/SMART scoring owned by the two earlier lenses, nor score nonexistent runtime tests as failures. Architecture score is an explicit reviewer judgement, not a benchmark or the requirements-validator weighted story formula.

| Architecture dimension | Score | Evidence / deduction |
|---|---:|---|
| Fit to authorized local MVP | 18/20 | Manual useful flow; off-by-default paid adapters; isolated web/worker/Postgres; paid/public actions excluded. |
| Reusable domain/public boundaries | 17/20 | Six explicit domain subpaths, concrete adapters, composition root; cross-domain transaction ownership needs specificity. |
| Ownership / immutable data contracts | 14/20 | Composite project FKs and CAS are strong; array/JSON relations and export provenance remain incomplete. |
| Security / resource boundaries | 11/20 | Private storage, fixed outbound endpoints, redaction, strict Origin; guard ordering, bcrypt bounds and parser aggregate limits need correction. |
| Spend / payments / lifecycle | 13/20 | Durable reservation, no blind redispatch, payment verification before ledger; dispatch race and refund identity contracts incomplete. |
| **Total** | **73/100** | **High-severity contract gaps override the aggregate score: NEEDS WORK.** |

Sound decisions to retain: same-project composite references plus actor predicates; immutable shell and design content; decimal quantities and integer money; outstanding reservations across UTC midnight; once-only dispatch marker; no external call while holding a DB transaction; provider verification before event insertion; revocation-aware image routes; no automatic catalogue or physical-accuracy claim. Package subpaths are sufficient reuse architecture; no extra framework is needed.

## Findings and minimal corrections

### ARCH-01 — HIGH — Rate counting follows body validation

Evidence: `Pseudocode.md:176` GuardRequest step 1 validates body/schema, while `:178` counts RateBucket only at step 3. StorePrivateAsset `:63` calls GuardRequest before body, so the generic guard also contradicts the streaming upload order. `.claude/rules/security-operation-order.md` explicitly requires rate limit before validation.

Consequence: malformed bodies can return before counting, and a generic body-parsing guard can consume multipart content before the bounded uploader. This is a plan contradiction, not an observed runtime bypass.

Correction: split transport/header/peer gate from body parsing. Apply an atomic short IP gate for auth/public routes before body parsing; authenticate from cookie then apply account mutation gate before domain/schema/decode work. Keep body streaming and hashing outside DB transactions. Business quota admission remains after input validation. Count invalid attempts, return bounded typed failures, and specify request-body read timeout plus finite pool acquisition timeout.

Required implementation cases: malformed JSON attempts reach 429; slow body does not hold DB connection; upload is read once with actual-byte bound; concurrent same-subject requests cannot exceed expensive-work admission limit; ordinary parallel reads remain responsive. Existing SC-US-016-2 is relevant but does not currently name the ordering assertion.

### ARCH-02 — HIGH — bcrypt password contract permits silent truncation

Evidence: `Specification.md:22` permits 12–128 characters with bcrypt; Authenticate has no byte-bound/prehash policy. Upstream bcrypt documents that only the first 72 UTF-8 bytes participate in matching, including for multibyte passwords. [bcrypt upstream security note](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns).

Consequence: two accepted passwords differing only after byte 72 authenticate identically. This contradicts SC-US-001-2's wrong-password refusal for part of the accepted input domain.

Minimal correction: retain the donor bcrypt path and explicitly reject passwords above 72 UTF-8 bytes, with consistent registration/login/UI validation and no silent truncation. Update the 128-character statement accordingly. If retaining 128 characters is necessary, deliberately select and document a versioned safe hashing policy; do not improvise an undocumented prehash.

Required cases: ASCII 72/73-byte boundary; multibyte string below 72 characters but over 72 bytes; differing suffix after byte 72 never becomes an accepted equivalent password; donor hash compatibility.

### ARCH-03 — HIGH — Dispatch authorization and job snapshot are insufficiently specified

Evidence: SubmitAndRunProposal `Pseudocode.md:104` closes the claim transaction, checks eligibility, then separately marks dispatched using only fence. ProjectCommand `:47` says archive prevents future dispatch and suppresses completion; completion `:105` checks fence/state/current shell but does not explicitly recheck active project/account. `Job` at `:16` promises exact snapshot input in algorithm `:103`, yet has no canonical outbound request snapshot, consent digest, or originating project/design version. Re-reading mutable reference text/catalog at worker time could change the consented request.

Concrete interleaving: worker checks active project; archive commits; worker marks dispatch; external call occurs for a now-archived project. Another interleaving returns a valid response after archive without changing the shell; the written completion condition still passes. A shell-only check also does not define whether a same-shell newer manual design can be displaced.

Correction: make `markDispatched` the linearization point under the shared lock order, atomically checking fence, no prior dispatch, account/project eligibility, deadline and current job input binding. Define that jobs committed as dispatched before archive are already in flight even if the network syscall follows; no DB lock may span HTTP. Completion rechecks archive/active status and either applies via originating version CAS or appends a detached draft without replacing newer user work. Store the bounded immutable exact provider request plus consent/input digest and origin version, and send those bytes only. Decide and document whether a refund blocks only new admissions or also admitted-but-undispatched jobs.

Required cases: held-lock/barrier archive before mark prevents dispatch; archive after mark allows only in-flight reconciliation and suppresses application; newer same-shell design is not overwritten; reference/catalog edits after consent do not change outbound body; old fence cannot settle twice. These are implementation preconditions; the existing two-worker test plan alone is not proof of these races.

### ARCH-04 — HIGH — Refund verification needs a distinct remote object contract

Evidence: ApplyVerifiedPayment `Pseudocode.md:150` uses one verification list including paid/shop/orderId/amount/remoteId, then `:152` applies any verified refund. FR-billing-2 explicitly includes partial refunds. The current entity and algorithm do not say how refund ID is linked to payment ID or which amount is compared. The later webhook plan repeats this list and explicitly leaves this distinction unresolved.

Correction: discriminate payment and refund event types before fixed-endpoint lookup. For payment, fetch the payment and compare its full immutable intent/merchant/test/currency/amount/metadata. For refund, fetch the refund by its own ID, verify succeeded/currency and positive refund amount bounded by the original payment, obtain its `payment_id`, fetch/validate that payment against the order, then apply the hold. Do not require refund amount to equal original order amount or assume the refund object contains all payment metadata. Dedupe by provider + event kind + verified refund ID. The supplier documents full and partial refunds and their payment linkage. [ЮKassa refunds](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds).

Required cases: partial refund accepted and holds entitlement; foreign-payment refund rejected; refund API timeout leaves event key free; duplicate refund and refund-before-success retain once-only, monotonic hold. No refund creation API or real payment is required for this fix; offline adapter fixtures suffice.

### ARCH-05 — HIGH — Share creation does not bind the asset to a verified export

Evidence: API `Pseudocode.md:230` accepts `{designId,assetId,...}`; Asset `:12` has client-declared kind including `share_image`, while ShareLink `:23` links an asset without export provenance. ExportAndShare `:159–161` promises redacted watermarked derivatives but does not explicitly forbid raw uploads or another design's exported asset from being attached. Project ownership alone does not establish that image went through entitlement/watermark processing.

Correction: exclude `share_image` from ordinary upload input; only export service creates this kind. Persist immutable server-owned export provenance (same-project design ID/hash, normalized image key/hash, watermark decision and schema version). Share creation requires that provenance, matching design, ready image kind, owner preview/rights, and active project in its transaction. Serve only the normalized derived key. Define the effect of refund on already-created unwatermarked snapshots versus new export creation; frozen historical links and entitlement revocation must not silently disagree.

Privacy limit: reencoding strips metadata, not sensitive text already baked into user-supplied pixels. Since client canvas upload is explicitly permitted, narrow the guarantee to application-generated content/DTO/metadata exclusion and owner-reviewed pixels, or render only a controlled server scene. Do not claim arbitrary uploaded pixels are automatically redacted. No OCR engine is needed for the minimal correction.

Required cases: own raw room photo/reference/GLB cannot become share image by choosing an ID/kind; export for design A cannot be published as design B; free export path always adds watermark; public image contains no storage IDs/private JSON/metadata; revoke and archive still deny subsequent image GET.

### ARCH-06 — MEDIUM — Aggregate parser/storage bounds are not yet a contract

Evidence: FR-space-2 caps individual file size/triangles/nodes and parsing deadline; Architecture `:94` permits worker process or worker thread. Neither document fixes decoded texture/vertex/accessor aggregate size, parser concurrency, retained asset bytes/count, or filesystem free-space refusal. NFR-performance-1 caps references but not all uploaded assets or derived exports.

Consequence: a per-file cap/deadline does not establish aggregate memory or retained-disk bounds. Unlimited unreferenced ready uploads can remain reachable and avoid orphan cleanup. This is an incomplete resource plan; no resource exhaustion was reproduced.

Minimal correction: explicit small GLB feature/extension allowlist, decoded resource/count caps before expensive allocation, one bounded parser slot or queue limit, process/container memory ceiling, per-account/project retained byte quota reserved before upload and settled/released transactionally, and low-disk refusal. Choose concrete initial values once in the implementation contract, with tests; no general scheduler is needed.

Required cases: embedded huge texture and oversized declared accessor are rejected without process-wide failure; simultaneous uploads respect slot/byte quota; failed upload releases reservation; unrelated authenticated read remains available.

### ARCH-07 — MEDIUM — Physical ownership/immutability mapping overstates generic FK coverage

Evidence: Architecture Data Architecture claims one-to-one table mapping and composite FK protection for all relations. `DesignRevision.referenceIds[]`, `Job.referenceIds[]`, `Project.sceneCatalog[*].snapshotId` and `SceneProposal` references are array/JSON relations, for which that generic FK description supplies no physical enforcement. ProductSnapshot/ObjectDefinition immutability appears in algorithms but only Shell/Design/Budget receive explicit DB immutable-content protection. Job duplicates `accountId` and `projectId` without a named account-project consistency constraint.

Correction: add a short mapping table distinguishing scalar composite FKs, transactional same-project validation of bounded embedded references (or explicit join tables), and append-only content protections. Require `Job.accountId` to match its project's owner by composite constraint or same-transaction invariant. Add unique `(project_id,design_id,element_id)` shopping selection so duplicate lines cannot double-count an element. Clarify `SpendBudget` CHECK: global implies null account, account scope implies nonnull account. Specify `pg` bigint/numeric decoding into bounded safe integers/canonical decimal strings at the DB adapter boundary.

Required cases: cross-project IDs inside arrays/JSON rejected; duplicate element line rejected; old catalog dimensions and ProductSnapshot fields cannot mutate; read-back money remains exactly equal at documented maxima; account/project mismatch cannot create a Job. This is a migration-design precondition, not a claim that nonexistent migrations are faulty.

## Proposed Next peer-IP boundary

Conditional architectural acceptance: a custom Node HTTP ingress that unconditionally replaces a reserved lowercase internal header from `req.socket.remoteAddress` before passing the same request into Next is a reasonable local boundary. Node exposes the socket peer separately from user headers; the address can be absent on a destroyed socket. Header names are lowercased and duplicate-header handling is distinct from raw headers. [Node socket.remoteAddress](https://nodejs.org/api/net.html#socketremoteaddress), [Node HTTP message.headers](https://nodejs.org/api/http.html#messageheaders).

Required details, small enough for the existing ingress adapter:

1. One production/dev/test server entrypoint for HTTP API routes; the container and scripts start that custom server. Ordinary `next start` or a separate standalone generated server cannot be an alternate ingress. Current official Next guidance explicitly says standalone output does not trace the custom server and the two servers cannot be combined. Use a normal production Next build with the custom entrypoint and pin/test the chosen version. [Next custom server guidance](https://nextjs.org/docs/app/guides/custom-server).
2. Replace, never append, the reserved header on every request before any routing/auth. No fallback to `X-Forwarded-For`, `Forwarded`, `X-Real-IP` or a client-supplied internal header when socket peer is missing. Remove/ignore untrusted raw-header duplicates wherever a consumer might use a different representation; verify Next's actual production request adaptation with a raw duplicate-header request.
3. Normalize IPv4, IPv6 and IPv4-mapped IPv6 through the established tested IP parser. Missing/malformed/unsupported peer fails closed for trust-sensitive routes. Provider allowlist remains separate: loopback, container gateway and internal network are not ЮKassa provider identities.
4. Publishing host port on loopback limits remote reachability but is not authentication or proof of original client IP. Docker/proxy topology can expose a gateway as peer; record the observed peer in an isolated runtime test. The local build may share one IP bucket and correctly reject all real provider callbacks. Do not restore provider trust with XFF merely to make a local webhook test pass.
5. Local provider simulation remains explicit constructor injection under NODE_ENV=test; production ingress/peer trust is not weakened for fixtures. Any future TLS proxy/public release needs its own authenticated/trusted-hop design and authorization.

Required production-build boundary cases: forged internal header overwritten; mixed-case/duplicate header values do not survive; forged XFF cannot change limiter subject or provider acceptance; absent peer refuses; mapped IPv6 normalizes; no alternate listener/start command bypasses ingress. These checks are pending implementation, not failed runtime checks.

## Criterion scenarios relevant to this lens

These are existing exact acceptance excerpts plus the named architecture checks proposed above. The full story-wise criterion table belongs to validator-stories/validator-acceptance, not this independent architectural score.

| Source criterion | Existing acceptance excerpt | Named proposed check |
|---|---|---|
| SC-US-001-2 | «неверный пароль/истёкшая или отозванная сессия … общий 401, приватные данные отсутствуют» | Password bytes cannot be silently truncated; session remains private |
| SC-US-004-2 | «oversized/повреждённый/remote-URI GLB либо изображение-bomb … нет опубликованного asset и сетевых запросов» | Bounded decode and aggregate upload refusal |
| SC-US-007-2 | «один commit, второй 409 VERSION_CONFLICT без потери данных» | Same-shell manual edit wins over stale job application |
| SC-US-008-3 | «один dispatch, caps атомарны; неизвестный исход сохраняет reservation» | Archive-versus-dispatch linearization and immutable consent body |
| SC-US-013-3 | «refund.succeeded … новые live jobs запрещены и export entitlement отозван» | Partial refund linked through verified payment and monotonic hold |
| SC-US-014-1 | «watermark соответствует entitlement, исходные приватные данные не включены» | Only provenanced normalized export assets can become shares |
| SC-US-016-2 | «429 с Retry-After, logs без credentials/планов/полных payload» | Malformed request consumes atomic rate allowance before parsing |

## Handoff / limits

Five HIGH contract findings and two MEDIUM implementation-contract gaps. Fix with short amendments to Specification/Pseudocode/Architecture/ADR/Refinement, then recheck these exact findings once; do not restart research or add generic engines. Known surface contracts and benchmark protocol gaps from other lenses are intentionally not duplicated here. Actual code suites, runtime ingress, schema enforcement, performance and live integrations remain unexecuted because this stage reviews a plan. Paid API and public deployment stay excluded.

The package is feasible after these corrections. This report does not certify implementation or provider billing. No original source was edited; only this isolated receipt was written. Coordinator owns aggregation, telemetry events and final source integration.

## Terminal evidence

Final source check found one formatting-only change in Architecture.md: evidence-table header removed stray `Checked`; current SHA-256 `84535d8d3e854041f9a76accea581a56cb4b13841dcc2ef5010e9f01687ffbf3`. Restoring exactly that header in memory reproduced the reviewed SHA-256 above, proving there were no other byte changes. The other four normative source hashes remain unchanged. Findings remain applicable.

- Supplemental `webhook-contract.md` SHA-256: `ee73fb64ee135e7ecdfdbbac355cc440e243e914193cf69240d7f8c0c4cbed3f`.
- Supplemental `long-job-contract.md` SHA-256: `d688b8d42cb163f38c6334b531026a70f1925c7ddb6ff4b7a3b6b2b55f53c522`.
- Supplemental `model-cost-contract.md` SHA-256: `68f54ba11877cd4ef5915a4c73672e10135189527b54ec02c16b0a0d6a087545`.

Ended UTC: `2026-10-13T21:29:03.704317+00:00`. Elapsed from coordinator launch: `307752` ms; active time `null` (complete exclusion intervals unavailable). Usage/cost `null`; no measured savings claim. Receipt checks: regular file, isolated path, source drift explained and checked, terminal marker appended last.

Status: completed
