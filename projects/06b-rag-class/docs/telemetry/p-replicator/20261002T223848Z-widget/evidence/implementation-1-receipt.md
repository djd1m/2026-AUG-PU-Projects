Bounded F09 implementation is ready for coordinator handoff. **This is not feature acceptance.**

Implemented WID-01–07 and prepared WID-08 evidence:

- Self-contained TypeScript widget with Shadow DOM, adopted stylesheets, accessible controls, privacy notice, safe text/citation rendering, and `credentials: omit`.
- Shared published-bot/Origin gate for config, ask, event, and bodyless OPTIONS. Question/body validation precedes PaidGateway; account, channel, visitor HMAC, and metric host are server-derived.
- Server badge decision, restoration observer/interval, page-wide impression deduplication, and bounded impression/tamper events.
- Atomic install deduplication and first-question marking using the existing schema.
- Real PostgreSQL tests and deterministic test-only fixture authored.

Changed files cover `apps/widget/src/index.ts`, the three widget routes and server helpers, runtime integration, `packages/db/src/widget.ts`, related unit/PG tests, and the production-build-only widget hook. The obsolete cabinet hint was removed. F10/F11 surfaces remain outside scope.

Local results:

| Check | Result |
|---|---|
| Node22 typecheck | Exit 0 |
| Focused units | Exit 0; 128 tests across 5 files |
| Widget production-build hook | Exit 0; emitted `/w.js` |
| Final gzip size | **3,824 bytes**, limit 30,720 |
| Oversized build probe | Expected exit 1 at 80,594 gzip bytes; stale output removed |
| Production-server config with TypeScript imports forbidden | Exit 0 |
| Diff and source-freeze verification | Exit 0; all 19 source/test/build-input hashes match |

Both required mutations failed on substantive fixed assertions, then passed after exact byte restoration:

- Origin guard disabled: received **200 instead of 403**; red exit 1 → restored green exit 0.
- Badge decision altered: received **false instead of true** for Free; red exit 1 → restored green exit 0.

Original, mutated, and restored hashes plus exact commands are saved in [mutations.json](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-widget/projects/06b-rag-class/tests/artifacts/widget/mutations.json).

Source snapshot SHA256:
`68c3f4a92f6f814a70a31b6b1839994c324ceece2637a08fcd402f633c97cb48`

Generated `w.js` SHA256:
`a9cffb1cce8585c5942b2d76030506ac633cde8e9addee3219510fba474e0edb`

The [completion report](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-widget/projects/06b-rag-class/docs/features/widget/05_completion.md) contains the AC mapping, files, commands, exits, corrections, and pending gates. The [source snapshot](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-widget/projects/06b-rag-class/tests/artifacts/widget/implementation-source-hashes.json) binds the handoff.

Pending coordinator gates: full unit/real-PG regression, full production build and immutable image receipt, independent Astra review, and actual foreign-origin CSP/hostile-CSS/CORS UI at 390/1440. None is claimed passed.

Profile: `compact-quality-first-v2`. Requested model/effort: `gpt-6.1-sol/high`; actual native model, effort, usage, and cost were not exposed and remain null. Elapsed to final receipt: approximately **1,161 seconds**, within 1,500 seconds. Coordinator-owned telemetry under `docs/telemetry/p-replicator/20261002T223848Z-widget/` was untouched; own evidence is under `tests/artifacts/widget/`.

Run-ID: 20261002T223848Z-widget
Work-Unit-ID: widget-implementation
Attempt-ID: implementation-1
Source-Revision: 39464ac3c4ac77afd43bf1c15859398b7dd42b12
Build-Revision: none
Launch-SHA256: 687230da0f5fdfd4290a4a76bda1eb78d6606ef3053de2ae8db14bd3caa148a3
Finished-At: 2026-10-02T23:02:01Z
Verdict: bounded implementation handoff

Status: completed