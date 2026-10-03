# F14 — атомарная передача аккаунта клиенту

Run-ID: `20261003T042338Z-handover`; Work-Unit-ID: `handover-plan`; Attempt-ID: `plan-1`.
Source-Revision: `c213679dac4e8eff62a62feae82b81e515847324`; Build-Revision: none.
Профиль: `compact-quality-first-v2`. PLAN requested `gpt-6-astra/high`; actual подтверждает координатор по native metadata, не по этому тексту.

## Основания, ROUTE и граница

Обязательства независимо выведены сначала из `docs/Specification.md` FR-n6b-14 / SC-US-014-1…4,
`docs/Pseudocode.md` Handover to client и API Contracts, `docs/Architecture.md` Data/Security Architecture,
`docs/ADR.md` ADR-008, `docs/Refinement.md` conflict/concurrency/security; затем проверены собственные
`001_init.sql`, `002_rls.sql`, `tenant.ts`, `auth.ts`, `auth-store.ts`, `auth-handler.ts`.
После этого прочитаны принятый F13 `docs/features/studio-subaccounts/01_plan.md`, финальное дополнение
`05_completion.md`, correction review, `studio.ts`, `referral.ts`, studio handler/UI и настоящие PG race tests.
Доноры N6/N2 не читались и не требуются. Упоминания доноров в комментариях своего кода не означают их использование.

Содержательный ROUTE: **XL**, меняется граница владения credentials и доступ студии; полный цикл сохраняется.
Механический ROUTE 2026-10-03T04:25:27Z по пяти будущим путям handover DB/handler/двух API/page дал M
(публичный маршрут), exit 0; это нижняя граница, не понижение XL. Команда:
`bash ../../scripts/complexity-router.sh projects/06b-rag-class/packages/db/src/handover.ts projects/06b-rag-class/apps/web/src/server/handover-handler.ts 'projects/06b-rag-class/apps/web/src/app/api/handover/[token]/route.ts' 'projects/06b-rag-class/apps/web/src/app/api/studio/clients/[id]/handover/route.ts' 'projects/06b-rag-class/apps/web/src/app/handover/[token]/page.tsx'`.
Повторить substantive + mechanical ROUTE перед IMPLEMENT на точном списке файлов.
Применимое owner/root разрешение из launch brief: весь MVP и продолжение через планы без промежуточной остановки;
новая остановка только из-за локального XL plan rule не нужна. Этот исполнитель делает только план.

Существуют account(email/password_hash nullable, parent_account_id, studio_access), unique lower(email),
handover_token(unique token_hash, expires_at, used_at), session и необходимые service grants.
`n6b_tenant` не получает UPDATE account/password/session; privileged handover выполняется `withService`
с явной авторизацией. Миграции, роли, grants, RLS, зависимости и пины **не требуются**.
Не создавать общий lock engine, новую таблицу владельцев, почтовую доставку или impersonation.
Перенос в существующий аккаунт, смена провайдера, оплаты, F15/F16, публичный deployment и main merge вне этой работы.

## Восемь обязательств приёмки

| AC | Обязательство и отрицательный оракул |
| --- | --- |
| HAN-01 | SC-US-014-1: same-origin authenticated root studio выдаёт 201 `{data:{link,expires_at}}` только своему текущему доступному UNCLAIMED child; случайные 32 байта, только hash в БД, TTL ровно 7 дней по БД. Неверный actor/чужой, detached, revoked или claimed child не создаёт токен. |
| HAN-02 | SC-US-014-2: публичный accept валидирует Origin, media, actual body bytes, token/email/password/boolean; bcrypt cost 12 вне DB TX. Успех 200 + существующая session cookie только после COMMIT account credentials + parent/access + used token + session. Сбой любой записи откатывает всё. |
| HAN-03 | SC-US-014-2: тот же account UUID владеет теми же bot/source/source_file/document/chunk/job/log строками. public_id, demo slug, embed code и публикация не изменяются. keep=false удаляет parent и доступ студии; keep=true сохраняет parent/access, credentials принадлежат клиенту. |
| HAN-04 | SC-US-014-3: malformed/unknown token →404; used/expired/уже claimed account →410 без credentials/session/cookie изменений. Старый другой токен и новая выдача не позволяют студии сбросить credentials keep=true клиента. |
| HAN-05 | SC-US-014-4: case-insensitive занятый e-mail →409 с точным текстом ниже, token/account/session полностью прежние. Уникальный индекс — окончательный арбитр, в том числе против concurrent registration/другого handover. |
| HAN-06 | Общие ресурсы: same-token, different-token/one-child, same-email/two-child, issue-vs-accept, expiry-after-wait и F13 family/cap гонки сериализуются без deadlock; membership стабилен до commit, время берётся после ожидания. |
| HAN-07 | Новые fixed tests + meaningful mutation, все unit/contract, все real-PG, typecheck и production build; fresh независимое Astra review исходников/AC. Никаких пропусков blocker/high и фиктивных зелёных при отсутствии окружения. |
| HAN-08 | Production Docker UI 1440/390: studio issue/copy → client accept обе ветки → reload/login → действительный доступ/отказ студии; ошибки 409/410/404, отсутствие JS errors/overflow; header и body-stream проверки на реальном Next. Source/image/preflight/evidence/cleanup связаны с кандидатом. |

