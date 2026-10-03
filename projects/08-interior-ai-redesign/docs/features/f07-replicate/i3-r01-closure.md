# I3-R01 closure

Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Source: b18f3d1e08f1f79ea87260b47f76b108317fc458
Verdict: CLOSED

Only original I3-R01 ([i3-review.md](i3-review.md), lines17–37) was reviewed against baseline `e7c8bf5a10212189f128a7126eb11b97fd42eb0e`. No remaining defect was established in this bounded correction; all other previously accepted I3 contracts retain their prior assessment.

`web/replicate-media.js:28–46` walks actual PNG chunk boundaries before Sharp. The existing10MiB cap bounds work; each iteration requires a12-byte envelope, checks the unsigned payload length against remaining bytes, and advances by length+12. It rejects acTL/fcTL/fdAT, including one-frame/stray animation chunks, and fails closed on truncated bounds or missing/nonempty IEND. It does not scan compressed payloads. Input preparation uses this guard at line60; provider normalization at line242. Import awaits depth normalization at line282 before downloading output at line283; artifact creation begins only at line291.

`tests/replicate-media.test.js:97–116` constructs CRC-correct512×512 two-frame APNG with properly sequenced fcTL/IDAT/fdAT, filter-zero RGB rows and separate zlib frame payloads. Lines118–132 assert the original4061-byte fixture hash `031839f815d9d497abec27a167b236c92816a8ceb6aac41303b387e364d154f5`, Sharp's missing-pages behavior, safe input/provider rejection, exactly one delivery request and empty output/depth/config directories. Lines133–161 cover malformed bounds/animation and successful static PNG with all three animation names inside compressed pixels.

Saved evidence in [checks](../../telemetry/n8-20261002-1740/replicate-i3-r01-checks.json), [snapshot](../../telemetry/n8-20261002-1740/replicate-i3-r01-snapshot.json) and the three referenced logs confirms baseline2/2 RED (`Missing expected rejection`, exit1), corrected2/2 GREEN and full affected150/150 PASS (both exit0), plus syntax/whitespace checks. Current product/test SHA256:

- `web/replicate-media.js`: `55baa1f5a8686fc2256106888a4e9e82724745497f38aa741045812e2d781e94`
- `tests/replicate-media.test.js`: `a071ea896aa1bffb75c22c0b12d921b1e4b255366eb109494bfe521321d356dd`

Both match corrected focused/full-run evidence. Baseline source hashes, exact diff digest, correction/checks/log digests and review launch digest match. Relevant protected I2 `web/replicate.js`, `tests/replicate.test.js` and `tests/replicate.integration.test.js` hashes match; the recorded134-file protection result was not rerun.

Limits: source/evidence review only; no tests or fixture rebuild. Baseline and corrected whole-test-file hashes differ; focused RED/GREEN is the supplied behavioral evidence, not a claim of identical complete test files. PNG parsing intentionally stops at IEND, preserving the previously accepted trailing-byte contract; this is not a new general CRC validator. No live provider/TLS, E2E, I4 wiring, quality or full-feature acceptance is claimed.

Profile: compact-quality-first-v2; bounded M correction review within previously routed feature. Author actual: gpt-6.1-sol/high (host runtime record). Reviewer requested: gpt-6-astra/high; actual model/effort, usage and cost:null pending host evidence. Timing and identity: [review receipt](../../telemetry/n8-20261002-1740/replicate-i3-r01-review-receipt.md).
