# Public journey read-only audit

- Run-ID: `20261014T165824Z-gemini-live-audit-bc87`
- Work-Unit-ID: `public-journey-audit`
- Attempt-ID: `audit-1`
- Source-Revision: `47c4e6fb3f1e336822f97af227a1e5f905925b28`
- Deployed-Application-Revision: `ffcdfb7a` (later commits through Source-Revision change docs, telemetry, README, and `.env.example` only)
- Build-Revision: `sha256:181590da9bf545d69fb927e56abb5da50f52f5ead7bd3d0fdcca8a45d90058ee`
- Launch-SHA256: `6054a2589b5e41f9603691922d61e83e48c6651b3dfee002eb21bfd44d58e071`
- Finished-At: `2026-10-14T17:04:04.762Z`
- Duration-From-Launch: `313.293 seconds`
- Profile: `bounded read-only public Chromium journey audit`
- Actual-Model: `null` (execution metadata was not exposed to this worker)
- Actual-Usage: `null` (token metadata was not exposed to this worker)
- Actual-Cost: `null` (usage and model billing metadata were unavailable)
- Budget: `15 minutes`; completed within the allocation
- Verdict: `passed_with_observation`

The public HTTPS origin returned ready and the live web container image ID exactly matched the expected Build-Revision. The root port guard passed before the browser container. The final browser run exited `0` in 10.678 seconds using Chromium from `n8-interior-playwright:local` (`sha256:c16f3fc40392fc765ded5583538f398a47d55aaab348a6a078abab27a061ed41`). The exact private synthetic fixture was mounted read-only; no database or provider environment was supplied.

| Area | Result | Actual observation |
|---|---|---|
| Login and dashboard | observed works | Synthetic login succeeded; account capabilities rendered; the dashboard explicitly says AI is in manual mode, payments are off, and manual plan/design/budget remain available. |
| 01 Обмеры | observed works | Drawing import, measured plan, private file upload, manual/GLB modes, dimensions, and openings rendered. Existing controls reflected fixture state. |
| 02 Референсы | observed works | Reference board and link/image entry rendered. The synthetic escaped-script string appeared as text, not executable content. |
| 03 Дизайн | observed works | Current approved manual design, same-camera before/after view, plan, palette, measured items, and history rendered. The helper states that only manual design is currently available. |
| 04 Покупки | observed works | Product selections, saved verified price, quantity inputs, and manual snapshot entry rendered. |
| 05 Смета | observed works | Saved total `19 250,00 ₽`, `750,00 ₽` remaining against the limit, explicit reserve, formula, phases, unknown-history entry, and CSV action rendered. |
| 06 До / после | observed works | Approved manual design, prepared watermarked image, and revoked link history rendered. New export/share actions remained gated by the rights and selection state. |
| Account usage | observed works | `aiMode=manual`, `paymentsMode=off`, credits available/held `0/0`, admissions today/limit `0/5`, reserved/known micro-USD `0/0`, unknown outcomes `0`, and account/job monetary caps `null`. |
| Billing | config blocked | Billing page says payment is disabled and manual capabilities plus watermarked export remain available; no checkout buttons and no payment history were present. This matches configuration, not a functional defect. |
| Automatic AI design | config blocked | Live AI submission is absent in `manual` mode; the UI provides manual design. No job POST or paid provider call was made. |
| Pinterest and store automation | config blocked | UI explicitly says automatic Pinterest import is not connected and store-front reading is blocked; manual link/image and manual verified product entry are available. These are disclosed missing automatic features, not newly observed breakage. |
| Design-view analytics | partial | Opening the Design tab automatically attempted `POST /api/projects/.../designs/.../view`, which source binds to the `first_design_viewed` growth event. The audit route blocked it before the server. This did not break the visible journey, but the tab is not intrinsically read-only. |
| User-facing failures | none observed | Six tabs selected successfully, billing and dashboard loaded, no unexpected outbound requests occurred, and no unexpected browser errors remained. |

The only server-side POST that completed was `/api/auth/login`, creating the permitted synthetic session. The final trace contains 20 successful GET responses, zero forbidden mutations, zero unexpected outbound requests, and one blocked automatic design-view analytics POST. No project, design, budget, share, credit, order, growth event, or AI job was created or changed by this audit.

Evidence:

- Final sanitized result: `docs/telemetry/p-replicator/20261014T165824Z-gemini-live-audit-bc87/evidence/public-journey-audit/result.json` (`sha256:d4967ca5a2ab106535fe2e7eb6121b5e08a8c190ea2f4d71363e20adc961f67b`)
- Final preflight: `docs/telemetry/p-replicator/20261014T165824Z-gemini-live-audit-bc87/evidence/public-journey-audit/preflight-retry-2.json` (`sha256:874d7c48ac0ec7739120f27dc1dc35983833e99332685046253c6b8b1c1c3dd2`)
- Read-only driver: `docs/telemetry/p-replicator/20261014T165824Z-gemini-live-audit-bc87/evidence/public-journey-audit/read-only-public-audit.mjs` (`sha256:76ebd8575d911472432bec50cf299d56c09701fd6ac610284506a08f4675c56a`)
- Screenshots: `dashboard.png`, `tab-01.png` through `tab-06.png`, and `billing.png` in the same evidence directory.
- Preserved discovery trace: `blocked-automatic-analytics-observation.json` records the first protected pass that surfaced the design-view POST before the final classified run.

Limits: this was one Chromium desktop audit of visible availability and fixture state. It does not repeat the prior three-engine regression and does not prove every business mutation. Live AI, payments, automatic Pinterest import, and automated store reading were not exercised because they are unavailable in the deployed configuration and paid/provider calls were outside scope.

Status: completed
