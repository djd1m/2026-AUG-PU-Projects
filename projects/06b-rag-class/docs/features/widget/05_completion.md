# F09 — bounded implementation handoff

Run-ID: 20261002T223848Z-widget
Work-Unit-ID: widget-implementation
Attempt-ID: implementation-1
Source-Revision: 39464ac3c4ac77afd43bf1c15859398b7dd42b12
Build-Revision: none
Launch-SHA256: 687230da0f5fdfd4290a4a76bda1eb78d6606ef3053de2ae8db14bd3caa148a3
Handoff-Recorded-At: 2026-10-02T23:01:01.288265+00:00
Verdict: bounded implementation handoff; feature acceptance pending

## Scope and AC

Approved plan: `01_plan.md`; validation: `02_validation.md`. ROUTE before implementation gave mechanical M;
substantive L (new public routes), approved fresh-SPARC M exception retained. No new paid policy or schema.
All source/test/build paths are listed with exact byte hashes in
`tests/artifacts/widget/implementation-source-hashes.json` (19 files, each under 500 lines).

| AC | Implementation / local evidence | Coordinator gate still pending |
|---|---|---|
| WID-01 | Self-contained TS IIFE, Shadow DOM/adoptedStyleSheets, open/close labels, text-only DOM rendering, credentials omitted for all fetches. `/w.js` emitted at 12223 bytes / 3824 gzip bytes. | Real 390/1440, host CSS isolation and restrictive CSP UI. |
| WID-02 | Shared publication/public-ID + strict Origin gate for config/ask/event/OPTIONS. Query bot covers bodyless preflight; optional body bot must agree. CORS only after allowed gate. Unit negative cases and Origin mutation passed. | Real browser OPTIONS/CORS and real PG execution. |
| WID-03 | Bounded 4096-byte JSON and 1..500 question before existing AnswerQuestion/PaidGateway; server account/channel/HMAC from final XFF + internal bot ID. Safe citations/contact, 429/503/recovery retained. | Authored real PaidGateway/PG provenance and quota cases must execute. |
| WID-04 | Exact server privacy notice above disabled-until-config input; visible config failure/retry, pending and request error recovery. | Actual browser loading/error/recovery. |
| WID-05 | Existing planOf + exact active removal decision; server future-F10 badge URL. MutationObserver + 2-second restoration, page-wide impression dedup, keepalive omit events limited to impression/tamper. Badge mutation passed. | Browser restoration/event counts and server PG event execution. |
| WID-06 | One metricHost, closed preview/IP/local/own-host exclusions; SQL ON CONFLICT config insert and first-question-if-NULL update, existing config only, account test/operator exclusion rechecked in SQL. | Authored config dedup/first timestamp concurrency and semantic/failed outcome PG cases must execute. |
| WID-07 | 34 new widget unit cases, focused regression 128 green, two production-guard mutations red/exact-restore/green. Real PG cases authored using existing fixtures. | Run real PG cases; independent review. |
| WID-08 | Source freeze, exact snapshot/build artifact hashes, local receipts. | Full regression/build, immutable image receipt, independent Astra review and actual foreign-origin Docker UI. |

## Files and seams

Widget: `apps/widget/src/index.ts`; build: `scripts/build-widget.mjs`, production-build-only
`apps/web/next.config.mjs` hook, project `tsconfig.json` inclusion and generated `w.js` ignore rule.
Web: three `/api/widget/{config,ask,event}` routes, `widget-handler.ts`, `widget-policy.ts`,
`metric-host.ts`, runtime seam. DB: `packages/db/src/widget.ts` + index export using existing schema/roles.
Tests: `apps/web/tests/unit/widget-handler.test.ts`, `tests/int/widget.int.test.ts` and test-only
`widget-fixture.ts` (real handler/gateway/PG + deterministic existing FakeProvider). The fixture is a
server-side test binding, with no production fake selector. `publish-bot.tsx` removes the obsolete
next-stage widget hint. Demo hint remains. `docs/embed-contract.md` records the contract and unverified UI.
No manifests/lockfiles/migrations/global/toolkit changes, donor N6 reads, children, network/installs,
Docker/ports, commits or pushes. F10 click/referral/removal and F11 operator surfaces are outside scope.
`/r/b/{public_id}` remains the canonical future F10 badge destination.

## Local checks

All local commands ran from project root with `/tmp/n6b-f06-node22/bin` on PATH (v22.22.3).
Exact commands, exits and stage metadata: `tests/artifacts/widget/implementation-checks.json`.

