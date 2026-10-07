# Independent ReviewQR SVG hero review

Run-ID: 20261007-svg-hero-02
Work-Unit-ID: 02-review-a1
Attempt-ID: 02-review-a1
Source-Revision: 732df4cc+heroSHA2566554c9b6e7e5b5e45524e97d8abadcaa059a4a000381a284f55ff82451d4075b
Build-Revision: null
Launch-SHA256: d077fb427d615cd16288cd674cc67a83a326353a4e9c794afa7fb1e3042eeaad
Finished-At: 2026-10-07T21:42:36.404128+00:00
Verdict: PASS

Independent scoped static/source review is complete, with no confirmed blocker, high, medium, or low findings. This verdict covers the frozen SVG and narrow README insertion; it is not an E2E verdict or full feature acceptance.

## Frozen inputs and independence

Read the coordinator-approved planner and frozen artifacts only, plus mandatory repository instructions and directly relevant source proofs. No author chat, implementation receipts, author working notes, or accumulated coordinator history were used.

- Planner origin: coordinator approved source-bound contract; planner SHA256 `833cc25a492b0b03b364d57ee9343979ec56e97092afcea2da32eb087541b1c5` verified.
- Frozen SVG SHA256 `6554c9b6e7e5b5e45524e97d8abadcaa059a4a000381a284f55ff82451d4075b` verified.
- Frozen README SHA256 `7bcb2181015c6665660234a9e355040f49571e5bfec1b77b15121bb038781f64` verified.
- Manifest SHA256 `b2af2b734b543093f45bf2dcf8b79f0e084d21d35f9be946f8747ba6280e777b` and caller launch SHA verified.
- Actual source root HEAD `732df4cccca8cd03bdaa51eaafe49adac23f01ee` matches assigned baseline. Candidate README and SVG bytes still match frozen digests.

## Checked acceptance criteria

1. Product flow: six cards convey owner QR setup → guest scan → guest choice → maps OR private form → Telegram owner. Maps and private-form branch cards both use class `card`, width 217, height 110, radius 18, identical fill/stroke and label styles. No sentiment or rating sorting is depicted. SVG description explicitly distinguishes map transition from review publication. Added copy makes no publication, rating-boost, MAX, savings, or legal claims.
2. Source truth: `apps/guest/src/render.ts` `buildDoors` maps configured Yandex Maps/2GIS links, appends the private door to the same set, and sorts by slug-derived hash; `template` renders one shared door structure. The optional rating lives in the already-selected private-form document. `docs/Architecture-UI.md` documents equal immediately visible door weights. `services/notifier/src/deliver.ts` implements Telegram `sendMessage`; `worker.ts` uses that sender by default. This supports the three new README properties without assuming live message delivery was tested.
3. README: hero image is near the top, linked to existing `docs/demo-script.md`, with descriptive alt text and exactly three added property bullets. Removing the exact insertion reproduces the original source README byte-for-byte. Candidate target asset exists and matches the reviewed frozen SVG. Existing unrelated README statements are preserved, outside this narrow review.
4. Static/security/accessibility: XML parses; all seven IDs are unique; the sole URL reference is local `#arrow`. SVG contains native vector primitives and text, with no scripts, event attributes, external assets, raster images, embedded fonts, base64, or foreignObject. The required namespace is the only HTTP URI. Size is 6,845 bytes. Root `role=img`, meaningful title/description, and `aria-labelledby` are present; decorative paths/markers are hidden from accessibility traversal.
5. Text geometry: existing Cairo with DejaVu Sans regular/bold measured every heading, label, and copy line. All fit inside their card or canvas margins. Closest branch label is “На карты”: right edge 568 against inner limit 592, leaving 24 SVG units. Static font sizes are 19/22/29. Existing `fc-match` resolves system sans-serif to DejaVu Sans. Markers and arrow rails occupy gaps outside text/card content.
6. Static and reduced-motion behavior: all six cards, labels, explanatory copy, and edges exist at frame zero. Reduced-motion CSS applies `animation:none !important` and retains marker visibility at base positions on rails, so the flow remains informative. Light/dark palettes are defined; fixed 640×790 viewBox preserves layout, with root maximum width 100% and height auto. Actual outer IMG scaling at 360px and native reduced-motion rendering require the coordinator's browser evidence.
7. Animation definitions: all five distinct marker groups have the required exact `class=marker`/ID structure, 10-second linear infinite animation, and transform keyframes. Maps animate during 40–65%; private branch during 65–89%; Telegram during 90–98%. Maps move between 5.5 and 5.9 seconds (vertical rail into horizontal rail); private marker moves between 8.0 and 8.4 seconds (vertical rail into horizontal rail). Forward QR marker is visible around 1 second; maps marker is visible around 4.3 seconds. These are verified definitions, not a claim of observed browser movement.

## Checks and limits

All focused Python XML/hash/source-comparison and Cairo text-bound checks exited 0. Initial workspace sandbox initialization failed with bwrap permission denial; subsequent commands used narrowly justified escalation for the authorized read-only review and this sole receipt. No dependencies, source edits, runtime/provider calls, publish, push, PR, or commit actions occurred.

Browser checks are delegated to the coordinator and were not consumed here. Direct SVG / IMG 360/900 light/dark normal/reduced rendering, screenshot marker subtraction, native forced system reduction, negative guard mutation, and integration diff gate must be separately evidenced before full feature acceptance. No E2E claim is made. A build is not applicable to this docs-only asset review.

## Telemetry

Profile: model-routing-econom. Requested model/effort: gpt-6.1-sol / high. Actual model, actual effort, usage counters, and cost: null; host execution/billing metadata are unavailable, so no fallback or savings claim is inferred. Launch-to-receipt elapsed: 165.572 seconds, measured from caller launch timestamp; active time null because no complete interval accounting is available. Telemetry ownership remains with the coordinator; this source-bound receipt and `review-a1-launch.json` are the review evidence.

Status: completed
