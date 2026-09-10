# Bounded HTTP/UI security review

Review verdict: changes required in the reviewed snapshot. Confirmed findings: high 1, medium 1, low 1; no invented minimum quota. This completed review is not whole-feature acceptance. Coordinator reports corrections in another worktree, but those corrected bytes and browser results are not reviewed here.

Scope: identity-program-partner HTTP adapter, auth/config/session/credential interfaces and onboarding UI against all five feature documents, validation report and frozen contract. Profile `compact-quality-first-v2`, feature risk XL, independent REVIEW. Applied `.claude/skills/brutal-honesty-review/SKILL.md` with model policy's explicit no-quota override. Root/project CLAUDE and applicable local security/testing/ownership/telemetry rules were read. No runtime source edited, no additional agents, deployment, real identity provisioning, messages or financial operations.

## Confirmed findings

### HTTP-UI-01 — High: native form fallback places credentials and grants in URLs

`apps/web/src/components/onboarding/login-form.tsx:35` and `join-form.tsx:164` render forms with only className/onSubmit, no explicit method. Their named identity/password/grant_token controls are enabled in server-rendered HTML. Without JavaScript, or when hydration cannot install the submit handler, the native form defaults to GET on the current page. Submitting valid synthetic fields produces `/join?grant_token=...&identity=...&password=...` or `/login?identity=...&password=...`. Browser history and the server request target receive secrets before any protected JSON endpoint can reject the request. Referrer-Policy does not remove those URLs. This contradicts FR-8/NFR-3 and the join page promise that the invitation never enters its address.

`invite-form.tsx:86` and `policy-form.tsx:83` use the same unsafe fallback for identity/evidence/terms, although these forms are displayed after client-side data loading; login/join establish the prehydration exploit without that additional condition.

Reproduction: render the actual login/join modules using React server rendering, observe `<form class="form-stack">` with named sensitive controls and no method. Then disable JavaScript in a browser, load `/join`, fill synthetic valid identity/password/grant, and submit; inspect the request target/history. Local executable `/tmp/n3a-http-review-repro.cjs` confirmed the actual server-rendered markup (exit 0); the browser navigation step is a coordinator follow-up, not claimed executed here.

Minimal fix: explicit `method="post"` on all sensitive forms so failure to hydrate cannot become a GET query. Keep the normal hydrated JSON/CSRF boundary. Native fallback should safely fail without domain effects. Verify with JavaScript disabled and also failed/blocked hydration, checking URL, request method, log sentinel absence and no protected writes.

### HTTP-UI-02 — Medium: suspension removes the owner's reactivation control

`apps/web/src/components/onboarding/member-list.tsx:96` gates every partner action on `member.status === 'active'`. The accepted pseudocode TransitionPartnerAndResolveHistory step 2 sets Membership.status to revoked when Partner becomes suspended. That valid DTO therefore hides the nested `Возобновить` button, preventing the required owner reactivation flow after the list refreshes. Line 94 also labels that temporary suspension as revoked access before considering partner_status.

Reproduction: render the actual MemberList with one synthetic member `{role:'partner', status:'revoked', partner_status:'suspended', partner_id:'4', scopes:['read']}`. The local harness injects only the hook data and leaves the real rendering branch unchanged; it asserts the output has no `Возобновить` control (exit 0). This is a rendering/contract reproduction, not evidence of the SQL transition executing.

Minimal fix: allow the owner partner-management branch for a suspended partner as well as active membership, then gate the exact transition by partner_status. Prioritize the suspended status label. Verify a real suspend → reload → reactivate journey, while partner access remains denied during suspension and separately revoked assets remain revoked.

### HTTP-UI-03 — Low: shared draft status claims assets exist before consent

`apps/web/src/components/onboarding/shell.tsx:50` always says links and promo codes are already issued. The same ProgramState component renders on owner setup and preacceptance join preview, where no partner consent/assets need exist. It receives only program status, so it has no evidence for the issued-assets assertion. The local harness renders draft status without any assets and confirms the assertion (exit 0). This is inaccurate onboarding state, not fake activation or financial metrics.

Minimal fix: neutral integration-unavailable wording in the shared component; describe issued assets only where an actual asset DTO exists. Verify empty owner draft and partner preview before acceptance.

## Checks and security assessment

