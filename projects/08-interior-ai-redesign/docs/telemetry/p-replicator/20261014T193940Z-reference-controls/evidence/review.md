# Independent bounded reference-controls review
Baseline: a28e0d6e
Finished: 2026-10-14T19:43:24.115227+00:00
Launch SHA256: d0415e4558d2d5eea283cdcb4c25d2eddc68176fcfc7e7ea48e2e1e7bce3c3c6
Actual model: unknown (execution metadata unavailable).
Verdict: pass
Findings: no blocking issue identified in bounded review.

Link references can now be checked. Resolution uses existing owned private asset/upload and reference creation APIs, propagates upload version into creation, refreshes state, and replaces the selected link ID with the resulting image-reference ID. Unresolved selections block palette application with an explanation; opening the link is explicit browser navigation and the server does not fetch it. Picker normalizes stale/deleted IDs against active references.

Reference removal preserves rows/assets and historical IDs, checks actor/project ownership, locks Account then Project, applies expected-version CAS, and bumps project version in the same transaction. Active listing and new direct palette admission exclude deleted refs. New manual design creation and job snapshots explicitly reject deleted refs; historical restore/approve and already-admitted finish continue through the retained-row check. History and active limits remain bounded at 200/20. DELETE route uses existing mutation guard. Tests inspected include preservation through approval/restore, new-use rejection, foreign actor denial, and simultaneous CAS removal.

Static code/diff review only; no tests, build, browser run, external request or source edit performed by reviewer. Full validation results remain coordinator-owned. Model usage/cost unavailable, not estimated. User-facing resolution at the 20-active cap still correctly follows existing capacity rejection; adding an image reference consumes a new active reference slot.

Source SHA256:
- `apps/web/src/components/DesignReferences.tsx`: 33e154ac4775ab3829489a490970e46e4a6cb21514ed8e8451254c8724cea043; launch match: True
- `apps/web/src/components/ReferencesPanel.tsx`: 845f6d66c5dc897fd7ba5effc3f8679c35e43d77bf08e9413f6116ea5023b68d; launch match: True
- `packages/db/src/space.ts`: e37a9c40a08425f0198b5d124f710988f736f0e24e55db94a0d8c9f1fd1af4e7; launch match: True
- `packages/db/src/design/revisions.ts`: f71b554df010530612b80c14376253fe4239720b283a72d262c1e3fc1a111221; launch match: True
- `packages/db/src/design/jobs.ts`: 6efc844e71acea3586a79a13482943db77225759b1f79a1e618d4e78848ba1a8; launch match: True
- `apps/web/src/server/reference-design.ts`: e1afe442ff8004b1c830814695b25f1ff8ab4caba517350af76b52cfff60d3ff; launch match: True
- `apps/web/src/server/space.ts`: d58cf40af2a04b6009a50e52ab4c5273f623bb723d10efd5ad39a575ef84c101; launch match: True
- `packages/db/src/migrations/007-reference-removal.sql`: aa7934a1e2ab04ccbf54a1f03a50a59329adeaee61e83b50dfbfa943b4a3b94c; launch match: True
- `apps/web/src/components/DesignPanel.tsx`: 0d8b405a20223952a037d11d2f8bb5f603ebb240fd91c2879423682b0ebdab21
- `apps/web/src/app/api/projects/[projectId]/references/[referenceId]/route.ts`: 8e8d2a8a3a42a13d1b7ead13b0846e25004a1c57e0db3831c0f76acbd8d3b278
- `tests/space/reference-removal.test.ts`: 182851a5c8eca80cc2cb125b03b2573c8cbc1c699ec7b7134933e44b9f3d231c

FinalStatus: completed
Status: completed
