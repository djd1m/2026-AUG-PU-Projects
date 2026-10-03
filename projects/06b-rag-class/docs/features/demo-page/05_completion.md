# F12 bounded implementation handoff

Run-ID: 20261003T021046Z-demo-page  
Work-Unit-ID: demo-page-implementation  
Attempt-ID: implementation-1  
Source-Revision: 24d7e6fb85c425347ae31205f43888575e84594c  
Build-Revision: none  
Launch-SHA256: 4ee024fdb45ded0592a33d581c8e54f252b094254a16d4c5a8f85149fb0ffbf8  
Source frozen: 2026-10-03T02:29:13.556727+00:00  
Snapshot-SHA256: 59bdd808a5ace6d3975826c9ba622f83a80db39e5525fdd39e06121b1114ff04

Bounded implementation handoff only. F12 is **not accepted**: mandatory coordinator gates below remain pending.

## Scope and implementation

The public SSR `/b/{slug}` page and separate `/api/demo/{slug}/ask` handler resolve the stored slug only when `published AND demo_enabled`. The request guard accepts JSON media type with parameters and a normalized serialized same-origin Origin. It denies foreign/simple POST before admission, uses bounded existing JSON parsing, and derives visitor/channel/owner from server authority. The existing AnswerQuestion/PaidGateway and configured visitor/bot/global caps remain the sole paid path. Demo logs use `demo`; no demo code writes widget installs or badge impressions.

Explicit publication atomically allocates a 24-character cryptographically random slug with the existing unique constraint. Row UPDATE serialization and COALESCE retain it on concurrent saves and disable/re-enable. Body slug/public ID remain ignored by the existing validated publication handler. Enabled/null legacy rows allocate on the next explicit save. Disabled cabinet/publication DTOs hide the retained slug. A checkbox and saved link connect the cabinet and sandbox CTA.

Server privacy appears before input; Free badge links to `/r/b/public_id`, and the existing paid-active badge decision hides it. The chat provides pending, error, retry, citation and limit/contact states. React escapes text and citation labels, and rendered citation links permit only stored http(s) URLs. Responsive CSS reuses the cabinet tokens.

## AC and evidence

| AC | Implemented / local evidence | Remaining gate |
| --- | --- | --- |
| DEM-01 | Separate parameterized demo reader, bounded slug, safe presentation DTO; handler unit gates pass; real-PG published/enabled/unknown/empty-widget-allowlist cases authored | Execute PG and actual GET/404 |
| DEM-02 | Route headers configure noindex/no-store/frame-ancestors none/DENY, global headers retained, force-dynamic SSR and middleware no-store; config unit passes | Actual HTML and 404 headers; foreign iframe in browser |
| DEM-03 | Strict Origin/media before lookup/admission; JSON/question/byte/IP checks, client authority ignored; unit tests and media mutation pass | Execute authored PG guard/counter cases |
| DEM-04 | Existing gateway, visitor HMAC and demo log channel; no widget-install calls; real-PG success/limit/existing-install preservation and two 50-request mixed-channel races authored | Execute real PG including caps=3, exactly three admissions/six provider calls |
| DEM-05 | Privacy/badge/escaped HTML/citation scheme tests pass; Russian chat supports pending/retry/error/limit/contact | Browser desktop 1440/mobile 390, overflow/console/content/retry |
| DEM-06 | Atomic stable slug, safe DTO, checkbox and usable CTA; unit body-spoof/client tests pass; real-PG foreign-owner/legacy/toggle/concurrent-first-enable cases authored, existing session publication case extended for slug spoof/reload | Execute real PG and actual register/publish/enable/disable/reload |
| DEM-07 | Local typecheck, 122 focused tests, exact-restore guard mutation, diff check and immutable 24-file map recorded | Full Node22 all-unit/all-real-PG/build and fresh independent Astra review |
| DEM-08 | Production route/gates stay real; existing test-only FakeProvider DI is reused in authored PG tests; no production fake selector | Coordinator companion preflight, real Docker browser session, receipts and cleanup |

## Commands and measured outcomes

All commands ran from this project, Node v22.22.3, with `PATH=/tmp/n6b-f06-node22/bin:$PATH`. No Docker, port binding, network, installs, commit or push ran.