- PASS `npm ci --ignore-scripts`, exit 0: local isolated dependencies installed, 90 packages added; npm reported zero vulnerabilities. This install output is not a separate comprehensive dependency security review.
- PASS `npm test -- --reporter=dot`, exit 0: all configured unit suites, 9 files / 22 tests; Vitest start 2026-09-10 06:13:51 UTC, measured duration 14.40s. Includes HTTP factory/stream/CSRF/admission tests, auth config/cookies/KDF primitives and exact decimal rate conversion. PostgreSQL integration suites are excluded by the unit configuration.
- PASS `npm run typecheck`, exit 0.
- PASS `node /tmp/n3a-http-review-repro.cjs`, exit 0: actual transpiled React components demonstrate missing form method, inaccessible suspended-partner reactivation and unsubstantiated issued-assets copy. Hook fixture is isolated to MemberList; router/Link are stubbed for server rendering. No runtime source changed.
- Manual source inspection: HTTP process guard precedes runtime loading and durable admission; exactly 16/no queue. Source admission uses a stable unknown-source bucket and ignores forwarding headers. Shared fixed-row/global counter SQL itself is outside this snapshot's review. Body reader enforces byte/deadline/abort limits and does not await a hostile cancellation producer. KDF active cancellation retains native capacity until settlement; queued cancellation removes the waiter.
- Manual source inspection plus existing unit tests: exact Origin/current-session-or-anonymous CSRF context, canonical token encoding, signature/expiry and duplicate cookie rejection; successful auth revokes old session and clears anonymous cookie, raw session is Set-Cookie only; logout DB error yields explicit sanitized 503 without cookie clearance. Protected domain methods receive session hash for downstream authorization, never client actor/role authority. Allowlisted bodies, UUID/hash/numeric/enum/evidence parsing reject owner delegation, extra authority/readiness and implicit consent.
- Manual source inspection: credential absent/disabled/unsupported-hash branches verify the supported startup dummy; admitted wrong credentials have a generic error. Repository lookup completes before KDF, and credential issuance calls the current-user SQL boundary. No statistical credential timing measurement or SQL lock-race proof is claimed.
- Manual source inspection: errors serialize fixed codes/messages without private exception payloads; adapter responses have no-store/no-referrer. Config requires canonical distinct secrets and one exact origin. UI normal requests match the frozen snake_case DTO/method contract; tokens stay in component memory/POST in the hydrated path. React renders terms as text; exact terms and hash are submitted, with consent cleared on stale-term recovery/refetch. Percentage conversion is integer digit based.

## Limits and handoff

Core onboarding service, new migration bodies, fixed admission repository, runtime factory and Next API mounts were not integrated into this review snapshot. Their absence is an explicit integration limitation, not a new bug finding. No end-to-end claim that the downstream service enforces roles, tenant boundaries, current SQL session locks, expiry, evidence, transaction rollback or fixed durable counters follows from handler mocks. No final Next build, secure-cookie browser journey, PostgreSQL integration, guard mutations, cancellation across a real DB commit, credential timing distribution, responsive/accessibility measurement or full-feature acceptance executed by this reviewer. Coordinator owns browser/integration; separate SQL reviewer owns PostgreSQL. The reviewed baseline is blocked by HTTP-UI-01 until corrected-source verification.

The coordinator's 2026-09-10 follow-up reports all four explicit form POST methods, suspended-partner controls/status and neutral ProgramState wording fixed in `/tmp/n3a-build`. That is a reported correction only; this report deliberately binds the original isolated source. Later acceptance must bind the changed hashes and browser evidence separately. No live N1/YooKassa readiness, D7 decision, money, tracking or real grant delivery is inferred.

## Source binding

Base commit: `567f7bba0bf435452079b5c90129879c093ede65` plus the coordinator-supplied dirty/untracked UI snapshot. Frozen contract SHA-256 verified: `9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511`. Exact declared-input manifest SHA-256: `e6382f3d877f8c74cf369b0a3d9f61ddb6b2175fa8ab6ab104c2d2f55862edf5` (UTF-8, each row `sha256  relative/path\n`, sorted by path). Foundation dispatch snapshot was read; it documents earlier ownership, not these new reviewed bytes. The table below is the exact reviewed/test-input binding.

