# Test scenarios

Gherkin contract; execution evidence is recorded separately. Fixtures never prove real geometry quality.

@FR-GROWTH-001 @growth @happy-path
Scenario: Growth 001 happy-path
Given готовый результат владельца
When он нажимает Поделиться и подтверждает системный share
Then один share_completed за не более 2 действий

@FR-GROWTH-001 @growth @edge-case
Scenario: Growth 001 edge-case
Given открытый системный share
When пользователь отменяет
Then число share_completed равно 0


@FR-GROWTH-002 @growth @happy-path
Scenario: Growth 002 happy-path
Given валидный код партнёра до оплаты
When провайдер подтверждает первую покупку
Then ровно 1 paid_conversion связан с партнёром

@FR-GROWTH-002 @growth @edge-case
Scenario: Growth 002 edge-case
Given cookie заблокированы
When пользователь вводит персональный код в paywall
Then подтверждённая покупка сохраняет 1 атрибуцию

@FR-GROWTH-002 @growth @security
Scenario: Growth 002 security
Given код самого покупателя
When он пытается применить self-referral
Then атрибуция отклонена и начислений партнёру 0

@FR-GROWTH-003 @growth @happy-path
Scenario: Growth 003 happy-path
Given бесплатный результат
When владелец экспортирует композит
Then на 1 изображении есть видимый badge RoomKind

@FR-GROWTH-003 @growth @edge-case
Scenario: Growth 003 edge-case
Given подтверждённый платный пакет
When владелец повторно экспортирует прежний результат
Then badge RoomKind отсутствует и пометка AI сохранена

@FR-GROWTH-003 @growth @security
Scenario: Growth 003 security
Given бесплатный аккаунт
When запрос содержит removeBadge=true
Then экспорт сохраняет badge и entitlement не меняется

@FR-GROWTH-004 @growth @happy-path
Scenario: Growth 004 happy-path
Given два разных партнёра
When оператор создаёт коды
Then сохранены 2 уникальных кода и конверсии не смешиваются

@FR-GROWTH-004 @growth @edge-case
Scenario: Growth 004 edge-case
Given существующий код
When оператор повторяет создание того же кода
Then возвращается конфликт и сохранён 1 код

@FR-GROWTH-004 @growth @security
Scenario: Growth 004 security
Given оплата с одним provider_id
When 10 одинаковых событий приходят одновременно
Then в партнёрском агрегате ровно 1 конверсия

@FR-GROWTH-005 @growth @happy-path
Scenario: Growth 005 happy-path
Given real accepted результат и описание 40 символов
When владелец явно включает публикацию
Then 1 публичная страница содержит сравнение и стиль

@FR-GROWTH-005 @growth @edge-case
Scenario: Growth 005 edge-case
Given опубликованная работа
When владелец отзывает публикацию
Then прежний token и media URL возвращают 404

@FR-GROWTH-005 @growth @security
Scenario: Growth 005 security
Given fixture или unverified результат и HTML в описании
When пользователь пытается публиковать
Then публичных страниц 0 и скрипты не исполняются

@FR-payment-1 @security
Scenario: Return URL forgery
Given неоплаченный заказ
When пользователь открывает success URL
Then баланс не увеличивается

@FR-redesign-1 @security
Scenario: Late worker fence
Given lease попытки A истёк и взят B
When A сохраняет результат
Then обновлено 0 job rows и кредит не расходуется повторно

## Criterion scenarios

All are planned acceptance scenarios, not execution evidence. Each AC ID is canonical in Specification; matrix scenarios require every listed parameter case, not one representative.

