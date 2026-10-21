# SPACE independent implementation review and anti-drift
Reviewer family: codex
Spec revision: sha256:0b4f9b2493995e15db8b258cf06c2fde33c9aba1f0883d6f1a8344188bff72ad
Run-ID: 20261013T220722Z-space-6259
Work-Unit-ID: space-review-1
Attempt-ID: space-review-1
Source-Revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Owned-Code-Test-Snapshot-SHA256: bb2140d929dc10b6f1a80f48ca413b06614383662ce235eedc8dadd7f6811ef7
Launch-SHA256: 96633afdfd4f5c527f4ac59710539ab04b719ef6e1cda3bb8f0fc70a329be460
Started-At: 2026-10-13T22:48:00.462442+00:00
Finished-At: 2026-10-13T22:53:56.750513+00:00
Duration-Seconds: 356.288
Profile: compact-quality-first-v2; substantive risk M from approved fresh plan, checks retained
Requested-Model: gpt-6-astra / high
Actual-Model: null; Actual-Effort: null; Usage: null; Cost: null (host execution/usage counters unavailable)
Fallback: none claimed; model request is not evidence of actual execution
Build-Revision: null; production build/browser verification owned by coordinator
Verdict: core review closed after two medium corrections; production/browser/recovery gates pending
Trace-Path: docs/features/space/review.md

## Scope and evidence

Read-only review of the 22 SPACE-owned source/test files listed in implementation-receipt.md, feature specification/pseudocode/architecture/refinement, normative global space/asset/limits/API clauses, root UI integration, shared ownership/guards/schema/bounds, and Next packaging seams. All 22 current file SHA-256 values independently matched the immutable author receipt; no source edits or new test files were made. Original canon remains 70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d. The separately logged Architecture D1 rate-key clarification has no SPACE behavior impact.

Applied brutal-honesty-review evidence/actionable-fix method with explicit no-findings-quota dispatch override and project-work-companion handoff rules. E2E preflight is not_applicable in this attempt: no browser/production E2E was run. Full Vitest SPACE run is direct module/handler integration against actual temporary PostgreSQL schemas, real Sharp/Khronos decoder subprocesses, and SSR; it is not browser E2E. Russian dz recall on the canonical root returned the concrete-fixes/targeted-closure lesson and reject-before-cancel timeout lesson; both applied. Recall occurred during review, not before its first read.

Command actually run from project root: `node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/space`. Exit 0; **5 test files, 52 tests passed**, start 22:49:08 UTC, reported duration 11.51s. Private env content/URL were never printed. This run supersedes the author's 49-full-plus-15-targeted count ambiguity. The author reports two actual red/restored-green mutations (stream byte bound and pending quota); this reviewer inspected those guards/tests but did not repeat mutations. No paid or external provider calls.

## Spec conformance table

| Criterion | Verdict | Actual source and verification |
|---|---|---|
| AC-space-1 | unverifiable | Exact18, stable hash/immutable CAS, wall openings and plan SSR pass (geometry.test.ts:6, repository.test.ts:14–15, viewer.test.ts:7–8). Initial missing-plan defect SPACE-R1 is closed: SpacePanel.tsx:14 now always shows RoomPlan for manual shell and ui.test.ts:6–10 passes. Complete live 3D visibility remains a mandatory unverified browser gate. |
| AC-space-2 | met | geometry.ts:15–51 enforces decimal grammar/bounds, opening overlap/wall extents, nonzero anchors, uniform scale, explicit additional-control tolerance and confirmation; geometry.test.ts:7–9 exercises actual failures and exact boundaries. Handler delegates failures through typed envelope. |
| AC-space-3 | met | assets.ts:25–32 writes/verifies original and normalized bytes before ready; worker:14–18,52–59 decodes/reencodes with stripped metadata; server/space.ts:27–32 checks ownership and fixed MIME/nosniff/private serving. parser.test.ts:12–13 and http.test.ts:15 pass with real image/GLB codecs and original-byte comparison. Production packaging remains a later gate. |
| AC-space-4 | met | worker:20–49 rejects URI/data URI before validator, malformed headers/chunks, prohibited skin/animation/extensions/modes/sparse data, inconsistent actual accessors; enforces resource limits and full decode. parser.test.ts:14–17,20 and assets.ts:13–18 prove malformed/pixelbomb/actual-byte/deadline/slot failures. Static no-fetch path plus URI rejection is verified; live integrated no-egress observation is pending. |
| AC-space-5 | met | db/space.ts:16,34,58,69–74 and scalar composite schema FKs bind assets/references/shells to project/actor; pending is invisible. repository.test.ts:19,26 and http.test.ts:14 exercise foreign asset/project/cursor and pre-body ownership refusal. Browser never receives private storage keys. |
| AC-space-6 | met | references.ts:5–13 validates exact-one source, bounded note/tags/rights; db/space.ts:56–66 saves source/observedAt and loads it; repository.test.ts:20,23 prove provenance round-trip and 20 cap. ReferencesPanel.tsx:5 renders escaped text and safe owner links. |
| AC-space-7 | met | server/space.ts:24 returns CAPABILITY_DISABLED before writes; http.test.ts:16 proves useful alternative/empty unchanged list. ReferencesPanel.tsx:5 explicitly offers URL/upload and discloses missing automatic Pinterest import. |
| AC-space-8 | met | references.ts:10–13 validates but retains exact input string; repository.test.ts:20 round-trips the specified Pinterest pin path; ReferencesPanel.tsx:5 directly uses retained sourceURL with noopener noreferrer. |

