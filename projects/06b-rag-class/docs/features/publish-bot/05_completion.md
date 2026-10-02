# F08 — bounded implementation handoff

Implementation is ready for coordinator checks, not feature acceptance. Approved plan:
`01_plan.md`, PUB-01…08. Profile `compact-quality-first-v2`, substantive risk M;
mechanical ROUTE M, exit 0. No child agents, Docker, network, ports, installs, dependency,
manifest, lockfile, schema, toolkit, donor N6, commit or deployment work was performed.

Run-ID: 20261002T213130Z-publish-bot
Work-Unit-ID: publish-bot-implementation
Attempt-ID: implementation-1
Source-Revision: 7b82dffc9d84a5e64b16d59a103a65e678a93bbb
Build-Revision: null
Launch-SHA256: e15ef0e239848fbe61fd75cdfe16043d7c538d79e1d593b6d4bccf2971f905ed

The dirty source is bound by `tests/artifacts/publish-bot/implementation-source-hashes.json`:
18 exact production/test file digests, aggregate SHA256
`13a3a5f48e5725ec091c87eed22aa30b16bce18f940c26224a90103335993a21`.
This covers code and tests, not a production build. Recompute after any correction.

| AC | Implemented behavior and local evidence | Coordinator gate |
|---|---|---|
| PUB-01 | PATCH route/runtime/handler; same-origin, session, UUID, bounded JSON, 401/403/404/422/413, safe 503. Server selects account and immutable public ID. Handler tests pass. | Real session/RLS integration and build pending. |
| PUB-02 | Contact required: bounded e-mail, E.164, credential-free HTTPS. Invalid payload returns before tenant connection/write and exposes no embed code. Fixed missing-contact guard passed and failed under production mutation. | Real invalid-before-write/preserved-state tests pending. |
| PUB-03 | One URL.origin helper canonicalizes case, IDNA, default ports; distinct schemes/nondefault ports, duplicates removed, forbidden origins rejected. Empty list remains empty. Validation tests pass. | Persisted canonical origins covered by pending PG case. |
| PUB-04 | First chronological site origin proposed only for unpublished bot; owner submit confirms. PDF-only proposes nothing; published empty list remains empty on reload. Helper tests pass. | Real source ordering/reload case pending. |
| PUB-05 | One owner-scoped UPDATE under withTenant writes contact, origins and published together; optional demo boolean preserved when omitted. | Five new real PG cases include RLS and six different overlapping payloads; final row must equal one whole payload, never a mixed tuple. Unrelated owner progresses while first bot is row-locked. Not executed locally. |
| PUB-06 | Configured PUBLIC_BASE_URL/w.js + immutable public_id + async, code returned only with published/valid contact and rendered as readonly textarea text. No executable HTML or invented demo URL. Local code/client tests pass. | Real persisted reload and actual browser checks pending. |
| PUB-07 | Labelled form, disabled pending fields, error/retry messages, closed-list hint and mobile-safe widths. Sandbox CTA links to form; demo remains disabled with readiness text. Client submission/static checks pass. | Actual 390/1440 Docker UI, overflow/JS errors, real registration/PATCH/PG pending. |
| PUB-08 | Node 22 typecheck, focused units, exact mutation restore and source snapshot completed. | All units, all real PG integration, full build and independent Astra review pending. |

Production files: `apps/web/src/server/{publish-handler,origin,contact,runtime}.ts`,
`apps/web/src/app/api/bots/[id]/publish/route.ts`,
`apps/web/src/app/cabinet/{publish-bot,page,sandbox}.tsx`, minimal `globals.css`,
`packages/db/src/{publish,cabinet,index}.ts`.

Necessary extra existing seam: `apps/web/src/server/auth-handler.ts` adds optional
`readJson(request, { objectOnly: true })` mode. Without it, the JSON string
`"too-large"` collides with the helper's size-limit sentinel and incorrectly yields
413 instead of invalid-payload 422. Publication also requires exact JSON MIME in
this mode. Existing callers retain default behavior; auth-handler regressions pass.

