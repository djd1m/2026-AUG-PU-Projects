# Requirements Testability Analysis
Spec revision: sha256:8c55e447d6a5e9f8b98f5bbb0415102089ed300b31142dab42f73d44ac9d7712

Verdict: NEEDS WORK
Source revision: b18648c6bdc0df02964a238a7ec2f48d978137f0
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f07-validate-a1
Дата: 2026-10-06. Независимая VALIDATE; продуктовая реализация не проверялась.

## Область и основание

Проверены все пять ролей F07, expanded-mvp/01_specification.md,
02_pseudocode.md, 03_architecture.md, docs/plans/expanded-mvp-plan.md,
каноническая docs/Specification.md § Safety policy n7-safety-v1 и OWN-N7-005.
Пути без префикса относятся к projects/07-cold-email-warmup.
Контракты отчёта: корневая .claude/skills/requirements-validator/SKILL.md и
references/{feature-report-contracts,scoring-system}.md. Применён companion
для source-bound handoff; E2E readiness: not_applicable, только документы.
Разрешение OWN-N7-005 применимо; повторный checkpoint владельца не нужен.

Одна история US-201, восемь AC. Testability: 92/100 до внешних бонусов:
INVEST 42/50 + SMART 30/30 + Quality 20/20. Security +5 и growth +5
отдельно; итог ограничен100. Числовой балл не отменяет противоречие F07-VAL-001.
Нет блокировки по нулевому floor; переход к IMPLEMENT требует исправления
подтверждённого конфликта и повторной проверки изменённых документов.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-f07-connected-capacity-001 | SC-US-201-1 — 101-й connected без cap и без побочных разрешений |
| AC-f07-connected-capacity-002 | SC-US-201-2 — Конкурентный последний глобальный слот |
| AC-f07-connected-capacity-003 | SC-US-201-3 — Expiry, stale renew и атомарное освобождение; SC-F07-Q — Жалоба немедленно освобождает слот |
| AC-f07-connected-capacity-004 | SC-US-201-4 — Sender и pool recipient требуют lease на каждом fence |
| AC-f07-connected-capacity-005 | SC-US-201-5 — Stop выигрывает final commit, включая midnight |
| AC-f07-connected-capacity-006 | SC-US-201-6 — Полный tenant-only обход bounded pages; SC-F07-AUTH, SC-F07-INPUT, SC-F07-TENANT, SC-F07-RATE |
| AC-f07-connected-capacity-007 | SC-US-201-7 — Поздняя страница, waiting, retry и смена session |
| AC-f07-connected-capacity-008 | SC-US-201-8 — Schema12 без auto-lease и прежний TEST billing |

## Подтверждённое замечание

### F07-VAL-001 — HIGH: quarantine через complaint противоречит release AC003

01_specification.md:45–46 требует: «Deactivate, PUT credentials, pause и
quarantine освобождают lease в той же eligibility transaction».
03_architecture.md:37–38 разрешает существующим stop writers в suppression/replies
оставлять unusable lease до expiry. Это включает настоящий mailbox quarantine:
src/suppression/store.ts:65 вызывает complaintClient; src/dispatch/seams.ts:47–52
вызывает cancelMailbox и переводит mailbox в quarantined под eligibility lock.
В таблице компонентов нет отдельной интеграции complaint release; описанное
исключение прямо позволяет удержать слот после этого quarantine.

Воспроизводимый сценарий проекта:30 unexpired active; подтверждённая complaint
карантинит один mailbox; другой tenant явно activates31-й. По архитектурному
исключению count остаётся30 и ответ waiting_capacity до120s; по AC003 слот уже
свободен в момент commit, поэтому новый mailbox должен получить active.
Существующая state/consent защита запрещает отправку; замечание относится к
обязательному атомарному освобождению, не утверждает обход безопасности SMTP.

Минимальная коррекция: убрать исключение для mailbox quarantine; release helper
вызвать из общего cancelMailbox либо complaintClient в уже открытой
eligibilityTransaction, без вложенной транзакции и без смены lock-first порядка.
Согласовать 02/03/04/05 роли с этим путём и назначить SC-F07-Q реальному PG тесту.
Исключение для отзыва одного consent scope может остаться: такой revoke сам по
себе не является mailbox quarantine и не даёт полномочий на отправку.
Спецификация и продуктовый код этим валидатором не исправлялись.