- `npm run typecheck`: exit 0, including widget and new integration tests. Initial exit 2 (wrong moscowDay import) was corrected.
- Focused Vitest command in checks JSON: exit 0, five files / 128 tests, including 34 widget cases and production provider guards.
- Actual Next production-build config hook invocation: exit 0, generated `apps/web/public/w.js`; no full Next build claim.
- Production-server config invocation with loader rejecting any TypeScript import: exit 0. This verifies the config seam, not a complete Next server launch.
- Build cap probe: expected exit 1 at 80,594 gzip bytes; output removed, exact source restored, later final hook build exit 0.
- `git diff --check`: exit 0. All changed source/test/build files <500 lines.

No real PostgreSQL test, full unit suite, full service build, Docker browser UI, image build or independent
review was run here. Their required gates are preserved for the coordinator, not claimed passed.

## Meaningful mutation receipts

Fixed test file: `apps/web/tests/unit/widget-handler.test.ts`. Exact commands and hashes are in
`tests/artifacts/widget/mutations.json`; raw red/green output is adjacent.
Origin test selector `denies Origin https://foreign`: production guard temporarily `if (false)`;
fixed assertion received 200 instead of 403 (exit 1). Badge selector `SC-US-009-1/2`: decision temporarily
`return false`; fixed Free assertion received false instead of true (exit 1). Exact original bytes restored
in finally, and each identical test command passed (exit 0). No quota/citation mutation repeated.

| Guard | Original SHA256 | Mutated SHA256 | Restored SHA256 | Exit red → green |
|---|---|---|---|---|
| origin | `bd45ad818b385c6e4b7967c48496bfed61b51c52172c1fa98f15be09e88144ec` | `8f2c64383ffc484d52f255ae729cd414e0586a09658c4a043e99711eae93e182` | `bd45ad818b385c6e4b7967c48496bfed61b51c52172c1fa98f15be09e88144ec` | 1 → 0 |
| badge | `a993b4e0aee5430c988b261769ef9246e2ffcb91a6723e6d0dd801755d82a8cc` | `b6075eb81892238f385addb45336d8d9c8c09f32883f7c1ec8c4908780b0473a` | `a993b4e0aee5430c988b261769ef9246e2ffcb91a6723e6d0dd801755d82a8cc` | 1 → 0 |

The separate gzip-cap probe also restored exact bytes at probe time; a subsequent legitimate widget
change added page-wide impression dedup. Final snapshot/build below bind that final source.

## Frozen identity and telemetry gaps

Source snapshot SHA256: `68c3f4a92f6f814a70a31b6b1839994c324ceece2637a08fcd402f633c97cb48`.
Tracked source/config diff SHA256: `4f59632fcf916eb1d99d7aabd65915afadefdb788f1c236422b95c45c98485f4`.
Generated w.js SHA256: `a9cffb1cce8585c5942b2d76030506ac633cde8e9addee3219510fba474e0edb`.
`widget-build-proof.json` binds the generated artifact to the source snapshot; Build-Revision remains none
because the full immutable production image is a coordinator gate.

Profile: compact-quality-first-v2; requested gpt-6.1-sol/high from coordinator launch metadata.
Actual native model/effort/usage/cost: null (not exposed to this worker); no fabricated counters or model switch.
Elapsed at handoff record: 1101.550 seconds from launch, including reading, implementation,
checks and receipt preparation; active time unavailable. No baseline comparison; savings not established.
Coordinator telemetry: `docs/telemetry/p-replicator/20261002T223848Z-widget/run.json`, `events.jsonl`,
`work-record.json`; worker did not edit those files. Own stage/check/mutation/build evidence is in
`tests/artifacts/widget/`. Project-work-companion was applied for source-bound preparation/handoff;
E2E preflight is not_applicable for this bounded attempt and must occur immediately before coordinator E2E.

Bounded implementation handoff is complete. Feature acceptance, public deployment and roadmap completion remain pending.


## F09-R1 correction-1 — preserved-history source handoff

Run-ID: 20261002T223848Z-widget · Work-Unit-ID: widget-r1-correction · Attempt-ID: correction-1.
Source-Revision: 39464ac3c4ac77afd43bf1c15859398b7dd42b12 · Build-Revision: none.
Launch-SHA256: d52c372c7d59177b8d0c5f85da97fc1b47d3574ab01e43482f3a85097d3aeafb.

Only production change: `apps/widget/src/index.ts`. Required branding is appended to `.root`, beside
the toggle and outside the collapsible `.panel`. Badge parent/computed-style checks now apply in either
panel state, and ancestor restoration targets the actual shared root. The chat panel is no longer repaired
as a badge ancestor; its hidden state, handlers, focus behavior and stylesheet remain unchanged. Successful
required config creates/restores the badge before impression handling. The existing page-wide per-bot Set
still deduplicates impressions; opening, closing and tamper restoration do not add another impression.
The server remains the sole source of badge_required; active paid-removal config creates no badge.
No F10 click logic, server/build-helper/manifests/CSS edits, dependencies, children, Docker, ports or commits.

