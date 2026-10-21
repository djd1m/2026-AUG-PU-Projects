# N8 HTML CJM author receipt

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `html`
- Attempt: `html-1`
- Baseline/source revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`
- Finished at: `2026-10-13T20:49:02Z`
- Scope: three offline interactive HTML CJM candidates and a comparison index; no product application, PRD, deployment, authentication, external write, or paid API call.
- Recommended candidate: **A — «От комнаты к решению»**, because its ordered measured-space → reference → visualization → approval → products → budget → revision flow is closest to the owner's canonical gist. B preserves the same core and moves the cap forward; C adds procurement phases after the full design/list/budget.

## Artifacts and build identity

| Artifact | SHA-256 | Lines |
|---|---|---:|
| `docs/discovery/cjm-a.html` | `5f954a28e8599bca767a1505536852d0f751ce3b2d3e4005ecd2ac955f7eab40` | 365 |
| `docs/discovery/cjm-b.html` | `e063243737572b90a472229fd1e7b0477b861d1b4a994ac45098f3a1bbadca5a` | 365 |
| `docs/discovery/cjm-c.html` | `17d66f6bc914d7dc0673aff9645e6aacb62a58bc0cae9fa12463fa18fb4cdb6b` | 365 |
| `docs/discovery/index.html` | `c311ffde3885659a798827a7bb60fef39994a763b99b24961c882c2dafe84e9d` | 29 |
| `docs/discovery/src/prototype.js` | `0097b590f82fc5e93145527956afe3c2152ca126479dfee430c1d1bedeb32d41` | 173 |
| `docs/discovery/src/prototype.css` | `d658f11c6f906f869a550c40b57b6f525179c9c2707253ab13a3f126f39832bb` | 165 |
| `docs/discovery/src/variants.js` | `93045b22366032b2856c2e363680b3280d7883946a84ad6ab636506b5fed10f8` | 5 |
| `scripts/build-cjm.cjs` | `fd6321c485dbd9526fb10e9ead8a6d21da74ce6a1254ee281506fa797a82710c` | 73 |

The builder embeds local CSS, configuration, and JavaScript into each final file. The final HTML has no font, image, CDN, module, or fetch dependency and opens over `file://`.

## Routing, model, duration, and usage

- Mechanical complexity route on the exact eight implementation/build artifacts: tier `S`, exit `0`; the route explicitly identifies itself as a lower bound. Substantive treatment kept the owner-approved 16-AC discovery contract and required focused interaction/mutation checks.
- Execution model available to the agent through system identity: `GPT-6`. No immutable provider execution metadata or fallback event was exposed, so provider model ID and fallback evidence are `null`.
- Token usage and model cost: `null` because the host did not expose counters. External paid API spend: `0`; no external API call was made.
- Measurable wall window from the RUN_ID timestamp to the terminal hash capture: `28m53s`. It includes the wider run clock and is not an isolated per-agent CPU or billing duration.
- `dz recall "interactive CJM HTML offline prototype accessibility validation" --project /home/2026-AUG-PU-Projects --json --limit 5` returned an empty set; no recalled pattern was presented as evidence.

## Reuse provenance

The mandatory local N1–N7 and follow-up GitHub search is recorded in `docs/research/reuse-inventory.md`. The implementation used no new dependency and adapted these concrete donor patterns:

- N6 `projects/06-rag-sales-chatbase/docs/discovery/cjm-prototype.html`: `state`, `path()`, `go()`, `jumpTo()`, and `renderKey()` informed one persistent state object, bounded stage navigation, and render/bind separation. Its `data-j` + `aria-current="step"` dot navigation informed stable `data-step="0"…"9"` controls. Its `answer()` method's `textContent` use informed safe display of user-derived names/notes.
- N5a `projects/05a-podcast-clips-opus/docs/CJM_Variants.html`: `render()`, delegated `[data-action]` handling, `message()`, native tab/step semantics, `:focus-visible`, and 390 px layout informed the accessible interaction shell. The new prototypes retain separate candidate files instead of copying N5a's mixed-variant product domain.
- GitHub candidates from the inventory: `mrdoob/three.js` and `google/model-viewer` remain future 3D candidates; neither is loaded because these files only depict a marked SVG state. Microsoft Playwright was used from `/tmp/n8-check-tools` for checks, not added as a project dependency. The wizard search found no more suitable generic replacement.

## Acceptance evidence

