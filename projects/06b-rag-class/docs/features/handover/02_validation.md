# F14 — semantic plan validation и матрица проверок

Run-ID: `20261003T042338Z-handover`; Work-Unit-ID: `handover-plan`; Attempt-ID: `plan-1`.
Source-Revision: `c213679dac4e8eff62a62feae82b81e515847324`; Build-Revision: none.
Вердикт: **READY FOR AUTHORIZED IMPLEMENTATION**. Это содержательная проверка плана в той же bounded попытке,
не независимое review кода, не выполненные тесты и не приёмка F14. Числовой validator score не измерялся.

## Полнота и разрешённые уточнения

FR14/SC0141…4 покрыты HAN-01…06; HAN-07/08 сохраняют XL delivery gates. Схема и service grants уже достаточны;
нет обнаруженного неизбежного blocker, требующего dependencies/schema/toolkit расширения.
Сопоставлены canonical Specification/Pseudocode/Architecture/ADR-008/Refinement, собственные schema/auth/RLS
и затем принятый F13: ordering account locks UUID ASC, member classification through commit, attached cap5.

| Риск буквального исполнения короткого Pseudocode | Решение плана |
| --- | --- |
| Token-first lock с разными токенами одного child и F13 | Discovery read без lock, accounts sorted, затем token; F14 не захватывает bot locks |
| Bcrypt внутри TX и отдельная session после commit | Bcrypt/session material до TX, session INSERT на том же connection |
| Used token защищён, другой outstanding token всё ещё меняет credentials | UNCLAIMED guard после account lock в issue и accept; keep=true не даёт права reset |
| Transaction now() остаётся временем до ожидания | DB clock после locks и финальный guarded token write после остальных блокирующих записей; typed rollback |
| Короткий текст 409 в псевдокоде | Полный точный текст из SC-US-014-4; lower(email) unique, целевой SQLSTATE/constraint |
| Новый bodyless endpoint повторяет production stream bug F13 | Actual bytes, а не `request.body !== null`; unit streamed-empty + реальная Next UI |
| Перевыпуск не определён | До claim несколько валидных ссылок; первый claim побеждает, остальные 410; нет ложного обещания revocation |

Это уточнения исполнения canonical ownership-инвариантов, не новый продуктовый scope. Owner/root разрешение
из brief позволяет следующую реализацию без отдельного XL plan approval. PLAN worker не запускает её сам.

## Fixed tests и отрицательные оракулы

Имена тестов должны включать `SC-US-014-n` и/или HAN-ID; fixtures используют owner только для подготовки,
реальные service/tenant логины для операций и наблюдаемые SQL barriers. Моки SQL не доказывают атомарность.

| AC / файл | Обязательные случаи | Доказательство отказа / состояния |
| --- | --- | --- |
| HAN-01 / unit handler + `handover.int.test.ts` | Root studio own unclaimed issue; owner/nested studio/foreign studio/self/malformed UUID/revoked/detached/claimed; repeat issuance | 201 только eligible; token hash != raw, unique, 32-byte decoded link token; expires_at ровно DB issue time +7d; отказ не добавляет token/session и не меняет child |
| HAN-02 / unit handler | Missing/null/foreign Origin; media jsonp/text/plain; malformed/object/scalar/array/null; 4096/4097 actual bytes при лживом Content-Length; email max254, пароль10 и UTF8<=72, bool false/true vs strings/missing | Отказ до bcrypt/claim по порядку; format404 не ищет token; safe503 без исключений/секретов; auth limiter429 до bcrypt; cookie только200 |
| HAN-02 / real PG | Valid claim; forced session INSERT failure; forced token-finalization failure после credentials/session write | Все четыре изменения commit вместе; при fault точный snapshot account/token/session неизменен, ноль success cookie; verify actual password login и session lookup |
| HAN-03 / real PG workflow | keep=false и keep=true на опубликованном child с site/PDF/doc/chunk/job; owner/new client/studio/other studio/sibling | До/после сравнить ID/account_id, public_id, slug, embed code, sources/doc/text/chunk hashes; клиент видит свои данные, foreign нет; keep=false studio list/read/create/source/job/retry/publish/ask запрещены и не вызывают provider/log admissions; keep=true studio работает без child credentials |
| HAN-04 / real PG + handler | Malformed, syntactically valid unknown, expired, used; account claimed by другой token; claimed keep=true reissue | 404/410 по контракту; credentials/parent/access/session/token snapshot прежние; нет Set-Cookie; старый пароль клиента не заменён |
| HAN-05 / real PG | Existing same email разным регистром/с пробелами; duplicate race с другим child и registration | Exact409; winning row одна; losing token/account/session неизменны; тот же losing token успешно принимается с другим email |
| HAN-06 / `handover-race.int.test.ts` | Same token два concurrent accepts; два разных токена одного child, разные email | Барьер удерживает account/token; ровно один200 и одна новаяsession, проигравший410; verify winner credentials, no overwrite; не только количество fulfilled promises |
| HAN-06 / real PG | issue-before-accept и accept-before-issue с keep=true; keep=false detach vs create at cap5 | До claim выданная ссылка больше не сбрасывает пароль; после claim issue403; keep=true attached count5 →sixth409, keep=false послеcommit позволяет одно новое место, ни одного момента committed count>5 |
| HAN-06 / real PG clocks | Account lock wait и token lock wait до/после expiry; unique-email wait заканчивается после expiry без конфликта | TX начинается до expires_at, ждёт реальную блокировку, истекает по PG clock, затем410; account/session/token неизменны. Отдельный still-valid-after-wait case успешно200 |
| HAN-06 / F13 PG integration | Настоящий F14 detach commit BEFORE referral classification и AFTER F13 insert-before-commit barrier; keep=true control; оба UUID orders | BEFORE внешняя атрибуция допустима; AFTER пока семья null и handover ждёт F13 commit; keep=true остаётся family=null. Real `pg_stat_activity` wait, bounded statement_timeout, никакого sleep-as-proof |
| HAN-07 / mutation | Fixed different-token/claimed-keep-access guard test, remove locked accept UNCLAIMED protection | Тот же тест должен поймать overwrite/лишнююsession и дать behavioral red; exact-byte restore, тот же тест green, hashes equal. Import/DB unavailable/timeout не mutation pass |
| HAN-08 / real Docker UI | 1440 и390, issue/copy, real empty-stream POST, accept обе ветки, duplicate then retry, used/invalid, login/reload, separate studio/client contexts | Реальные Next routes без interception; screenshot/HTTP/SQL evidence, cookie flags, no-store/noindex/no-referrer на page/API/error; отсутствуют JS errors/overflow и токены в логах |