All 19 original source-map hashes were verified before editing. Only the widget source hash changed;
new immutable `tests/artifacts/widget/correction-1-source-hashes.json` preserves the complete map.
Original implementation snapshot/evidence and `08_review.md` remain unchanged; this section is appended.

Correction snapshot SHA256: `00f9a5a25dc0506e7df3f2bad58457c407474f0206e777f90b8912456c2f3954`.
Widget source SHA256: `c6a052d4becb9f8b4ab40d58c272b08437a8f1eceeed2ccd7c6083910f1601bd`.
Generated w.js SHA256: `6aed4d4c21c49bc1c2ae733ce8ab2283a7961ed6a68c46752ae7468e40235090`.

Actual local checks, Node v22.22.3 (`/tmp/n6b-f06-node22/bin` on PATH), project root:

- `npm run typecheck`: exit 0; `correction-1-typecheck.txt`.
- `node --input-type=module -e 'const {default:config}=await import("./apps/web/next.config.mjs"); await config("phase-production-build");'`: exit 0; `correction-1-widget-build.txt`. Actual bundle 11,932 bytes, 3,756 gzip bytes (Node gzipSync), below 30,720 bytes. This is the widget hook, not a full Next/image build.
- `git diff --check`: exit 0. Source continuity/diff verification confirms exactly one changed source-map entry.

No unit test changed or rerun. The existing 128 focused unit tests cover server policy rather than DOM;
unchanged server Origin/badge mutations are preserved and were not repeated. Local resolution found no
jsdom/happy-dom/Playwright DOM harness, and the brief forbids installs/network/Docker. No substitute
string test, synthetic DOM pass or actual browser pass is claimed. During evidence preparation a Python
gzip-default assertion stopped the metadata script after snapshot creation; Node gzipSync remeasurement
confirmed the unchanged successful build's 3,756-byte gzip result. Source and tests were not changed for this.

### Required actual UI acceptance cases — pending, not executed here

Use the already-planned real foreign-origin page, restrictive CSP and hostile host CSS, at both 390/1440.
Bind browser evidence to the correction snapshot and generated asset hash; run readiness preflight immediately
before E2E. Observe computed visibility, rendered rectangles, ancestor visibility and actual event requests.

| Case | Required observation |
|---|---|
| Free / server-normalized unknown plan, initial collapsed config | With no toggle click, panel stays hidden and aria-expanded=false; exactly one visible “Работает на N6b” anchor appears beside the visible bubble with server URL; one impression event. Exercise unknown plans through server-owned fixtures. |
| Open then close with both close button and toggle | Panel opens/closes and focus behavior remains usable; the same branding stays visible throughout; no extra impression after repeated cycles. No horizontal overflow at either width. |
| Badge tamper in each panel state | Remove or move the badge into the hidden panel; alter text/href/class/target/rel, set hidden/style/display/visibility/opacity. Observer or periodic repair restores a visible root-level badge with canonical text/URL/attributes, emits tamper, retains current panel state and adds no impression. |
| Actual root / stylesheet tamper in each panel state | Hide/style/reclass/remove the shared root or change adoptedStyleSheets/CSSOM/add internal style. Restore the visible root and badge within the existing two-second check, retain panel state and page-wide impression count. Verify host layout/style and CSP behavior using the existing planned checks. |
| Paid start/studio with active removal | Server config badge_required=false: no badge or impression/tamper event initially, after open/close or after periodic checks. Client-side paid flags must not override a required server config. |
| Duplicate widget for same bot, then actual page reload | Same-page duplicate/open/close/tamper emits at most one impression across instances; a fresh page load permits one new impression. |

Full unit regression, real PG, full production build/immutable image, corrected-source independent review,
and actual foreign-origin UI remain coordinator gates. This is a corrected-source handoff, not F09 acceptance.
Profile: compact-quality-first-v2; requested gpt-6.1-sol/high. Native actual model/effort/usage/cost and
active time are unavailable to this worker; coordinator must reconcile native metadata. No measured savings.
Worker stage/check/build/duration/history evidence: `tests/artifacts/widget/correction-1-checks.json`.
Coordinator telemetry remains `docs/telemetry/p-replicator/20261002T223848Z-widget/{run.json,events.jsonl,work-record.json}`
and was not edited by this worker. CLI owns the terminal receipt; no TRACE is written manually.


## F09 fixture-correction-1 — bounded fixture correction

