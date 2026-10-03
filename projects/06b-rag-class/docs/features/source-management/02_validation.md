# F15 independent validation — implementation-1

Run-ID: 20261003T053651Z-source-management
Source-Revision: c7e5c65fcf7d880c8eae686d4221053085ca692f
Validated before product edits, 2026-10-03. Own Specification FR-n6b-17/SC-US-017-1..3/NFR-n6b-4,
Pseudocode Source management and retention, Architecture tenant/service separation, ADR-005 and
Refinement conflict row were cross-read. No donor reading. Scope and seven AC accepted for implementation;
SRC-06/07 execution and acceptance belong to coordinator, not this bounded coder.

Repeated mechanical ROUTE command:
`bash ../../scripts/complexity-router.sh projects/06b-rag-class/packages/db/src/source-management.ts projects/06b-rag-class/apps/web/src/server/source-management-handler.ts projects/06b-rag-class/services/worker/src/retention.ts`
Exact result: `ТИР: S`, exit 0; files 3, explicit mode. Substantive route remains **M**:
existing authenticated tenant contract and lifecycle, deletion races and retention cutoffs; full
regression, real PG concurrency, mutation, production build and Docker UI remain required.
No new public access, schema/grants, dependencies or model calls.

Critical independent finding: no cascade FK exists here and tenant has DELETE but no UPDATE on index_job.
SELECT FOR UPDATE jobs is forbidden. Solution using existing grants: lock visible source FOR UPDATE;
DELETE index_job WHERE source_id RETURNING state locks all job rows, including failed retry contenders.
If any returned state is queued/running, throw a private conflict exception so withTenant ROLLBACK restores
ALL deleted jobs. Retry winning first is observed through DELETE's READ COMMITTED recheck; delete winning
first makes retry not-found. Source lock serializes recrawl/enqueue/FK insertion. Then explicit chunk,
document, file and source deletion commits atomically. No pre-check snapshot is used as safety oracle.
Existing enqueueSiteSource must lock its selected source too and return null if concurrent deletion wins.
Existing retry SECURITY DEFINER locks job only; no grant/schema changes necessary.

Recrawl inserts only source_id/account_id (permitted columns), preserves documents/files/chunks and worker
hash reuse, returns current live job on conflict, and uses defaults for new progress/attempts.
Latest job tie must add id DESC. Stats use tenant RLS and return two counts only with strict >7d cutoff.
Retention uses service role, strict <30d/<Moscow today-2, bounded batches and non-overlapping startup/daily
schedule; stopping awaits in-flight cleanup before caller pool.end. Errors disclose class/count only.
Integration files use existing tests/int convention because vitest.int.config.ts excludes tests/integration;
this is a necessary SRC-06 discovery correction, not a manifest change.

Readiness preflight: not_applicable — this attempt does not execute E2E or Docker. Coordinator performs
source-bound preflight before actual runtime checks. Requested gpt-6.1-sol/high; host supplies GPT-6-based
Codex identity but exposes no per-attempt usage counters. Telemetry run/launch already exists and is
coordinator-owned. No children, Docker, network, ports, paid requests, commit or push authorized here.

Implementation discovery: source FOR UPDATE followed by job deletion can deadlock a worker holding job
FOR SHARE while inserting a document (source FK KEY SHARE). Delete therefore takes **FOR NO KEY UPDATE**;
both recrawl and existing enqueueSiteSource explicitly take FOR UPDATE on that source, so supported
job creation remains serialized. Worker FK checks stay compatible; job DELETE waits for worker's short
transaction and observes the returned state before commit/rollback. Final source DELETE/FKs still enforce
atomicity against any direct SQL insertion. Added a real PG worker-FK barrier regression for this order.
