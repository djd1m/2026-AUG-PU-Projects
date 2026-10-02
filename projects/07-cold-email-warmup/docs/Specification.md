# Specification — N7 v1

Source: секция 07 prompt; CHOSEN_CJM A. ADR-001..005 approved in OWN-N7-002.
Auth пользователь и оператор production — разные полномочия. Consent — отдельный
версионированный факт с actor, scope, timestamp и revoked_at; registration не consent.

### FR-n7-001 — Tenant identity

US-001: как владелец, регистрируюсь и управляю только своими ящиками.
SC-US-001-1: Given два tenant, When A запрашивает mailbox B, Then 404 без данных B.
SC-US-001-2: Given revoked session, When API mutation, Then 401 и ноль изменений.
Opaque random session, HMAC hash в БД, HttpOnly/SameSite cookie, CSRF origin check,
bounded KDF + rate limit. ADR-005. AC-N7-002.

### FR-n7-002 — SMTP/IMAP connection

US-002: подключаю несколько ящиков к собственному разрешённому provider.
SC-US-002-1: Given allowlisted TLS endpoint, When save connection, Then secret
сохранён только AEAD ciphertext с tenant/mailbox AAD, API возвращает masked metadata.
SC-US-002-2: Given localhost/private IP/credential canary, When connection attempt,
Then forbidden host заблокирован, secret отсутствует в error/log/response.
SMTP 465/587+required TLS, IMAP 993+TLS; no plaintext fallback. Подключение не
отправляет сообщение. Test mode явно обозначен и не выдаёт real verified status.
ADR-001; AC-N7-002.

### FR-n7-003 — Separate sending authority

US-003: разрешаю конкретный вид отправки и могу сразу отозвать разрешение.
SC-US-003-1: Given нет warmup consent или campaign consent, When dispatcher,
Then transport calls=0 даже при подключённом ящике и active campaign.
SC-US-003-2: Given отзыв согласия, When queued job проверяется, Then canceled;
already submitted SMTP cannot be recalled and this boundary is shown explicitly.
Consent required: pool exchange, campaign version+recipient set, optional share
and invitation actions separately. Consent re-required after substantive content
or recipient expansion. Operator live gate не заменяет user consent. ADR-002.

### FR-n7-004 — Seeded pooled warmup

US-004: вижу пригодный pool и добровольно участвую в автоматической переписке.
SC-US-004-1: Given 30 active eligible opted-in mailboxes, When pool metric,
Then count=30; invited/disconnected/quarantined/revoked excluded.
SC-US-004-2: Given менее 2 разных tenant eligible, When pair scheduler,
Then waiting и 0 exchange jobs; участникам не раскрываются чужие адреса.
Общий пул между tenant, только recipient opt-in members. Neutral deterministic
templates, limited scheduled exchange/replies, no AI. Контент пула обозначен
участникам как test correspondence. Не mark-not-spam, не fake open/click.
ADR-003; AC-N7-007.

### FR-n7-005 — Sequences and dispatch

US-005: составляю цепочку по разрешённым полям, смотрю preview и запускаю явно.
SC-US-005-1: Given 20 concurrent claims and daily remaining quota=3,
When worker reserves, Then <=3 accepted reservations суммарно warmup+campaign.
SC-US-005-2: Given missing field/header CRLF or unsafe markup, When preview/start,
Then validation error и 0 message jobs; plain text + escaped preview.
SC-US-005-3: Given SMTP ambiguous timeout, When retry scheduler,
Then unknown_delivery требует reconciliation, automatic resend=0.
Default daily limit=10/mailbox including warmup, user can lower; upper policy
ceiling=30/day for pilot (product choice, not provider entitlement). Provider
limit overrides lower. Campaign steps <=5, recipients<=100/import, min step delay
24h pilot. SMTP is at-most-attempt automatic for ambiguous outcomes, not exactly-once.
Idempotent job key campaign+enrollment+step, distinct mailbox quotas and rotation.
ADR-002; AC-N7-004, AC-N7-008.

### FR-n7-006 — Replies and pauses

US-006: после ответа адресата последующие письма прекращаются.
SC-US-006-1: Given matched In-Reply-To/References and sender, When ingestion,
Then enrollment replied, queued steps canceled, next dispatch sends 0.
SC-US-006-2: Given IMAP cursor replay/UIDVALIDITY change,
When ingestion retries, Then dedup prevents duplicate events and mailbox pauses
pending safe rescan; отсутствие свежего poll blocks campaign sends.
Reply event по Message-ID tenant/mailbox binding; no subject-only matching.
IMAP reads bounded headers; body retained only if required explicitly, not default.
Replies already after SMTP submission stop subsequent messages only. AC-N7-006.

### FR-n7-007 — Unsubscribe, suppression, complaints