Run-ID: 20261002T223848Z-widget · Work-Unit-ID: widget-fixture-correction · Attempt-ID: fixture-correction-1.
Source-Revision: 39464ac3c4ac77afd43bf1c15859398b7dd42b12 · Build-Revision: none.
Launch-SHA256: 94afe3c5ba9661faeac7e287179f815443a044a70fb640bacfd63433105e01cd.

The demonstrated `bot_published_needs_contact` failure (all seven widget PG cases,
`tests/artifacts/widget/attempt1-final-full-regression.txt`, lines 240–282) is corrected only
in `apps/web/tests/int/widget-fixture.ts`: seed options now default contact to
`owner@example.test` before publication, retaining explicit non-null contacts.
Shared sandbox `answer-fixture.ts`, DB constraint, product source and test assertions are unchanged.

Node v22.22.3: `npm run typecheck` exit 0; log `tests/artifacts/widget/fixture-correction-1-typecheck.txt`.
`git diff --check` exit 0. Previous source map retains 19 entries with exactly one updated entry;
other 18 hashes match. Snapshot: `1f8de8e69a48755557fc8279848fafaa90d2e0eca45ef21c8aeac491097fd199`;
map `tests/artifacts/widget/fixture-correction-1-source-hashes.json`. Historical completion is preserved.
No unit/mutation repeat, actual PG/DOM run or full feature acceptance is claimed. Actual PG is the coordinator's next gate.
Profile: compact-quality-first-v2; requested gpt-6.1-sol/high; native actual model/effort/usage/cost unavailable (null).
Attempt stages/checks/duration: `tests/artifacts/widget/fixture-correction-1-checks.json`;
coordinator telemetry at `docs/telemetry/p-replicator/20261002T223848Z-widget/` is untouched.
CLI owns the terminal receipt; no TRACE written manually.

## Приёмка координатора — 2026-10-02T23:59:06.431907+00:00

WID-01…08 приняты на `80b4e35c4dbab99316c633fa95c6d887f0b741a2`. Финальный snapshot `1f8de8e69a48755557fc8279848fafaa90d2e0eca45ef21c8aeac491097fd199`, все19файлов совпали с immutable runner. Productionimage `sha256:82460803f628576175aac1dc260f8df39d8938d4f6defff683034100d3ccecc2`, w.js3756байт gzip. Astra08 нашёл P2 collapsedbadge; отдельный Sol исправил, Astra09 ACCEPT. Ошибка contact в тестовой фикстуре исправлена отдельно, Astra10 ACCEPT. История исходных отчетов/квитанций сохранена.

Node22 typecheck/fullbuild0;515unit пройдены до fixture-onlyправки, production/unitbytes неизменны. Полный PG215/216: единственный оставшийся T9 не нашёл db/dist из-за моей пропущенной pretestсборки при reuseunit. Я восстановил prerequisite; affected19/19 прошли. Все216уникальных интеграционных сценариев имеют успешное подтверждение; монолитный зелёный прогон не выдуман. final-checks-summary.json связывает три попытки, включая исходные7fixturefail.

ActualDockerUI2 PASS1440/390,8снимков; просмотрены answered390/collapsed1440. Настоящие OPTIONS204/POST200 exactOrigin,безcookie/credentials; strictCSP/hostileCSS,privacy/disabled/pending,ответ/цитата/контакт,503recovery,denied403безмодели,collapsed/close/tamper/oneimpression/paidabsence. Только answerprovider детерминирован в test-only bridge при настоящих handler/gateway/PG; config реального web задержан250мс сетевымtransport. Playwright routing полностью отсутствует в принятойUI2. UI1 сrouting не наблюдалOPTIONS, честноfailed; исправленharness, productimageне менялся. Cleanupownstack/privateenvcomplete,sharedbrowserpreserved.

ActualCLI Sol6.1high/Astra medium подтверждены6nativeсессиями. Измеренный subtotal 5696406tokens; elapsed 4817688ms отначалаrecord, coordinator/active/costunknown,pre-recordprepнеизмерен. Profilecompact-quality-first-v2; экономиянеустановлена. Strictcompanion aggregate вevidence/delivery-1. F10badge-referral следующий; публичныйстенд/livecalibration и rootdependencyadvisories не закрывались.

### Уточнение файловой доставки

Два узких fixture CLI завершились0, но `-o` не записался из-за относительного пути при project cwd координатора. Оригинальные TRACE отсутствуют и не объявляются строгими квитанциями. Точные native final_answer сохранены отдельно в `*-recovered-final.md`, происхождение и SHA — `evidence/receipt-output-recovery.json`. Source reports и native usage сохранены. Строгий companion index использует только aggregate delivery-1. Следующие CLI запускаются с абсолютным `-o`. Первое извлечение native проверяло phase=final, тогда как фактический phase=final_answer; эта проверка завершилась до записи файлов, затем исправлена.
