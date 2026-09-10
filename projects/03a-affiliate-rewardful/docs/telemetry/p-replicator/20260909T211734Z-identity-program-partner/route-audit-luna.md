# Route audit receipt — Luna

RUN_ID: `20260909T211734Z-identity-program-partner`
WORK_UNIT_ID: `route-audit-luna`
TRACE_PATH: `/tmp/n3a-route-audit/projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/route-audit-luna.md`
Snapshot/base: `d7a31e47b36a623f2690704701287d64e73858b8`
Started: `null` (launch timestamp was not captured by this worker)
Ended: `2026-09-10T08:47:10.918Z` (measured receipt completion, UTC)
Requested model/effort: `gpt-5.6-luna` / `medium`
Actual model/effort: `null` / `null` (host execution metadata unavailable)
Usage: `null` (host counters unavailable); cost: `null` (no billing evidence).

## Client call → HTTP action → service operation

All mutations use `POST`, fetch a fresh CSRF token first, and send JSON with `Origin`; reads use `GET` and same-origin credentials. `handler.ts` performs source admission, method/auth/CSRF/content-type/body checks before dispatch. Empty `{}` means the client sends no business fields.

| Client method | Path and method | Required client payload/query | Handler action and validation | Service action |
|---|---|---|---|---|
| `freshCsrf` | `GET /api/auth/csrf` | none | `csrf`; anonymous/session binding | `createCsrf`, cookie issuance |
| `signup` | `POST /api/auth/signup` | `identity`, `password`, `grant_token` | `signup`; exact allowlist, identity hash, password, session token grant | `register` |
| `login` | `POST /api/auth/login` | `identity`, `password` | `login`; exact allowlist, identity hash/password | `credentials.authenticate` |
| `logout` | `POST /api/auth/logout` | `{}` | `logout`; empty object only | `sessions.revoke` |
| `me` | `GET /api/auth/me?limit=20[&cursor=UUID]` | `limit=20`, optional UUID `cursor` | `me`; pagination | `getMe` |
| `bind` | `POST /api/enrollments/bind` | `grant_token` | `bind`; grant token must be 43-char session-token shape | `bindEnrollment` |
| `preview` | `POST /api/enrollments/preview` | `grant_token` | `preview`; same grant validation | `previewEnrollment` |
| `acceptEnrollment` | `POST /api/enrollments/accept` | `grant_token` | `accept`; same grant validation | `acceptEnrollment` |
| `acceptPartner` | `POST /api/partners/accept` | `grant_token`, `policy_id`, `terms_hash`, `accepted: true` | `acceptPartner`; grant, UUID, 64 lowercase hex hash, literal `true` | `acceptPartner` |
| `program` | `GET /api/programs/{id}` | path UUID; no query keys | `program`; UUID and empty pagination query | `getProgram` |
| `savePolicy` | `POST /api/programs/{id}/policy` | `rate_bp`, `attribution_days`, fixed rule/mode/currency fields, `timezone`, `terms_text`, `expected_version`, `acknowledged:true`, `effective_mode`, future `effective_at` | `policy`; strict object, integer/range/literals, IANA timezone, text ≤16,384 bytes, canonical UTC instant for future mode | `savePolicy` |
| `activate` | `POST /api/programs/{id}/activate` | `{}`; path UUID | `activate`; empty object and UUID | `activateProgram` |
| `issue` | `POST /api/programs/{id}/enrollments` | `identity`, `expires_at`, nested identity/authority evidence, `role`; operator additionally nonempty unique scopes | `issue`; strict fields, text/instant/evidence/hash/ranges, role and scope allowlist | `issueEnrollment` |
| `members` | `GET /api/programs/{id}/members?limit=20[&member_cursor=UUID][&grant_cursor=UUID]` | `limit=20`, optional UUID cursors | `members`; UUID path and pagination allowlist | `listMembers` |
| `revokeGrant` | `POST /api/programs/{id}/enrollments/{grant}/revoke` | `{}`; UUID path ids | `revokeGrant`; empty object and UUIDs | `revokeEnrollment` |
| `revokeOperator` | `POST /api/programs/{id}/members/{membership}/revoke` | `{}`; UUID path ids | `revokeOperator`; empty object and UUIDs | `revokeOperator` |
| `setPartnerStatus` | `POST /api/programs/{id}/partners/{partner}/status` | `status`, `expected_status` ∈ `active\|suspended`; UUID path ids | `partnerStatus`; strict object/literals/UUIDs | `setPartnerStatus` |
| `partnerAssets` | `GET /api/programs/{id}/partner-assets[?partner_id=UUID]` | optional UUID `partner_id` | `assets`; only `partner_id` query allowed (pagination helper called with that allowlist) | `getPartnerAssets` |
| `revokeAsset` | `POST /api/programs/{id}/assets/{asset}/revoke` | `{}`; UUID path ids | `revokeAsset`; empty object and UUIDs | `revokeAsset` |

