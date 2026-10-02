Independent obligations derived before implementation review from FR-n6b-3, SC-US-003-1…3, Pseudocode, ADR-012, Architecture and Refinement:

- Bound multipart ingestion; enforce 10 MiB and signature checks; return 202/413/409/415 as specified, without partial records on rejection.
- Check ownership before reading uploads; atomically enforce the Free three-PDF cap and persist source/file/job under RLS.
- Extract locally, enforce ≤300 pages, preserve page/title/text/hash metadata, and persist the exact scan failure reason.
- Preserve lease fencing, cancellation, shared-lock protection, retry identity and embedding-cache reuse.
- Show upload acceptance, progress and errors; disable uploads while work remains live.

**Finding — P2: fast completion can permanently disable PDF uploads in the mounted cabinet.**

[add-pdf.tsx:12](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-pdf-source/projects/06b-rag-class/apps/web/src/app/cabinet/add-pdf.tsx:12) clears `accepted` only when `busy` becomes true. After 202, lines 23–25 set `accepted=true` and refresh. If the worker finishes or fails before that refresh reads the job, `busy` stays false. The preserved client component therefore keeps `accepted=true`, disabling both input and button indefinitely until remount/full reload. A quickly rejected damaged PDF is a concrete trigger.

This conflicts with PDF-07 and the planned behavior of enabling another upload after indexing. Reconcile acceptance with the returned job ID and refreshed job state, including a first observation that is already terminal. Verify that terminal-on-first-refresh permits another upload while a live job remains disabled. This finding follows from source inspection; no browser reproduction was performed.

**Evidence and limits**

- Reviewed all 14 snapshot source/test files and relevant existing transaction, job-status and indexing code.
- Independently verified HEAD, caller launch digest, 14/14 source hashes, snapshot digest and regression-log digest.
- Saved F06 evidence records typecheck exit 0, **353 unit tests passed**, **183 integration tests passed**, and build exit 0.
- Mutation evidence shows the intended assertion failure—two accepted uploads instead of one—followed by restored hashes and green.
- No additional backend finding identified in the reviewed scope.
- Required runtime PDF UI remains pending the external N7 browser mutex. Production build receipts and the prepared UI script are not UI-pass evidence. No tests, probes, Docker commands or mutations were executed during this review.

**Verdict: REQUEST_CHANGES** for the upload-state defect. Separate runtime UI acceptance remains required after correction. Review completion does not mean feature acceptance.

| Receipt field | Value |
|---|---|
| Run-ID | `20261002T190728Z-pdf-source` |
| Work-Unit-ID | `pdf-source-independent-review` |
| Attempt-ID | `review-1` |
| Source-Revision | `20417e604f43066639e62ea1c79cca85b951f45c` |
| Build-Revision | `sha256:596aad269deb9b1cacb2c717d8005be3811d08be53cef0f677afeddc42dea84a` |
| Launch-SHA256 | `190f99a44243db01450ef22b91367861b097a920d39eaf90eec4549d37a283e5` |
| Finished-At | `2026-10-02T19:57:51Z` |
| Duration | Approximately 122 seconds from recorded launch |
| Profile | `compact-quality-first-v2`; scoped M review |
| Requested reviewer | `gpt-6-astra`, effort `medium` |
| Actual reviewer / fallback | Unverified; native model metadata unavailable |
| Coder | Caller-confirmed `gpt-6.1-sol/high` |
| Tokens / cost | Unknown; coordinator must reconcile native usage |

Telemetry/receipt destination: `projects/06b-rag-class/docs/telemetry/p-replicator/20261002T190728Z-pdf-source/evidence/review-1-receipt.md`. Receipt persistence is delegated to the caller CLI as specified.

Status: completed