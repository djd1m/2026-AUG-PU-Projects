Independent obligations derived before reading the implementation plan:

- **FR-n6b-6 / SC-US-006-3:** publication requires a valid contact; invalid input must not publish or expose embed code. The contactless sandbox remains usable.
- **FR-n6b-7 / SC-US-007-1/2/3:** derive the snippet from configured `PUBLIC_BASE_URL` and immutable `public_id`; propose the first site's origin for owner confirmation; preserve an explicitly empty allowlist.
- **Publish bot pseudocode / PATCH contract:** validate contact and origins, then persist publication settings together; support the optional boolean `demo_enabled`.
- **Architecture / ADR-007:** authenticate the owner, use tenant transactions and RLS, conceal foreign bots with 404, and retain fail-closed origin semantics. Public widget enforcement belongs to F09.

**Findings: none. Verdict: ACCEPT_WITH_CAVEATS.** Ordinary code acceptance is conditional on the pending runtime gates. This review does **not** grant overall feature acceptance.

| AC | Independent assessment |
|---|---|
| PUB-01 | Same-origin, session, UUID, bounded JSON and validation precede publication writes. Account identity comes from authentication; foreign/missing rows produce 404. |
| PUB-02 | Contact validation enforces bounded email, E.164 or HTTPS; rejects credentials and unsupported schemes. Invalid contact returns before the write. |
| PUB-03 | One `URL.origin` normalizer canonicalizes default ports and IDNA, preserves nondefault ports, rejects credentials/wildcards/opaque inputs, deduplicates and preserves `[]`. |
| PUB-04 | First chronological site is proposed without persistence; PDF-only supplies no invented origin. Published empty lists are not refilled. |
| PUB-05 | One parameterized UPDATE writes contact/origins/publication and optional demo flag under tenant RLS. Concurrent full payloads cannot mix these fields across separate statements. PostgreSQL execution remains pending. |
| PUB-06 | Embed code requires publication and valid contact, uses configured `/w.js` and stored public ID, and is displayed through a read-only textarea. Cabinet reload reads persisted settings. |
| PUB-07 | Form labels, pending state, error recovery and publication anchor are present. Demo CTA remains explicitly unavailable. Actual browser behavior and 390/1440 layout remain unverified. |
| PUB-08 | Snapshot and mutation evidence verified below. Full unit/PG/build/Docker UI gates remain pending. |

The optional `objectOnly` change in [auth-handler.ts](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-publish-bot/projects/06b-rag-class/apps/web/src/server/auth-handler.ts:59) preserves default behavior for existing callers. Publication opts into strict object parsing: literal JSON `"too-large"` becomes invalid input (422), while actual byte overflow retains 413.

Evidence and assertion meaning:

- Independently hashed **18/18 files: 13 production, 5 tests**, with no mismatches. Aggregate SHA-256: `13a3a5f48e5725ec091c87eed22aa30b16bce18f940c26224a90103335993a21`. Commit scope matches **621 insertions, 19 deletions**. Launch digest also matches.
- Saved results report **Node 22.22.3 typecheck exit 0** and **124 tests across 7 files passing**. I inspected these logs; I did not rerun them.
- [Mutation evidence](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-publish-bot/projects/06b-rag-class/tests/artifacts/publish-bot/contact-guard-mutation.json) and red output show the fixed assertion failing with **“expected 200 to be 422”** after disabling the contact guard. This is a meaningful handler-level failure, not a startup/compiler error. Restored source and unchanged test hashes match the reviewed snapshot; restored execution passed. The mocked write does not independently prove PostgreSQL enforcement.
- Five authored PG cases assert unchanged state after rejection, real session/RLS isolation, persistence, source proposals and whole-payload concurrency. They have **not executed**. UI source-text assertions likewise do not establish browser behavior.

Profile: **M**, bounded independent functional review. Implementation native metadata identifies **gpt-6.1-sol / high**. Review requested **gpt-6-astra / medium**; actual review model/effort, usage and cost are unavailable here and require coordinator reconciliation. Elapsed launch-to-final timestamp: approximately **250 seconds**, within 480 seconds. No children, writes, test runs, probes, Docker or network actions were performed.

Telemetry: `projects/06b-rag-class/docs/telemetry/p-replicator/20261002T213130Z-publish-bot/`. Receipt persistence belongs to the CLI.

Run-ID: 20261002T213130Z-publish-bot
Work-Unit-ID: publish-bot-independent-review
Attempt-ID: review-1
Source-Revision: 094a13c7b1653ecac853f73a8d2e20c34ab16b93
Build-Revision: null
Launch-SHA256: 85e0b582b0a600e72abf7f28fd051fa089f1055eacdc627e54566ce6938c56d4
Finished-At: 2026-10-02T21:57:20Z
lastStatus: completed