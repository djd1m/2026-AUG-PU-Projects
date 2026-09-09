# Scoped feature-catalog checker receipt

Run: `20260909T170258Z-proofwall-n3`

Checker: `/tmp/n3-check-feature-catalog.mjs`
SHA-256: `76dd6bbd97dbf8d866ab056b5a701d79ae202a5097f23348d631a48378ed27e3`

The checker creates a private temporary project containing only the selected
`docs/features/<slug>` contour. It rejects lexical `..`, escaping paths,
symlinks and non-regular inputs; verifies copied bytes; invokes the unchanged
N3 wrapper with the root role-map sources passed through both vendor flags;
prints input SHA-256 receipts; and propagates status 0/1/2. With no flags it
runs the three PLAN modes. `--completion` copies and hashes the exact safe test
files referenced by the Criterion coverage table.

## Real P1 PLAN gate

Command:
`node /tmp/n3-check-feature-catalog.mjs projects/01-testimonials-senja docs/features/n3-affiliate-bridge`

Status: `0`. Selected scope only: `n3-affiliate-bridge`, `features=1`.
Vendor results: 6 requirements, 6 algorithms, no missing/orphan IDs;
traceability PASS; report-revision PASS; criterion-scenarios PASS.

Bound inputs:

- `01_specification.md` `f8cfa4a2836ce91ac6170e875d1284434b9a49f8db46bdccb731dc8f61617d11`
- `02_pseudocode.md` `ff1091b8f534566cf9475ebe86deeedaa8ee80e4e57213f6adb5cd1ff90f83e9`
- `03_architecture.md` `6b8efedf2345bfca2a8c41a79255f859d0eec616f93ce92ba6d343f79568c18e`
- `04_refinement.md` `eb0c4c3a773634c6e47b5dcbdc58efd813389d825045130bed7cca5513f2840c`
- `05_completion.md` `1540a9509bdc7bf1edd09c488fd91ea8832b28a61f3034dcc4b6bdf01e277d91`
- `toolkit-compatibility.md` `ebf5d9d2ebe1397577eafea537d47236c30fd39b6b6cb18bc4bcc5768b44163e`
- `validation-report.md` `5d8604691a4f7868e22c6c7cb52ed12a49d3a8c5392b1121dea4fcd99f81f94d`
- N3 wrapper `472eacd85343534d5ce19e5d2ae270b0287b33dd74e6a81fce5f4473363880d6`
- vendor checker `06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8`
- root feature role map `6908fa6c8ba770f829378a021d5f7e9a9bc79a15bdd67b278d8c6a765968b291`
- root project role map `b663793d1e1d1de028f91f2e266a191811bb610f97a12be7f95d62327589d53a`

## Meta-tests

- Byte-identical valid fixture, default PLAN modes: status `0`.
- Removed `AC-n3-affiliate-bridge-6` pseudocode claim, `--traceability`: status `1`; vendor found one missing algorithm and an unkeyed algorithm.
- Removed the AC-6 Criterion scenarios row, `--criterion-scenarios`: status `1`; vendor found the missing scenario row.
- Synthetic complete coverage table plus referenced `tests/bridge.test.mjs`, `--completion`: status `0`; copied test SHA-256 `02251146173973fcf8793b80184426ec03aa2665fb78f7649e00fba2571d56b4` appeared in the input receipt.
- Catalog path containing `..`: status `2` before vendor execution.
- Symlinked catalog: status `2` before vendor execution.
- `node --check /tmp/n3-check-feature-catalog.mjs`: status `0`.

The first sandboxed real invocation returned `2` because nested `bash` was
blocked with `EPERM`; the authorized rerun and final rerun both returned `0`.