Verdicts above are limited to their named module/handler evidence. They do not waive unresolved mandatory product integration gates.

## Confirmed findings

### SPACE-R1 — MEDIUM — measured plan absent during normal successful 3D operation

Location: apps/web/src/components/SpacePanel.tsx:13; packages/viewer/src/index.tsx:16; related apps/web/src/components/SceneViewport.tsx:9.

The accepted success scenario and global FR-design-1 require both the plan and 3D to be explicitly available. SpacePanel only mounts SceneViewport. SceneViewer renders RoomPlan exclusively in its error branch. A user with functioning WebGL cannot access the measured plan; if the viewer module import itself fails, SceneViewport renders only a message, also without a plan. The existing standalone RoomPlan SSR test does not check the integrated page and therefore stays green.

Fix owner: coordinator (root-owned UI). Render the existing measured RoomPlan independently for manual shells, or provide an explicit accessible Plan/3D control that remains usable when the viewer module fails. Do not derive a GLB floor plan. Add a focused UI assertion for ordinary successful manual-room rendering. No new renderer/library is needed. Keep the source requirement and record the code correction/hash/checks in the decision log. Confirmed during initial pass and sent to coordinator; closed by the narrow closure below.

### SPACE-R2 — MEDIUM — authoritative asset API contract disagrees with implementation

Location: docs/Pseudocode.md:238; actual apps/web/src/server/space.ts:14–19,27–32 and apps/web/src/components/SpacePanel.tsx:18.

The canonical API row advertises bounded multipart kind/file and GET `/api/projects/:p/assets/:a`. Actual code accepts raw bytes with `x-asset-kind` / `x-rights-confirmed` headers and serves GET `/api/assets/:id` (optional `original=1`). Existing HTTP tests/browser agree with the implementation, and the implementation receipt documents it correctly. The canonical table additionally omits asset/shell list pagination contracts. Consumers following the authoritative document cannot use the implemented route/body.

Fix owner: coordinator (canonical docs). Recommended autonomous choice: correct the canonical row to the actual raw bounded body and owner-authorized GET route, document GET shells/assets/references `{items,nextCursor}` with owned `after` UUID and page≤50, and record old/new canonical hashes plus reason. This preserves the implemented sole-reader guard/limits and avoids unnecessary multipart machinery. Update dependent source-hash references deliberately; do not silently weaken behavior. Confirmed during initial pass and sent to coordinator; closed by the narrow closure below.

## Anti-drift: source ↔ implementation ↔ tests