| Criterion | Scenario |
|---|---|
| FR-auth-1 | Registration and trial race; Session lifecycle and cookie flags; Auth abuse and origin boundaries; Session isolation |
| FR-upload-1 | Image decode boundary matrix; Upload ownership and orphan cleanup |
| FR-redesign-1 | Durable job admission and retry; Concurrent last-slot admission; Job timeout and crash recovery; Retry limit and release races; Interrupted status recovery; Late worker fence |
| FR-geometry-1 | Generation provenance boundary; Real geometry corpus; Operator quality transition |
| FR-gallery-1 | Gallery states and privacy; Accessible comparison layout; Delete revoke and cleanup |
| FR-payment-1 | Checkout idempotency and return forgery; Provider verification matrix; Verified payment replay; Verified refund binding; Refund reservation export and success ordering; Return URL forgery |
| FR-GROWTH-001 | Share artifact action count; Share outcome event matrix; Growth 001 security; Growth 001 happy-path; Growth 001 edge-case |
| FR-GROWTH-002 | Attribution consent persistence and expiry; Attribution override and freeze; Concurrent first conversion and second purchase; Growth 002 happy-path; Growth 002 edge-case; Growth 002 security |
| FR-GROWTH-003 | Composite entitlement and cached hold; Public token original exclusion; Growth 003 happy-path; Growth 003 edge-case; Growth 003 security |
| FR-GROWTH-004 | Partner operator and binding boundary; Partner aggregate replay refund repeat; Growth 004 happy-path; Growth 004 edge-case; Growth 004 security |
| FR-GROWTH-005 | Publication consent and content boundaries; Accepted-public XSS and privacy; Public revoke and cache replay; Growth 005 happy-path; Growth 005 edge-case; Growth 005 security |
| NFR-security-1 | Fail closed configuration matrix; Security limits injection and leak matrix; Security guard mutation controls |
| NFR-performance-1 | Attempt ticket counter matrix; UTC rollover and queued expiry; Measured GPU performance cohort |
| AUTH-01 (FR-auth-1) | Registration and trial race |
| AUTH-02 (FR-auth-1) | Session lifecycle and cookie flags |
| AUTH-03 (FR-auth-1) | Auth abuse and origin boundaries |
| AUTH-04 (FR-auth-1) | Session isolation |
| UPLOAD-01 (FR-upload-1) | Image decode boundary matrix |
| UPLOAD-02 (FR-upload-1) | Upload ownership and orphan cleanup |
| JOB-01 (FR-redesign-1) | Durable job admission and retry |
| JOB-02 (FR-redesign-1) | Concurrent last-slot admission |
| JOB-03 (FR-redesign-1) | Job timeout and crash recovery |
| JOB-04 (FR-redesign-1) | Retry limit and release races |
| JOB-05 (FR-redesign-1) | Interrupted status recovery |
| GEOM-01 (FR-geometry-1) | Generation provenance boundary |
| GEOM-02 (FR-geometry-1) | Real geometry corpus |
| GEOM-03 (FR-geometry-1) | Operator quality transition |
| GALLERY-01 (FR-gallery-1) | Gallery states and privacy |
| GALLERY-02 (FR-gallery-1) | Accessible comparison layout |
| GALLERY-03 (FR-gallery-1) | Delete revoke and cleanup |
| PAY-01 (FR-payment-1) | Checkout idempotency and return forgery |
| PAY-02 (FR-payment-1) | Provider verification matrix |
| PAY-03 (FR-payment-1) | Verified payment replay |
| PAY-04 (FR-payment-1) | Verified refund binding |
| PAY-05 (FR-payment-1) | Refund reservation export and success ordering |
| SHARE-01 (FR-GROWTH-001) | Share artifact action count |
| SHARE-02 (FR-GROWTH-001) | Share outcome event matrix |
| SHARE-03 (FR-GROWTH-001) | Growth 001 security |
| ATTR-01 (FR-GROWTH-002) | Attribution consent persistence and expiry |
| ATTR-02 (FR-GROWTH-002) | Attribution override and freeze |
| ATTR-03 (FR-GROWTH-002) | Concurrent first conversion and second purchase |
| BADGE-01 (FR-GROWTH-003) | Composite entitlement and cached hold |
| BADGE-02 (FR-GROWTH-003) | Public token original exclusion |
| PARTNER-01 (FR-GROWTH-004) | Partner operator and binding boundary |
| PARTNER-02 (FR-GROWTH-004) | Partner aggregate replay refund repeat |
| PUBLIC-01 (FR-GROWTH-005) | Publication consent and content boundaries |
| PUBLIC-02 (FR-GROWTH-005) | Accepted-public XSS and privacy |
| PUBLIC-03 (FR-GROWTH-005) | Public revoke and cache replay |
| SEC-01 (NFR-security-1) | Fail closed configuration matrix |
| SEC-02 (NFR-security-1) | Security limits injection and leak matrix |
| SEC-03 (NFR-security-1) | Security guard mutation controls |
| PERF-01 (NFR-performance-1) | Attempt ticket counter matrix |
| PERF-02 (NFR-performance-1) | UTC rollover and queued expiry |
| PERF-03 (NFR-performance-1) | Measured GPU performance cohort |

