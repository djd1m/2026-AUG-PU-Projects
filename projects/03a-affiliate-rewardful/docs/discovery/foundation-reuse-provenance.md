# Foundation reuse and dependency provenance

Donor baseline: `6a5920dea8f5fcc256257bf50d520b1f0a7af72b`. No donor runtime imports, databases or secrets. Source hashes below were verified before copying.

## Donor provenance

N2 runner was adapted, not replaced by an unrelated implementation: retained sorted SQL discovery, filename/checksum map and per-file SQL+journal BEGIN/COMMIT/ROLLBACK structure. Removed baseline and truncation; added 64-hex byte SHA, full-history preflight including missing later files, journal shape/constraint checks, finite advisory serialization and sanitized CLI diagnostics.
N1 native hash/verify wrappers and primitive assertions were adapted. N3a adds code-point/byte bounds, supported stored-format bounds, explicit Argon2id v19/m65536/t3/p1/output32/fresh16-byte salt and shared FIFO admission. N1 dummy Promise/warm-up pattern was retained with randomBytes replacing Math.random; no donor login transaction/rate-limit/account schema was copied.
N1 token generation, HMAC and indexed lookup patterns were adapted to domain separation, Buffer Hash32 storage, 24-hour identity-only contexts, revocation/current enabled state, and always Secure __Host cookie. No donor imports or resources.

| Actual inspected donor | SHA-256 |
|---|---|
| `projects/01-testimonials-senja/apps/web/src/lib/password.ts` | `0566315c95d3f12dc32ac694f880824b7fc8d0306fcf488773fd64f979c91505` |
| `projects/01-testimonials-senja/apps/web/src/lib/login.ts` | `386a9a9ad71d34061ba4a3af8c20fcf2752579181c9d6b1b914d00d0d9b6c668` |
| `projects/01-testimonials-senja/apps/web/src/lib/session.ts` | `5f22ed53dc93ca1c775c101a59835f19459ab525f678e5298579c6ae54b32376` |
| `projects/01-testimonials-senja/apps/web/src/lib/current-session.ts` | `b849d831a642c78178b6e1f8bd55812e35cfa18e5413f32b3e85a850c9965b70` |
| `projects/01-testimonials-senja/apps/web/tests/auth-primitives.test.ts` | `423baee432541d3d1e143749eb25487486386c65f6c7901b3d0944b5d1d77d40` |
| `projects/02-review-qr-reputation/packages/db/src/migrate.ts` | `8bda5fd4c75c0ec33c8e83c8b9edd70e3d32828d5e39fb2b194225d5bce8e5d0` |

N3a-specific schema/repository/admission/config/bootstrap and resource/race/privilege integration tests are new because donors lack the required dependency closure.
Pinned actual @node-rs/argon2 index.d.ts was read from coordinator installation: algorithm enum numeric2, version V0x13 numeric1 (encoded v19), memoryCost/timeCost/parallelism/outputLen/salt options confirmed.


## Integration adaptations

Coordinator added a sanitized idle-pool error handler, strict database URL decoding, degenerate-secret refusal and full sentinel tests after independent audit SA-01/02. Narrowed TypeScript environment input to a readonly string map so invalid-config fixtures typecheck with Next global ProcessEnv augmentation. Native failure logs a fixed code; no Error/Client object is logged.

Rubik regular/bold and OFL license copied byte-for-byte from the accepted CJM assets; shell colors use those prototype tokens. Homepage has no invented live balances or login route.

## Dependency remediation

Initial donor compatibility pins are recorded in the foundation architecture. npm audit found7 vulnerabilities (4moderate,2high,1critical). Final implementation uses Vitest5.0.0 instead of2.1.9 and overrides PostCSS to8.5.28; Next15.5.24, React19.2.8, Argon2 2.1.0 and pg8.23.0 remain pinned. npm install reports0 known vulnerabilities after repair. Vitest4.1.11 was checked but npm10.9.4 peer resolution failed with edgesOut; a fresh dependency tree reproduced the tool failure, then the compatible5.0.0 version installed without disabling peer checks.

Primary documentation: [Vitest migration](https://vitest.dev/guide/migration/) states Node>=22.12.0 for5.0; actual runtime22.22.0 meets it. [Maintainer security advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) and npm audit identify the test-stack remediation. Audit is a point-in-time known-advisory result, not a general security guarantee.

Exact installed graph and integrity checksums: package-lock.json. Base-image digests: compose.yaml and Dockerfile; no latest tags. Own package lock was resolved independently, never copied wholesale.