- Manual geometry/calibration: global FR-space-1 and feature CalibrateSpace map to domain/space/geometry.ts, repository createShell, SpacePanel manual/GLB forms, and geometry/repository tests. Decimal strings normalize before stable hash; holes sort by ID; overlap uses strict rectangle intersection, permitting touching edges. Additional controls require explicit tolerance and bounded deltas; GLB floor area stays null unless separately confirmed. Immutable SQL triggers/FKs live in coordinator migration001, not in the feature. Manual-plan integration is the concrete missing source→UI edge (R1).
- Shell state: account→project locks, expected-version check, project-wide combined revision cap and current_budget_id clearing happen inside one transaction (db/space.ts:33–36; db/bounds.ts:4–10). Old immutable records remain. Approval invalidation is intentionally by current shell mismatch; design/approval integration is the next feature, not claimed here. CAS concurrency and no-version-bump cap refusal pass. The 100-cap test seeds shells; helper source explicitly sums shell+design+budget. Cross-kind producers must continue using the helper under the same project lock.
- Upload: source one-reader/pre-body requirements map to server guard → reserve → writeUpload → isolated decode → verify hashes/files → ready transaction. Limits are actual stream10MiB image/25MiB GLB, body10s, parser10s, one active decoder through child close, native RSS sampled25ms at512MiB plus V8 heap256MiB. Image original+normalized together count toward reserved30MiB; normalized≤20MiB. Embedded GLB texture total≤20MP, accessors≤8m components, vertices≤750k, triangles≤250k, nodes≤1000, and rendered node instances also count. UUID exclusive0600 keys never use filenames. Typed body/parse/CAS refusals clean reservation/files; ownership precedes body access. URI branches contain no fetch implementation, and validator externalResourceFunction always rejects.
- Quotas/cleanup: reserveAsset under account→project locks counts pending bytes across projects before streaming; 64 assets,200MiB project,1GiB account; free disk check≥512MiB. Real concurrency tests exercise project/account limits. cleanupAssets implements stale15min pending release and unreachable old-file removal with30min grace. Current cleanup test directly proves stale pending removal and preservation of young file; its title mentions old orphan/ready preservation, but those branches are not directly exercised. Do not promote that test title into broader evidence. Worker scheduling is still an explicit integration dependency.
- References: source URL remains original HTTPS string including Pinterest pin, credentials/control chars/javascript rejected; no remote fetch. DB same-project asset rights/kind checks and 20 limit occur inside owned transaction. Root ReferencesPanel posts the exact body contract, escapes React text, and renders retained URL. observedAt/createdAt persist even though dates are not currently shown in that card. No requirement to auto-import Pinterest is invented.
- API/pagination: actual list handlers return envelope data `{items,nextCursor}`; all mutations use If-Match version, create201+ETag/meta.version; lists owner-check forged cursors and max50; RoomEditor.tsx:12 uses allPages so all64 assets remain reachable. Asset GET owns DB lookup, fixed allowlisted MIME/nosniff/private no-store and no storage-key input. Canonical body/path table requires R2 correction. App route modules delegate to these handlers; no parallel upload endpoint or unbounded multipart reader was found.
- Viewer boundary: packages/viewer exposes pure React/domain types and caller-provided byte resolver; no Next/db/API import. One Babylon engine owns loaded shell, overlays/materials, one camera; renderer.ts:40–54 applies only canonical calibration to GLB, captures before/after synchronously with that camera, and disposes on teardown. Manual wall tessellation honors actual openings; tests verify net area and escaped plan labels. GLB fallback correctly refuses to infer a floor plan/area. Live renderer/picking/disposal/WebGL-loss/same-camera capture require browser evidence; SSR is insufficient.
- Root packaging/shared dependencies: next.config.mjs intentionally externalizes @n8/adapters to keep asset-parser-worker.mjs locatable; installed source packages run through tsx in start:web. A production build and valid/invalid upload smoke are necessary because Vitest bypasses this seam. DomainError class identity may differ between bundled @n8/domain and external adapters; this is an **unconfirmed integration risk**, not a third confirmed finding. Malformed/oversized production uploads must retain intended typed statuses/codes instead of generic503. Root migration002 supplies history indices; db/bounds.ts supplies combined100 cap. These are reviewed integration inputs, not claimed as SPACE-author files.
- Reverse direction: concrete parser resource ceilings, URL strictness, pagination, reference/revision caps, preservation/cleanup and viewer abstraction all have accepted global amendments or feature contracts. No paid provider, Pinterest scrape, executable AI geometry, automatic scan-to-wall conversion, neighboring-project runtime dependency, or extra workflow engine was introduced. Reuse.md records local-before-GitHub choices and dependency revisions/licenses; its stale sentence “Viewer fresh search and final source receipts pending” is contradicted by the completed viewer entry below and is a minor author-evidence wording issue, not a product blocker.

## Mandatory later integration gates (not passed by this review)

1. Fix R1 and reconcile R2 with logged before/after hashes, then run only affected closure checks.
2. Coordinator production Next build and real built-server valid image/GLB upload plus invalid/oversize typed-error smoke; prove worker file/module resolution after packaging. Maintain OS container memory ceiling (sampled RSS can overshoot and is not an instantaneous hard limit).
3. Bind cleanupAssets to the worker watchdog (F7 ownership), and verify stale/orphan recovery through that runtime. The exported/tested helper alone is not a running cleaner. Add actual old-unreachable-versus-old-ready reachability coverage there.
4. Browser WebGL/plan visibility, context-loss/module-failure fallback, camera before/after, disposal and integrated no-egress checks against exact build after companion preflight. A passing SSR test is not proof of these.
5. Final cross-feature suite and security/performance/recovery checks under the full project risk plan. This review's 52 SPACE cases do not replace it.

