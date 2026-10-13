# F02 — durable jobs, conservative tickets and ControlNet worker

## Entry gate and scope
Prepared while F01 receives its two bounded review corrections. `/next` → `f02-generation` and `/go` may execute only after F01 acceptance; this document does not mark that gate passed. Existing owner autonomy covers this implementation. Parent XL risk remains: credit reservation/release, concurrent admission and untrusted media.

F02 is delivered in two bounded source-bound coding units, each followed by fresh independent Astra review and only concrete corrections. Each unit gets a unique absolute receipt, actual model metadata and a maximum 25-minute attempt. Sol6.1 high owns product code; coordinator owns plans and integration.

## F02a: transaction and queue core
Acceptance: JOB-01–04, PERF-01/02, owner-scoped job APIs and gallery data (GALLERY-01), applicable AUTH-04/SEC-01–03. Own `db/002-generation.sql`, `web/jobs.js`, necessary API/config/media integration, queue maintenance entrypoints and focused tests. Existing manifests change only if essential and under this single writer.

Implement atomic admission with account credit lock, immutable owner idempotency, style enum and current-day first ticket. Platform200/account20 are hard ceilings; lower positive configured caps only. Use platform-day → account-day → account → job lock order, no reverse lock acquisition. All terminal release operations are unique by job. Worker claim/heartbeat/finish/failure interfaces enforce fencing, first-ticket reuse, UTC replacement, retry ticket, max2 starts, queue60s/attempt180s/hard360s deadlines even with heartbeats. Hash/image/network work stays outside transactions. Deletion tombstones and fences immediately; maintenance calls the corrected bounded orphan sweep periodically and retries physical cleanup.

Required real PostgreSQL tests cover last-credit/last-ticket concurrent admission; same-key reuse/changed-body conflict; retry exhaustion; rollover reservation; queue expiry; healthy-heartbeat hard deadlines; stale fence/late output; exactly one release; deletion and hold vs start serialization. The budget mutation must fail the exact targeted assertion from a green baseline. Fixture output is labelled and cannot establish geometry success. Current F01 auth/upload green checks repeat only if changed integration paths justify them.

## F02b: inference and immutable quality evidence
Acceptance: GEOM-01/03 and applicable output/private read bindings; GEOM-02/PERF-03 remain real-GPU measurements. Own `worker/**`, operator quality CLI, generation evidence attachment, focused tests, isolated optional GPU/fixture runtime configuration. Use the validated SD+ControlNet-depth plan and recorded model revision/license sources; never replace it with OpenAI image generation. Python engine and queue-controller boundary must be explicit; avoid duplicating financial transitions across runtimes. Record any concrete implementation mapping in Architecture before review, without weakening canonical invariants.

Real mode requires actual CUDA and locally provisioned pinned models, records input/output/depth/config hashes, model revisions, seed, source revision, hardware and distinct queue/inference times. Missing CUDA/models fails explicitly. No paid resource rental, model weight download or silent CPU/fixture fallback. A cancellable child process enforces deadlines. Fixture mode refuses production, stores unmistakable provenance and cannot pass operator acceptance/publication.

Operator-only append-only review binds actor/time, immutable output/evidence and corpus report digests. Missing or changed bytes/provenance, fixture and ordinary account must reject; rejection revokes access and releases once. Add the mandatory fixture-exclusion mutation plus otherwise-valid provenance/changed-output cases. Real geometry quality and p95 are unknown until the licensed corpus and authorized GPU exist; independent API/runtime work continues.

## Shared resources and completion
Heavy Docker tests acquire `/tmp/codex-heavy-build.lock` after coordination, total active service CPU≤2, memory checked. Browser uses the separate shared mutex only at integrated UI stage. Raw logs/prompts and ignored env remain outside git; checked summaries, source/image identities and receipts live under project docs. F02 is done only when both units and required checks/reviews pass. Real GPU gate stays separately blocked, never inferred from fixture success.
