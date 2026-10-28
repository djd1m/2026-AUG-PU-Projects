# Independent source review — support chat close

Result: **BLOCKED pending one concrete caller cancellation fix and targeted regression coverage.**

Frozen revision: `cdb11a471551259286982a2a9a5cbfc6996fb2df`, reviewed against `de12c7eb`; four changed files only.
Planner: `projects/05-podcast-clips-opus/docs/telemetry/p-replicator/20261028-n5-support-close/plan.md`.
Planner SHA-256: `d009c4e6e5b731fd9808b24cbeb4e2ca02e488fa0303aee7d26d1909fe3fa0f6`.
Risk: M, including anonymous reopen cache lifecycle. Requested review model: Sol high; actual runtime model attestation and usage unavailable.

## Blocking finding

**P2 — cancelled anonymous open still publishes stale success state.** `apps/web/src/app/support/SupportPanel.tsx:34-35` unconditionally calls `setMessage('Чат открыт без передачи почты аккаунта.')` after `openAnonymousSupport` returns. That function intentionally returns false when an account/authority/focus epoch event invalidates an in-flight open. Consequently the clear handler empties the message, the widget correctly does not show, and the old caller subsequently restores the claim that chat opened. This directly misses the requested caller-abort async-state acceptance criterion. Return without publishing success when the helper returns false; verify with a mounted-panel test that suspends logout or iframe readiness, invalidates the epoch, resolves it, and asserts no success message, open close control, or stale show.

## Coverage needed with the fix

The new cache in the component is not behaviorally exercised by the new tests. The close test calls the helper and then manually calls API show; the overlay test checks source/CSS strings. Neither executes anonymousReady or the actual panel close/reopen handlers. Add focused component coverage of same-epoch anonymous close→reopen preserving vendor state, every support-clear/account switch clearing that readiness, and identified transition invalidating it. Existing library cancellation tests do not cover the stale caller message above.

## Source checks that passed

- Close uses the published vendor hide alias, then opener focus; it does not logout, destroy, setUser, or reload. The supplied published widget script exposes hide as hideChat and uses iframe z-index 9999.
- Parent close is a real labelled button, fixed with z-index 2147483647; inspected CSS has no parent transform/stacking override that defeats this. Actual usability at 360/900 remains the coordinator browser gate.
- Primary label names support chat; copy states a human/manual response and no invented response hours or SLA, and clarifies that application login does not transfer email.
- Clear events synchronously reset anonymousReady and opened, increment epoch, and clear consent/context. Account id/verified effects call clearSupportIdentity. Setting a verified vendor identity resets anonymousReady before setUser.
- Existing helper still guards asynchronous cleanup and iframe readiness against epoch changes before show.

## Separate integration gates / limits

Read-only source/test review; no app, config, keys, provider, deployment, or message operations performed. Did not consult coder chats, logs, or history. No full tests/build/browser results claimed; coordinator owns the Node 22 full regression/build and actual published-vendor open→close→reopen checks for anonymous and available synthetic logged-in account. In particular verify focus changes between the iframe and parent: the existing window focus handler intentionally clears vendor identity and must retain its privacy behavior. Draft/history guarantees apply to hide/reopen inside the same unchanged epoch.

## Correction review — 3f76ddd2

Reviewed the exact one-file delta `cdb11a471551259286982a2a9a5cbfc6996fb2df..3f76ddd24298b8bfe5d4f536f29e40044e932518` in SupportPanel.tsx. The false return from openAnonymousSupport now returns from the caller before anonymousReady, opened, or success-message writes; finally still releases busy state. **The reported P2 source finding is closed; source correction PASS.**

This is not an integration or release PASS. Mounted behavior coverage is explicitly pending the coordinator actual Playwright checks: delayed-widget cancellation with no stale success/open/show, same-epoch close/reopen, and support-clear/account invalidation. No mounted harness or extra dependencies were added, and source guard tests must not be described as mounted behavior tests. Full Node 22 regression/build and published-vendor 360/900 checks remain separate gates. Planner SHA is unchanged from the original review context.
