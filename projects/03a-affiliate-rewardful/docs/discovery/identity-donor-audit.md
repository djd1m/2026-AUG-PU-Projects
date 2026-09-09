# Identity-program-partner donor audit

Run `20260909T211734Z-identity-program-partner`; work unit `identity-donors`.
Audit scope was read-only source inspection of the current main worktree donors:
`projects/01-testimonials-senja` (N1) and `projects/02-review-qr-reputation` (N2).
At initial inspection both reported commit `25415301a870fff29d1362d49bd091990d61d0a4`.
At corrective-pass terminal verification the repository HEAD had advanced to
`b6ec2d88c167e61bc045fbab85d9a73e0ffc22f5`. N1 was hashed before and after inspection
because it is concurrently edited; every selected source hash cited below was unchanged. No
donor runtime import, database, secret, or migration is authorized for reuse.

The N3a foundation already owns Argon2id password admission, opaque 24-hour HMAC sessions,
its migration engine, `n3a.users`/`n3a.sessions`, and identity-only context. Do not copy
donor password, session, or foundational migration code.

## Exact reusable patterns

| Need | Donor evidence | Classification and required N3a adaptation |
| --- | --- | --- |
| Bounded unauthenticated JSON body | N1 `apps/web/src/lib/request-body.ts` SHA `d13ef84a23b8832c693bec2e31d2517cf444dbb05e462335cb35af281fcf1e83`; callers `apps/web/src/app/api/auth/register/route.ts` SHA `3dc0280b2713c3ba4431dba48a8a64351e3847ad2d0d4238b2626a7e6564b85b` and `.../login/route.ts` SHA `300a1d7655b0b5550ca11e1595ed77919a21cd7d76a9cf88b7d1ff0fb3f65d1d`. | **Copy/adapt minimum closure:** directly copy the 34-line reader/core and `MAX_JSON_BODY=4096`; adapt it with the required 5-second deadline/AbortSignal and non-blocking cancellation. N1 currently awaits `reader.cancel()` on oversize and has no deadline, so those are necessary bounded adaptations, not a reason to create a different reader. Keep one N3a shared App-Router helper. N3a ordering follows its own approved plan: bounded admission/rate before full validation; release any short rate-query connection before streamed body or KDF work. The donor caller order is not copied as authority. |
| Email canonicalization | N1 `apps/web/src/lib/validation.ts` SHA `52bfa7c785ad7cff2258ca223aa76d839c4bb8a68bb0bb10edaed4e8996c3c0f`; registration uses it in `lib/register.ts` SHA `74c414d7596dff4a5d60d888dbfdf1db03d1880371531868349cb7c37bb4a79c`. | **Copy/adapt safe block:** `EMAIL_MAX=254`, `isValidEmail`, `normalizeEmail(value)=value.trim().toLowerCase()`, and `normalizeEmailFromInput(unknown)`. Keep Gmail local-part dots distinct. Apply the plan's strict ASCII identity policy before/with this canonicalizer, rename/export under N3a, and derive the trusted identity hash only after canonicalization. Non-email identities are additive, not incompatible. |
| Trusted proxy IP boundary | N1 `apps/web/src/lib/client-ip.ts` SHA `5eec0e0fe942f56b85c6fcca11022aed44609abb5f1c850a441332f6bfdcf6b8`; callers use `extractClientIP(request)`. | **Copy/adapt conditionally:** `extractClientIPFromHeaders` selects final validated XFF, then X-Real-IP, then `unknown`. It is safe only when N3a web is reachable solely through a proxy that appends/overwrites headers. Otherwise force `unknown` and ignore forwarded headers. This is topology configuration, not a donor-code incompatibility. |
| Login admission ordering | N1 `apps/web/src/lib/login.ts` SHA `386a9a9ad71d34061ba4a3af8c20fcf2752579181c9d6b1b914d00d0d9b6c668`: pair/IP scopes, advisory try-lock, rate check, dummy KDF for absent identity, generic denial. | Adapt policy, not code: N3a retains its existing Argon2 admission queue/dummy verification and needs route-level rate-before-credential work. Choose N3a scopes/thresholds from requirements; N1's account/IP values and PostgreSQL lock namespace are not transferable. |
| Sliding-window rate-limit store | N1 migration `packages/db/migrations/006_rate_limit.sql` SHA `c074c7b048c93c45244d08152e59639ba3c30ff0d3fcea60a9f02950b69e5028`; repository `packages/db/src/rate-limit.ts` SHA `815b66d95d2e65d737542ee076ddc251730dd2209938de36935a986d4432d8c6`; strict closure `lib/login.ts` SHA `386a9a9ad71d34061ba4a3af8c20fcf2752579181c9d6b1b914d00d0d9b6c668`. | **Copy/adapt only if N3a policy selects this store:** copy migration columns/index plus the `Executor` interface and parameterized count/record/where helpers. Those helpers are separate queries and are not an atomic limiter alone. Strict policy needs an outer N3a transaction and advisory try-lock (`pg_try_advisory_xact_lock(namespace,hashtext(key))`) around count/charge only, commit and release BEFORE credential KDF work. Never retain the limiter transaction/advisory lock while hashing. Rename schema/table/role/namespace/scopes; do not share donor table or copy cleanup without N3a retention ownership. |
| Cookie transport and generic denial | N1 `apps/web/src/lib/session.ts` SHA `5f22ed53dc93ca1c775c101a59835f19459ab525f678e5298579c6ae54b32376`; N1 login route cited above. | Foundation already supersedes token generation/storage and has `__Host-n3a_session`, Secure/HttpOnly/Lax/path settings. Only route response behavior is reusable; do not copy N1's 30-day cookie, permissive development Secure toggle, or secret API. |
| Origin CSRF gate + streamed 32KiB form body | N2 `apps/web/src/server.ts` SHA `a78c46aa4b36de4dfea4140e7b643b39a66f8519943dba5ea9bf9a4cd2d0f`: `originOk(req) { return req.headers.origin === BASE_URL; }`. | **Copy/adapt safe block:** exact configured-origin comparison before every cookie-authenticated POST; rename BASE_URL to N3a public origin and reject missing/mismatch. N2 `readForm` is **not copy-safe**: timeout/oversize pauses the request but retains listeners; this does not establish the required bounded cancellation lifecycle. Repeated Promise resolution alone is harmless and is not the security finding. Use N1 bounded JSON reader for N3a JSON routes. |
| Atomic account + membership bootstrap | N2 `apps/web/src/auth.ts` SHA `f8ed199f51993f2ea6c726b61984a68bba2009b844df0ed3978513e7a1692641`; `packages/db/migrations/002_core.sql` SHA `ca829ac023eb3355fc92818a510672ece3a75ca23a6df0cd4771a8d4a622b8fe`. | **Copy/adapt transaction shape:** one client begin → identity → membership → session → commit, rollback/release. Replace entities/trust inputs: lock verified EnrollmentGrant, record consent, insert Partner/Membership in designated Program, invoke existing N3a issuer. N2 scrypt, public self-register, account auto-provisioning, and session insert are real incompatibilities; entity names/columns are renames. |
| Membership roles and tenant scoping | N2 enum/table above plus `packages/db/migrations/007_rls_owner.sql` SHA `f038f05766583608083ffff336b8c90eb5ce9c226e8e557509ab0e0c2c0bb029`. | Use as a warning-backed design reference only. N3a needs its own explicit membership-to-program scope query and RLS/grant decision. Never derive scope from a session alone; no scope is present in Foundation's `IdentityContext`. |
| Partner entry UX separates public referral code from private secret | N1 `apps/web/src/app/partner/page.tsx` SHA `9e38a87334ab4588568f79ceb83dd2e7d6ee0135a23b91da4b10a55468fb49bd`, `login-form.tsx` SHA `3c115b23e1b3a33512138631999dfc6b6343f8a76188c49d19f199726924eaf4`, and `lib/partner-auth.ts` SHA `adb8d08a511a01dc7ccfbdead9c10bccdeb39df956aade19a3ddc14a081fdc06`. | UI/message may be adapted: private dashboard credential must not be a public referral code nor travel in URL. N3a product requires trusted enrollment/membership, so no standalone bearer-token partner session should be copied without its authorization model. |

