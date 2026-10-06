# F10 — постоянные workers и автоматический opt-in pool

PLAN / AUTO, 2026-10-06. Baseline: 2248aa17df74822cb9e82f62046e3c1a26032cba; F09 runtime e043bb27 integrated161b92e1, независимый ACCEPT9.
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1; WORK_UNIT_ID: f10-plan-a1.
/run mvp → /next F10 → /go → /feature; mechanical M/exit0 — нижняя граница, substantive XL сохраняется. OWN-N7-005 покрывает этот scope, повторный checkpoint не нужен. Profile compact-quality-first-v2; requested Astra/high, actual model/effort/usage/cost null (host_not_exposed). Это PLAN, не VALIDATE или runtime acceptance.

## User story and scope

Как участник добровольного пула я хочу один раз включить участие и активность, чтобы worker регулярно проверял ответы и планировал безопасный прогрев без ручных ticks. Как оператор я хочу конечные очереди, восстановление и видимые причины ожидания. Родитель: FR/AC-expanded-mvp-004 и A1/A2 в ../../plans/expanded-mvp-plan.md. Approved brief, research, solution и ai-policy-v1 наследуются; Explore и новый market research пропущены по pre-filled context. F11–F15, AI generation/authority/SLO, UI redesign, real billing, внешние аккаунты и deployment вне F10.

Фактические gaps: dispatch/worker.ts выполняет один tick; live PollWorker.tick выбирает первый mailbox; loop последовательно ждёт poll и30s; PoolStore.tick повторяет первую пару. Не менять native F09 на Nodemailer/ImapFlow из исторической parent architecture. Существующие SMTP/UID и ownership contracts — donor; Redis/BullMQ/новый scheduler framework отвергнуты.

### FR-f10-durable-runtime-001 — durable lifecycle и безопасное восстановление

Отдельный worker entry point поддерживает explicit tick и persistent loop; PostgreSQL хранит due/ownership, а процесс — конечный набор исполняемых операций. Shutdown прекращает admission, передаёт cancellation и завершает cleanup. Restart восстанавливает только безопасную работу.

### AC-f10-durable-runtime-001 — restart and drain

[SC-F10-001] Given worker с queued, claimed, submitting, unknown и незавершённым rescan, When SIGTERM либо crash/restart, Then новые claims после начала drain отсутствуют, queued/expired claimed продолжаются с новым owner CAS, submitting после120s становится unknown_delivery без повторной SMTP, unknown сохраняет quota, rescan сохраняет cursor/pause. Graceful drain≤15s при работающем event loop и доступной БД: abort немедленно, existing child TERM5s/KILL5s/confirmed exit, затем DB cleanup≤5s; при отсутствии подтверждения exit результат cleanup_blocked, occupied slot остаётся занят. Произвольная остановка OS не имеет обещанного wall-clock завершения.

### FR-f10-durable-runtime-002 — fair durable polling и active intent

Due polling распределяется round robin между tenant и oldest due mailbox, независимо от send/pool pressure. Существующие active/waiting capacity rows обозначают явное желание активности; worker не активирует произвольные connected records и не возвращает удалённое deactivation/revoke состояние.

### AC-f10-durable-runtime-002 — every eligible mailbox progresses

[SC-F10-002] Given100 connected,30 active across≥3 tenants, explicit consent/activity и healthy bounded fixtures, When persistent worker выполняет несколько rounds и restart, Then каждый active mailbox имеет healthy complete poll cadence≤30s, fair due-work round≤60s, active≤30 globally и lease120s обновляется до expiry. Нагрузочный receipt публикует реальные duration/max gap каждого mailbox, CPU/RAM и нарушения; round target не означает SMTP completion в60s. Waiting_capacity admission идёт по tenant rotation при освобождении места; deactivated row не создаётся вновь. Медленный/failed provider переводится в видимый overdue/backoff, не исключается из метрик и не превращает условный healthy target в безусловную гарантию.

### FR-f10-durable-runtime-003 — finite lanes, page fairness и socket ownership

Исполнение ограничено2 SMTP и4 IMAP lanes globally,1/protocol/mailbox; rescan получает один bounded operation/page quantum до следующего выбора. Физическое владение F09 сильнее due lease; expiry не освобождает открытые сокеты.

### AC-f10-durable-runtime-003 — physical bounds under suspension

[SC-F10-003] Given competing processes, stalled provider и SIGSTOP owner>120s, When due/transport leases expire и второй worker стартует, Then peer-observed sockets≤2 SMTP/4 IMAP/1 per protocol mailbox, paused/orphan slot не переиспользуется. Release только exact sealed close или confirmed exact child exit; DB release failure хранит proof и повторяет CAS, а restart без proof оставляет cleanup_blocked. Число live child operations≤6, pending closed proofs≤6, in-memory jobs≤6, каждый lane не получает следующий job до settlement/cleanup предыдущего. Один rescan не удерживает lane на20 страниц подряд; полный rescan сохраняет20pages/120s attempt и не производит false freshness.

### FR-f10-durable-runtime-004 — fair paced dispatch сохраняет final fence

Existing DispatchStore/SubmissionStore остаются единственным путём отправки. Tenant/mailbox rotation выбирает oldest due job всех разрешённых scopes, без бесконечного приоритета кампаний или пула. SMTP pacing и provider cooldown проверяются повторно в final transaction.

### AC-f10-durable-runtime-004 — spacing quota and stop race