## Detailed acceptance scenarios

@FR-auth-1 @AUTH-01
Scenario: Registration and trial race
Given two concurrent registrations with one canonical email, and password lengths11,12,128,129
When register then login
Then exactly1 account/trial exists;12/128 accepted and11/129 rejected

@FR-auth-1 @AUTH-02
Scenario: Session lifecycle and cookie flags
Given valid, unknown, expired and logged-out sessions
When login and access a private resource over configured local/nonlocal origins
Then only valid sessions authorize; cookie flags match environment and failed login bodies are generic

@FR-auth-1 @AUTH-03
Scenario: Auth abuse and origin boundaries
Given requests below/at/above auth caps with valid, foreign, missing and null Origin
When send registration/login/logout and SQL-looking email input
Then caps yield413/429; invalid Origin403; values stay data and do not bypass authentication

@FR-auth-1 @AUTH-04
Scenario: Session isolation
Given accountsA/B and resources belonging toA
When B lists and reads/deletes A resources
Then only B-owned entries listed; direct cross-account requests404 with zero media bytes

@FR-upload-1 @UPLOAD-01
Scenario: Image decode boundary matrix
Given each allowed format at/beyond byte and pixel limits, spoofed MIME/magic and EXIF orientation
When upload each case
Then valid boundary files normalize and strip EXIF; oversized413, invalid422; no original client filename exposed

@FR-upload-1 @UPLOAD-02
Scenario: Upload ownership and orphan cleanup
Given two accounts, traversal/URL inputs and forced DB failure
When read/delete/upload then run bounded cleanup
Then wrong owner404, traversal/URL400; failed-write file removed; live/recent referenced files retained

@FR-redesign-1 @JOB-01
Scenario: Durable job admission and retry
Given one valid upload plus invalid style/other-owner upload and a dropped202 response
When create and retry same/different bodies
Then valid response arrives before worker; retry same id; changed body409; invalid inputs create no job

@FR-redesign-1 @JOB-02
Scenario: Concurrent last-slot admission
Given one credit or one remaining account/platform ticket with two admissions and optional held account
When race job creation
Then at most1 reserve/ticket/job; exhausted/held requests create none and no partial bucket increment

@FR-redesign-1 @JOB-03
Scenario: Job timeout and crash recovery
Given queued job at60s, healthy-heartbeat attempt at180s, crashed lease and job at360s
When sweeper/worker claims or finishes
Then expired work is fenced/failed and process cancelled; no late success, no third attempt; status reads never wait for inference

@FR-redesign-1 @JOB-04
Scenario: Retry limit and release races
Given retry at daily limit plus concurrent failure/sweeper/delete/late completion
When transition terminal states
Then job fails with named reason; unique release +1 at most; output from stale fence inaccessible

@FR-redesign-1 @JOB-05
Scenario: Interrupted status recovery
Given queued/running/succeeded/failed job and a network outage
When poll then reload
Then unknown during outage; fresh GET resumes server state with same job and unchanged ledger

@FR-geometry-1 @GEOM-01
Scenario: Generation provenance boundary
Given real/fixture modes, missing CUDA/models or missing provenance field
When generate and persist result
Then real unavailable fails explicitly; fixture labelled; successful result bound to exact bytes and complete evidence

