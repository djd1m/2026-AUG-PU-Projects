# F07 bounded implementation handoff

Run `20261002T202425Z-rag-answer-sandbox`, work unit `rag-answer-sandbox-implementation`, attempt `implementation-1`.
Source `0598b253e5415975df5e24cb5eb98230505f5347`; dirty source/test snapshot is bound by
`tests/artifacts/rag-answer-sandbox/implementation-source-hashes.json`. No commit or production build was made.
This is an implementation handoff, **not feature acceptance**. Roadmap remains unchanged.

The authenticated ask route validates same origin, session, UUID, bounded JSON (existing 4096-byte streaming reader),
and a nonblank question of at most 500 UTF-16 code units before accessing the paid gateway. It resolves the owner
under tenant RLS and accepts only the question from the body; channel and account always come from the server.
The answer pipeline uses existing PaidGateway.beginAnswer, embedQuestion, searchChunks top5, and attempt.generate.
Runtime MIN_SIMILARITY controls the pre-generation threshold; its fulfilled PENDING_DECISIONS entry was removed.
Existing provider schema, pinned provider, deadlines, reservation, and constructor/export restrictions are unchanged.

Unknown/empty/non-retrieved/below-threshold cited IDs refuse deterministically. Citations join chunk, document and
source with explicit bot/account predicates; incomplete or unsafe locators refuse the whole answer. Site links
come from DB, PDF labels use DB filename/page. Model URLs are stripped and the UI uses plain React text.
Every accepted attempt writes one outcome; 429 uses existing Retry-After/refusal helpers and contact, failures return
safe 503 without retry or refund. Terminal persistence runs outside provider awaits. Answer log, conditional bot
marker and growth event share one transaction; event failure propagates without a second log or successful CTA.

The cabinet has a labelled question form, 500-character bound, pending/error/recovery states, answers and citations.
The existing succeeded-job affordance links to the bot's sandbox. The first cited answer shows disabled
«Вставить на сайт» and «Поделиться демо-страницей» CTAs with publication/contact/domain readiness explained.
Publication routes, demo URLs, widget code, donor code and Docker operations were not added.

| AC | Implementation and evidence | Pending gate |
| --- | --- | --- |
| ANS-01 | Ask handler, gate unit tests, real PostgreSQL gate/owner/foreign-bot tests authored | Execute real DB tests |
| ANS-02 | Existing top5 search, DB citation joins, site/PDF/provenance units and PG tests authored | Execute real retrieval/provenance tests |
| ANS-03 | Deterministic reasons, filtered citation guard, exact refusal text; unchanged fixed guard test red/restored green | Execute all refusal PG cases; later live calibration is outside F07 |
| ANS-04 | Existing quota/provider refusal helpers; orchestration units passed, charged-failure/quota PG tests authored | Execute real quota/provider cases |
| ANS-05 | One transaction, conditional marker; 10 concurrent API answers, independent bots and trigger rollback tests authored | Execute PG race/rollback tests |
| ANS-06 | Runtime boot threshold wired, existing provider guards passed, prompt data boundary tested | Independent source review |
| ANS-07 | Cabinet form and affordance implemented; test-only deterministic fixture provided | Docker UI at 1440/390, recovery/XSS/overflow/console checks |
| ANS-08 | Local typecheck and focused units passed; source/test hashes and receipt | Coordinator full units/integration/build/images/cleanup and independent Astra ACCEPT |

Local checks: initial focused run passed 64 tests across five files. Added flow/config checks passed 90 across two
files. Final ask-handler run passed 16 after adding the absent-origin case. These correspond to 155 distinct final
unit tests across seven files; overlapping ask-handler reruns and mutation checks are not additional coverage.
The 21 new real-PostgreSQL test cases are authored/typechecked, not executed here. Full suite, production build,
images and browser checks were not run. Two initial npm typecheck invocations from the repository root exited 254
(ENOENT package.json); project-directory typechecks subsequently exited 0. Detailed commands and exits are in
`tests/artifacts/rag-answer-sandbox/implementation-checks.json`.

Mutation evidence and exact handoff: `tests/artifacts/rag-answer-sandbox/citation-mutation-handoff.md` plus
`citation-mutation.json`, `citation-mutation-red.txt`, and `citation-mutation-restored.txt`.

The test-only fixture is `apps/web/tests/int/answer-fixture.ts`: `seedAnswerFixture(owner, cabinet, service, options)`
creates real DB data and an actual PaidGateway around a deterministic FakeProvider, returning the real ask handler,
fixture token and IDs. No production fake selector exists. For coordinator browser checks, authenticate the cabinet
normally in the isolated test stack, pass that real account's ID as `options.accountId`, and explicitly intercept
only that bot's ask POST in the browser harness. Forward its body to the returned handler using `request(f.token,
body)` and `f.botId`, and fulfill with the handler's status/headers/body. This binds the real cabinet form to the
real API/gateway/DB pipeline with a fake provider; the fixture's session lookup is test-only. Record this interception,
source/image hashes and companion preflight in UI evidence. It is UI acceptance under a test binding, not live-provider
acceptance. Options `delayMs`, `answer`, and `outcomes` allow pending, unknown and safe-failure cases; production remains
unchanged. Existing separate API/DB tests exercise real gates. No browser binding was executed by this worker.

Profile compact-quality-first-v2, substantive tier M under approved fresh-SPARC exception. Requested model/effort:
gpt-6.1-sol/high; actual model, effort, usage and cost are null because worker-visible native metadata is unavailable.
No fallback or child was launched. Worker-only telemetry lives in
`docs/telemetry/p-replicator/20261002T202425Z-rag-answer-sandbox/evidence/implementation-1-telemetry.json` and
`implementation-1-events.jsonl`; the coordinator owns run.json, events.jsonl and the overall acceptance record.
The terminal receipt gives measured elapsed time including reading and checks. No savings claim is made.

## Принятая поставка — 2026-10-02T21:27:29.543314+00:00

ANS-01…08 закрыты на `715a3edfccd3e8db4d5f25692617392ed98e2052`. Единственный P2 — неполное удаление URL модели — исправлен двумя файлами и независимо принят Astra (09_correction_review.md). Финальный Docker Node22: typecheck/394 unit/204 integration/build exit0;21/21 файлов совпали с неизменяемым runner (tested-source-final.json). Исходный expected-red guard цитат и2новых assertion-red URL сохранены; неизменный guard повторно не запускался.

Реальный production Docker UI1440/390: PASS,8скриншотов, регистрация, сайт/PDF-цитаты, отказ безконтакта,503/восстановление, pending/inputbound/CTA/layout/noJSerrors. Тестовая привязка направляет только ask посеянных ботов к реальным handler/gateway/PG с детерминированным провайдером и тестовой аутентификацией; это не проверка платного провайдера или калибровки. Auth/tenant отдельно проверены реальными21PG кейсами. Образ `sha256:16141faf089c07dfd0603c0a4de24937060c9a8a3b9f9b030035369635d51818`. Первый UI проход ошибся в тестовом ожидании текста безконтакта; его отчёт сохранён, продукт не менялся.

Собственные контейнеры/сети/privateenv удалены, общий браузер сохранён. Профиль compact-quality-first-v2/M; nativeCLI Sol6.1high (реализация/коррекция), Astra medium (два ревью); точные timestamp/usage в evidence/*-native-usage.json, стоимость и расход координатора неизвестны. Исторические короткие CLI receipts не заменялись; полнота проверок в progress/checks и итоговой source-bound квитанции. Следующий этап — publish-bot; release gates калибровки/публичной поставки остаются.