US-007: получатель прекращает дальнейшие сообщения без логина.
SC-US-007-1: Given any generated letter, When rendered,
Then visible unsubscribe link + signed opaque List-Unsubscribe and one-click POST.
SC-US-007-2: Given unsubscribe repeated/concurrent with pending job,
When processed, Then tenant suppression persists idempotently and job cannot dispatch.
SC-US-007-3: Given authenticated complaint record, When accepted,
Then recipient suppression + sender mailbox quarantine, queued work canceled.
GET shows confirmation (crawler-safe), POST performs opt-out; tokens carry no
plaintext email, never authorise other actions. Complaints ingress operator-only
or authenticated provider-specific adapter; generic unauthenticated webhook banned.
Recipient suppression applies tenant-wide; cohort withdrawals apply globally to
pool participation. Every live provider needs a declared complaint intake route.

### FR-n7-008 — Evidence and metrics

US-008: вижу репутацию только когда известен её источник.
SC-US-008-1: Given no valid observation, When dashboard,
Then reputation unknown and share-after-improvement disabled.
SC-US-008-2: Given two same-source comparable observations,
When owner records verified improvement with dates/denominator/source evidence,
Then report shows raw values and provenance; no causal warmup claim.
Manual observations are labelled manual; SMTP accepted and pool count displayed
separately. Sample n<30 hides percentages, not counts. AC-N7-009.

### FR-n7-009 — Billing boundary

US-009: вижу серверный тариф и прохожу разрешённый sandbox checkout.
SC-US-009-1: Given duplicate payment callback/request, When verified provider state,
Then one immutable intent, at most one entitlement grant; redirect alone grants zero.
SC-US-009-2: Given no configured sandbox provider, When checkout,
Then explicit unavailable state, no fake success and no live provider call.
Free/team limits from versioned server config. Price must be explicit server-side
minor currency units before checkout enabled. Real charges excluded until approval.
ADR-004; AC-N7-010.

### FR-GROWTH-001 — Share at verified value

US-010: делюсь очищенным отчётом только после наблюдаемого улучшения.
SC-US-010-1: Given verified comparable improvement, When explicit share,
Then 1 anonymous report link/copy event; no mailbox email/credentials.
SC-US-010-2: Given unknown/stale/incomparable evidence, When share,
Then no fabricated improvement report; explicit unavailable reason.
SC-US-010-3: Given another tenant observation, When forged share id,
Then 404 and no report. ADR-003.

### FR-GROWTH-002 — Attribution before conversion

US-011: код партнёра учитывается до checkout независимо от cookie availability.
SC-US-011-1: Given valid code/cookie, When first verified sandbox conversion,
Then one attribution snapshot is recorded before entitlement grant.
SC-US-011-2: Given blocked cookies, When explicit valid code, Then attribution works.
SC-US-011-3: Given self-referral/tampered cookie/replayed callback,
Then no fraudulent attributed conversion. Explicit code wins only if valid;
invalid code errors visibly, never silently falls back. ADR-004.

### FR-GROWTH-003 — Free report badge

US-012: бесплатный report содержит видимый source attribution badge.
SC-US-012-1: Given free entitlement, When shared report rendered, Then 1 badge shown.
SC-US-012-2: Given paid entitlement expires, When next report view, Then badge returns.
SC-US-012-3: Given client forges paid flag, When report render, Then server entitlement
keeps badge. Unsubscribe cannot be removed by entitlement.

### FR-GROWTH-004 — Partner codes and events

US-013: имею личный код и вижу достоверные aggregate events.
SC-US-013-1: Given partner creates code, When 2 unique eligible conversions,
Then counts=2, duplicate provider event adds 0.
SC-US-013-2: Given inactive code, When entered, Then explicit rejection.
SC-US-013-3: Given own account/replayed event/cross-tenant access,
When conversion count queried, Then fraud adds 0 and foreign details absent.
No payout promises; code attribution isn't proof of causality/CAC.

### NFR-n7-001 — Security and resource bounds

Requests <=64KiB except bounded CSV <=256KiB; no template evaluation, remote
attachments or arbitrary URLs. DB parameter binding, tenant predicates, CSRF,
allowlist connection hosts, rate limits, KDF admission. No secrets in logs.
Worker SMTP connect<=10s and total attempt<=30s, IMAP operation<=30s; one claim
per mailbox concurrently; crash leases recover only definitely unsubmitted jobs.

### NFR-n7-002 — UX and operations

390px/1440px no unintended horizontal overflow; keyboard focus and clear labels;
reduced motion; empty/error/blocked/loading states; demo markers separate from live.
Health endpoints disclose no secrets, DB ports unexposed. Local API p95 target
<500ms excluding bounded password hashing/provider I/O under 10 concurrent users;
target requires measured evidence and is not currently achieved.

## Traceability / AC

AC-N7-001..012 are defined in plans/mvp-xl-plan.md. F01 covers FR-n7-001/002,
F02 003/004, F03 005, F04 006/007, F05 008/009 and FR-GROWTH-001..004.
No borrowed README feature expands this specification. ADR-001..005 are all linked.

### FR-LOOK-001 — Visual hierarchy

Один основной CTA на рабочий шаг, заголовок и краткое пояснение различимы;
собственные цвета/типографика. Подтверждённая regularity публичного source landing
из source-product-profile.md. Проверяется desktop/mobile screenshot и keyboard.
FR-LOOK-002 отклонено: AI-first entry вне MVP, явная секция 07 исключает AI replies.
