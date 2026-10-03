# Narrow real PostgreSQL validation — F16

Run `20261003T064351Z-release-gate`; work unit `release-gate-pg-validation`; attempt `pg-validation-1`.
Accepted source `e5672838a107c2cafc616600a4cb00de7d5895b8` plus the new regression test; product source unchanged.

Validated exported `createFixture`, `prepareCorpus`, `seedCorpus`, `readEvidence`
with real PostgreSQL 16.15 / pgvector 0.8.6 and existing migration/role helpers.
Only provider vectors are fake, via existing bounded gateway and `FakeProvider`.
Three tests passed: service-role fixture/corpus writes; real vector search isolation;
populated ledger/question/quota evidence scoping, token sums, null billing and incomplete usage.
Root typecheck and `npm run pretest` package exports passed; final runner exit 0.

Source overlays verified 65 SHA256 inputs inside the cached runner image
`sha256:ff0c8692df9cfbaeae0d176d4c9de9a28cadb7fd9d5e9dae2725e99ee2fcb65f`.
Snapshot manifest SHA256 `2c73e18a2e6099c0d613c22a3710b6abbf3951e84656896faf4c776ba66a797a`.
Runtime image/mount binding: [pg-container-bindings.txt](../../../tests/artifacts/release-gate/pg-container-bindings.txt).
Log: [pg-validation.txt](../../../tests/artifacts/release-gate/pg-validation.txt).
Checks: [pg-verification.json](../../../tests/artifacts/release-gate/pg-verification.json).

Two corrected failures are preserved: missing F16 source overlays (typecheck exit 2),
then invalid sibling test public ID format (2 tests passed, 1 failed).
No product helper defect was found and no product edits were made.

Each invocation acquired/released the shared mutex; final interval
`07:29:34Z–07:30:18Z`. Unique internal compose stacks used DB 1 + runner 1 CPU,
no published ports; all containers/networks/volumes and random private env files cleaned.
Reproduce from project root: `bash tests/artifacts/release-gate/pg-runner.sh "$PWD"`.
No image rebuild, full-suite rerun, live calls, commits or push.

Profile `compact-quality-first-v2`; requested `gpt-6.1-sol high`, actual model/effort
and usage/cost unavailable. Elapsed from launch through receipt preparation: 502.816s.
[Full receipt](../../telemetry/p-replicator/20261003T064351Z-release-gate/evidence/pg-validation-1-receipt.md).
Parent telemetry integration belongs to coordinator; worker evidence is `pg-attempt.json`.
Live calibration, stand/browser/CJM/rollback and separate source review remain external to this pass.
Status: completed
