# Independent frozen SVG hero review

Run-ID: 20261007-svg-hero-01
Work-Unit-ID: 01-review-a1
Attempt-ID: 01-review-a1
Source-Revision: 732df4cc+immutable-file-SHA256-manifest
Build-Revision: null
Launch-SHA256: 2da61f7e45b81fb64462d8be92664537fe651f75426c5e25266d85e68172aa88
Started-At: 2026-10-07T21:12:16.485566+00:00
Finished-At: 2026-10-07T21:17:35.367944+00:00
Verdict: FAIL

## Scope and provenance

Independent static review of only the approved planner and frozen README.md/product-flow.svg/manifest.json in `/tmp/projects-svg-hero-swarm-20261007/review-01-a1`, plus narrow donor implementation and guide reads. No author notes, author receipt, or accumulated coordinator history were read. Product files were not modified. The approved source-bound planner origin is coordinator approved contract, not an author-written review oracle.

Profile: model-routing-econom. Requested model: gpt-6.1-sol; requested effort: high. Actual model, actual effort, model evidence, fallback and all usage/cost counters: null, because host-authoritative execution metadata/counters were not supplied. Completion time is measured by UTC launch and this receipt; duration 318.9 seconds, within the eight-minute attempt budget.

Checked donor HEAD equals `732df4cccca8cd03bdaa51eaafe49adac23f01ee`. SHA-256 verification succeeded for all frozen inputs:

- Planner: `716a59420b864ab28e4e54f7d21b02d1afc278cf5bb26bd2f3186d09e6ed2302`.
- README: `0b9087a4a6a9df1f3727ee90e5e43fdfc5ca74d5e39eb5647c044cc72b72112c`.
- SVG: `4296d9f4559e095c3c20ffc607170b210ab66ce036d4610d674fe87abb76efdd`.
- Manifest: `bc94fd85d3b047c1f1768ee487d85eb0b1368c99ed125a5d4ddf9d5e4df3e231`.

## Findings

### M01 — fixed standalone SVG size does not satisfy the 360px direct-view acceptance criterion

Evidence: product-flow.svg:1 declares `width="640" height="650"` with `viewBox="0 0 640 650"`; styles at lines 5–25 have no responsive width/max-width or aspect-ratio sizing. The standalone image has an intrinsic viewport of 640px on a 360px browser viewport. Its right-hand outputs are at x395–612, so without scaling they lie outside the mobile viewport. The planner explicitly requires direct SVG and img verification at 360px. The coordinator independently reported direct SVG 360px overflow; that report corroborates this static finding but is not a browser test executed by this reviewer.

Impact: the wall/widget branches are not fully visible on the required mobile direct SVG route. Fix intrinsic/responsive sizing so direct SVG adapts to the available viewport while preserving the viewBox and verify both standalone and img rendering at 360px.

### M02 — declared system font fallback can overflow cards and intersect moving markers

Evidence: the file specifies `system-ui,-apple-system,"Segoe UI",sans-serif` (line 5), with label 22px/700 and copy 19px (lines 9–10). `fc-match system-ui` on this host resolves DejaVu Sans. A read-only Cairo text-extents measurement using DejaVu Sans bold/regular produced:

- Line 47, “Решите, что показать”: ink bounds x84–360, y432–451; its card at line 45 ends x338. Branch markers at lines 22–23 start visibly at (346,455), radius6 plus 1px stroke, which intersects those text bounds under this font.
- Line 52, “Публичная страница”: bounds x416–620, while its card ends x612.
- Line 56, “Блок на вашем сайте”: bounds x416–627, while its card ends x612.

Qualification: this is a font fallback portability defect, not a universal claim about Chromium. The coordinator's independent Chromium bounds were x82–306.7 for the moderation label and right edges602.47/607.81 for the captions, which fit. Those browser results do not remove the declared system-font variation. Use shorter text or line wrapping with enough margin; preserve the planner minimum 19px. Verify the accepted fonts and marker separation after correction.

No high-severity finding identified. Findings are specific to layout; no unsupported product claims were identified.

## Passed static checks

- Python ElementTree parse succeeded; SVG size6144 bytes, below the desired25KB.
- No script, foreignObject, image/raster, base64/data resource, external asset/font, event handler, or JavaScript link was found. No dependencies or app logic were reviewed as changed.
- IDs are unique; arrow URL and aria-labelledby references resolve locally. Title and Russian description explain the full path and the two publication destinations.
- All flow labels, edges and outputs are static. First frame explains send link → collect text → owner approval → wall/widget, without waiting for animation. Reduced-motion CSS sets animation:none for every animated class and keeps all markers/graph visible.
- All animations use a10s cycle; actual coordinate changes are specified, rather than opacity-only pulses. Link/review travel18viewBox px; wall/widget traverse separate branches with successive40–65% and65–98% phases. Branch paths and marker keyframes agree geometrically. Browser coordinate behavior remains a separate gate.
- Declared minimum static font size19px on a640px viewBox matches the planner. At360px scaling this becomes10.69px; subjective mobile readability remains a browser visual gate rather than an asserted pass.
- README image is near the top, has meaningful Russian alt text, links to existing `README/ru/02_user_guide.md`, and is followed by exactly three confirmed property bullets.
- Existing `apps/web/public/brand` donor seam contains tracked SVG icons; the new asset path matches the approved public seam.
- Product claims are source backed: anonymous text intake documented and implemented in `src/lib/testimonial.ts:98` and pending insert:159–160; owner ownership check in `src/lib/moderation.ts:40–48`; allowed pending→approved transition:15; approved-only publication queries in `src/lib/wall.ts:41` and `src/lib/widget-config.ts:88`. Existing Russian user guide confirms all three properties. New hero excludes disabled-default video and makes no numerical quality/speed/revenue/savings claims.

## Commands, limitations, and next step

Executed read-only checks: exact file SHA256 comparison against manifest; ElementTree XML parse; duplicate ID and local reference checks; unsafe-token/resource scan; minimum-font inspection; `git rev-parse HEAD`; source-backed claim searches; `fc-match system-ui`; installed Cairo text-extents measurement. Exit0 for these checks. PIL measurement attempt returned exit1 because PIL is absent; no dependency installed, replaced by installed Cairo measurement.

Default sandbox startup failed with bwrap mkdir permission denial before any command ran. Narrow authorized reads and this atomic receipt write used require_escalated; no external network or publishing action ran.

Not executed by this reviewer: browser direct/img light/dark/reduced-motion screenshots, actual timed coordinate assertions, app build/site mirror, git diff --check, or E2E. These remain coordinator-owned acceptance checks. The coordinator separately reported reduced-motion IMG deltas; this reviewer does not assert an independent reproduction or browser pass from that message. Static reduced-motion intent is correct, while browser IMG behavior still needs resolution before delivery.

Review completion is distinct from acceptance. Next responsible actor: coordinator assigns scoped author correction for standalone mobile sizing and resolves measured font fallback fit plus browser IMG reduced-motion behavior; then repeats affected mandatory checks against a new immutable revision. This receipt authorizes no publication, push, PR or release.

Status: completed