## INVEST и SMART с источниками

| INVEST | Баллы | Основание |
|---|---:|---|
| Independent | 0/8 | US-201 опирается на готовые F02/F05 и существующий final fence; самостоятельный deployment невозможен без согласованного drain |
| Negotiable | 8/8 | TTL120 — явно инженерное решение; UX и организация helpers допускают выбор при сохранении AC |
| Valuable | 10/10 | US-201: произвольное число connected, явная ограниченная active capacity и видимое ожидание |
| Estimable | 8/8 | 03_architecture Component Breakdown перечисляет конкретные модули; concurrency/schema/UI проверки назначены в 05_completion |
| Small | 8/8 | Один bounded slice F07; transport/live/AI и автоматическая fairness выделены F08–F15 |
| Testable | 8/8 | AC001: «Then201 masked configured record»; AC002: «ровно30 active unexpired»; все AC процитированы ниже |

| SMART | Баллы | Основание |
|---|---:|---|
| Specific | 6/6 | Конкретные состояния, коды API, tenant и lock-first контракты; конфликт F07-VAL-001 выделен отдельно |
| Measurable | 8/8 | 101-й connected, global30, lease120s, transport0, page25/max100, campaign3/10 |
| Achievable | 6/6 | Используется PostgreSQL transaction/advisory lock, существующие auth/AEAD/TEST adapters |
| Relevant | 5/5 | Все восемь AC поддерживают US-201 и expanded AC001/009 |
| Time-bound | 5/5 | AC003 expiry120s и equality, AC005 момент final commit/UTC day, AC008 TEST30days |

Quality: Traceability10/10 — таблица «Criterion scenarios» выше покрывает8/8 AC.
Completeness10/10 — в 01_specification.md присутствуют happy/error/edge критерии:
AC001 «нет plan_limit_reached ... автоматического consent, lease, job или SMTP»;
AC002 «Сбой транзакции не оставляет частичного admission»;
AC003 «expires_at==now уже непригоден» и «stale renew не оживляет ящик»;
AC004 «у sender либо pool recipient ... transport calls0»;
AC005 «DB errors fail closed» и «Время берётся после ожидания lock»;
AC006 «Malformed limit/cursor400, foreign/missing cursor404»;
AC007 «Campaign mailbox chooser листает все страницы» и «игнорирует поздние ответы»;
AC008 «нет автоматически выданных lease» и «single entitlement grant».
Источники цитат: 01_specification.md, соответствующие AC-f07-connected-capacity-001..008.
Это баллы наличия проверяемых требований; архитектурное противоречие ими не скрыто.

Security +5: сохранены auth/Origin/tenant/AEAD/allowlist, no-send-on-save,
fail-closed и отдельные consent. Дополнительные обязательные сценарии ниже.
Growth +5: docs/product-discovery-brief.md § Growth Requirements Seed содержит
FR-GROWTH-001..004; все четыре точных ID присутствуют в docs/Specification.md.
F07 не меняет этот scope; перенос требований проверен чтением, не acceptance реализации.

## BDD — конкретные проверки

SC-US-201-1: Given free/TEST100 records; When create101, expiry/revoke и PUT;
Then201, identity PUT сохраняется, consent/lease/job/SMTP не создаются.
SC-US-201-2: Given29 active у трёх tenant; When два activate под real PG barrier;
Then ровно30, один waiting; duplicate не добавляет слот, rollback не оставляет запись.
SC-US-201-3: Given unexpired lease; When renew после ожидания lock, expiry==now,
read, deactivate и stale renew; Then120s от БД, equality blocked, read не renew,
renew expired409; PUT требует нового verify-test и явного activate.
SC-US-201-4: Given остальные send guards выполнены; When lease missing/expired
поочерёдно у sender и recipient на tick/claim/final; Then0 adapter calls;
при валидных leases local TEST проходит, consent revoke всё равно блокирует.
SC-US-201-5: Given claimed job; When stop либо expiry выигрывает final lock;
Then0 submit; обратный порядок сохраняет только существующий in-flight предел;
при переходе UTC суток применяются текущие quota10/30/lower-provider.
SC-US-201-6: Given101 own и foreign records; When обход страниц25/100;
Then весь fixed dataset достижим без foreign; malformed400, чужой anchor404.
SC-US-201-7: Given page5 и capacity30; When activate/retry/deactivate клавиатурой;
Then waiting/expiry/local TEST и ошибки честны, chooser видит поздние страницы,
overview использует total, смена session очищает данные и поздние responses.
SC-US-201-8: Given schema11 и existing records; When migrate дважды и TEST billing;
Then schema12, no auto leases, AEAD/history/consents целы, campaign3/10 и
100 minor RUB/30days/canonical payment/single grant/expiry/revoke сохранены.

