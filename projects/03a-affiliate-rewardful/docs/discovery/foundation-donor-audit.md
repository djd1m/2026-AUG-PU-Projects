# N3a foundation donor audit

Run: `20260909T192932Z-foundation`; work unit: `donor-audit`; snapshot: repository and both donors at `6a5920dea8f5fcc256257bf50d520b1f0a7af72b` (2026-09-09T19:25:06Z). This is a read-only donor inspection. N1 is `projects/01-testimonials-senja`; N2 is `projects/02-review-qr-reputation`. N1 local rules were read; N2 has no project `CLAUDE.md` or local rules. D7 remains unresolved and is excluded.

## Minimum dependency closure for `AuthenticateSession` and `AcceptPartnerAndAssets`

Copy/adapt these small donor units into N3a-owned modules; do not import donor runtime code, database, secrets, or schema.

| Need | Donor and SHA-256 | Decision and N3a adaptation | Equivalent N3a tests |
|---|---|---|---|
| Opaque session token and HMAC-at-rest hash | N1 `apps/web/src/lib/session.ts` `5f22ed53dc93ca1c775c101a59835f19459ab525f678e5298579c6ae54b32376` | Adapt `randomBytes(32).base64url`, secret-required HMAC-SHA-256, 30-day absolute expiry, and single session issuer. N3a needs `user_id`, `revoked_at`, and enrollment-safe lookup rather than N1 `account_id`. | Token entropy/format; no plaintext token persisted; secret missing fails closed; expiry/revocation; production cookie is Secure/HttpOnly/SameSite and mutation CSRF/Origin enforcement. N1 primitive reference: `apps/web/tests/auth-primitives.test.ts` `423baee432541d3d1e143749eb25487486386c65f6c7901b3d0944b5d1d77d40`. |
| Password KDF and generic failure | N1 `apps/web/src/lib/password.ts` `0566315c95d3f12dc32ac694f880824b7fc8d0306fcf488773fd64f979c91505`, `apps/web/src/lib/login.ts` `386a9a9ad71d34061ba4a3af8c20fcf2752579181c9d6b1b914d00d0d9b6c668`, login route `apps/web/src/app/api/auth/login/route.ts` `300a1d7655b0b5550ca11e1595ed77919a21cd7d76a9cf88b7d1ff0fb3f65d1d` | **Do not label this scrypt.** Current N1 is Argon2id (`@node-rs/argon2`) with per-hash salt, bounded password length, dummy-hash warm-up and generic denial. Select and pin N3a KDF separately; if using N1, carry its dependency and calibrate memory/CPU/concurrency2/queue8 as required by Pseudocode. Keep KDF outside DB transactions. | Correct/wrong/invalid hash, different salts, unknown identity consumes dummy work and produces same denial, password upper bound, queue saturation/429 before KDF, no DB connection held through KDF. N1 reference test above covers only primitive properties, not N3a queue/admission. |
| Session resolver | N1 `apps/web/src/lib/current-session.ts` `b849d831a642c78178b6e1f8bd55812e35cfa18e5413f32b3e85a850c9965b70` | Adapt indexed `token_hash`, `expires_at > now()`, `revoked_at is null` lookup. Add N3a active Membership resolution on every protected program request; keep identity-only accept endpoint as an explicit exception. | Revoked/expired/unknown session denied; identity-only session can only accept bound grant; active membership scope/program/partner isolation; foreign grant returns 404. |
| Atomic rate-limit store | N1 `packages/db/src/rate-limit.ts` `815b66d95d2e65d737542ee076ddc251730dd2209938de36935a986d4432d8c6`, migration `packages/db/migrations/006_rate_limit.sql` `c074c7b048c93c45244d08152e59639ba3c30ff0d3fcea60a9f02950b69e5028` | Adapt a single scoped, indexed DB event table only if N3a chooses this design. Admission must happen before body/KDF; arrange record/revoke atomically with the outcome. Do not inherit Proofwall thresholds. | Window boundary, scope separation, failed work quota rollback, concurrent admission at N3a threshold, bounded body before DB/KDF. N1 reference: `packages/db/tests/rate-limit.test.ts` `75fa46e088b27a4cb5c4c52f64e683c7a63c06c4e6b5e96564efa6d6119eb7b8`. |
| Immutable migration runner | N1 `packages/db/src/migrate.ts` `dc2d8288fe7c4f0d18295571ffce2810c0d3215b7d01e114a06b8a6316d50f41`; N2 `packages/db/src/migrate.ts` `8bda5fd4c75c0ec33c8e83c8b9edd70e3d32828d5e39fb2b194225d5bce8e5d0` | N1 supplies only sorted discovery, per-file transaction and filename-only applied tracking; it has **no** checksum, edited-file refusal or `--baseline`. Copy/adapt the stronger N2 runner for recorded checksums, edited-file refusal and explicit `--baseline`; do not make either donor a runtime dependency. | Fresh apply order; rerun skips; N1-style filename-only runner behavior is insufficient. N3a must test changed applied migration rejects, failed migration rolls back and is unrecorded, and explicit baseline is never automatic. |
| Grant/token one-time binding and least privilege | N2 `packages/db/migrations/009_binding_grants.sql` `999bfe0c9a2147408f4a4815a19bb756e0cbc2b8cf16ab8fcebf0a7829735878`, `012_bind_token_burn.sql` `696a453c8e56f81742c307f205d6d711ef8ead71cae57ffb5c2ba3f93636c902`, role grants `005_roles_grants.sql` `5985d2e0e2a59a1a86b26da0b18d6a9844010a51b13283c9796fd7f728f0329a` | Reuse principles only: store a hash, consume/burn it only on successful atomic acceptance, issue the narrowest DB/application permissions. N2 is messenger binding, not a Membership implementation. | Concurrent same-token acceptance produces one Membership/assets; replay by same user returns original; foreign identity gets 404; invalid/revoked/expired has no state change; scope ceiling prevents role escalation. |