@FR-geometry-1 @GEOM-02
Scenario: Real geometry corpus
Given 12 real rooms with annotated openings/anchors and3 styles
When run actual GPU generation and independent measurement
Then 36 valid pairs meet all thresholds; fixture or missing evidence cannot pass

@FR-geometry-1 @GEOM-03
Scenario: Operator quality transition
Given real/fixture results with valid, missing or mismatched evidence and operator/user actors
When attempt accept/reject and then publish
Then only valid real operator review accepts bound bytes; all others refuse; rejection revokes and releases once

@FR-gallery-1 @GALLERY-01
Scenario: Gallery states and privacy
Given owned jobs in each state and second account
When list/reopen at desktop/mobile and simulate fetch error
Then correct state/actions; unknown on failure; no cross-owner data and no indexing/cache headers

@FR-gallery-1 @GALLERY-02
Scenario: Accessible comparison layout
Given before/after result at1440px and390px with keyboard/reduced motion
When navigate and change slider
Then labels/state readable; value changes by keyboard; computed body≥16px and document width≤viewport

@FR-gallery-1 @GALLERY-03
Scenario: Delete revoke and cleanup
Given owned published/queued/running results plus failed filesystem delete
When delete then request old tokens/private IDs and rerun cleanup
Then all reads404 immediately; worker cannot attach; one reserve release if pending; files removed within bounded healthy-worker interval

@FR-payment-1 @PAY-01
Scenario: Checkout idempotency and return forgery
Given client price override, repeated key, provider timeout and missing keys
When create/retry intent then visit return URL
Then server amount unchanged, one intent/provider key; retry resumes; changed409; no return grant; unavailable config503

@FR-payment-1 @PAY-02
Scenario: Provider verification matrix
Given each merchant/id/account/order/amount/currency/paid/status field individually wrong plus timeout/malformed/oversized response
When deliver success notification then valid retry
Then each mismatch grants0; transient failure claims no dedupe; valid retry grants20 once

@FR-payment-1 @PAY-03
Scenario: Verified payment replay
Given 10 duplicate successes, reordered cancel/success and different purchases
When settle concurrently
Then one grant per payment; succeeded resists cancel; review monotonic; repeat package grants do not duplicate first conversion

@FR-payment-1 @PAY-04
Scenario: Verified refund binding
Given valid partial/full refund and wrong refundID/payment/merchant/account/currency/amount/status
When process notification
Then only correctly bound succeeded refund sets hold/review; mismatches no state change; duplicate harmless; ledger never guessed/reversed

@FR-payment-1 @PAY-05
Scenario: Refund reservation export and success ordering
Given refund racing reservation/export/cached access/retry plus stale success before/after refund
When execute each ordering
Then no post-hold new reserve/start/badge-free response; cached asset cannot bypass; review stays and queued credit releases once; pre-hold authorized effects are explicitly distinguished

@FR-GROWTH-001 @SHARE-01
Scenario: Share artifact action count
Given owner result and recorded browser network/actions
When share using native API or download fallback
Then artifact after≤2 actions contains comparison/badge and no messaging request

@FR-GROWTH-001 @SHARE-02
Scenario: Share outcome event matrix
Given native resolve/abort/error/unavailable and download success/failure
When invoke each path and replay same event key
Then only native resolve completed1; successful download export1, complete0; cancellation/errors0; dedupe prevents repeats

@FR-GROWTH-001 @SHARE-03 @growth @security
Scenario: Growth 001 security
Given result of another account
When request composite by job_id
Then 404 and zero image bytes

@FR-GROWTH-002 @ATTR-01
Scenario: Attribution consent persistence and expiry
Given consent denied/accepted, blocked cookies and30d elapsed
When onboard/reload and enter code at checkout
Then no tracking cookie before opt-in; valid consent persists until expiry; denied/expired cookie not used; manual code works

@FR-GROWTH-002 @ATTR-02
Scenario: Attribution override and freeze
Given valid cookieA/codeB plus self/tampered/inactive codes
When edit before intent then change after intent creation
Then validB replacesA before freeze; later input cannot alter intent; bad codes have no effect