New tests: `apps/web/tests/unit/{publication-validation,publish-handler,publication-guard,publish-bot-ui}.test.ts`
and `apps/web/tests/int/publish.int.test.ts`. Unit client checks are not browser E2E.
Integration uses real PostgreSQL session lookup and tenant RLS, no provider or
outgoing contact/origin fetch. The old F07 browser artifact expects disabled
publication CTA; F08 intentionally replaces it with the publication link, so the
coordinator's current UI assertions must reflect PUB-07 rather than that old state.

Local checks ran from project root with `/tmp/n6b-f06-node22/bin` prepended to PATH:

- `npm run typecheck`: exit 0 (`v22.22.3`), including new integration/client tests.
- `./node_modules/.bin/vitest run --config vitest.config.ts apps/web/tests/unit/publication-validation.test.ts apps/web/tests/unit/publish-handler.test.ts apps/web/tests/unit/publication-guard.test.ts apps/web/tests/unit/publish-bot-ui.test.ts apps/web/tests/unit/ask-handler.test.ts apps/web/tests/unit/create-bot-ui.test.ts apps/web/tests/unit/auth-handler.test.ts`: exit 0, 124 tests / 7 files passed.
- `git diff --check`: exit 0.
- Fixed guard command `./node_modules/.bin/vitest run --config vitest.config.ts apps/web/tests/unit/publication-guard.test.ts`: production missing-contact branch disabled temporarily, exit 1 with `expected 200 to be 422`; exact original bytes restored, same unchanged test exit 0. Evidence contains original/mutant/restored and unchanged-test SHA256. Repeated after object-only seam correction to bind final source; initial evidence retained.

Evidence: `tests/artifacts/publish-bot/implementation-{checks.json,typecheck.txt,focused-tests.txt,source-hashes.json}`,
`contact-guard-{mutation.json,red.txt,restored-green.txt}` and preserved initial mutation artifacts.
Own progress: `docs/telemetry/p-replicator/20261002T213130Z-publish-bot/evidence/implementation-1-progress.json`.
Coordinator run/events/work-record and roadmap were not edited by this executor.

Requested model/effort: `gpt-6.1-sol` / high. Native actual model, effort, token
usage and cost are unavailable to this executor and remain null; coordinator
reconciliation pending. Launch start `2026-10-02T21:35:41.850805+00:00`; source
freeze `2026-10-02T21:49:14.934582+00:00` (813.084 seconds from launch).
Terminal duration is recorded in own progress/receipt; accepted-feature duration
remains open. E2E preflight is not applicable to this local stage; the coordinator
must perform it before actual E2E. Stand visitors/calibration are separate release
gates and are not claimed here.

## Итог координатора — 2026-10-02T22:25:27.149996+00:00

PUB-01…08 приняты на `094a13c7b1653ecac853f73a8d2e20c34ab16b93`. Независимое Astra: ACCEPT_WITH_CAVEATS, находок0; оговорки полногоruntime закрыты финальным Node22 Docker typecheck/481 unit/209 PostgreSQL/build exit0 и actualUI1440/390 PASS. Все18файлов совпали с неизменяемым runner; tests/artifacts/publish-bot/tested-source-final.json. Guardcontact дал meaningfulred200vs422 и exactrestoregreen; нового productисправления после review не было.

Productionimage `sha256:ff4d0d287194a97b2ba53df83ac94cd0af42fd3b50100063a188c38c20b71053`. UI: настоящие регистрация/session/PATCH/PG; шестьснимков; контакт422, originproposal/normalization, pending, embedкакtext, reload/emptylist, foreign404, nooverflow/noJSerrors. Никакойподменыhandler/provider; ответ задержан200мс дляпроверкиpending. Источник — публичныйIPбезобхода; DNSexample.com недоступен в internalсети(EAI_AGAIN). UI1/2 — моиошибкиметаданныхдоbrowser, UI3 — DNSfixtureпослерегистрации; история сохранена, UI4passed. Продукт/fullsuite не менялись и не повторялись. Собственныестеки/privateenvудалены.

ActualCLI Sol6.1high + Astra medium; profilecompact-quality-first-v2/M. Nativeusage/timestamps в evidence; coordinator/costunknown. ReviewerlastStatus оставленкакесть; strictcompanionпоставка подтверждаетсяновой агрегирующейквитанцией, не переписаннойисторией. npm audit4существующихtransitiveadvisories переданыroot: ихустранение/публичныйrelease не объявлены. Следующийэтап widget, затемостальнойroadmap.
