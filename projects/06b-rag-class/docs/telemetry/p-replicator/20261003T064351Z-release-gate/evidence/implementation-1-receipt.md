Bounded F16 offline implementation completed. **F16 acceptance and public release remain pending.**

Run-ID: 20261003T064351Z-release-gate  
Work-Unit-ID: release-gate-implementation  
Attempt-ID: implementation-1  
Source-Revision: 58b49da642298d991679241ce26c508b22392aee  
Build-Revision: null  
Launch-SHA256: 9de1fe0c84f691c244252aa06e68e472adf889d82568f0a2bc7777ee17c4d685  
Finished-At: 2026-10-03T07:08:21.181752+00:00  
Verdict: pass  
Scope: independent requirements validation and bounded offline author work only.

The [launch record](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate/evidence/implementation-1-launch.json) matches the supplied digest. The [source snapshot](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/tests/artifacts/release-gate/implementation-source-hashes.json) records exact SHA-256 hashes for all 20 authored files, reverified after final checks.

Snapshot-SHA256: `58dba6fad7322f117aa412c10cbba3504a840e7302023a4867613d0c875f0c7f`

Delivered files:

- `scripts/calibrate.ts`, `scripts/calibration/evaluate.ts`, `scripts/calibration/live-store.ts`.
- `scripts/check-cjm.sh`, `scripts/check-cjm.ts`.
- `tests/calibration/{questions.json,corpus.json,site.html}`.
- `packages/rag/tests/unit/release-gate.test.ts`.
- `docs/features/release-gate/{02_validation.md,05_completion.md}`, `docs/calibration-report.md`.
- `tests/artifacts/release-gate/`: focused/typecheck results, preserved initial failures, mutation evidence, native CLI probes, repeated ROUTE and source hashes.

| AC | Author result |
|---|---|
| REL-01 | Frozen fictional corpus and exactly 20 known/10 unknown questions, with expected facts, document locators and omitted details. |
| REL-02 | Explicitly gated live/seed CLI using existing gateway, RAG, PostgreSQL and call ledger. One bounded corpus batch; maximum 30 sequential answer attempts, 400 output tokens, no retries, 1200-second deadline. |
| REL-03 | Strict scorer requires 10 high-similarity `model_unknown` outcomes and at least 17 factual answers with expected retrieved citations. `below_threshold` never counts. |
| REL-04 | Explicit-base CJM driver covers registration, owner-DB test marking, source job, sandbox answer, publication/embed, visitor config/preflight/ask and badge/ref. Browser proof remains separate. |
| REL-05 | Substantive offline tests, typechecks, native refusal probes and similarity-guard mutation passed. |
| REL-06 | Calibration report explicitly says `NOT_EXECUTED`; completion mapping preserves external gates and historical receipts. |

Checks:

- Focused unit: **37 passed**, exit 0; final duration 2.88 seconds.
- Root and web typecheck: exit 0; new scripts are included through test imports.
- Similarity mutation: red exit 1; exact restoration green exit 0.
- Required DB/RAG workspace builds: exit 0.
- Native calibration/CJM commands without prerequisites: exit 2; shell syntax: exit 0.
- Snapshot rehash matched; every authored file is below 500 lines.

Initial failures remain recorded. Fixed the corpus byte guard before deduplicating chunking, a malformed test public ID, and test typing errors. No unresolved author check failure remains.

Frozen fixture SHA-256:

- Questions: `3f924f6a4e3ee8e332d60340473a697e3d9e8c470e2ee86a8dec3f54f17d3bd6`
- Corpus: `61f9cf3f700c99d84a9187e777fd8e88810265f29e9043305a022ca7bb054bbf`
- HTML: `8f625bb45091a9782745da255c7b81b47e1cd1f892cb4408eba8f950de17a85f`

Repeated ROUTE: mechanical S/exit 0; substantive M. Profile: `compact-quality-first-v2`. Requested model/effort: `gpt-6.1-sol/high`. Actual model, effort, token usage and monetary cost are unavailable to the worker and remain **null**. Measured launch-to-receipt duration: **1337.985 seconds**, within 1500 seconds. Active/model time and time to accepted F16 remain unknown.

Coordinator-owned telemetry remains at `docs/telemetry/p-replicator/20261003T064351Z-release-gate/`. The terminal [receipt](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate/evidence/implementation-1-receipt.md) binds this delivery to the launch and snapshot.

Pending, owned by the coordinator: independent postimplementation review; mandatory full runtime checks; authorized live credentials/configuration/spend; source/build binding; frozen 30-case live calibration and semantic review; actual issued-stand CJM; foreign-host browser CORS/CSP/CSS/privacy/badge evidence; rollback and authorized delivery steps. Actual similarities, live outcomes and billing are **NOT_EXECUTED/unknown**. Supplied F15 results remain historical baseline evidence.

Next bounded step: verify this receipt and snapshot, independently review the candidate, then execute mandatory and separately authorized external gates. No background continuation is claimed by this worker.

No child agents, donors, secret reads, network/live calls, Docker, ports, production/schema/dependency/global changes, commit or push were performed.

Status: completed