Точный текст 409: **этот e-mail уже зарегистрирован: передача создаёт отдельный аккаунт, укажите другой e-mail**.

## Минимальная реализация и контракт HTTP

UNCLAIMED = `email IS NULL AND password_hash IS NULL`. Наличие любого credentials поля запрещает повторную
передачу. Для issue дополнительно обязательны `actor.kind='studio'`, `actor.parent_account_id IS NULL`,
`child.parent_account_id=actor.id`, `child.studio_access=true`, child не actor и child.kind=owner.
Все условия повторно читаются после account locks, не выводятся из UI, body или старой tenant-проверки.

1. `POST /api/studio/clients/{id}/handover`: точный собственный Origin до действий; session actor из существующего
   auth helper, отсутствие сессии 401. Непригодный UUID/неподходящий child →403 без выдачи информации.
   Endpoint не нуждается в body. Как исправленный F13, принимает реально нулевой поток без Content-Type;
   необязательное непустое тело ограничено 4096 фактическими байтами и JSON object, поля не дают полномочий.
   Некорректное тело 422, превышение 413. Генерировать base64url token из `randomBytes(32)`; хранить SHA-256,
   не сырой token и не URL. Внутри TX брать actor+child account locks по UUID и повторять eligibility.
   INSERT expires_at от `clock_timestamp() + interval '7 days'`, вернуть записанное значение.
   Ссылка только `${PUBLIC_BASE_URL}/handover/${token}` с корректной сборкой URL; имя host из запроса не доверенное.

2. Повторная выдача до claim создаёт независимый одноразовый токен с собственными 7 днями; предыдущие ссылки
   до первого claim остаются действительными. Это минимальная явно выбранная семантика, не обещание revoke/rotation.
   Первый успешный claim аккаунта делает остальные ссылки непригодными через locked UNCLAIMED guard.
   Массово блокировать/удалять другие token rows не нужно. UI не обещает, что новая ссылка отменяет старую.

3. `POST /api/handover/{token}` публичен, сессия посетителя не является полномочием или целевым аккаунтом.
   Missing/null/foreign Origin →403 до bcrypt/операции. Exact media `application/json` с параметрами разрешён;
   иной media →422; `readJson(...,{objectOnly:true})` ограничивает реальный поток 4096 байт →413.
   Malformed/array/null/scalar/zero-byte JSON, missing/wrong-type fields →422. Проверить token формата
   43 base64url символа (32 байта), неверный →404 без token lookup. E-mail trim/lowercase, email-format/max254;
   пароль >=10 символов и <=72 UTF-8 bytes как auth; keep_studio_access обязательно boolean, без coercion/default true.
   Переиспользовать текущий auth address limiter перед bcrypt (существующие key/limit/429/503, без новых env или engine).
   Ошибка Origin не расходует квоту; отдельный limiter может учитывать неуспешную попытку, но не меняет account/token/session.

4. Bcrypt и генерация session material выполняются до handover TX. Небольшой общий seam в `AuthService`:
   сделать существующий генератор доступным как `prepareSession()` и вызывать его также из register/login,
   сохранив 32 bytes, HMAC SESSION_SECRET и SESSION_TTL_SECONDS. Не вызывать `createSession()` после commit.
   Handler получает hasher/session factory из runtime; DB helper получает только normalized email, password hash,
   token hash, boolean и session material. Не передавать plaintext password в DB package.