| AC | Result and observation |
|---|---|
| CJM-01 | Pass: each file exposes ten `data-step` buttons and S0–S9 at desktop and 390 px; back/next and direct review work. |
| CJM-02 | Pass: plan/mesh/splat choices work; negative dimensions produce a readable error; splat is explicitly rejected as a size basis. |
| CJM-03 | Pass: finite positive demo dimensions confirm the user-entered contour, update area, and expose plan/isometric SVG views. |
| CJM-04 | Pass: S4 remains inspectable without confirmation and labels the AI view as an unverified image rather than purchase-ready geometry. |
| CJM-05 | Pass: Pinterest example source is retained; the denied-access toggle gives an own-image fallback and does not claim the pin is absent. |
| CJM-06 | Pass: style/design/view/before-after state persists; approval history and the return-to-reference action work. |
| CJM-07 | Pass: SKU 89433614, official link, source date, region, unit, demo price, unknown stock, and alternative are visible. |
| CJM-08 | Pass: default formula yields `10` packs and `16 000 ₽`; changing inputs recalculates; invalid/NaN/range mutations are rejected. |
| CJM-09 | Pass: blank delivery/labor and unselected furniture remain unknown; the heading stays “Известная часть бюджета”; B does not claim success. |
| CJM-10 | Pass: demo out-of-stock → accepted substitute creates a new version, changes the floor line, invalidates approval, and retains history. |
| CJM-11 | Pass: B cap mutation shows known-part deficit/room plus uncertainty; C phase transfer keeps the same known total. |
| CJM-12 | Pass: export preview/download, tariff open/close, and private preview/revoke work locally; measurements default off and no message is sent. |
| CJM-13 | Pass: post-approval dimension change marks fit/approval stale on products, propagates the new area, and requires re-verification. |
| CJM-14 | Pass: native keyboard activation works, visible focus styling is present, and the 390 px smoke traversed all files without clipping the core controls. |
| CJM-15 | Pass: “Мне подходит этот вариант” changes only local in-memory copy and explains the approval boundary. A remains the recorded recommendation for the coordinator. |
| CJM-16 | Pass: region change marks price/stock stale and preserves the previous amount explicitly as a snapshot until re-check. |

## Checks run

1. `node --check` for `prototype.js`, `variants.js`, and `build-cjm.cjs`; all exit `0`.
2. `node projects/08-interior-ai-redesign/scripts/build-cjm.cjs`; exit `0`, producing all four HTML artifacts.
3. Playwright/Chromium offline smoke over `file://` for A/B/C at 390×844; all ten stages, invalid/valid geometry, canonical 10-pack calculation, export preview, B budget dock, and C phases passed with no page errors.
4. Focused interaction/mutation run: malicious-looking local filename and design note remained text, splat gate failed as intended, Pinterest fallback, approval, stale fit, propagated area, region snapshot, revision history, paywall/share, local selection, B deficit, and C transfer all passed.
5. Desktop screenshots of A/S4, B/S0, and C/S7 were visually inspected for hierarchy, readable labels, and distinct interactions.
6. `git diff --check -- projects/08-interior-ai-redesign`; exit `0`.

## Stable browser selectors

- Common stages: `[data-step="0"]` through `[data-step="9"]`
- Geometry: `[data-testid="verify-dimensions"]`, `[data-testid="geometry-status"]`, `[data-testid="area-label"]`, `#measureError`
- Visualization: `[data-testid="room-visual"]`, `[data-action="view"][data-view="concept|plan|iso"]`, `[data-action="before"]`
- Approval/staleness: `[data-testid="approve-design"]`, `[data-testid="stale-fit"]`, `#historyList`
- Budget: `[data-testid="pack-count"]`; B: `[data-testid="budget-dock"]`; C: `#phaseMove`, `.phases`
- Export/choice: `[data-testid="export-preview"]`, `[data-testid="select-prototype"]`

## Remaining limitations

These are journey prototypes, not product proof. SVG rooms do not import or validate 3D; user confirmations are demo state; prices and stock are not live; the two sampled retailer paths returned 401 in ordinary Playwright; delivery, labor, furniture dimensions, and unmatched items remain unknown; Gemini candidates were not evaluated; export is a local text blob; paywall and sharing have no payment, account, authorization, or delivery. Retail partnerships remain deferred. No claim is made that A, B, or C is implemented as an application.

Verdict: all 16 HTML-CJM acceptance scenarios have a working prototype path and focused evidence; A is the recommended closest-to-gist candidate for the coordinator's owner-selected downstream pipeline.

Status: completed