## Needed new N3a work

1. A migration set for trusted enrollment grants, consent record, Program, Partner and
   Membership with immutable provenance and unique/foreign-key constraints. The grant must
   be consumed and membership created atomically after validated identity proof; untrusted
   input cannot nominate `role`, `program_id`, partner, or scope.
2. Route admission shared by enrollment and login: bounded body read, configured trusted-proxy
   IP extraction, rate-before-validation/KDF, generic credential denials, and safe logging.
3. Cookie-auth mutation middleware with strict Origin/CSRF policy, including logout and later
   program administration routes. Enrollment needs its own anti-abuse controls and does not
   obtain its authority from a browser cookie.
4. An authorization repository that resolves a valid identity session plus membership scoped to
   the requested program. Session resolution alone must return no program role or money authority.
5. Onboarding UI only after those HTTP contracts exist: redeem trusted invitation/enrollment,
   show consent, and route an authorized member to the correct program/partner surface.

## Donor limitations and exclusions

N1 `registerAccountAndProject` combines self-signup with account/project provisioning,
growth attribution, N3 bridge receipt, and partner-code logic; it violates N3a's required
trusted bootstrap boundary if copied. N1 partner dashboard uses a 32-byte bearer dashboard
token in a `/partner` cookie (`api/partner/session/route.ts` SHA
`d116b463a54fe5dab290cbf1d52e4119bf3aca4acb432a44d4937dfa9a93f5b3`) rather than N3a
membership authorization. N1's `003_core.sql` SHA
`49a7f63d740917ecc9aaa9ef40495b99a7c68d36fa9e9051c8ace2f71154da72`, `004_growth.sql`
SHA `4cf50d27335465d46a0ad8b29e7eaf96fe85c4f14bbe4bf09d6acc5d7143f888`, and
`009_partner_owner.sql` SHA `6c13a43137a88372ed405137b3151e0b6b17dc16b90b9ad68b40e4d7c79e038d`
are donor-specific and must not be applied.

N2 has valuable transaction/Origin patterns but its `scrypt`, `rq_session`, 30-day expiry,
direct public `POST /register`, and `resolveSession` choosing the first membership are all
incompatible with N3a Foundation's Argon2id identity-only 24-hour session. Its RLS function
uses an ambient account setting and tenant hierarchy, neither of which establishes N3a
Program/Partner authority.

All source was read from the main repository, no tests were run because no runtime or code
changed. Main donor heads and selected N1 hashes were verified unchanged after inspection.

Coordinator correction after receipt integration: exact donor code was re-read. N3a never holds a DB transaction across KDF/body reads; harmless repeated Promise resolution is not a vulnerability claim. This paragraph and the corrected rows supersede worker wording; original artifact SHA is retained in run events.