5. Ответ accept: 200 `{data:{ok:true}}` + `sessionCookie(token, config.production)` с Path=/, HttpOnly,
   SameSite=Lax, Max-Age=604800, Secure в production. При любой ошибке Set-Cookie отсутствует.
   Не выполнять referral attribution заново и не регистрировать второй account. Существующая cookie браузера
   заменяется на сессию принятого child только после успеха; чужой account по cookie не обновляется.

6. Все handover API ответы, включая ошибки, no-store; `/handover/*` force-dynamic + no-store + noindex/nofollow,
   `Referrer-Policy: no-referrer`, DENY/frame-ancestors none. Выдача ссылки также no-store/no-referrer.
   Добавить точечные header rules в next.config/middleware без изменения соседних контрактов.
   Ссылка и пароль не попадают в application logs, analytics, error bodies, metadata или сторонние assets.
   Минимальный audit после успешного commit: безопасный event/account ID/keep flag; без credentials/token/email.
   GET страницы не расходует токен, показывает форму и ограничение отдельного аккаунта; POST — источник истины
   для 404/410. Не нужен дополнительный публичный endpoint просмотра account/token metadata.

## Транзакция, блокировки и часы

Одна `withService` TX на claim, READ COMMITTED как существующий helper. Порядок **accounts UUID ASC → token**
одинаков у всех F14 операций; никакая ветка не берёт token lock перед account lock. F13 сначала держит bot
KEY SHARE, затем accounts UUID ASC; F14 вообще не блокирует/не обновляет bot, поэтому обратного ребра нет.

- Неблокирующий lookup по token_hash даёт account_id; отсутствует →404. Неблокирующий read child даёт
  ожидаемый parent. Это discovery, не авторизация. Взять child+ожидаемый parent через
  `SELECT id ... WHERE id=ANY(...) ORDER BY id FOR NO KEY UPDATE`; затем отдельным SELECT перечитать child/parent.
- Если parent изменился во время ожидания, не добавлять новый parent lock вне порядка. Уже claimed/detached
  →410; прочий неожиданный drift → отказ 410 без записи. Нового attach API в scope нет. Повтор с новым
  snapshot допустим только отдельной TX при конкретной необходимости, не рекурсивный generic retry engine.
- Для accept проверить UNCLAIMED и текущие parent=root studio/studio_access=true. Только затем взять
  строку данного token `FOR UPDATE`, повторно проверить hash/account связь, used_at и expiry.
  Известный токен без eligible account →410. Только формат/отсутствующая token запись →404.
- `expires_at <= clock_timestamp()` означает истёк. Не использовать JS clock или transaction `now()` для
  решения после ожидания. Срок проверяется после account/token locks и **повторно последней записью** после
  потенциально блокирующей проверки уникального e-mail и вставки session.
- UPDATE именно child: email/password_hash; studio_access=keep; parent=oldParent при keep, иначе NULL.
  Сохранить kind/plan/badge_removal/is_test/referred_by_bot_id и остальные поля. INSERT session для child
  на этом же connection. Последняя guard-запись token: `used_at=clock_timestamp()` только при used_at NULL
  и expires_at > clock_timestamp(); ноль строк после уже выполненных записей обязан **бросить typed abort**,
  чтобы `withService` сделал ROLLBACK, а не вернуть значение и закоммитить partial claim.
- Unique violation маппить в email409 только для `23505` и constraint/index `account_email_key`, с catch
  снаружи `withService` после rollback. Session/token uniqueness и прочие SQL ошибки →safe503, не email409.
  После любого failed INSERT/UPDATE никаких cookie и success audit. Session lifetime не продлевать токеном передачи.

Оставшийся parent lock сериализует detach с F13 child cap. keep=true остаётся attached и **считается** в cap5,
включая уже claimed child; keep=false освобождает место после commit. F13 referral classification читает parent
под теми же account locks и остаётся стабильной до commit. Старые RLS actor semantics не меняются:
студия не получает child session; клиент входит своим UUID; keep=false закрывает новые studio операции через
`n6b_account_ids()`, прямые bot/job UUID и stale cabinet selection. Нет обещания отменять уже начатые запросы.

## Точные разрешённые пути следующего IMPLEMENT

