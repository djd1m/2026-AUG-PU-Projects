# Аудит запланированных возможностей N8 против текущей реализации

Run-ID: 20261014T165824Z-gemini-live-audit-bc87  
Work-Unit-ID: planned-feature-audit  
Attempt-ID: audit-1  
Source-Revision: 47c4e6fb3f1e336822f97af227a1e5f905925b28  
Build-Revision: sha256:181590da9bf545d69fb927e56abb5da50f52f5ead7bd3d0fdcca8a45d90058ee  
Launch-SHA256: 935b604ea9947497f39e007e6d2ee154a469b0215e247a8fd82c8ed985288728  
Launched-At: 2026-10-14T16:58:51.468117+00:00  
Finished-At: 2026-10-14T17:01:41.025Z  
Duration from formal launch: 169.557 seconds  
Profile: compact-quality-first-v2  
Actual model/effort: null — authoritative host execution metadata is unavailable  
Usage/cost: null — attempt-scoped counters and billing attribution are unavailable  
Verdict: PASS — bounded read-only audit completed with material product gaps found

## Scope and interpretation

The audit compares the owner's expanded intent in `docs/project-input.md` and
`docs/research/canonical-cjm.md` with `docs/PRD.md`, the actual source at the revision above,
and retained test/runtime evidence. It deliberately does not treat compliance with the
narrower PRD as completion of the desired journey. The current source is the same 153-file
production snapshot bound by
`docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/source-image-4.json`
to the running image above; later repository changes are documentation/templates.

Classification used here:

- `works`: implemented and supported by retained source-bound test or browser evidence;
- `partial`: a real usable subset exists, but the owner's desired outcome still needs a
  substantial manual step or lacks a material part;
- `config-disabled`: the implementation exists, but the current production configuration or
  an enforced prerequisite prevents use;
- `not implemented`: no current product path performs the capability;
- `untested`: a path or claim exists, but retained evidence does not establish it on the named
  real input/provider.

No tests were rerun. No network/provider/payment call, environment read, DB query, container
mutation, or product-source change was performed. Existing evidence was read only; no secret
or `.env` value was inspected or copied.

## Material blockers

1. **The desired AI-assisted design path cannot currently be used.** The deployed application
   remains in manual mode. A coordinator-provided control-plane observation records a valid key
   response, USD 10 limit and USD 10 remaining, but `limit_reset=weekly` and
   `include_byok_in_limit=false`. `createOpenRouter().verifyBudget()` in
   `packages/adapters/src/openrouter.ts` accepts only `daily` and `true`, so a live job would be
   rejected as `PROVIDER_LIMIT_UNVERIFIED` before inference. Adding a key to the host `.env`
   did not activate live mode.
2. **There is also no usable credit bootstrap.** `account.credits_available` defaults to zero in
   `packages/db/src/migrations/001-initial.sql`; `PgAuthStore.register()` inserts no grant;
   `PgJobs.submit()` rejects live admission with `CREDITS_REQUIRED`; production payments are
   off; and the route inventory contains no operator/free-credit grant endpoint. Thus merely
   making the provider guard compatible would still leave new users unable to submit AI jobs.
3. **The current AI request is not multimodal and is not grounded in the actual scan.**
   `buildRequest()` in `packages/domain/src/design/provider.ts` converts references to only
   `{id,note,tags}`. It sends manual-room geometry, but for GLB it sends only `surfaceIds`.
   `JobsCard` explicitly says images and scans are not transmitted. Photos, Pinterest pixels,
   GLB vertices, camera views and textures never reach Gemini.
4. **Automatic product discovery and commerce data are absent.** Public product creation in
   `createProcurementHandlers()` accepts only `source:'manual'`.
   `ManualCatalogueProvider.resolve()` validates two fixed retailer URLs and deliberately makes
   no fetch. Refresh returns `manualRequired:true`; there is no current API/scraper result,
   current price/stock fetch, delivery quote, lead time or automatic alternative search.
5. **The plan importer is a dimension-label picker, not plan understanding.** Tesseract extracts
   number candidates, after which the user selects length/width/optional height and manually
   enters openings. `DrawingImport` states that one rectangular room is supported and that
   complex shapes/whole-apartment plans are not. No walls, doors, furniture or room topology are
   inferred.

## Capability matrix

