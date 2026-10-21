# N7: минимальный реальный email/payment выпуск — план, 2026-10-07

Статус: read-only feasibility, **не тестировалось live**, не реализация и не разрешение выпуска. Исходники: `.claude/worktrees/n7-replicate/projects/07-cold-email-warmup`, наблюдаемый HEAD `a089640231bdbd62e369385b04e073eafd2d7ed5`. Принятые email-основания: F09 `e043bb27`, F10 `db50798a` по `docs/Completion.md`. Механический ROUTE для `src/billing/service.ts` и `provider.ts`: exit1, XL; деньги требуют полного PLAN→VALIDATE→IMPLEMENT→независимый REVIEW и checkpoint плана у владельца. Применены prepare/handoff инструкции `.claude/skills/project-work-companion/SKILL.md`; E2E preflight `not_applicable`, потому что это только чтение и план. Requested model HIGH; actual host model/usage/cost: null, host evidence не предоставлен. Прогноз длительности: insufficient_data, ETA не установлен.

## Почему публичный кабинет ещё не выполняет бизнес-путь

Публичный URL `https://n7.194.85.249.105.sslip.io/signin` запускает прежний F08 image `sha256:3791cac50f5b6c2c87dd5cd3975f8141a1dd846b405361ca7456623121ec0b37`; git revision image неизвестен. Принятые F09/F10 этим deployment не подтверждаются. По передаче координатора режимы local_test, poll worker/fixtures отсутствуют: это факт текущей передачи, не самостоятельная runtime-проверка этого агента.

F09/F10 уже содержат native SMTP, read-only UID IMAP и durable worker. `src/config.ts` поддерживает dispatch/poll `live_provider`; текст старого deployment-checkpoint «live-адаптера нет» относится к исходному MVP и для почты устарел. Но authority, worker и новый source-bound image должны пройти отдельный реальный release gate.

Биллинг существенно отличается: `BillingService.mode`, `requireAvailable()` и config допускают только disabled/local_test; checkout использует TEST100коп./30дней и внутренний API URL, `reconcile()` блокирует `local_provider_payment`, а `currentEntitlement()` JOIN этой же таблицы. **Вставить YooKassa Provider недостаточно**: нужна отдельная verified-provider модель, миграция и транзакционная выдача тарифа. TEST-платежи не конвертируются в реальные оплаты.

## Один минимальный клиентский путь

1. Клиент регистрируется и входит; добавляет свой поддерживаемый Gmail/Yandex ящик, проверяет SMTP/IMAP. Сохранение не отправляет письма. Отдельно подтверждает согласие цепочки и разрешённый получатель; pool-consent требуется только если включается peer warmup.
2. Создаёт одну цепочку с первым письмом и одним последующим шагом. После explicit activation и operator transport authority worker отправляет первое письмо реальному контролируемому получателю. Кабинет показывает «SMTP accepted» с Message-ID; подтверждение inbox хранится отдельно. Получатель отвечает обычным почтовым клиентом; IMAP ingest останавливает enrollment до следующего шага. Без добровольного peer pool честно показывает waiting.
3. Выбирает один утверждённый платный тариф и цену; checkout перенаправляет на реальную страницу выбранного провайдера. Возврат в кабинет показывает pending до независимой server-side проверки. Только подтверждённый succeeded/paid с точной привязкой intent/tenant/amount/currency/shop/live-mode выдаёт один тариф с фиксированным expiresAt. Клиент видит оплаченный тариф и дату окончания.

Это законченный узкий бизнес-demo email→ответ→stop и checkout→verified grant. Это не полная приёмка expanded MVP: F11–F14, AI replies, inbound-content processing/retention и 30-box/7-day reputation goal остаются отдельными AC. Для промежуточного выпуска AI откладывается; он остаётся обязательным в полном expanded MVP; непринятый F11 нельзя включать в release и нельзя ослаблять его ≤30s fault witness (из передачи: фактические32.5–45s).

## Минимальная область реализации и reuse

Email: сохранять принятую реализацию `src/dispatch/{smtp,worker,submission}.ts`, `src/replies/{imap,worker}.ts`, `src/runtime/worker.ts`, `src/mailboxes/transport-authority.ts`, config и Compose. Не менять transport library без подтверждённого дефекта. Собрать release с принятыми F09/F10 и требуемыми исправлениями; отдельно развернуть работающий worker, выделить mailbox/recipient authority и ограниченный opt-in запуск. Не выпускать HEAD только потому, что он новее принятого source.

Payment: точные существующие точки изменения `src/billing/{provider,service,plans,transaction}.ts`, `src/config.ts`, `src/server.ts`, `src/web/app.ts`, `db/` forward migrations и focused tests. Добавить явный live billing config, настоящие confirmation/return URL и verified canonical provider snapshot/event store отдельно от local_provider_payment. Нужны immutable intent/provider binding, unique provider payment/event/grant constraints, последовательная reconciliation под блокировкой, deny stale/duplicate/canceled transitions, выдача и revoke entitlement без TEST JOIN; внешний HTTP всегда вне DB-транзакции. Не изображать remote provider состояние локально атомарным: durable verified observations и state-ordering проверяются гонками и повторной reconciliation.