Source locations: client path/payload definitions [onboarding/api.ts] (lines 45–137); dispatcher [handler.ts] (lines 18–126); parsers [input.ts] (lines 3–81); service contract [onboarding-contract.ts] (lines 86–105). The supplied `/tmp/n3a-route-map.json` maps these route suffixes to the same actions.

## Reproducible route observations

1. **Password UI/server consistency observation.** Login/join controls declare `minLength=8`, `maxLength=400` ([login-form.tsx] lines 35–43; [join-form.tsx] lines 164–177). `isValidPassword` additionally caps Unicode code points at 200 ([auth/password.ts] lines 18–21). Therefore some 201–400-character values pass browser constraints and are rejected by HTTP as `422 invalid_input`; the server guard remains authoritative. This is a UX consistency observation, not a security vulnerability.

2. **Policy text UI/server consistency observation.** The policy textarea is required but has no `maxLength` ([policy-form.tsx] lines 111–114); HTTP `input.policyInput` enforces nonempty text ≤16,384 UTF-8 bytes ([input.ts] lines 50–68). Larger visible input receives `422 invalid_input`; the server cap remains enforced.

3. The earlier identity and invite-expiry differences are not confirmed findings: the injected `hashIdentity` delegates to runtime normalization/validation, and core service/SQL enforce the future/≤72-hour expiry rule. The snapshot route mounts are an integration dependency already handled by the coordinator, not a new defect.

## Contract comparison

The client payload types omit server-only `program_id` and `sessionTokenHash` exactly as required by `SavePolicyInput` and `IssueEnrollmentInput` ([api.ts] lines 98–105; [onboarding-contract.ts] lines 34–37, 73–76). Fixed policy values and operator scope allowlists match the closed contract unions ([policy-form.tsx] lines 39–50; [invite-form.tsx] lines 8–17; [onboarding-contract.ts] lines 3–5, 34–37). DTO route return shapes match the declared service methods ([api.ts] lines 82–137; [onboarding-contract.ts] lines 86–105). No speculative architecture/security acceptance judgment made.

## Source hashes (SHA-256)

| Source | SHA-256 |
|---|---|
| `apps/web/src/components/onboarding/api.ts` | `0cb55b224b0c76ffbec3a483b5046eb694d352d237b138be9733a80516755b93` |
| `apps/web/src/components/onboarding/invite-form.tsx` | `5e90e6d1aaf681eb35a542b10e202540b2be686ba78019969a5d78c7ef96a44d` |
| `apps/web/src/components/onboarding/join-form.tsx` | `1303663480ecd3bddd94e59e7215400e55a7fbf24ce3279445078395545c417d` |
| `apps/web/src/components/onboarding/login-form.tsx` | `57e850d9ec49f9910292bb1ba9d472173831c141c94cfee809dc20d9ab855a30` |
| `apps/web/src/components/onboarding/member-list.tsx` | `d0eb656b1be6da46dc0f9d1aedde5489ba057f8282b43cf5712987d9698cf978` |
| `apps/web/src/components/onboarding/membership-list.tsx` | `c5ed32c524ab13e68282ce71bdd3a55a8e710e4c669750bd73e75fa0eb6efa36` |
| `apps/web/src/components/onboarding/partner-assets.tsx` | `6dc7c523422f19d91b1834722942ceaa4984e400d1a27d9a3a7aebb11a21e15c` |
| `apps/web/src/components/onboarding/policy-form.tsx` | `13bfbd7844a50f4e221138419782e05c81d46b53f331cc01e0b626649f66f768` |
| `apps/web/src/components/onboarding/program-setup.tsx` | `e88c897c081ada477e288b70b6f7c1f298042a79384c6669d89016e351768e97` |
| `apps/web/src/components/onboarding/rate.ts` | `35ea8b864ee1e53dd956d8f95df1d5a4fb70f4905ff41450e6bcf914cfa4777a` |
| `apps/web/src/components/onboarding/shell.tsx` | `d398146e38ec3a30ff98dba92e1d5e0479c4cc261ff178459a0e26ef33d49bc8` |
| `apps/web/src/lib/http/handler.ts` | `11f8d18cae3a61da6512f9d9b50548e12e996e72039f4b692f86785b67fc6e9e` |
| `apps/web/src/lib/http/input.ts` | `ba3a6c734b9ac6db58d46877e3d83f5e529947418e84be180a8d4f35a099c063` |
| `packages/db/src/onboarding-contract.ts` | `9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511` |

## Correction note

This receipt supersedes the first draft. Hashes were recomputed mechanically with `sha256sum` for every listed source. The start timestamp is explicitly unavailable; identity/expiry and mount observations were narrowed per coordinator evidence. No source files were edited.

Status: completed