@FR-GROWTH-002 @ATTR-03
Scenario: Concurrent first conversion and second purchase
Given two differently attributed valid intents for one account and later purchase/refund
When settle concurrently then settle later/refund
Then exactly one first marker and at most one conversion; first committed wins; no second/backfilled/promoted conversion

@FR-GROWTH-003 @BADGE-01
Scenario: Composite entitlement and cached hold
Given free, paid and held accounts with cached artifact and removeBadge=true
When export/request directly before and after hold
Then free/held include badge or unavailable; paid unheld may omit; AI label always; stale badge-free cache never bypasses

@FR-GROWTH-003 @BADGE-02
Scenario: Public token original exclusion
Given published valid composite token plus guessed original/result paths
When request every public media variant
Then only authorized composite returned; originals/direct raw paths404 without private bytes

@FR-GROWTH-004 @PARTNER-01
Scenario: Partner operator and binding boundary
Given operator/user actors, duplicate codes, changed owner and self code
When create/attribute codes
Then only operator creates; duplicate409, user denied, binding immutable and self conversion0

@FR-GROWTH-004 @PARTNER-02
Scenario: Partner aggregate replay refund repeat
Given two partners, duplicated notifications, repeat purchase and refunded first purchase
When query counts/amount after each settlement
Then exact sums/counts of eligible first records only; repeated/refunded events do not inflate; no financial payout writes

@FR-GROWTH-005 @PUBLIC-01
Scenario: Publication consent and content boundaries
Given accepted/unverified/fixture jobs, checked/unchecked consent, missing style/context and descriptions39/40chars
When publish two separate results
Then only complete accepted real opted-in40+ result succeeds; no inherited consent or fixture SEO

@FR-GROWTH-005 @PUBLIC-02
Scenario: Accepted-public XSS and privacy
Given accepted real job with script-like description and private EXIF/contact data
When publish and load page/gallery
Then text literal, script not executed; useful comparison remains; zero private fields/EXIF

@FR-GROWTH-005 @PUBLIC-03
Scenario: Public revoke and cache replay
Given published accepted job and cached page/media/token
When revoke/delete/reject then retry every old URL
Then 404 with zero media bytes and no-store; absent from public list

@NFR-security-1 @SEC-01
Scenario: Fail closed configuration matrix
Given each missing DB/secret/storage/runtime config and unsafe production fixture/default credential/public DB port
When start validated configuration/compose
Then each unsafe case refuses before socket; safe isolated config starts; no secret in client files

@NFR-security-1 @SEC-02
Scenario: Security limits injection and leak matrix
Given foreign origins, SQL/path/HTML injection, oversize public/provider bodies,121 requests/min and error containing secrets
When exercise routes and inspect safe logs/config
Then no bypass/execution/leak; size413 or provider503 and rate429; bounded resources; DB not published

@NFR-security-1 @SEC-03
Scenario: Security guard mutation controls
Given isolated tests tied to source snapshot
When remove each named guard in disposable worktree and run relevant case
Then each mutation makes its targeted assertion fail; original source restored and no fake fixtures accepted

@NFR-performance-1 @PERF-01
Scenario: Attempt ticket counter matrix
Given platform/account independently at limit, concurrent last slot, failed/retry work and invalid limits
When admit/claim/retry
Then no partial increments or overrun; every attempt ticket counted despite refund; impossible retry fails/releases exactly once

@NFR-performance-1 @PERF-02
Scenario: UTC rollover and queued expiry
Given job admitted before midnight, current-day cap full/available and elapsed60s queue deadline
When claim at new UTC day or after expiry
Then new ticket only if both counters available; old count retained; exhaustion/expiry terminal and one credit release

@NFR-performance-1 @PERF-03
Scenario: Measured GPU performance cohort
Given real warm/cold/fixture samples and missing metadata
When calculate nearest-rank p95 on valid warm cohort
Then n≥30 real warm only with complete provenance; report queue separately; unavailable cohort remains unknown
