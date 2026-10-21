# Semantic reference delivery

Implemented: four independent role colours/evidence, owned image thumbnails in existing durable jobs, strict role response mapped onto frozen scene, GLB geometric submeshes with original unknown materials, manual switch, asynchronous UI, preserved paid retry identity and replay-first lookup. No migration/new dependency. Legacy scenes remain valid.

Evidence root: `docs/telemetry/p-replicator/20261014T203111Z-semantic-reference/evidence/`.
- Full regression: 285 passed, 1 failed constructor-bypass fixture; fixed fixture and final affected10/10 pass (`tests.txt`, `targeted.txt`).
- Strict schema mutation killed (`mutation.txt`); author geometry wall mutation killed (`geometry-author.md`).
- Final Docker build includes typecheck/Next build, exit0 (`build-final.txt`); final lint exit0.
- Independent plan/code review plus concrete retry-fix closure passed. No renderer blocker.
- Public Docker Playwright browser2 passed five checks; screenshots after/before and literal3colour pixel counts retained. Browser1 failed before execution due mounted script permissions, no app writes.
- Exact deployed source hashes in preflight-browser-2.json; image sha256:4b9deb07adb3372d3ac78fa35ba6dde87014ac30b0fd62567516a3e67ff4ed49. DB container identity/start time unchanged, only web/worker recreated.

Limits: paid model-quality smoke NOT RUN (no eligible funded QA account; owner sole credit preserved, no grants). Real key limit GET passed; no paid inference cost. Offline model fixture does not establish real-image interpretation accuracy. GLB grouping geometric/approximate, most of owner's noisy scan remains unknown, not exact instance segmentation; textures/patterns not transferred. Provider config rates expire after24hours under existing policy. Existing paid caps unchanged.

Decisions and anti-drift: `docs/decision-log.md`, DRIFT-SEMANTIC-REFERENCE. Profile compact-quality-first-v2, tierL by service/provider risk despite mechanical S lower bound; executor actual model/usage unavailable. Geometry renderer requested Astra high, actualunknown; review inherited session actualunknown. Detailed timing/measurement gaps in run.json. No global model/hook settings changed.