Если владелец выбирает ЮKassa: адаптировать, а не переписывать, `projects/03-affiliate-rewardful/shared/payments/yookassa.mjs` (bounded HTTP, decimal money, shop/test checks, create/get/verify) и TypeScript `projects/06-rag-sales-chatbase/apps/web/src/server/payments/{provider,yookassa}.ts`; patterns checkout/webhook/idempotency из `billing-handler.ts`. Донорам присвоен partial/adapt: несовместимые account/plan/schema/framework поля не копировать. N6 handler показывает bound-payment reuse, canonical GET проверки уведомления и durable apply/refund; подключать его целиком в native N7 нельзя. Провайдер пока не выбран; ЮKassa здесь кандидат, не установленный факт доступности. Актуальные внешние правила провайдера сверить по его официальной документации на реализации; в этой ограниченной стадии сеть не проверялась.

## Измеримые обязательные AC

| Проверка | Условие принятия и квитанция |
|---|---|
| SMTP | один opt-in получатель; final SMTP250 после DATA + сохранённый Message-ID/recipient/job/source/image/UTC; timeout после DATA означает unknown и **не blind retry** |
| Inbox | отдельное подтверждение реального получателя: тот же Message-ID, inbox/spam placement и UTC; SMTP250 не выдаётся за доставку или inbox placement |
| Reply stop | обычный reply с In-Reply-To/References; IMAP UID/UIDVALIDITY и ingestion receipt, остановленный enrollment; после stop commit ни один новый submitting для enrollment; in-flight boundary раскрыт, уже начатую передачу не обещать отменить |
| Реальный checkout | HTTPS confirmation URL выбранного live provider; browser journey успешный; тестовый provider payment rejected in live; возврат сам не выдаёт тариф |
| Verified grant | canonical remote GET подтверждает succeeded/paid, shop, intent/tenant, сумму/валюту, live flag и paidAt; 1grant/intent; повтор checkout/webhook/reconcile, включая concurrent duplicates, не создаёт второй платёж/грант и не продлевает expiry |
| Failed/canceled/unknown | declined/canceled дают0grants; outage/timeouts остаются pending/unknown и0grants; forged/mismatched webhook не выдаёт тариф; reversal/refund корректно отзывает entitlement; запоздалый успех не отменяет известный terminal revoke |
| Regression/release | existing stop/consent/quota/tenant/secret guards сохраняются, mutation/concurrency negatives способны упасть; все обязательные локальные наборы/type/lint/build, независимое review и source/build/image receipts; live browser не считается выполненным без preflight |

До pilot зафиксировать максимальный измеряемый reply-detection интервал и фактический worker cadence; значение сейчас неизвестно. Проверить stop после commit и отсутствие следующего письма в течение как минимум полного запланированного follow-up окна, не объявлять секундный SLA по одному письму.

## Deployment gates, сохранение данных и реальные blockers

До rollout: source-bound accepted image; capacity для build/backup (по координатору свободно2.1GiB, install/rebuild сейчас запрещены); separate allowed release/pilot/payment permissions; port-conflict check; TLS/proxy/origin/cookie/API webhook routing и доверенный источник client IP; private DB без host ports; работающий worker/health/typed errors. Никакие чужие containers/volumes не удалять ради места.

До migration: `pg_dump` существующей source DB и защищённый encrypted/off-host backup; отдельное сохранение существующего AEAD keyring, HMAC/hash/session ключей и DB password без вывода значений. Fresh production keys допустимы только для новой пустой БД, не вместо ключей существующих ciphertext. Restore в отдельную disposable DB; сравнить schema/counts/constraints и расшифровку canary. Source DB/volume не перезаписывать. Восстановление проверяется до переключения; текущих production restore receipts нет. Down migration нет: compatible old image rollback либо restore в отдельную БД после disable modes; source DB сохраняется. RPO/RTO неизвестны.

Подтверждённые gaps: old F08 deployment, отсутствующий accepted F10 worker в public runtime по передаче, только TEST billing, unaccepted F11, storage/build ограничение, невыполненные backup/restore/live witnesses. Непроверенные входы, **не доказанные отсутствия**: выбранный provider/live merchant activation, разрешённая доступность shop credentials, контролируемые send/reply mailboxes и consent, разрешённая сеть providerSMTP/IMAP/API, конкретная live цена, разрешение реальные транзакции. Секреты и merchant/dashboard доступ не читались. Push в проектную ветку подтверждён для текущего HEAD; возможность создания нового PR здесь не проверялась.

## Самый маленький следующий шаг

Координатор фиксирует этот narrow scope и выбранный payment provider в существующем N7 run/work-record, получает только требуемый XL checkpoint для конкретного плана, затем поручает **один bounded local coding slice**: provider-independent canonical payment snapshot + immutable intent binding + single-grant migration/reconcile/entitlement tests, без network/secret/deploy/mail/charge. Срез сохраняет local_test регрессии; completion означает конкретные DB invariants и negatives, не live readiness. После независимого review адаптируется выбранный donor и UI checkout, затем выполняются source-bound offline/full gates и разрешённый email/payment pilot. F11/AI работа не является зависимостью этого среза. Владелец/координатор остаётся ответственным за продолжение; этот файл завершает только bounded планирование.