Все пути ниже относительно `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-handover/projects/06b-rag-class`.
Один writer; координатор передаёт этот root, source SHA, AC, fresh launch/TRACE и бюджет явно.

| Пути | Единственная цель |
| --- | --- |
| `packages/db/src/handover.ts` (new), `packages/db/src/index.ts` | Scoped issue/accept TX, typed results/abort, export |
| `apps/web/src/server/handover-handler.ts` (new) | HTTP boundary, validation, hash/session preparation, safe responses |
| `apps/web/src/server/auth.ts`, `apps/web/src/server/auth-handler.ts`, `apps/web/src/server/runtime.ts` | Minimal reusable session factory/credential validation exports + wiring; preserve existing auth behavior |
| `apps/web/src/app/api/studio/clients/[id]/handover/route.ts`, `apps/web/src/app/api/handover/[token]/route.ts` (new) | Thin nodejs Next routes, awaited params |
| `apps/web/src/app/cabinet/studio-clients.tsx`, `apps/web/src/app/cabinet/page.tsx` | Issue button only for unclaimed listed child, link/copy/expiry/error; server remains authority |
| `apps/web/src/app/handover/[token]/page.tsx`, `apps/web/src/app/handover/[token]/handover-form.tsx` (new) | Accessible email/password/unchecked keep checkbox, exact errors, success navigation |
| `apps/web/next.config.mjs`, `apps/web/src/middleware.ts`, `apps/web/src/app/globals.css` | Scoped handover headers/cache and minimal existing-token layout |
| `apps/web/tests/unit/handover-handler.test.ts`, `apps/web/tests/unit/handover-ui.test.ts` (new), `apps/web/tests/unit/auth-handler.test.ts` | Boundary/UI/session regression tests |
| `apps/web/tests/int/handover.int.test.ts`, `apps/web/tests/int/handover-race.int.test.ts`, `apps/web/tests/int/handover-fixture.ts` (new) | Real PG authority/atomicity/locks/negative oracles; reuse studio fixture helpers read-only |
| `tests/e2e/handover.mjs` (new), `tests/artifacts/handover/` | Coordinator-controlled real UI script and bounded evidence/mutation logs, no production fixtures |
| `docs/features/handover/05_completion.md`, `docs/features/handover/08_review.md` | Author handoff and separate reviewer findings, each its assigned writer |

`studio.ts`, `referral.ts`, `tenant.ts`, migrations/RLS/grants are read-only contractual seams; no change is
currently needed. No manifests/lockfiles/compose/Dockerfiles/toolkit/global settings/other project files.
If a concrete unavoidable blocker requires any excluded path, stop that change and report evidence to coordinator.
Do not silently widen scope; ordinary corrections inside listed paths need no extra owner pause.

## Порядок поставки и остановка

1. Следующий автор: requested Sol high (точный доступный Sol ID указывает launch), один проход **25 минут / 1500 s**
   inclusive чтение, implementation, локальные проверки и substantive receipt. Результат: код, fixed tests,
   отрицательные оракулы, source hashes, commands/exits и точное pending по HAN-01…08. Никаких детей.
   На deadline прекратить попытку, сохранить partial/failed receipt и конкретную причину; не продлевать молча.
2. Автор/координатор выполняют относящиеся проверки из `02_validation.md`; Docker/CPU2 mutex/own stack у координатора.
   Полные unit/PG/type/build обязательны на frozen candidate; прошедший неизменный набор не гонять повторно.
3. Fresh независимый requested Astra high review **<=480 s**, obligations-first из canonical docs, затем diff,
   PG oracles, mutation и UI receipts. Actual model/fallback сверять native. Исправлять конкретные blocker/high,
   повторять затронутые проверки; не открывать раунд необязательной полировки.
4. Перед real UI companion preflight ready с source/build/image/environment/командой/evidence; сейчас
   `not_applicable` (docs-only, build none). Полная feature acceptance только после HAN-01…08 и review,
   update run/work-record/roadmap делает координатор. Публичного deployment этот план не разрешает.

Текущая PLAN попытка ограничена 480 s inclusive; нет tests/probes/Docker/network/product edits/commit/push.
Telemetry/run/events/work-record принадлежат координатору. Не создавать второй run и не писать TRACE вручную:
CLI `-o` сохраняет полную финальную квитанцию с terminal Status. Usage/cost/actual model пока null;
оценка экономии и численный прогноз не установлены.