Гонки строить на существующем `studio-fixture.ts::waitForLock` и connection proxy barriers,
не на production test hooks. Все promises завершаются/освобождаются в finally, lock wait/statement timeouts
делают зависание failed. Для email-wait-after-expiry: другая TX держит конкурирующий unique email INSERT,
claim блокируется на email UPDATE; дождаться clock expiry и rollback holder → claim обязан откатиться410,
а не пройти по старому времени. Обратный контроль с release до expiry проходит200.
Для rollback fault разрешена локальная test connection proxy, реально выполнившая предыдущие SQL;
не создавать production injectable fault engine или schema migration.

## Команды как данные, исполнители и обязательные результаты

Все команды из project root, Node22, без установки зависимостей. В этой PLAN попытке они **не запускались**.

| Gate | Команда/действие | Владелец и артефакт |
| --- | --- | --- |
| Focused unit | `node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/handover-handler.test.ts apps/web/tests/unit/handover-ui.test.ts apps/web/tests/unit/auth-handler.test.ts` | Author, log+exit+source hashes |
| Focused real PG | `node node_modules/vitest/vitest.mjs run --config vitest.int.config.ts apps/web/tests/int/handover.int.test.ts apps/web/tests/int/handover-race.int.test.ts` | Coordinator prepared existing private PG runner; author only if separately assigned environment |
| Mutation | Fixed critical guard test → one temporary production mutation → identical command red → byte-exact restore → identical command green | Coordinator/author under exclusive writer ownership, red/restored-green logs + SHA |
| All unit/contract | `npm test` | Coordinator CPU2/mutex, no skipped failing suites |
| All real PG | `npm run test:int` | Coordinator existing isolated stack, all apps/packages/services; F10/F13/RLS/session included |
| Type/build | `npm run typecheck`; `npm run build` | Coordinator frozen candidate; preserve logs/exits |
| Diff/scope | `git diff --check`, changed/untracked allowlist + <500 lines per source file | Coordinator, include new-file hashes, don't rely only on commit SHA |
| Independent review | Fresh Astra high <=8min, canonical obligations first, final diff and source-bound receipts next | Separate reviewer `08_review.md` and unique complete CLI receipt |
| UI | `node tests/e2e/handover.mjs` in prepared browser environment | Coordinator writes exact env/input command-as-data and source/image binding in preflight; results at `tests/artifacts/handover/` |

Root package.json has no lint or test:e2e script: do not claim these nonexistent commands passed or add
manifest/dependency machinery. Use listed real type/build checks and scoped browser script with the existing
browser installation. Before starting containers preserve port check/no published DB/own stack/CPU2 mutex.
No paid calls/provider changes; browser fixture data may be prepared honestly and marked is_test, but production
handover APIs/session/cookie/UI must be real. If a browser action would invoke a provider, use deterministic PG
workflow tests for that action instead and disclose the UI boundary; don't claim an unperformed live answer.

Review and real UI must correspond to the final candidate. Changed related sources invalidate dependent checks;
unchanged successful checks can be retained with SHA proof. F13 completion showed genuine 422 UI failures before
its fix: its earlier green unit reports cannot replace F14 body-stream production proof.

## Measurement и следующий шаг

PLAN: read-only code/document inspection, mechanical ROUTE M→substantive XL, launch digest verification,
two plan documents; no execution gates claimed. E2E preflight not_applicable: docs-only, no build.
Next: authorized bounded Sol high implementation (25min inclusive), then complete gates and fresh Astra review
(8min). At deadline report concrete partial/blocker instead of extending or expanding schema/dependencies.

Run/events/work-record remain coordinator-owned under `docs/telemetry/p-replicator/20261003T042338Z-handover/`.
Requested model comes from launch; actual model/effort, usage, cost and active time remain null until native
reconciliation. This same-author validation is disclosed; it does not masquerade as independent model challenge.
The CLI final answer supplies the entire receipt; `-o` writes it to the allocated fresh TRACE. No manual TRACE write.