| Desired capability | Status | Concrete source/evidence | User consequence |
| --- | --- | --- | --- |
| Registration, login, private projects and dashboard | **works** | `AuthService.register/login`, `PgAuthStore`, `authHandler`, `projectsHandler`, `Dashboard`; retained current-journey evidence in `docs/public-release.md` covers registration and the main journey | A homeowner can create an account, return to private projects and see project status. |
| Manual measured room and openings | **partial** | `createManualShell` / `SpacePanel` validate exact dimensions and openings, but the UI and domain model are a single rectangle with four named walls | A normal rectangular room works; irregular rooms, multiple rooms and a whole dwelling must be reduced to separate rectangles or cannot be represented. |
| Drawing OCR | **partial** | `recognizeDrawing`, `extractDrawingDimensions`, `DrawingImport`; retained final image evidence has 30/30 synthetic import checks and a real native OCR invocation | Printed numbers can avoid retyping, but the user must identify which numbers are room dimensions and add height/openings. It does not reconstruct the plan. |
| OCR accuracy on real customer plans | **untested** | `docs/public-release.md` explicitly says the proof uses a synthetic drawing and does not establish accuracy on a customer plan | Success on noisy scans, varied fonts, dense apartment drawings and photographed paper is unknown. |
| Scaniverse/GLB upload, calibration and display | **partial** | `asset-parser`, `calibrateGlb`, `SpacePanel` GLB anchors, `BabylonRoom.loadGlb`; only self-contained GLB is accepted | A user can view and uniformly scale a GLB, but OBJ/FBX/splats are rejected and wall semantics, floor plan and reliable surface areas are not derived. |
| Accuracy on actual Scaniverse exports | **untested** | Retained evidence identifies synthetic GLB coverage and explicitly says real Scaniverse accuracy was not measured | Scale, material/surface mapping and usability of real user scans remain unknown. |
| Reference board with images and URLs | **partial** | `ReferencesPanel`, `validateReference`, `createSpaceRepository().createReference()` store an uploaded image or HTTPS URL plus manual note/tags | The user can collect references, but the product does not explain their visual content or turn a board into extracted design attributes. |
| Pinterest import and multimodal interpretation | **not implemented** | `ReferencesPanel` says automatic Pinterest import is not connected and URLs are stored without download; `buildRequest()` sends only note/tags | Pinterest boards and uploaded images are not visually interpreted. The user must describe every useful detail in text. |
| Gemini/OpenRouter declarative scene generation | **config-disabled** | `createOpenRouter`, `PgJobs`, worker lifecycle and strict scene schema exist; production remains manual. The observed remote key control is incompatible with `verifyBudget()` as described above | No production user can request a Gemini proposal now. |
| Gemini scene quality on actual plans/scans/photos | **untested** | No authorized live inference result exists. The request contract cannot send image pixels or GLB geometry | There is no evidence that the selected model produces a useful room proposal for the intended input. |
| Grounding a generated scene in actual GLB/photo geometry | **not implemented** | For GLB, `buildRequest()` sends only `surfaceIds`; `validateScene()` marks all GLB fits `unconfirmed`; room photos are never part of the provider body | A generated object can be positioned without collision or containment proof against the scanned room; photos cannot guide the result. |
| Automatic furniture recommendation | **not implemented** | `SCENE_JSON_SCHEMA` lets AI select only `catalogId` values already present. `CatalogForm` requires the user to create box/cylinder items with dimensions first | The product cannot propose suitable real furniture from a room/reference, discover it in shops or populate a catalog automatically. |
| Manual 3D fallback | **works** | `DesignPanel`, `CatalogForm`, `validateScene`, `BabylonRoom` and `RoomPlan` support palettes, measured box/cylinder objects, numeric XYZ/rotation, versions and approval | The homeowner can create a real, saved manual scene. Interaction is form-based and limited to primitives rather than arbitrary furniture meshes. |
| Collision/fit checking in manual rectangular rooms | **works** | `validateScene()` checks room bounds, opening clearance and object AABB collisions; retained design tests cover rotated boxes/collisions | Measured primitives get a useful preliminary fit check. It is still not an engineering guarantee. |
| Collision/fit checking on GLB scans | **not implemented** | `validateScene()` returns `fit:'unconfirmed'` immediately for `shell.mode==='glb'`; `DesignPanel` discloses that physical collisions are not checked | A scanned-room design may intersect walls or objects without detection. |
| Automatic product API or retailer scraping | **not implemented** | `products` handler rejects non-manual source; `ManualCatalogueProvider` performs no fetch and supports only fixed deep links for Lemana PRO and Dom Lenta | Product name, pack size, dimensions, price and stock must all be copied by hand. |
| Price/stock freshness handling | **partial** | `effectiveFreshness()` enforces a 24-hour region/store timestamp; `ProductsPanel` exposes stale/blocked/unknown; refresh only returns manual instructions | The budget does not silently treat stale data as confirmed, but the app cannot refresh it. A user must revisit the retailer and create/confirm data manually. |
| Product alternatives and savings | **partial** | `ProductsPanel` allows a manually chosen replacement; `PgProcurement.patchLine()` creates a new draft and demands re-approval/recalculation | Manual substitution preserves history and dimensions when supplied, but the product neither finds nor ranks alternatives or calculates discovered savings automatically. |
| Exact packaging and money calculation | **works** | `calculateBudget()` uses Decimal.js, integer minor units, exact `ceil`, unit checks and explicit unknowns; retained procurement tests cover boundaries, overflow and 200 lines | Given correct manual inputs, pack counts and money are reproducible without hidden zeroes. “Exact” remains conditional on complete/fresh source data. |
| Delivery cost and delivery timing | **partial** | `BudgetPanel.CostEditor` supports explicit delivery rows with confirmed/estimate/unknown/excluded status; no product schema or adapter contains delivery quote/date/lead time | Delivery money can be entered and versioned, but the app cannot obtain delivery availability, price or date from a store. |
| Budget phases, limits, deltas and history | **works** | `BudgetPanel`, `calculateBudget()`, immutable `budget_revision`, `delta`, `phaseTotals`, CSV export; retained tests cover reproduction and phase movement | The user can phase purchases, compare a complete scenario to a limit, inspect changes and reopen old budgets. |
| Design revision/approval/review loop | **works** | `DesignPanel`, `PgDesigns.create/approve/restore`, immutable revision history and retained revision tests | Manual variants can be saved, approved and restored as a new draft; downstream recalculation is explicit. |
| Before/after export and private sharing | **works** | `BabylonRoom.capturePair`, `SharingPanel`, export provenance/watermark, expiring hashed-token links and revoke; retained main journey and sharing suites cover create/view/revoke | A user can export the rendered scene and share a seven-day private image link. For a manual room, “before” is the rendered bare shell, not an uploaded room photograph. |
| Billing/checkout and unwatermarked entitlement | **config-disabled** | YooKassa adapter, `BillingService`, checkout/webhook/reconciliation and offline tests exist; `N8_PAYMENTS_MODE=off`, `BillingPanel` displays the disabled state | Users cannot buy credits or unwatermarked export rights in production. |
| Live payment behavior with a real merchant | **untested** | Provider tests are offline fixtures; no live merchant configuration or authorized payment was used | Real redirect, webhook ingress and settlement have no production transaction evidence. |
| Initial/free/operator credit bootstrap | **not implemented** | Account default is zero; registration does not grant credits; only a verified payment increments credits; no grant API/UI exists | With payments off, every newly registered account remains unable to submit a live AI job even if AI mode is enabled. |
| Per-user AI usage visibility | **partial** | `meHandler` returns admissions/reserved/known/unknown and `Dashboard` displays a subset; `usageHandler()` exists but has no route, and there is no `/dashboard/usage` page | Basic usage and uncertainty are visible on the account card, but the planned dedicated history/usage view is absent. |
| Growth measurement | **partial** | `recordGrowth()` records five pseudonymous event kinds; `growthReport()` and `scripts/growth-report.ts` provide a local operator report; no product analytics UI exists | Minimal counts can be queried locally, but there is no operator dashboard, funnel analysis or business validation. |
| Store/affiliate/partner programs | **not implemented** | No partner/affiliate entities or routes exist; `docs/ADR.md` explicitly defers store partnerships and affiliate programs | No referral payout, partner attribution, store feed or partner growth loop is available. |

## What the current user journey really is

The current production product supports this real path:

`account → manual rectangle / OCR-selected dimensions / calibrated GLB → manual reference notes → manual palette and measured primitives → manual retailer snapshots → exact conditional budget → rendered before/after share`.

It does **not** currently support the owner-intended automated path:

`plan/scan interpreted as room geometry + Pinterest/images visually understood → AI design grounded in the actual room → automatic real furniture/material recommendations → current regional price/stock/delivery/alternatives → purchasable AI credits`.

The strongest working parts are the private account/project boundary, immutable revision history,
manual scene editor, exact conditional calculation, explicit unknowns, CSV export and revocable
sharing. The largest missing product value sits between references and a grounded design, and
between that design and automatically sourced real products.

## Evidence limits

- Retained `docs/public-release.md` reports a 21/21 main journey on the predecessor image and
  explains that only the OCR results-focus presentation changed before the current image; the
  current image separately passed 30/30 OCR UI checks. This audit did not repeat either suite.
- Stored unit/integration outputs establish tested source behavior, not current live-provider or
  merchant behavior.
- The current key-control observation comes from the parent run passport/control check. This
  worker did not inspect host environment files or make the provider call.
- Actual model, token usage and cost remain null; no estimate is presented as measurement.

Status: completed
