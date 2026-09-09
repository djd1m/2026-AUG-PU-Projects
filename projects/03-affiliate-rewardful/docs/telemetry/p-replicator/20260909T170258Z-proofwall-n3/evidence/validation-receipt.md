# Bridge validation receipt
RUN_ID: 20260909T170258Z-proofwall-n3
WORK_UNIT_ID: bridge-validation-1

Both read-only reports completed using requirements-validator/SKILL.md, scoring-system.md and feature-report-contracts.md. Exactly six AC rows and current spec revision recorded in each. Initial durability/receipt findings reported immediately, corrected by parent and revalidated. Current verdicts CAVEATS; no PLAN blockers remain. Concrete worker bounds, P1 authority revision/invalidation, cumulative refund rounding and duplicate prose cleanup remain acceptance obligations. Revised envelope and isolated deployed F3 f8055e3 baseline accepted as concrete PLAN decisions.

- Report: /tmp/n3-bridge-validation.md
  SHA256: df4fa5c984e7f986722060b47b166f5dbef54757d2b8a7db5e21a0635ae4c70a
  Spec revision: sha256:c78a8ff1abe9efab187b8906d95224d1852820235d6d698da291b1f775f0a424
- Report: /tmp/proofwall-bridge-validation.md
  SHA256: 5d8604691a4f7868e22c6c7cb52ed12a49d3a8c5392b1121dea4fcd99f81f94d
  Spec revision: sha256:f8cfa4a2836ce91ac6170e875d1284434b9a49f8db46bdccb731dc8f61617d11

No project sources/docs modified by this child. No network, secrets, tests, migrations or deployment accessed. Actual model/effort/usage/cost/start/duration: null, no host metadata or measured child interval. Completion UTC: 2026-09-09T17:12:11.826738+00:00
Status: completed

## Delta validation before implementation freeze

Delta verdict: READY for implementation; no remaining PLAN blocker. Prior reports retain their original reviewed input manifests; this append records the later 02-only refinements, rather than claiming their former hashes cover changed bytes. Specification digests below remain unchanged.

- Pending email proof now binds existing sessions.token_hash, account and exact email; account→session→proof lock order and post-lock revoked/expiry checks are explicit. Existing password-change/reset invalidate all old sessions (password-change creates a fresh one), so old pending proof cannot transfer to the replacement session. Completed email ownership proof persists by explicit policy; no accounts.version migration is required. Test reset/change versus proof consumption race and expired session after lock wait.
- Worker now has 60s fenced leases, batch10, nonoverlapping 5s poll, max4 outbound operations, shared 8s deadline including 1MiB response bound, 60s exponential retries capped3600s, no silent attempt ceiling, and pending cap10000 with explicit admission failure before business mutation; retries remain possible at cap. Test lease-token fencing, total batch duration under lease, atomic cap under concurrent producers, capacity failure rolling back both tariff/proof and new outbox insert, and recovery after capacity frees. Externally paid provider events must receive retryable failure on capacity exhaustion, not success with lost entitlement.
- Cumulative N3 refund rounding/limits are explicitly inherited; P1 manual entitlement review remains defined. Generalized unique(kind,businessKey) is consistent; P1 AC1 pseudocode now matches revised specification. Bridge-only release from deployed F3 f8055e3 remains explicit, with release-candidate regression and source/build receipts required.

Scoped packaged-gate assessment: acceptable feature-only evidence, with conditions. Parent reports whole P1 docs fail modern pre-existing gate expectations; this child has not rerun or independently established that failure. Preserve whole-run command, exact output and exit status. Run identical existing checker logic on a regular-file, byte-identical snapshot of this feature plus authentic role-map sources, record each source/copy SHA and checker SHA, require all requested modes to PASS with exactly one intended feature, and disclose that legacy project/feature contours were deliberately outside the scoped run. Do not label the scoped PASS a whole-project PASS or erase legacy failure. Future completion gate must use actual test files and exact titles, not placeholders in the snapshot. Full source/test/build and migration regressions still apply.

Accuracy note: existing check-pipeline.mjs is a hash-bound compatibility wrapper that makes two in-memory substitutions for p-replicator 1.13.2 completion-path expansion; it does not run byte-identical upstream bytes. Keep that existing reviewed wrapper unchanged and describe it accurately. No new gate weakening is endorsed, nor is rewriting unrelated historical documents required for feature validation.

Delta inputs SHA256:
- `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/02_pseudocode.md`: `cecb418a726335f79bfae2b13d96a027d7885d45a4323c5ad85435f5f3b1c6eb`
- `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/02_pseudocode.md`: `ff1091b8f534566cf9475ebe86deeedaa8ee80e4e57213f6adb5cd1ff90f83e9`
- `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`: `c78a8ff1abe9efab187b8906d95224d1852820235d6d698da291b1f775f0a424`
- `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`: `f8cfa4a2836ce91ac6170e875d1284434b9a49f8db46bdccb731dc8f61617d11`
- `projects/03-affiliate-rewardful/scripts/check-pipeline.mjs`: `472eacd85343534d5ce19e5d2ae270b0287b33dd74e6a81fce5f4473363880d6`
- `projects/03-affiliate-rewardful/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh`: `06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8`

Delta completed UTC: 2026-09-09T17:41:38.195273+00:00
Read-only validation only; no source/docs/test/provider/deployment changes. Model/usage remain unavailable, not estimated.
Status: completed
