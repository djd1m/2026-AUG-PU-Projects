# Specification — N7 v1.1 (N7-V01..06 corrections)

Source: секция 07 prompt; CHOSEN_CJM A. ADR-001..005 approved in OWN-N7-002.
Auth пользователь и оператор production — разные полномочия. Consent — отдельный
версионированный факт с actor, scope, timestamp и revoked_at; registration не consent.

### FR-n7-001 — Tenant identity

US-001: как владелец, регистрируюсь и управляю только своими ящиками.
SC-US-001-1: Given два tenant, When A запрашивает mailbox B, Then 404 без данных B.
SC-US-001-2: Given revoked session, When API mutation, Then 401 и ноль изменений.
Opaque random session, HMAC hash в БД, HttpOnly/SameSite cookie, CSRF origin check,
bounded KDF + rate limit. ADR-005. AC-N7-002.

SC-US-001-3: Given a fresh account registration creates a usable session and own mailbox, When the owner logs out then logs in and logs out again, Then both logout cookies fail subsequent mutations with401; own reads had200.
SC-US-001-4: Given an authority from auth bypass Examples, When it mutates a mailbox, Then 401 for no/forged/revoked session or403 for bad Origin and zero commits.
SC-US-001-5: Given login attempts at the configured email/IP limits and KDF slots, When the next attempt or an unrelated allowed key runs, Then boundary policy produces429/503 and an unrelated allowed key with a free slot can succeed.
SC-US-001-6: Given SQL syntax in requested mailbox id or oversized password, When a request is submitted, Then 400 and no SQL execution outside parameter binding or KDF call.

### FR-n7-002 — SMTP/IMAP connection

US-002: подключаю несколько ящиков к собственному разрешённому provider.
SC-US-002-1: Given allowlisted TLS endpoint, When save connection, Then secret
сохранён только AEAD ciphertext с tenant/mailbox AAD, API возвращает masked metadata.
SC-US-002-2: Given localhost/private IP/credential canary, When connection attempt,
Then forbidden host заблокирован, secret отсутствует в error/log/response.
SMTP 465/587+required TLS, IMAP 993+TLS; no plaintext fallback. Подключение не
отправляет сообщение. Test mode явно обозначен и не выдаёт real verified status.
ADR-001; AC-N7-002.

SC-US-002-3: Given the ciphertext failure Examples contain a credential canary, When worker decrypts/connects, Then zero transport calls for AEAD/AAD failure and no canary in API/DB plaintext/log/error.
SC-US-002-4: Given an allowed transport returns a credential-bearing failure, When error is reported, Then only typed scrubbed code appears; canary absent in response/log.

### FR-n7-003 — Separate sending authority

US-003: разрешаю конкретный вид отправки и могу сразу отозвать разрешение.
SC-US-003-1: Given нет warmup consent или campaign consent, When dispatcher,
Then transport calls=0 даже при подключённом ящике и active campaign.
SC-US-003-2: Given отзыв согласия, When queued job проверяется, Then canceled;
a job whose final serialized transition to submitting already committed may still send; it cannot be recalled, even before the socket call. This boundary is shown explicitly.
Consent required: pool exchange, campaign version+recipient set, optional share
and invitation actions separately. Consent re-required after substantive content
or recipient expansion. Operator live gate не заменяет user consent. ADR-002.

SC-US-003-3: Given only current pool consent is granted and campaign consent absent, When one pool and one campaign job reach dispatch, Then pool may submit once, campaign calls0; changing campaign version invalidates only its consent.
SC-US-003-4: Given claimed job is paused before final serialized transition, When each stop writer in Examples commits then dispatcher resumes, Then conditional transition affects0 rows and transport calls0.
SC-US-003-5: Given final submitting transition committed before the same stop writers, When stop commits before socket call, Then at most that one in-flight attempt may send; every later job is canceled and UI explains boundary.

### FR-n7-004 — Seeded pooled warmup

US-004: вижу пригодный pool и добровольно участвую в автоматической переписке.
SC-US-004-1: Given 30 active eligible opted-in mailboxes, When pool metric,
Then count=30; invited/disconnected/quarantined/revoked excluded.
SC-US-004-2: Given менее 2 разных tenant eligible, When pair scheduler,
Then waiting и 0 exchange jobs; dashboard/API не перечисляет чужие ящики.
Общий пул между tenant, только recipient opt-in members. Neutral deterministic
templates, limited scheduled exchange/replies, no AI. Контент пула обозначен
участникам как test correspondence. ПОЛУЧАТЕЛЬ видит sender address, routing
headers и тестовый body в своём почтовом клиенте; это неизбежно при прямом SMTP.
Отдельный pool consent явно раскрывает эту передачу peer-участнику. Чужие
credentials, private campaign content, контактные списки и перечисление pool
через dashboard/API запрещены. Не mark-not-spam, не fake open/click.
ADR-003; AC-N7-007.