SC-F07-Q: Given30 unexpired active и waiting tenant; When complaint commits
mailbox quarantine, затем waiting tenant retries; Then slot сразу active,
quarantined lease удалён в той же transaction, stale renew409, transport0.
SC-F07-AUTH: Given absent/revoked session или wrong Origin; When capacity POST;
Then401/403 соответственно, lease/job/consent неизменны, DNS/SMTP0.
SC-F07-INPUT: Given own session; When SQL-like cursor, fractional/negative limit
или extra action keys; Then400 без SQL side effects; сохранённый HTML-like label
отображается текстом, DOM script execution0. Existing byte cap остаётся обязательным.
SC-F07-TENANT: Given tenant A и mailbox/cursor B; When read/update/capacity/page;
Then404, ciphertext не раскрыт, DNS и мутации0, own paging остаётся доступным.
SC-F07-RATE: Given31 create/capacity requests с одного trusted IP в минуту,
включая invalid body; When превышен существующий30/min bucket; Then429 до
body validation; старые login/register/KDF regression tests сохраняются.
Новых auth endpoints нет; brute-force regression относится к существующему auth.

## Сверка реализации как основания плана

freshMailbox/poolEligible используются в src/dispatch/store.ts, submission.ts
и src/pool/store.ts для sender и recipient: усиление общего predicate соответствует
AC004. Claim и pool tick сейчас принимают now до lock; план требует переноса
времени после lock, включая equality/UTC. Submit уже получает now внутри transaction.
Lease остаётся дополнительным guard, без implicit acquisition на enqueue/claim.
120s — срок admission;45s job claim и120s retry horizon остаются отдельными понятиями.

MailboxStore.list сейчас возвращает unbounded array. Три UI потребителя
src/web/{mailboxes,campaigns,app}.ts и SessionClient.data-only проверены: page
object внутри data и обновление всех consumers назначены явно. Paging не обещает
snapshot при одновременных добавлениях. Migration list и ready() сейчас требуют11;
план правильно назначает additive12 и no backfill, old binaries требуют drain.

tests/billing-unit.test.ts:8 и billing-integration.test.ts:89–99 действительно
проверяют старые mailbox3/10: их supersession по OWN-N7-005 обоснован. Campaign
concurrency test:101–109, TEST100 minor RUB/30days, payment canonical checks,
single grant и expiry/revoke остаются обязательными. Verified-only fixtures
нужно дополнить явным capacity; нельзя разрешить missing lease для local TEST.

## Проверки и границы результата

Selected exact-byte F07 staging: installed check-pipeline-gaps.sh с --traceability,
--report-revision и --criterion-scenarios; фактический результат записан ниже.
Role maps взяты из этого дерева: .claude/commands/feature.md и
.claude/skills/sparc-prd-mini/SKILL.md. Full-project gate остаётся отдельным
обязательным шагом координатора после legacy repair; selected PASS его не заменяет.
Runtime/build/E2E: not_applicable — docs-only VALIDATE. Все тестовые сценарии
выше являются назначением будущей реализации, не утверждением выполненных тестов.
Профиль политики: compact-quality-first-v2; проектные роли Astra high/Sol6.1 high.
Фактическая модель/effort/tokens/cost: null, метаданные хоста не предоставлены.
Терминальная квитанция: /tmp/n7-f07-validate-a1-receipt.md; общая telemetry
принадлежит координатору. Следующий шаг: ограниченная коррекция F07-VAL-001,
повторная source-bound VALIDATE изменённых ролей, затем разрешённый IMPLEMENT.

Фактически выполнено: selected traceability PASS (8 requirements/8 claims),
report-revision PASS (exact SHA256), criterion-scenarios PASS (8/8); общий exit0.
Журнал: /tmp/n7-f07-validate-a1-selected.log. Содержательные замечания этим
структурным PASS не снимаются; окончательный вердикт остаётся NEEDS WORK.
