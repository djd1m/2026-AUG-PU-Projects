# N8 architecture — bounded correction closure

Architecture closure verdict: READY for implementation of original ARCH-01–07; all seven contract findings closed. This is not an implementation acceptance verdict.

## Receipt

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`.
- WORK_UNIT_ID: `validator-architecture-2`.
- TRACE_PATH: `/tmp/n8-validator-architecture-20261013/projects/08-interior-ai-redesign/docs/validation/validator-architecture-fix.md`.
- Repository `/home/2026-AUG-PU-Projects`; project `projects/08-interior-ai-redesign`.
- Launch: `2026-10-13T21:45:26.415Z`, coordinator `validation/receipts-fix-wave2.json`; first observed execution UTC `2026-10-13T21:45:44Z`.
- Scope strictly original ARCH-01–07. No new broad review, research, implementation, external provider call, container start or public deployment.
- Profile `compact-quality-first-v2`; requested/inherited model `gpt-6-astra`, effort `high`; actual model/effort `null` because child-visible execution metadata does not identify them. No fallback asserted. Usage/cost `null`, no host counters.
- Prior finding receipt: `validator-architecture.md` in this same isolated directory. This correction record preserves that historical review.
- E2E preflight `not_applicable`: plan review; runtime checks remain implementation obligations, not failed tests.

## Frozen input identity

All five initial hashes matched `validation/fix-source-manifest.json` during this review. That manifest's SHA-256 at initial check was `1f599c392e73c42317583a030d5f1a63459c8ff85c496417324497277f7df86f`.

| Source | Initial reviewed SHA-256 |
|---|---|
| Specification.md | `a33255dc6f9dd1058108cf26968db630ba7584ffe9948349465bb78851aea8b3` |
| Pseudocode.md | `ea7bf1aaab679e2842e3d50c6675c7ca66de73672fe5b64bb2687473e6efd843` |
| Architecture.md | `5bfc8c2debc9f0ba67a028d3d348a3b4e63483943eed2fe38b0c1b21845345ee` |
| Refinement.md | `c6e9813f10856e51df77e4959812ec09faaa7fe4df22676a2608beb8d640929d` |
| ADR.md | `4c6423846d8600bd1cf47591a5883da18e8d29042be916aaaf62fad40e91f6bc` |

## Closure of original findings

### ARCH-01 — CLOSED at contract level — rate ordering and single ownership of upload body

Rate-order defect is corrected by `Pseudocode.md`, GuardRequest step 1/3: atomic rate gate before body read, cookie authentication without body parsing, all attempts counted, body deadline outside DB transaction. Specification SC-US-016-2 names the 59+20 concurrency boundary and invalid attempts; SC-US-020-1 names malformed/oversized/slow body and no DB connection held on read. Architecture amendments retain the exact peer boundary.

One remaining clause was reported and corrected during this bounded review. Final GuardRequest is always pre-body-only and returns ActorContext without consuming body; JSON routes own their bounded 256 KiB/10-second read and schema validation, and StorePrivateAsset explicitly owns the only upload stream read. Both exact paragraphs were reread at 2026-10-13T21:47:27Z. No mode knob or additional engine was added. Rate ordering and multipart body ownership are both closed. Runtime cases remain required: invalid attempts count, slow reads hold no DB connection, multipart body is consumed once, concurrent gate and unrelated-read responsiveness.

### ARCH-02 — CLOSED at contract level — bcrypt byte bound

Specification FR-foundation-1 now permits 12–72 characters with an independent maximum 72 UTF-8 bytes and identical explicit registration/login validation. SC-US-001-3 covers 72/73 bytes, multibyte input and suffix equivalence. Authenticate step 1 rejects above 72 bytes before bcrypt. Refinement correction checks and ADR-001/009 amendment record the boundary. The previous truncation conflict is removed.

Implementation evidence still required: ASCII and multibyte boundaries, accepted-password comparison, donor compatibility. No runtime result claimed.

### ARCH-03 — CLOSED at contract level — dispatch linearization and immutable input

Job data now contains `requestBody`, `consentHash`, `originProjectVersion`, `originDesignId`, `expiresAt`. SubmitAndRunProposal step 2 stores exact snapshot; step 3 atomically rechecks fence/state/current shell/active account/project/billingHold/expiry under stable mutex→Account→Project→budgets→Job before marking dispatch. It explicitly sends saved bytes and defines the mark commit as authorization linearization. Step 4 suppresses archived application and appends a detached draft for newer same-shell work. Specification validation amendments explicitly block admitted-but-undispatched jobs on refund. SC-US-008-6 and Refinement correction checks name the relevant races and consent immutability.

Implementation evidence still required: barrier-controlled archive/refund before and after mark; later manual work; snapshot bytes; stale fence; same-key replay after eligibility change. The wording that existing-key lookup precedes mutable eligibility is explicit, so the old admission precheck sentence must not be implemented as an earlier rejection.

### ARCH-04 — CLOSED at contract level — partial refund verification

ApplyVerifiedPayment step 1 now separates payment and refund lookup: verified refund ID/status/RUB/positive bounded amount, verified `refund.payment_id`, and original payment/order identity checks. Partial refund is explicitly not required to equal the original full amount. Step 3 records hold, revokes unwatermarked share/derivative access and blocks undispatched jobs. Existing provider-before-ledger and account/order locks remain. Specification amendments and ADR-007/008 repeat this decision; Refinement names partial/foreign-payment refund cases.

Implementation evidence still required: partial refund, foreign payment linkage, provider timeout then replay, duplicate and out-of-order refund. No refund creation or paid provider test required for local acceptance.

### ARCH-05 — CLOSED at contract level — export provenance and privacy limits

ExportAndShare step 1 rejects ordinary `share_image` uploads and persists immutable server-owned design/hash, normalized key/hash and watermark/schema provenance. Step 2 verifies it against the same design, excludes reference/photo/GLB, and rechecks current entitlement under Account→Project locks. Specification and Architecture amendments narrow the pixel guarantee and require owner preview/rights for sensitive content inside uploaded pixels. Refund revokes existing unwatermarked links and derivative access; downloaded copies are explicitly irretrievable. This resolves both provenance and frozen-snapshot/entitlement ambiguity.

Implementation evidence still required: forged kind/provenance, own raw asset ID, wrong-design export, free watermark, entitlement/refund versus publication, direct derivative access after refund, revocation/TTL. No automatic OCR/redaction engine is required.

### ARCH-06 — CLOSED at contract level — aggregate asset limits

Specification validation amendments and Architecture concrete amendments supply one parser slot/busy refusal; 10-second body and decode deadlines; 512 MiB process/container memory boundary including native memory; explicit GLB allowlist; 8 million accessor components, 750k vertices, 250k triangles, 1000 nodes and 20 MP aggregate embedded decoded images. Retained assets are capped at 64/project, 200 MiB/project, 1 GiB/account including reservations; normalized output 20 MiB; low-disk threshold 512 MiB. Asset pending rows and storedBytes reserve 30 MiB image/export or 25 MiB GLB under Account→Project before streaming, with release/15-minute stale cleanup. The prior unbounded aggregate contract is now concrete.

Implementation evidence still required: reservation/quota races, parser slot recovery, decoded resource bombs, actual native-memory/container bound, failed-upload release and unrelated-read responsiveness. These numbers are initial limits, not measured capacity; this closure does not certify their runtime implementation.

### ARCH-07 — CLOSED at contract level — physical relation and numeric mapping

Architecture concrete amendments distinguish scalar composite FKs (including current pointers) from bounded JSON/array same-project validation in owning transactions. They require append-only catalog entries, immutable ProductSnapshot, Job project/account composite ownership, unique shopping element selection, SpendBudget null/scope consistency and explicit pg bigint/numeric decoding. Specification SC-US-019-1 names scalar/array/JSON cross-owner rejection; Refinement correction checks include embedded-relation isolation.

Implementation evidence still required: migration constraints and DB-role permissions, embedded cross-project IDs, immutable content guards, duplicate element, project/account mismatch and exact numeric read-back at maxima. Pure domain/public-subpath boundaries remain adequate and do not require another framework.

## Peer boundary closure

The original conditional recommendation has been incorporated into Architecture concrete amendment 1 and Specification amendments: custom Node entrypoint only, ordinary Next build, no standalone/next-start bypass, socket-derived overwrite, mapped-IPv6 normalization, missing peer refusal and no XFF/loopback provider trust. Built-server spoof/duplicate/missing-peer and actual local peer observations remain mandatory runtime evidence. This review makes no new external API/library claim and performs no new research.

## Required next work

Implement the amended contracts with the focused tests listed above and the existing final integration gates. A document closure cannot waive code review, migrations, mutations, concurrency tests or production-build ingress checks. No original source files were edited by this reviewer; only this isolated receipt was written.

## Final score and source receipt

Architecture score **92/100**: authorized-MVP fit 18/20; reusable boundaries 17/20; ownership/data contracts 19/20; security/resource boundaries 19/20; spend/payment lifecycle 19/20. Same judgement rubric as original 73/100, not a measured runtime score or story INVEST/SMART score. Original findings closed 7/7; remaining concrete blockers in this scope 0. No unrelated discoveries or optional polish added.

Final Pseudocode SHA-256: `ac6df814f53a52ab5be225cc9f2ff9e7728339f65b17abb9ee0d018ad39690d7`. Besides the ARCH-01 clarification, coordinator clarified StorePrivateAsset step 3 original/normalized-file readiness, actual retained-byte settlement and cleanup; that exact paragraph was reread and is consistent with ARCH-06 closure. Other four hashes remain exactly as initial table. All five final hashes match rebound source manifest. Final manifest SHA-256: `01a8f35e20a9d43952a39aa2aaf013801fef6cd2e4e74b3268ff19052fabc1ef`. These final hashes supersede the initial table for integration.

Ended UTC `2026-10-13T21:48:24.616957+00:00`; elapsed from coordinator launch `178202` ms. Active time `null` (complete wait intervals unavailable); actual model/effort/tokens/cost `null` for metadata limits above. No measured savings claim. Source read/semantic closure and hash checks passed; runtime tests not run, as appropriate to this stage.

Status: completed
