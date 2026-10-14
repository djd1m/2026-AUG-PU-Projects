# Independent UI/UX and anti-drift review — dimensioned drawing import

Run ID: 20261014T080942Z-plan-import-8984
Work unit ID: plan-import-ui-review-1
Attempt ID: ui-review-1
Source revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4; reviewed untracked source is bound by the SHA-256 snapshot below and by evidence/source-image-1.json
Build revision: sha256:6a9d07f999b0188caae0afb67994ccbc2524f972ff7752284289a6f3a191b131
Launch record: plan-import-ui-review-1-launch.json
Launch-SHA256: 25b186c1628c98c9ec21b2d09e643e93db1297d3cdd2c72cceee7f20c39a1e81
Launched-At: 2026-10-14T09:01:39.553786+00:00
Finished-At: 2026-10-14T09:05:49.788Z
Duration from formal launch: 250.234 seconds
Actual model: null (authoritative execution metadata unavailable)
Usage/cost: null (host counters and billing attribution unavailable)
Verdict: NEEDS_CHANGES — the main import/confirm/reload flow is coherent, but one mandatory browser-evidence gap and two concrete mobile clarity defects remain

Scope was limited to AC-P01 through AC-P06 in `docs/features/floorplan-import/01_specification.md`, the current `DrawingImport.tsx` / `SpacePanel.tsx` / relevant CSS, `scripts/floorplan-e2e.mjs`, and the actual `drawing-journey-2` result and six mobile screenshots. No product files were changed, no browser run was repeated, and no network, installation, container start, publication, or external write was performed.

## Confirmed behavior

- The initial copy directly says that printed numbers can be selected without retyping, furniture is optional, absent height/openings need separate input, and whole-apartment/complex shapes are outside the current one-rectangle scope.
- The source image, numbered boxes, raw OCR text and converted metre values are present. Length and width remain user-selected; nothing is auto-assigned.
- Applying the draft clears old openings and confirmation, leaves absent height blank, and focuses the required manual height field. Applying printed height fills all three existing editable inputs. Saving still requires the existing explicit confirmation.
- The persisted measured plan identifies a drawing-backed source and exposes an owner-only source link after reload. Empty recognition preserves the prior plan and explains the manual alternative.
- `drawing-journey-2/result.json` is a real three-engine pass with 27 recorded checks, zero Axe findings, zero page errors and zero unexpected outbound requests. It is bound to the stated build revision and honestly limits accuracy to the synthetic native-OCR fixture.

## Findings

### UI-P01 — MEDIUM — AC-P06 feature-specific keyboard evidence is not present

`scripts/floorplan-e2e.mjs` does not issue any keyboard input. Import controls are exercised with `click`, `selectOption`, `fill`, `check` and `setInputFiles`. The assertion that the height input becomes `document.activeElement` after clicking “Перенести размеры в обмеры” proves the deliberate missing-height focus transfer, but it does not prove that the importer can be traversed and activated with the keyboard. The separate compatibility journey presses Tab once on an already measured room page and does not exercise the importer.

The 27-check result therefore supports mobile overflow, Axe and focus destination, but it is insufficient evidence for the explicit feature-level `keyboard` clause in AC-P06. A narrow keyboard-only traversal/activation assertion in the existing feature runner is enough; a new broad journey is unnecessary.

### UI-P02 — MEDIUM — numbered source annotations are too small at 390 px

The overlay uses a 1000-unit viewBox and `.drawing-preview text { font: bold 28px Arial; }`. On the roughly 308 px-wide drawing in the 390 px viewport this produces labels around 8.6 CSS pixels. In all three recognized-mobile screenshots, `№1`, `№2`, and `№3` are barely readable and visually crowd the printed dimensions. The selectors themselves are clear, but the central source-to-option cross-reference required for user review is weak.

Increase the overlay label size/stroke or render compact screen-sized labels so each number remains legible on the accepted 390 px viewport. This is a small styling correction, not a redesign.

### UI-P03 — LOW — persisted source label and link are concatenated

`SpacePanel.tsx` renders the muted confirmation `<span>` immediately followed by the source `<a>` with no separator or block layout. All three confirmed-mobile screenshots visibly read `Основа подтверждена владельцемПосмотреть чертёж-источник`. Give the source link its own line or explicit spacing so provenance is easy to scan.

### UI-P04 — LOW — the uploaded drawing is relabelled as a room photo

The import upload reuses `room_photo`, and the “Исходные файлы” list subsequently labels the actual dimensioned drawing as `Фото комнаты`. The upload control already says `Фото комнаты или чертёж`; reusing that wording in the asset list would avoid misleading users who want to find or reuse their drawing. This does not affect persistence or privacy.

## Anti-drift assessment

No UI copy or behavior claims automatic walls, doors, furniture, irregular geometry, a whole apartment, paid OCR, or real-customer drawing accuracy. The feature remains an explicitly reviewed one-room rectangular approximation feeding the existing manual form. The findings above are bounded to evidence completeness and mobile/source clarity; they do not justify a larger UI or data-model change.

Source and evidence SHA-256 snapshot:

```text
04401c923164ceaf3f223f3f9f6ea06bb8bf8a73b5404bf3b044c6802b549bad  apps/web/src/components/DrawingImport.tsx
c5c8f28e299507f00ff9af144c5bdb0bfa95ce0f39380322589d6a8b6faca0a1  apps/web/src/components/SpacePanel.tsx
030a169348d0ad6020fda4437866f193950d0176cb8b20fb667b1b5469f1dfe8  apps/web/src/app/globals.css
4c2da55da663b6ddd79f83d3bcbda8f5f23062479e83d4967321fe586c32bc15  scripts/floorplan-e2e.mjs
f7103359f11597b030e3ad4096dab6b979ea9aba99ca42d9afbc148e898ac558  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-2/result.json
948d2727b5554b8fd5fa1b5cf412bc394220e4e669bd0b058508253705d40743  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-2/chromium-confirmed-mobile.png
97270baa172f4ba0984f212ca09061466ee776b4e3d073b7e03e045facab048c  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-2/chromium-recognized-mobile.png
4cd25155347c9a02b325a8cc90addbd773ed38fa316c87da058439ee55ffdc6e  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-2/firefox-confirmed-mobile.png
ec34952233ebf37005f6c65835deb40c85e1d4f597080173cdda60cff57a9120  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-2/firefox-recognized-mobile.png
c3a0811ad771d55c683c82164c6e7cfa4542a9816628138488ccdfde6e4f246a  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-2/webkit-confirmed-mobile.png
d3f8ce246514bdbfd5e3184e5922753c1031a3944512a1dc2a360c8717760f3a  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-2/webkit-recognized-mobile.png
```

Status: completed