No donor provides the required N3a `EnrollmentGrant → Invitation → Partner → Membership` transaction. Implement it N3a-owned with the locks and uniqueness specified in `AcceptPartnerAndAssets`; do not splice N1 owner/partner models or N2 messenger bindings into it.

## Security gaps that prohibit blind copying

1. `AuthenticateSession` says “audited donor scrypt,” but current N1 is Argon2id. This must be corrected in implementation provenance or resolved as a deliberate N3a KDF decision.
2. N1 session cookies set `Secure` only when `NODE_ENV=production`, and its resolver is account-level; N3a must enforce its own deployment configuration, CSRF/Origin mutations, identity-only acceptance exception, and Membership authorization.
3. N1's simple event count helper is not an atomic reservation by itself. N3a must prove its admission/record/revoke ordering under concurrency, especially before expensive KDF work.
4. N2 authorization expresses process roles and grants, not N3a program-scoped Membership. N3a must use server-owned program, role, scope, partner binding and `UNIQUE(program_id,user_id,role)` rather than any client role field.
5. N1 and N2 migration runners do not constitute N3a schema or RLS policy. N3a needs its own migration ownership, hashes, tables, FK/unique constraints and tenant/program isolation tests.

## N1 bridge/payment/referral/cutover refresh

Present in current N1 source (all at the snapshot above):

| Present source | SHA-256 | What exists | N3a consequence |
|---|---|---|---|
| `apps/web/src/lib/n3-payment.ts` | `1ece15480c9e777630a732e3ff3e393687b182faf840e19bfa7c7adc520ad0e4` | Provider payment/refund lookup and N1-local checkout/refund handling; validates fixed current N3 test/payment assumptions. | Not a reusable general N3a payment ledger or production cutover. |
| `apps/web/src/lib/n3-referral.ts` | `0182cc605a5dcb39695b4d33067183ec41d38e12078f5cf1549aecc690f899d0` | N1 referral cookie/promo context for the existing N3 bridge. | N3a still owns its program assets, historical attribution and policy snapshots. |
| `packages/db/migrations/019_n3_bridge.sql` | `14bf874507b817637b294ea597f3e6338aaf7048def4f67fe191fbc9d6ab852c` | N1 bridge tables including `n3_bridge_outbox`, checkout intents and refund review. | Confirms a local N1 outbox table, but no N3a schema is supplied. |
| `services/worker/src/n3-outbox.ts` | `ceb1d673b5aa144f213b63f189033c182452f148f3227c16f448cd6dae219902` | Transactional enqueue, capacity guard, `SKIP LOCKED` leasing, ACK/backoff and N1→N3 external call. | Adapt delivery concepts only after N3a defines signed immutable event contract, receiver replay control and reconciliation. |
| `apps/web/tests/n3-payment.test.ts` | `21c69c9a8a32fb34225f072bfc4f803514847478ebd65ee94ec798b464af45c8` | Existing N1 bridge payment/refund test surface. | It is not evidence of N3a receiver, ledger, cutover or payout correctness. |

No explicit cutover manifest/boundary was found in the inspected N1 bridge sources. N3a still needs the Pseudocode-required rule: a verified N1 business fact and N1 outbox event in one N1-local commit; post-boundary no legacy commission writer; unknown mapping becomes an exception, never parallel payable debt.

## Dependency and lock observations

N1 root `package-lock.json` exists (`8838d575ae915eaa37fc8b9eebe07e01d10272e6ede0f556f0eb54a364c5e461`) and declares Node `>=22`; N2 has no root lockfile. Do not copy either lockfile. N3a must pin the chosen KDF/PG/test stack in its own manifest and lockfile when implementation begins.

## Correction — 2026-09-09T19:40:13Z

The initial audit incorrectly attributed checksum tracking, edited-migration rejection and explicit `--baseline` to the **N1** migration runner. Re-read at the same snapshot confirms that N1 records only `filename` and `applied_at`; it does not checksum files or provide `--baseline`. Those stronger controls are in the **N2** runner. The minimum-closure recommendation is corrected above: use N2 as the migration-runner donor, while N1 remains only a donor for sorted, per-file transactional application.

## Limits

No donor code, N1/N2 source, runtime, dependencies, database, tests, migration, secret, commit, or network state was changed. No runtime or test command was run. SHA-256 values identify files in the stated snapshot; concurrent work after the snapshot requires a re-read before implementation.

Status: completed
