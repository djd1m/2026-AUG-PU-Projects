# F07 — Unlimited connected и finite active capacity

PLAN ONLY · Source revision: c80504ac · RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f07-plan-a1 · OWNER checkpoint: OWN-N7-005 (передан координатором).

## Основание и границы

Delta к ../../Specification.md (safety-v1), ../../Pseudocode.md и ../../Architecture.md;
наследует ../expanded-mvp/01_specification.md AC-expanded-mvp-001/009,
все пять expanded ролей, ../expanded-mvp/ai-policy-v1.md и
../../plans/expanded-mvp-plan.md. F02/F05 готовы; F06 не dependency F07.
Роут /run mvp → /next f07-connected-capacity → /go XL (mechanical exit1,
передан координатором) → /feature AUTO. Substantive XL: billing policy,
долговечная схема, admission concurrency и final fence. Это план, не acceptance.

US-201: владелец подключает произвольное число ящиков и явно запрашивает
ограниченную активную ёмкость, видит ожидание и сохраняет отдельные согласия.
Число100 — размер контрольной когорты, не новый потолок. Global30 — принятый
параметр A1 всей инсталляции. Transport/live/AI worker lifecycle остаются F08–F15.

### AC-f07-connected-capacity-001 — Без коммерческого connected cap

[SC-US-201-1]
Given free и TEST team, по100 connected records, When создать101-й и повторить
после истечения/revoke TEST entitlement, Then201 masked configured record;
нет plan_limit_reached за количество ящиков, автоматического consent, lease,
job или SMTP вызова. PUT сохраняет существующую identity и отзывает старый scope.

### AC-f07-connected-capacity-002 — Атомарный global30

[SC-US-201-2]
Given29 действующих lease у≥3 tenant и≥2 конкурирующих activation requests,
When транзакции завершены, Then ровно30 active unexpired во всей инсталляции,
остальные waiting_capacity с сохранённой конфигурацией; повтор запроса на тот
же active mailbox не расходует второй слот. При30 свободных слотах31 запрос
даёт30 active и1 waiting. Сбой транзакции не оставляет частичного admission.

### AC-f07-connected-capacity-003 — Срок и безопасное освобождение

[SC-US-201-3]
Given verified_test mailbox и отдельный capacity request, When activate/renew,
Then lease истекает через120s от времени БД после lock; expires_at==now уже
непригоден. Expired lease отображается waiting_capacity и не продлевается
чтением. Явный retry может получить свободный слот, renew не создаёт новый.
Deactivate, PUT credentials, pause и quarantine освобождают lease в той же
eligibility transaction; stale renew не оживляет ящик. После PUT необходимы
новая verify-test и явная activation. После pause/quarantine F07 не добавляет
resume shortcut: существующий PUT→verify-test→activation путь остаётся явным.

### AC-f07-connected-capacity-004 — Ёмкость действительно управляет отправкой

[SC-US-201-4]
Given current consent/fresh poll/available quota, но lease отсутствует, waiting
или expired у sender либо pool recipient, When pool tick/claim/final submission,
Then transport calls0 и mailbox не counted eligible. При unexpired lease
существующий local TEST happy path проходит. Lease сам не даёт consent и не
означает live verification. Revoke consent сохраняет свою независимую защиту.

### AC-f07-connected-capacity-005 — Stop/final fence и текущий UTC день

[SC-US-201-5]
Given claimed job, When deactivate/expiry/pause/config replacement выигрывает
до final commit, Then submit0; final commit, выигравший раньше stop, сохраняет
только существующую in-flight границу. Все capacity writers берут lock(7,1)
первым; DB errors fail closed. Время берётся после ожидания lock, включая expiry
и UTC midnight: общий default10, ceiling30 и lower provider quota сохранены.
Никакой DB lock не держится на DNS/SMTP/IMAP IO.

### AC-f07-connected-capacity-006 — Tenant-scoped bounded pages и abuse

[SC-US-201-6]
Given101 own mailboxes и чужие records, When листать bounded pages,
Then каждый own record достижим, чужие не возвращаются; stable order
created_at,id. GET limit default25/max100 strict integer; optional after UUID — последняя own
identity предыдущей страницы. Malformed limit/cursor400, foreign/missing cursor404. Foreign capacity/read/update
404 без DNS, ciphertext или изменений. POST create/capacity используют имеющийся
IP rate limiter до body validation; существующий body byte limit сохраняется.

### AC-f07-connected-capacity-007 — Видимое ожидание и навигация

[SC-US-201-7]
Given saturated installation и own mailbox на странице5, When пользователь
выбирает его и активирует, Then cabinet показывает waiting_capacity, срок lease,
retry/deactivate и local TEST mode без обещания отправки. Кнопки доступны с
клавиатуры, loading/error/empty states явны. Campaign mailbox chooser листает
все страницы; overview не выдаёт длину первой страницы за total. Смена session
очищает старую страницу и игнорирует поздние ответы. Тариф показывает unlimited
connected отдельно от global30; consent checkbox остаётся unchecked.

### AC-f07-connected-capacity-008 — TEST billing и migration совместимость

[SC-US-201-8]
Given upgrade schema11→12 и existing configured/verified/paused records,
When migrate/repeat migrate and billing regressions, Then records/AEAD/consents/
quota/history сохранены; нет автоматически выданных lease. free/team active
campaign limits остаются3/10; TEST100 minor RUB/30days, canonical payment state,
single entitlement grant и expiry/revoke прежние. Mailbox limits API — явный
null unlimited, не Infinity/не отсутствующее поле. Старый binary с predicate
без capacity нельзя запускать после включения нового: rollout с drain.

## Нефункциональные границы

120s lease — локальное инженерное решение этого slice, не SLO автопрогрева;
F10 добавит bounded worker renewal/fairness. F07 предоставляет явные activate,
renew, deactivate и retry без daemon/таймера в браузере. Waiting не auto-send.
Сохранение произвольного числа records не снимает anti-abuse/request/page bounds.
Никаких новых dependencies, live email/LLM, payment spend или deployment.
Метрики принятия: connected101, active≤30, unauthorized transport0 — наша БД и
тестовые receipts. Числовые boundary tests используют литералы независимо от constants.
