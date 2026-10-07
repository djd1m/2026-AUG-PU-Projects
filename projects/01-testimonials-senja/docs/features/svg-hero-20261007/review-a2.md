# Project 01 SVG hero — independent static review a2

Run-ID: 20261007-svg-hero-01
Work-Unit-ID: 01-review-a2
Attempt-ID: 01-review-a2
Source-Revision: 732df4cc+heroSHA25699a07d2431b5bb7c942171320b12b0e0b305904e218072b5c659b3cce652b497
Build-Revision: null
Launch-SHA256: 6a3a2d7c684d304e937ac203753208952fed06c3eb38913fccb600b11c7e1506
Finished-At: 2026-10-07T21:28:53.501173+00:00
Verdict: PASS
Verdict-Scope: frozen SVG/README static semantic, XML, font-width and geometry review; not overall browser/E2E acceptance.

## Inputs and independence

Only the approved planner and frozen candidate package at `/tmp/projects-svg-hero-swarm-20261007/review-01-a2/` were used as implementation inputs. Root source at `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects` was read-only; observed HEAD `732df4cccca8cd03bdaa51eaafe49adac23f01ee`. Root/project CLAUDE, applicable local risk/model/evidence/project rules and project-work-companion delivery instructions were read. No author receipts, chat, working notes or coordinator accumulated history were read. The coordinator separately supplied the actual browser-a2 report during review; its limitations are preserved below.

Planner provenance: coordinator approved source-bound contract v3; SHA256 `bb701a120c6014acb408f8fea11917e0039a139112dedb97c41915d3c50d2343`.
Frozen SVG SHA256: `99a07d2431b5bb7c942171320b12b0e0b305904e218072b5c659b3cce652b497`.
Frozen README SHA256: `0b9087a4a6a9df1f3727ee90e5e43fdfc5ca74d5e39eb5647c044cc72b72112c`.
All three hashes match the frozen manifest; launch hash also matches the independently assigned expected digest.

## Findings

No confirmed defect in the static presentation scope.

- Flow and claims: all five steps and all four edges are always visible. The static first frame explains send link → text review → owner approval → public wall and widget, without dependence on moving markers. Root guide `README/ru/02_user_guide.md` lines 21 and 51 confirms no client account and approved publication to both destinations; moderation route allows approved status. SVG and new README properties avoid video, savings, revenue, speed and quality claims. Existing README prose below the hero still discusses the broader historical product; it is outside the new hero claims.
- XML/accessibility/security: ElementTree parses the 6,174-byte SVG; IDs are unique and title/description/ARIA plus local marker references resolve. `role="img"`, Russian title/description and `aria-labelledby` are present. No script, event handlers, foreignObject, image/raster/base64, external fonts/resources or SMIL were found. The namespace URI is an XML namespace, not a fetched resource.
- Responsiveness: root CSS explicitly uses `max-width:100%` and `height:auto`; viewBox is `0 0 640 650`. At width 360 its proportional height is 365.625. Labels use 22px, copy 19px; corresponding scaled sizes are 12.375px and 10.6875px. Actual device readability is part of the coordinator's browser visual gate.
- Text fit: installed `fc-match system-ui` and `fc-match DejaVu Sans` both resolve to DejaVu Sans. Installed Pango measured DejaVu Sans regular/bold at the SVG's absolute pixel sizes. Every label/copy fits horizontally; smallest card margin is 12px for “Страница отзывов” (right edge 600 against card edge 612). “Отправьте ссылку” ends at 315 against card edge 338, leaving 23px. Vertical baselines and group spacing keep text inside cards and number badges separate from labels. The initial optional Pillow measurement command exited 1 because Pillow is unavailable; no install was attempted. Pango provided the successful font measurement, exit 0.
- Marker/text geometry: radius 6 plus 1px stroke half-width gives a conservative radius 7. Link envelope y235..267 stays between card edges230/270; review y375..407 between370/410. Branch horizontal envelopes x339..393 stay between card edges338/395. Branch vertical envelope x361..375 clears cards and footer text, whose widest DejaVu line ends at271. All keyframe segments preserve this separation.
- Animation: common CSS duration10s, linear, infinite; link phase0–19%, review20–39%, wall40–64%, widget65–97% with actual coordinate changes within both branches. Static base transforms put all reduced-motion markers on their corresponding edges. Reduced-motion rule is `.marker { animation:none !important; opacity:1; }`; no other animation mechanism exists, and graph/text are preserved. Light/dark tokens are local CSS variables.
- README: image link is near top on line6 with meaningful Russian alt, links the existing `README/ru/02_user_guide.md`, and is followed by exactly three concise source-confirmed property bullets. Existing guide target is a regular file.

Digest/XML/README in-memory verification command exited0. Pango text/geometry check exited0. No source edits, dependency changes, installs, publication, push, PR or commit were performed. Default shell sandbox initialization failed (`bwrap` cannot create `.codex`); only the authorized narrow escalated reads and this receipt write were used.

## Browser evidence and remaining gate

Read `/tmp/projects-svg-hero-worktree-20261007/projects/01-testimonials-senja/docs/features/svg-hero-20261007/browser-a2/report.json`, SHA256 `7081509bb2232dc37de5b13dd030b9c3a58d2eb177b37fd506f9f73794a112c0`, sourceSHA256 matching this candidate. The report aggregate is **false**, not accepted as an E2E pass.

Normal IMG cases pass4/4 (light/dark ×360/900), actual marker centroid movement151.895–379.599px; measured same-branch wall movement12.679px and widget30.5px. Native forced reduced-motion RAW IMG cases pass4/4 with zero changed PNG pixels. DevTools-emulated RAW IMG reduced cases still fail4/4 and are retained as a distinct emulation diagnostic, not relabelled as passes. Direct SVG samples before the runner error show width360, height365.625, no text/card/viewport or marker/text overlaps. All8 direct cases nevertheless end in `page.addStyleTag` failure because the SVG document has no HTML head/body; runner repair and direct retest remain the coordinator's required pending work. No overall browser or GitHub rendering acceptance is claimed here.

Project-work-companion preflight: not_applicable to this static review; this worker did not launch browser E2E. The existing run's telemetry and mandatory gate aggregation remain coordinator-owned.

## Model and telemetry

Profile: model-routing-econom.
Requested-model: gpt-6.1-sol; requested-effort: high.
Actual-model: null; actual-effort: null; host authoritative model metadata was not provided.
Measured-input/cached/output/reasoning-tokens: null; measured-cost: null; cost-basis: unavailable.
Elapsed-wall-ms since assigned launch: 204443; active-wall-ms: null (separate wait intervals unavailable).
Budget: 8 minutes for this bounded independent attempt. No child agents, model switch or speculative improvements.
Telemetry pointer: coordinator-owned project run 20261007-svg-hero-01; this receipt is work-unit evidence, not a replacement historical telemetry record. Savings are not established.

Status: completed