No core geometry/upload security defect was confirmed in the inspected snapshot. Both confirmed corrections are closed below; explicitly later runtime gates remain. This is completed core review work, not final feature acceptance or handoff.

## Additional reviewed snapshot

```text
d06f8b59e07db6866c720cc8061fa2834050a0fa889fc0cf557c28b096b1c060  apps/web/next.config.mjs
3762d2005430cbee69f1d98855896c8663bc11de9fb46c62feab0b9b697e7346  apps/web/src/components/SpacePanel.tsx
87d951ec7f886e7f9fc1536f15831fd50bf3726778b0f1e92216f85db91d8507  apps/web/src/components/ReferencesPanel.tsx
db04c900d7eb2481700af76715688154a9aa575f8b135bda4ee6c8ab8f33f068  apps/web/src/components/SceneViewport.tsx
be4e46a11744155460418a383b7797f28d1b00e25857fdccc91d496057e0f80f  apps/web/src/components/RoomEditor.tsx
c50544e70b0c5f064470ae8c3e568040f1934b2036b35a298328be4ff1f378c2  packages/db/src/bounds.ts
8e94f8b99f4e0f63c5d6c5ef401f893fb467841ca9bdeec11900ca0ab2a48da8  packages/db/src/migrations/002-indexes.sql
```

Historical evidence is kept; root UI/canonical corrective changes after the snapshot require a separate narrow closure, not rewriting this initial verdict. Elapsed duration includes instruction reading, coordination, actual tests, source review and receipt creation; token/cost totals are unavailable and no economy claim is made.

## Narrow closure — same bounded attempt

Initial review file SHA before closure: 66b19eef9099b099e80da2d03ddc766fdb3bb0f329765669be14ac58ec6ce214. The body above preserves the original findings and first-pass investigation; this section records coordinator corrections observed after that pass. The additional SpacePanel SHA listed above was sampled after the coordinator had already applied R1, while the initial finding was raised from the earlier direct source read. It is the corrected source hash, not a hash of the defective pre-fix UI.

- **SPACE-R1 CLOSED**: reread SpacePanel.tsx:5,14. The existing RoomPlan is now statically imported and rendered outside the lazy 3D component for every manual shell. It shows plan and measured dimensions during 3D loading/success/failure; GLB still gets no fabricated plan. `tests/space/ui.test.ts` exercises the real SpacePanel SSR path and asserts plan plus loading viewer. Independently ran `node node_modules/vitest/vitest.mjs run tests/space/ui.test.ts tests/space/viewer.test.ts`: exit0,2 files/3 tests, start22:53:02, duration1.10s. Vitest oxc automatic JSX config makes the new real-web-component SSR executable; it does not alter Next TS settings. Root's earlier JSX harness failure is disclosed in the coordinator message, not counted as a pass.
- **SPACE-R2 CLOSED**: reread canonical Pseudocode.md:238–240. Raw body/kind-rights headers, owned GET /api/assets/:a with original query, and ≤50 paged lists now match actual handlers/browser. DRIFT-009 in docs/anti-drift-decisions.md records old af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59 → new 1d25bc13918dba5af5b6a483cacc1fa96ba4c3dfd324abcef67a0fb82c2847c8 with reason and retained guards; docs/source-versions.md records the new hash. Feature-local old parent hash remains historical dispatch evidence; no behavior change is hidden by this documentary correction.

Corrected additional hashes: SpacePanel 3762d2005430cbee69f1d98855896c8663bc11de9fb46c62feab0b9b697e7346; ui.test.ts a0b567c1dac2e045eec7c4f75f3409e26c6730c22a1f41838abaa8d60cc9cfc4; vitest.config.ts 6d58f7838047e1a0cc47dc40e9439d05f757d796cd42bfedb0e092de901892bf.

Current check accounting:52 full SPACE cases passed before UI correction;3 affected UI/viewer cases passed after, with1 new test, so53 distinct tested cases. **No full53-case run is claimed.** No repeated unchanged full suite was needed for this narrow UI/doc fix. The seven module/handler-backed criteria remain met; the first criterion is now unverifiable solely for its pending live-3D evidence, with its source defect fixed. No open confirmed core finding. All named production packaging/typed-error, worker cleanup/recovery, browser WebGL/camera/no-egress, and final cross-feature gates remain mandatory and unpassed by this receipt. The earlier gate item1 is now closed.

Final duration includes this narrow closure. Actual model/usage/cost remain null; no new agent, external service, paid call, or source edit by reviewer.

Status: completed
