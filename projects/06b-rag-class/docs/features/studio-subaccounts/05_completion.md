# F13 bounded implementation handoff

Run-ID: 20261003T031332Z-studio-subaccounts  
Work-Unit-ID: studio-subaccounts-implementation  
Attempt-ID: implementation-1  
Source-Revision: 362e8f4f3d341023751b085e3b32c82b59acb053  
Build-Revision: none  
Launch-SHA256: 277a85e2006159906e4028c67268c1c52b26b0b9a3806578fc5e462ded8e4606  
Source frozen: 2026-10-03T03:33:02.292785+00:00  
Snapshot-SHA256: 38cca51076dc9b4bbfbd1b35209e47005233e228aa0766f5d6b14fa3f87eed8a

Verdict: bounded implementation handoff. F13 acceptance remains pending mandatory coordinator gates.

## Implementation and authority

`POST /api/studio/clients` requires same-origin authenticated session authority. Optional JSON is bounded before acquiring a connection; all body fields are ignored. The service transaction locks the studio and, when applicable, the referral source account in UUID order using `FOR NO KEY UPDATE`. It then rechecks studio kind and absence of parent, counts all attached children (including revoked access), and inserts only below five. Child defaults explicitly set owner/free, null email/password, parent=session actor and studio access=true. There is no new child session, login credential, plan mutation or upgrade endpoint. Sixth-client response is 409 with exactly `предел 5 клиентов в MVP`.

The cabinet lists visible clients, selects via explicit `?account=<uuid>`, and offers a return to the studio's own account. The query/form account UUID is an untrusted selector verified under existing actor RLS. Bot creation proves target visibility inside the same tenant transaction that inserts bot/source/job with the actual target owner. Website is optional so a selected child can start with a PDF-only bot.

Sandbox lookup and publication use bot visibility under actor RLS instead of requiring the actor to own the bot. Sandbox quota uses the resolved bot owner's account. Existing site/PDF enqueue functions already derive source/file/job ownership from the visible bot; their authority is unchanged. Selected cabinet lists filter visible rows by actual owner. All `withTenant` calls retain the session actor. Public widget/demo behavior and ordinary-owner workflows retain their existing paths.

Child referral attribution uses only validated `n6b_ref` cookie data and the existing resolver inside creation's service transaction. Studio/self-child sources are excluded even if studio access is revoked. External sources are attributed; missing/unknown sources and body spoofing produce no attribution. Source bot existence is held by its existing key-share lock. Source-account parent membership is reread after acquiring its account lock and remains locked through insertion commit. Ordinary registration and referral click resolution retain their behavior without studio-family locks.

## AC and checks

| AC | Implementation / local evidence | Pending coordinator evidence |
| --- | --- | --- |
| STU-01 | Same-origin/session guards, bounded body, ignored body authority, exact cap and safe error responses; five new handler unit cases pass; Origin guard mutation proven red and exact-restored green | Execute real session/owner/child HTTP cases and actual UI refusal |
| STU-02 | Recheck after row lock; atomic child count/insertion; explicit safe defaults; no child session | Execute eight-concurrent-create cap case, both eligibility-after-lock cases and rollback/independent-studio case |
| STU-03 | RLS-verified query selection, client list/new client/own-account links; bot target selector and PDF-only UI requests tested | Real PG context/filter assertions; browser selection/back/reload/foreign404 |
| STU-04 | Actual child bot/source/job ownership, RLS bot-ID lookup/publication and child sandbox quota; child quota unit passes | Real PG site/PDF/doc/chunk/log/model/quota/publication/demo ownership, PDF-only path and child's Free PDF cap despite studio paid plan |
| STU-05 | All cabinet operations retain actor RLS; selected account is never authentication | Real PG foreign studio/ordinary owner/sibling, revoked access and detached parent cases across creation/list/source/PDF/job/retry/publish/ask, with zero provider/log admissions |
| STU-06 | Cookie-only same-TX resolver; deterministic account lock ordering; fresh membership read after locks; bot key-share preserved | Execute family attribution and four controlled SQL attach/detach races plus reciprocal cross-studio referrals; existing F10 regression |
| STU-07 | Typecheck, 94 focused tests, meaningful creation Origin mutation, script syntax, diff and <500-line checks pass; exact hashes frozen | All-unit/all-real-PG/build, optional additional cap mutation proof, fresh independent Astra review with obligations first |
| STU-08 | Real session/actor boundaries and UI routes are implemented; no production fake selector/provider | Companion preflight, actual Docker UI at 1440/390 with honest studio fixture, no paid calls, reload/overflow/JS checks, image-source binding and cleanup |