[SC-F10-004] Given pool/campaign jobs,20 competing workers, lower provider cap и UTC midnight, When due claims/final submissions race с consent revoke, suppression, quarantine, grant/config/capacity expiry, Then global advisory_xact_lock(7,1) FIRST у всех writers и final transition, no network in DB transaction, current-day shared default10/ceiling30/provider lower cap preserved; sender starts≥60s apart, provider later cooldown wins. Оба pool peers требуют current consent, active lease и complete poll age<60s. Stop-before-commit даёт0 calls; stop-after оставляет только уже committed in-flight attempt. Proven pre-DATA retries сохраняют max3/120s и5s/30s lower delay, но60s spacing тоже обязателен; retry, не помещающийся в120s, исчерпывается, лимиты не расширяются. Unknown никогда не retry.

### FR-f10-durable-runtime-005 — automatic idempotent pool allocation

Текущий affirmative pool consent уже атомарно создаёт pool_member. Worker автоматически создаёт due work для таких участников, без повторного enrollment consent и без отправки на save. Pair/day и parent reply uniqueness сохраняются, конфликт продвигает bounded persistent cursor.

### AC-f10-durable-runtime-005 — pair conflicts do not starve peers

[SC-F10-005] Given≥2 distinct opt-in tenants, fresh active peers с budget и первая пара уже занята сегодня, When concurrent allocation/restart/midnight, Then каждый allocation-eligible sender рассматривается≤5min и получает доступную legal pair, либо durable waiting reason; unordered pair/day≤1 и thread≤2 total (initial плюс единственный reply только submitted parent). Skip conflict продолжает других peers и senders в том же bounded round; повтор crash commit не создаёт duplicate. Budget-exhausted, same-tenant, revoked, stale recipient, unknown parent дают0 новых соответствующих sends. Нет peers — waiting и0 sends. На mailbox≤1 movable queued/claimed pool outbound job, чтобы автоматические rounds не накапливали бесконечный backlog.

### FR-f10-durable-runtime-006 — overload и честные operational outcomes

Процесс сохраняет due age, last service, eligibility outcome и bounded backoff в PG. Отказ отдельного tenant/provider не блокирует независимые lanes; DB unavailable прекращает admission fail-closed.

### AC-f10-durable-runtime-006 — bounded overload is observable

[SC-F10-006] Given noisy tenant,100 connected, exhausted quota, failed IMAP/DB и занятые slots, When несколько rounds проходят, Then доступные независимые tenants продолжаются, ineligible tasks получают typed reason и следующую проверку без busy spin; due age не обнуляется при отказе или restart. No-data tasks sleep cancellably≤1s, provider failure backoff30/60/120/300s capped300s, success сбрасывает failure count; transport_busy retry≤1s без создания обещаний/сокетов. Metrics считают overdue и blocked отдельно; DB outage не заявляется healthy pass. Connected records обходятся keyset pages≤100, active работы≤30, pool pair candidates≤30 за sender quantum; unlimited records не загружаются целиком.

### NFR-f10-durable-runtime-001 — bounded authority и local acceptance

CLI/container используют существующие disabled/local_test/live_provider modes и F09 grants; fixture injection доступна только trusted test constructors. Billing остаётся TEST. Acceptance требует реальных PG/protocol/restart/fault tests и независимого review.

### AC-f10-durable-runtime-007 — reproducible parent witness

[SC-F10-007] Given exact candidate/spec/build и disposable local PG/TLS fixtures, When полный обязательный набор выполнен, Then tests/expanded-mvp-04.test.ts title `persistent fair workers serve every eligible mailbox` доказывает родительский AC004 вместе с перечисленными ниже witnesses; typecheck/lint/build/unit/full PG/protocol/concurrency/crash/canary/mutations проходят. CLI tick завершается, loop переживает больше одного round, import не запускает worker; disabled default даёт0 external calls. Compose worker не публикует ports/DB и не получает fixture override/engine socket. Browser not_applicable без UI diff. F06 delivery gaps и ещё не выполненные F11–F15 остаются явно pending; PLAN test assignments не runtime PASS.

## Eligibility, priorities and measurements

Poll-eligible: current verified_test configuration, explicitly requested active capacity, selected poll mode, fixture source in local_test либо current imap_headers grant in live_provider; freshness не prerequisite самого poll. Incomplete rescan разрешён только через явный bounded retry transition, sending остаётся paused. Dispatch-eligible: actual due job плюс все existing claim/final predicates, current pacing и физический slot. Allocation-eligible: pool_member связанный с current consent, оба active/fresh peers разных tenant, available shared budget, legal pair/day, no movable pool outbound backlog; reply дополнительно требует submitted initial. Requesting a new pool job не резервирует quota вне existing claim.

Poll lanes изолированы от send lanes. Внутри класса: tenant с наименьшим durable service sequence, затем oldest due mailbox, затем UUID; внутри sender — oldest due job, затем UUID, без scope priority. Pool учитывает готовый reply как due candidate с parent accepted time, initial как due allocation time; выбирает oldest, а затем проверяет unique/budget. Progress при busy/failure перемещает fairness cursor, но не стирает исходный due age. Точные дополнительные quantum/backoff numbers — implementation bounds F10, не новые обещания commercial throughput.

| Metric | Target / window | Источник значения |
|---|---|---|
| Healthy poll completion gap |≤30s, каждый active mailbox в A1 fixture run |наша БД |
| Eligible due selection round |≤60s, включая restart round |наша БД |
| Eligible pool allocation round |≤300s |наша БД |
| Physical sockets / live children |≤2SMTP/4IMAP,1/protocol/mailbox;≤6children |наш журнал |
| SMTP start spacing / shared UTC cap |≥60s; default10,max30,provider lower |наша БД |
| Overdue, blocked, cleanup_blocked |все outcomes, без скрытых исключений |наша БД |

Healthy receipt фиксирует fixture latency/traffic/load и проверяет target на измеренном A1. Если30s не достигается при4 lanes, criterion fails; нельзя задним числом исключить медленные mailbox или повысить sockets. Fixtures не доказывают7day live capacity, arrival SLO или deliverability.