| Input relative to PROJECT_ROOT | SHA-256 |
|---|---|
| `apps/web/next.config.ts` | `d3c6b0274414d873a3e940c6ad129d6ab86f6ff551ee7da7e16364dfe75f6507` |
| `apps/web/src/app/join/page.tsx` | `bbda88a8a85dc36d0efab9957a4777d8c861327f57ec7e1255602ecdfff2669f` |
| `apps/web/src/app/layout.tsx` | `72f560b75f75a38eac01364b20c748d15f4c254d4ff6d31cc20fd86ad8a7566a` |
| `apps/web/src/app/login/page.tsx` | `df6dd5c15a94d1a9ea94d2ca164e97dd42228050ed41c31230a31792f97f4305` |
| `apps/web/src/app/onboarding/page.tsx` | `4715b4244f95f08d00982731b41d47f6b33e24a4157e96b7800498f08ef17ded` |
| `apps/web/src/app/page.tsx` | `8542322b64a6b8adee1bc6628c7fe8e6b80c6b107e61d9726ac3d48da8588517` |
| `apps/web/src/app/programs/[id]/partner/page.tsx` | `d94879d575d66c30519f6b14a76d419002b3089bcc8dc99552fff0bc7864c110` |
| `apps/web/src/app/programs/[id]/setup/page.tsx` | `5294d24627d119c9f8485f3c87762e6cd347018f073f2b51c4d50cf12519d8c1` |
| `apps/web/src/components/onboarding/api.ts` | `0cb55b224b0c76ffbec3a483b5046eb694d352d237b138be9733a80516755b93` |
| `apps/web/src/components/onboarding/invite-form.tsx` | `049b83bf8241a497814a876d419e3a5e0403586abb38b31d0c672f91ae665c53` |
| `apps/web/src/components/onboarding/join-form.tsx` | `37ee851997877c05b250a8cf43f4f16cbab771f80709c6d173551354c33fde92` |
| `apps/web/src/components/onboarding/login-form.tsx` | `2708c8945c3ff67a7117f566262508b3a0bc7970ba6c576ae0f1d88fff2aaec4` |
| `apps/web/src/components/onboarding/member-list.tsx` | `116c50daed11367ef152e03c674500800546d0bab86bd3c9e422959da8a18a20` |
| `apps/web/src/components/onboarding/membership-list.tsx` | `c5ed32c524ab13e68282ce71bdd3a55a8e710e4c669750bd73e75fa0eb6efa36` |
| `apps/web/src/components/onboarding/partner-assets.tsx` | `6dc7c523422f19d91b1834722942ceaa4984e400d1a27d9a3a7aebb11a21e15c` |
| `apps/web/src/components/onboarding/policy-form.tsx` | `d2b8c47f32480c4efa897366c497ac0bf5ca7d2325df77dd209f65ed10ec71d3` |
| `apps/web/src/components/onboarding/program-setup.tsx` | `e88c897c081ada477e288b70b6f7c1f298042a79384c6669d89016e351768e97` |
| `apps/web/src/components/onboarding/rate.ts` | `35ea8b864ee1e53dd956d8f95df1d5a4fb70f4905ff41450e6bcf914cfa4777a` |
| `apps/web/src/components/onboarding/shell.tsx` | `0aaf889e8ce332148e502d1210366f7cbbabf65cbaf658e811894b81e77c225e` |
| `apps/web/src/lib/auth/config.ts` | `cbf9080a76c29d3dd8f817ceff749911efa220f60a13789bca71d8b574fe98a8` |
| `apps/web/src/lib/auth/cookie.ts` | `f61d3bf4d3dd6f562dffb0bc43870cc856d5a36649223c80df985a094b37cae0` |
| `apps/web/src/lib/auth/credentials.ts` | `8c8bd8d70d722d89bd2a14d09a47c8232bb3721ca4fb3e8177646f9fd0ea670e` |
| `apps/web/src/lib/auth/kdf-admission.ts` | `d2618e5028b1dde8a20506ba451acc18f46cea623f70641fead9dd7fd6bbc30e` |
| `apps/web/src/lib/auth/password.ts` | `15e9ec01b1ff1f58299655663615bf31b95f2ce95be00b075cb3e6b9ef12891b` |
| `apps/web/src/lib/auth/session.ts` | `dd8d3ff1482794d4a358da4464168b37f0d064db4293d603c1d3674c3671a262` |
| `apps/web/src/lib/http/admission.ts` | `ff26f5393ee377369707ab0fe34b5ddfbdba82c7c4e5a66cff0fd79dc0663dfe` |
| `apps/web/src/lib/http/body.ts` | `b22403f84ede3f34ec8f1ae98cecfb67b92fbb6af032ba54fc81f2cd3da675f9` |
| `apps/web/src/lib/http/csrf.ts` | `d2f0b54e91b92bdb532130baf39c462baefec2746c5f02ddff522d34ab03fbf7` |
| `apps/web/src/lib/http/errors.ts` | `5324e42e2a83b77e47751f1b3f49234a22baa4005dc4b926b658bcfc9a185b4d` |
| `apps/web/src/lib/http/handler.ts` | `11f8d18cae3a61da6512f9d9b50548e12e996e72039f4b692f86785b67fc6e9e` |
| `apps/web/src/lib/http/input.ts` | `ba3a6c734b9ac6db58d46877e3d83f5e529947418e84be180a8d4f35a099c063` |
| `apps/web/tests/auth-config.test.ts` | `802952189225ed6aaf5c03e580b69fdd6ff9c021051757d11fe1854f7a8bd632` |
| `apps/web/tests/kdf-admission.test.ts` | `c4ef1904b8d6909263c780640dc8b3b334b371e78e37a7f0db35597e3a7b1d3d` |
| `apps/web/tests/onboarding-http-routes.test.ts` | `c68f81406ba1568863fe73cd3facc1345f36d64bd36c89e770f789d2f37bf82e` |
| `apps/web/tests/onboarding-http.test.ts` | `c9aa13f798baba133c890fe7d0bf7858fcabc3ca115360c205668d5437cb1799` |
| `apps/web/tests/onboarding-ui.test.ts` | `d71977fde7f2bc52f880d58cc0f911ea13b6131429e2d37592c8d026e11f1a94` |
| `apps/web/tests/password.test.ts` | `a67e874f47691ef996ad6a4694bec37704042e8107d5af2dda1a6258a217b09c` |
| `apps/web/tests/session.test.ts` | `44711b55e5dc406d5af7addbad1115a47ac8c8b7633f993014c33c250ca890ae` |
| `docs/features/identity-program-partner/01_specification.md` | `f4a311efd12075c120fa3754102f314bcd711c0e79f073b9e5abc85bb6a825da` |
| `docs/features/identity-program-partner/02_pseudocode.md` | `85f820c5237e0d56ce15e6fa4578b5049fc0d62d2d5e5662e3dffc042625db61` |
| `docs/features/identity-program-partner/03_architecture.md` | `c48fda7bcf48300a88a006bbeb1e887ddb3e0b89b179e6a759713e91047f02a4` |
| `docs/features/identity-program-partner/04_refinement.md` | `cabfbc15caf3c23c8136617bf8fa855254a5d89a7c3188b6079b6ce901e4a64e` |
| `docs/features/identity-program-partner/05_completion.md` | `880259fe23b9c6d3da84f96f6795216f833efe3d360d4d96e3bcd470cbd5abd6` |
| `docs/features/identity-program-partner/validation-report.md` | `5e3081ff951d667074e7651238108281bff363620e13f2a7b135f0e6a484d307` |
| `package-lock.json` | `08d9ee0b17ac2524bf93e787764e0d217c2ea32d2f136ab84603959006197731` |
| `package.json` | `ca8e90030dd0f088d46310085dfea8220a3413f6d7917dc48e299404804b756b` |
| `packages/db/src/auth-repository.ts` | `e3d6e39815a00076a7dd4015f6192d83755680c5592d0e0f2d335f4c7e806636` |
| `packages/db/src/onboarding-contract.ts` | `9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511` |
| `vitest.config.ts` | `7b3cd47fcfaba88f7e3c4b0f110ade74a039df202c34cf5fb677f689c882a53a` |

## Telemetry

RUN_ID `20260909T211734Z-identity-program-partner`; WORK_UNIT_ID `http-review`. Requested model/effort `gpt-6-astra` / `high`. Actual model/effort, token usage and cost are null: no attesting execution/billing metadata supplied to this worker; requested selection is not actual-model proof. No fallback or savings claimed; no comparator baseline. Coordinator prelaunch ledger is authoritative for start and path absence. Active wall time is null because independent active/wait instrumentation is unavailable. Terminal receipt contains measured elapsed wall time and report/source hashes.