Fourteen real-PG cases are authored and typechecked across `studio-clients.int.test.ts` (six), `studio-referral-race.int.test.ts` (five), and `studio-workflow.int.test.ts` (three). They were **not executed by this writer**. PostgreSQL fixtures use the existing owner login to provision truthful account kind and controlled membership changes, real service-session lookup for authentication, and the existing restricted tenant login for cabinet operations. Answer checks use existing test-only FakeProvider/constructGateway through real handlers and real quotas/logs. No paid calls or new production provider path were added.

Race ordering uses observable `pg_stat_activity` lock waits, not an assumed delay. Before-order cases hold a real SQL parent update until creation is blocked, then commit it. After-order cases pause after real child insertion while its creation transaction retains locks, prove the SQL parent update is blocked, then allow creation to commit. Both attach and detach assert the resulting stored attribution.

## Commands, exits and artifacts

Commands ran from this project using Node v22.22.3 via `PATH=/tmp/n6b-f06-node22/bin:$PATH`. No Docker, listening ports, external network, installs, commits, pushes, children, global toolkit or N6 donor access were used.

| Command / check | Exit / result | Artifact under `tests/artifacts/studio-subaccounts/` |
| --- | --- | --- |
| Initial explicit complexity route before implementation | 0, mechanical S; substantive authorization M retained from approved plan | Terminal output; initial three prospective paths supplied explicitly |
| `bash ../../scripts/complexity-router.sh <22 exact changed production/test paths>` | 0, mechanical M; substantive M, all mandatory gates preserved | `implementation-route.txt`, `implementation-source-files.json` |
| `npm run typecheck` | 0, final production and all authored PG test types | `implementation-typecheck.txt` |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/{studio-handler,studio-clients-ui,bots-handler,ask-handler,create-bot-ui,publish-handler}.test.ts` | 0, six files / 55 passed | `implementation-focused-tests.txt` |
| Same runner with `{jobs-handler,pdf-handler,publication-guard,referral-cookie,referral-handler,publish-bot-ui}.test.ts` | 0, six files / 39 passed | `implementation-affected-seams-tests.txt` |
| Fixed `studio-handler.test.ts` suite with Origin guard disabled | 1, one failed / four passed | `origin-guard-red.txt` |
| Exact original source bytes restored; identical fixed suite | 0, five passed; original and restored SHA identical | `origin-guard-restored-green.txt`, `origin-guard-mutation.json` |
| `node --check tests/artifacts/studio-subaccounts/cap-guard-mutation.mjs` | 0 | Recorded in `implementation-checks.json` |
| `git diff --check` | 0 | `implementation-diff-check.txt` |
| Changed-source/test line check | 22 files, each <500 lines; maximum 161 | `implementation-source-files.json`, `implementation-checks.json` |

Exact expanded focused commands and exits are stored in `implementation-checks.json`. The existing standard integration command is `npm run test:int`; coordinator must run full regression after freeze using the established isolated CPU2/mutex/no-DB-ports test workflow, then build and review the same source.

For an additional **real cap-guard mutation**, coordinator runs this exact command inside its prepared PG test runner with the existing `TEST_DATABASE_URL_OWNER`, `TEST_TENANT_PASSWORD` and `TEST_SERVICE_PASSWORD`:

```sh
node tests/artifacts/studio-subaccounts/cap-guard-mutation.mjs
```

The script verifies all 22 frozen file hashes, changes only cap five to cap 500, and invokes the fixed real-PG eight-concurrent-create test with `-t 'eight concurrent creates produce exactly five clients'`. Oracle: exactly five 201, three exact-message 409, and five child rows. Each invocation has a 90-second timeout; a finally block restores exact original bytes before the identical green invocation. Red must exit 1 and green 0; timeout or unavailable DB is failure, never green. It saves `cap-guard-{red,restored-green}.txt` and `cap-guard-mutation.json`. This script is authored and syntax-checked, **not executed here**. Existing Vitest integration global setup performs established migrations; Docker/environment provisioning remains coordinator-owned.

## F14 lock compatibility obligation

Future handover must honor the same deterministic UUID ordering for all affected account rows and hold membership changes through commit. F13 holds studio/source-account `FOR NO KEY UPDATE` locks and source-bot `FOR KEY SHARE` until child insertion commits. Do not acquire studio first and source second in caller order, or move parent membership outside compatible account locks. Parent-only updates already conflict with F13's account row locks, establishing the tested before/after semantics. F14 must preserve that ordering when its transaction touches multiple accounts. No handover endpoint or schema/grant change is implemented here.

## Measurement and delivery limits

Profile: `compact-quality-first-v2`; single bounded writer by explicit brief. Requested model/effort: `gpt-6.1-sol` / high. Actual native model/effort, token counters and billing are unavailable to this executor and remain null for coordinator reconciliation. No model switch, fallback or delegated agents were invoked. No savings claim; forecast data is insufficient. Source freeze occurred 954.349035 seconds after launch, including reading, implementation, mutation and checks; active time is unknown. The inclusive 1500-second deadline remains in force through the terminal receipt.

Telemetry is coordinator-owned at `docs/telemetry/p-replicator/20261003T031332Z-studio-subaccounts/`. The writer did not edit run/events/work-record/roadmap. CLI `-o` captures the final substantive receipt at `docs/telemetry/p-replicator/20261003T031332Z-studio-subaccounts/evidence/implementation-1-receipt.md`; this writer did not manually write TRACE. Launch digest was checked from exact bytes and HEAD matches Source-Revision.

`tests/artifacts/studio-subaccounts/implementation-source-hashes.json` contains the exact 22-file map and canonical SHA256 (sorted compact UTF-8 JSON map). Preserve the frozen source for fresh independent review and full regression/build/UI. E2E preflight is `not_applicable` at this writer stage because actual E2E is coordinator-owned and has not started. Build identity is absent. Mandatory gates remain pending, so this is a consumable bounded implementation handoff, not feature acceptance or release. F14/F15/F16 and public deployment are outside this launch.

## Приёмка координатора — 2026-10-03T04:19:50.267986+00:00

STU01..08 приняты на fb44f18728326a92fad758df065772fb8bf343b4, snapshotdd55491ba57d829f51f15a1b2a6c6ffb2b055151d852986d54afb53327085b02. Полный621unit/261PG/type/build0; все22host/image совпадают. FreshAstra ACCEPT_WITH_CAVEATS, runtime/UIусловия закрыты. Две meaningful guard mutations RED→exactrestoreGREEN.

Actual Docker UI1440/390 six screenshots: real registration, ordinaryowner403, isolated fixture promotes registered account to existing studio kind (no self-upgrade product feature claimed), real New client201/select/reload, actual createbot202 with child site/job ownership, publication200/save/reload, back to ownaccount hides child bot, reselect works; fifth child created and sixth exact409; foreignselected404/revokedselected404/directbotpublication404. Actual owner SQL observation proves five owner/free/nullcredential children, child bot/source/job ownership, only actor sessions. All product requests use actual production Next routes, no interception/FakeProvider/paid calls; queued job only, no browser indexing claim. Zero JSerrors/overflow at both widths. Own stack/network/contexts/privateenv removed, shared browser retained. Startup attempts1/2 lacked coordinator config keys and stopped before browser; histories preserved. ActualUI1 bodyless directPOST422 and UI2 real Newclient422 exposed productbug; narrow Sol correction accepts actualzero-byte streams while preserving bounded JSON validation. Fresh Astra source review accepted, but CLI final receipt format failed (short summary lacks identity/Status); original preserved and reconciliation binds source report/native. Accepted UI3 runs corrected image.

Actual Sol6.1high/Astramedium; CLI subtotal4384584, elapsed3977754ms; coordinator/cost unknown. Следующий F14handover обязан сохранять accountlock ordering и commitstablefamily attribution.