| Command | Exit / result | Evidence |
| --- | --- | --- |
| `bash ../../scripts/complexity-router.sh <24 exact changed source/test/config paths>` | 0, mechanical M; substantive public-path L with documented fresh-SPARC M exception, all mandatory gates retained | `tests/artifacts/demo-page/implementation-route.txt` |
| `npm run typecheck` | 0, final source; includes web and authored PG test types | `tests/artifacts/demo-page/implementation-typecheck.txt` |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/demo-handler.test.ts apps/web/tests/unit/demo-view.test.ts apps/web/tests/unit/publish-handler.test.ts apps/web/tests/unit/publish-bot-ui.test.ts apps/web/tests/unit/widget-handler.test.ts packages/rag/tests/unit/guards.test.ts packages/rag/tests/unit/guards-index.test.ts` | 0, 7 files / 122 tests passed | `tests/artifacts/demo-page/implementation-focused-tests.txt` |
| Exact same fixed demo-handler test suite with JSON-media guard disabled | 1, 7 failed / 27 passed | `tests/artifacts/demo-page/media-guard-red.txt` |
| Exact-byte original restored; same demo-handler test suite | 0, 34 passed; original/restored SHA identical | `tests/artifacts/demo-page/media-guard-restored-green.txt`, `media-guard-mutation.json` |
| `git diff --check` | 0 | `tests/artifacts/demo-page/implementation-diff-check.txt` |
| Changed-source/test/config line check | 24 files, each <500 lines | Hash map enumerates the checked files |

`apps/web/tests/int/demo.int.test.ts` contains seven real-PG cases (including both cap races); it is authored and typechecked, **not executed**. Existing `publish.int.test.ts` additionally verifies client slug is ignored and cabinet reload returns the stored slug. Coordinator executes them through the existing `npm run test:int` suite. Established `seedWidgetFixture`/`seedAnswerFixture` and internal test-only `constructGateway` provide FakeProvider DI behind the real handlers, gateway and PG. No paid external calls were made.

## Routing, measurement and handoff

Profile: `compact-quality-first-v2`, single bounded writer per explicit brief. Requested model/effort: `gpt-6.1-sol` / high. Actual model/effort, tokens and cost are unavailable in this executor; coordinator must reconcile native metadata. No model switch, fallback or children were invoked. No savings claim. At source freeze, elapsed from launch is 859.700 seconds, including reading, implementation and checks; active time is unknown. Hard stop remains 1500 seconds inclusive.

Telemetry is coordinator-owned at `docs/telemetry/p-replicator/20261003T021046Z-demo-page/`. Run/work-record/events/roadmap were not edited by this writer. The CLI captures the substantive terminal receipt at `docs/telemetry/p-replicator/20261003T021046Z-demo-page/evidence/implementation-1-receipt.md`; this writer does not manually write that path. Launch digest verified from exact bytes.

Source/test/config identity is in `tests/artifacts/demo-page/implementation-source-hashes.json`; snapshot digest uses SHA256 of canonical sorted compact JSON of its exact-byte file map. Build is absent. Before independent review/full regression/build/UI, verify those hashes and keep the source frozen. Companion E2E preflight is `not_applicable` for this author stage because actual E2E is coordinator-owned and was not started. Mandatory acceptance is pending, not waived. Public deployment and live calibration remain outside this bounded launch.

## Coordinator runtime closure

Initialfull failed matcher test; R1 test-only Sol fix and fresh Astra ACCEPT. Next full610unit/246PG passed, one authored botcap fixture rejected invalidvisitor50>bot3. Second test-only Sol correction keeps distinct50visitorKeys and original3success47refusal6calls assertions; fresh Astra ACCEPT_WITH_CAVEATS. Final affected7PG/type/appbuild/productionimages all0; unchanged prior green suites not repeated. Composite coverage610unit/247uniquePG, final25file host/image hashesmatch. Histories preserved. ActualDockerUI pending.

## Приёмка координатора — 2026-10-03T03:09:56.665832+00:00

DEM-01..08 приняты на 05d05ca9fe3edd911f4d953ad8848f34505b36d8; final25snapshot a7ce1d5c28fa33d7d2de07a17a47cca86f68c9ff48de3f12fa8bd59c1de4de83. Составная регрессия610unit/247uniquePG/type/build0, all25host/imagehashes совпали; два test-only замечания закрыты отдельными Sol/Astra и проверками, histories preserved.

Actual DockerUI1440/390, eight screenshots: real registration/API-created bot, owner checkbox publication/save/reload, public demo200 with no-store/noindex/CSP frame-ancestors none/DENY, server privacy and visible Free badge, cited answer200 with escaped malicious-looking text, actual foreign iframe blocked and simple POST403 without provider/log changes,503 retry200 then429/contact, paid-active badge hidden, disableGET/POST404 and re-enable same slug. Persisted SQL stats show only demo logs and zero widget installs. Production Next HTML/auth/cabinet/publication unchanged; answer HTTP uses identical frozen demo handler plus real gateway/PG and isolated FakeProvider with fixture visitor cap3. No Playwright routing, response fulfillment, production fake selector or paid calls. Fixture source/chunk seeded into API-created bot. Own stack/network/contexts/privateenv removed; shared browser retained. Preflight1 wrong priorrun timestamp failed before browser; UI1 strict alert locator collided with Next announcer; both histories preserved, accepted UI2 scopes locator to chat. No product edits after the frozen runtime source.

Six actualnative Sol6.1high/Astra medium; CLI subtotal 4671756, elapsed 3550302ms. Coordinator/cost unknown. Следующий этап studio-subaccounts, с обязательствами семейной атрибуции F10/F13/F14.