SC-US-004-3: Given two distinct opted-in tenants and disclosure consent, When local SMTP exchange fixture renders a message and B reads it, Then B sees sender/header/test body as disclosed, but foreign dashboard/API/private campaign/credentials access returns404.
SC-US-004-4: Given a warmup thread already has its single reply or pair daily thread, When scheduler replays either event, Then zero additional reply/thread jobs and total thread length<=2.

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

SC-US-005-4: Given each injection or missing-field Example, When preview/start runs, Then invalid template/header yields400 and0 jobs; personalization renders as escaped text.
SC-US-005-5: Given quota at23:59 UTC and lower provider limit, When final transition runs after00:00 with concurrent workers, Then current-day reservation obeys lower limit and no previous-day token bypasses it.
SC-US-005-6: Given proven pre-DATA failure versus ambiguous failure, When retry clock reaches configured boundaries, Then max3 total attempts within120s for proven failure,0 retries for ambiguous.

### FR-n7-006 — Replies and pauses

US-006: после ответа адресата последующие письма прекращаются.
SC-US-006-1: Given matched In-Reply-To/References and sender, When ingestion,
Then enrollment replied, queued steps canceled, next dispatch sends 0.
SC-US-006-2: Given IMAP cursor replay/UIDVALIDITY change,
When ingestion retries, Then transport observations may repeat under new UIDs,
but semantic reply/stop effect is unique per mailbox+enrollment; mailbox stays
paused until full bounded rescan and successful tail poll; stale poll blocks sends.
Reply event по Message-ID tenant/mailbox binding; no subject-only matching.
IMAP reads bounded headers; body retained only if required explicitly, not default.
Stops committed after the serialized submitting boundary affect subsequent messages only. AC-N7-006.

SC-US-006-3: Given same reply returns under changed UIDVALIDITY/UID, When bounded rescan commits then crashes/restarts after a page, Then semantic effect count remains1 and no dispatch until high-water and tail poll complete.
SC-US-006-4: Given wrong sender, foreign mailbox, unrelated References or missing Message-ID Example, When reply ingestion runs, Then only matching own recipient+References produces one semantic stop; all foreign/unrelated cases stop0.
SC-US-006-5: Given poll age59.999s,60s or60.001s and incomplete rescan Example, When final submitting guard runs, Then only age<60s with complete poll/rescan authorizes dispatch.

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

SC-US-007-4: Given valid unsubscribe GET, forged token, wrong-purpose token or unauthenticated complaint Example, When public route is requested, Then GET changes0 rows; bad token denied; unauthenticated complaint401 and0 suppression rows.
SC-US-007-5: Given warmup initial, warmup reply or campaign step message, When renderer runs, Then each includes visible unsubscribe body and both one-click headers.

### FR-n7-008 — Evidence and metrics

US-008: вижу репутацию только когда известен её источник.
SC-US-008-1: Given no valid observation, When dashboard,
Then reputation unknown and share-after-improvement disabled.
SC-US-008-2: Given two same-source comparable observations,
When owner records verified improvement with dates/denominator/source evidence,
Then report shows raw values and provenance; no causal warmup claim.
Manual observations are labelled manual; SMTP accepted and pool count displayed
separately. Sample n<30 hides percentages, not counts. AC-N7-009.

SC-US-008-3: Given observation age7days or7days+1ms and mismatched/future window Example, When share guard evaluates, Then exact7days comparable qualifies; stale/future/incomparable share is denied.

### FR-n7-009 — Billing boundary

US-009: вижу серверный тариф и прохожу разрешённый sandbox checkout.
SC-US-009-1: Given duplicate payment callback/request, When verified provider state,
Then one immutable intent, at most one entitlement grant; redirect alone grants zero.
SC-US-009-2: Given no configured sandbox provider, When checkout,
Then explicit unavailable state, no fake success and no live provider call.
Local fake payment adapter is REQUIRED for MVP success: independent durable
provider fixture state, operator-only success/cancel simulation, immutable intent,
canonical status fetch and idempotent grant. Unavailable is a negative scenario,
never sufficient billing acceptance. Fixture team price=100 minor RUB for 30 days,
marked TEST at every view/event; this is not a live price. Free/team limits come
from server config; client cannot alter amount/plan. Live charges remain deferred.
ADR-004; AC-N7-010.

SC-US-009-3: Given local provider fixture is configured with team100 minor RUB and valid attribution, When operator simulates payment success and server fetches fixture canonical state, Then exactly1 test entitlement and1 attributed test conversion follow verified matching snapshot.
SC-US-009-4: Given redirect-only, wrong amount/currency, duplicate or reordered event Example, When billing adapter reconciles independent local provider state, Then redirect/mismatch grants0, duplicates grant<=1 and stale state cannot resurrect entitlement.

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
When attribution or payment event is processed, Then no fraudulent attributed conversion. Explicit code wins only if valid;
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
Policy version n7-safety-v1 below is required; absent/invalid config fails startup,
not fallback. Runtime keys decode to >=32 bytes. Password8–200 Unicode characters,
<=800 UTF-8 bytes; Argon2id v19 m=65536KiB/t=3/p=1, salt16bytes, output32bytes;
only exact supported hash parameters are admitted. Sessions absolute TTL7days.
Worker SMTP connect<=10s and total attempt<=30s, IMAP operation<=30s; one claim
per mailbox concurrently; crash leases recover only definitely unsubmitted jobs.

### NFR-n7-002 — UX and operations

390px/1440px no unintended horizontal overflow; keyboard focus and clear labels;
reduced motion; empty/error/blocked/loading states; demo markers separate from live.
Health endpoints disclose no secrets, DB ports unexposed. Local API p95 target
<500ms excluding bounded password hashing/provider I/O under 10 concurrent users;
target requires measured evidence and is not currently achieved.


## Safety policy n7-safety-v1 (N7-V02/V03/V04)

- **Serialization:** every writer changing sender consent, campaign version/state,
  mailbox/quarantine/limits, pool sender/recipient membership, reply/enrollment,
  suppression or job eligibility obtains PostgreSQL transaction advisory lock
  `(7,1)` BEFORE reading or mutating eligibility. Final claimed→submitting is one
  conditional transaction under that same lock, rechecking all current predicates
  and lease owner/state; 0 affected rows means 0 transport calls. Global short lock
  is deliberate MVP throughput tradeoff; never hold it across network I/O.
- The commit of final submitting is the irreversible boundary. Stops winning
  that lock first prevent sending; stops winning later cannot recall this in-flight
  attempt and cancel later queued/claimed jobs. User wording uses this exact boundary.
- Poll every30s. Fresh means last COMPLETE successful poll age <60s; exactly60s
  or future timestamp fails closed. Failed poll/rescan page does not advance it.
- On UIDVALIDITY reset capture run_id/UIDNEXT high-water and pause. Scan at most
  20pages×100headers and120s per rescan attempt. Persist page+cursor atomically;
  restart from committed cursor under same high-water. If budget is exceeded,
  stay rescan_incomplete until explicit bounded operator retry, never auto-resume.
  Resume only after all UIDs through high-water are accounted for AND successful
  tail poll under unchanged UIDVALIDITY. A second reset starts a new paused run.
- Reply transport observation unique(mailbox,UIDVALIDITY,UID). Valid normalized
  Message-ID has additional unique(mailbox,message_id) ledger. Authoritative
  semantic stop unique(mailbox,enrollment,reply) irrespective of message ID/UID.
  Missing/malformed Message-ID may still stop only when valid References matches
  our sent message AND normalized sender equals enrollment recipient; count only
  the first semantic stop. Wrong sender/foreign or unrelated reference never matches.
- Warmup thread: one initial message plus at most one template reply; reply jobs
  have parent_id and unique(parent,reply), cannot create another reply. All count
  against the same mailbox quota. Same pair: at most one new thread per UTC day.
- Retry only proven pre-DATA transient failures: max3 attempts TOTAL within120s,
  delays5s then30s. Ambiguous outcome has zero automatic retries. Unknown crash after
  submitting cannot claim pre-DATA proof. Claim lease45s; expired non-submitting claim
  may recover, submitting/unknown remain held for reconciliation, quota retained.
- Quota date chosen at final transition in UTC: expired prior-day reservation is
  moved atomically to current day or deferred if full, preventing midnight bypass.
  Effective limit=min(user limit, provider configured limit, policy30); default10.
- Login per normalized email: 5 attempts/15min; per trusted client IP:10/min.
  Registration per IP:5/hour. DB atomic fixed UTC windows; bad/duplicate attempts count.
  Do not trust client forwarding headers without configured trusted proxy. Per-account
  limit does not consume unrelated account bucket. Exceeded bucket →429 Retry-After.
- KDF admission: max2 concurrent process operations, zero queued; saturation→503
  Retry-After:1 before KDF. Release in finally including failures. Unrelated key
  with a free KDF slot can succeed; global saturation rejects all explicitly.
- Public token/complaint APIs:30 requests/min per trusted IP; invalid requests count.
  Complaints require operator authority in addition; unsigned event commits nothing.
- Evidence comparison: latest observation age<=7days, baseline<=28days before latest,
  same source/metric/unit/duration and nonoverlapping equal UTC windows, declared
  metric direction; future observations invalid. More than7days disables sharing.
  Percentages require denominator>=30; lower samples preserve raw counts only.

## Traceability / AC

AC-N7-001..012 are defined in plans/mvp-xl-plan.md. F01 covers FR-n7-001/002,
F02 003/004, F03 005, F04 006/007, F05 008/009 and FR-GROWTH-001..004.
No borrowed README feature expands this specification. ADR-001..005 are all linked.

### FR-LOOK-001 — Visual hierarchy

Один основной CTA на рабочий шаг, заголовок и краткое пояснение различимы;
собственные цвета/типографика. Подтверждённая regularity публичного source landing
из source-product-profile.md. Проверяется desktop/mobile screenshot и keyboard.
FR-LOOK-002 отклонено: AI-first entry вне MVP, явная секция 07 исключает AI replies.
