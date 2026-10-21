# Donor01 — source-bound review для N7

**Вывод: 1/5, функциональный прототип с отдельными пригодными фрагментами, не готовый почтовый runtime.** Переносить целиком нельзя: обнаружены несовместимость workers со схемой/шифрованием, небезопасный retry после SMTP, отсутствие consent-граничения warmup pool и неполная tenant-изоляция. N7 TS/Postgres и принятые consent/quota/stop guards остаются основой.

Ревизия: `fdf565827880813c97535c9aa68ea7fa08ee4339`, репозиторий [donor01][repo]. Проверка 2026-10-06, завершение около08:40 UTC. Прочитан CLAUDE.md; AGENTS.md в checkout не найден. Код уже находился в sparse checkout; дополнительные fetch/install/build/test/Docker/mail/provider вызовы не выполнялись. Все выводы ниже — статический анализ source, не результат работающего сервиса. Sandbox bootstrap был неисправен; использовался одобренный read-only exec вне sandbox. Единственная запись — этот отчёт. Promo production остаётся PAUSED.

## Единая шкала и оценки

0 — реализации/проверяемых артефактов нет; 1 — каркас или критические разрывы; 2 — частичная реализация; 3 — связный интегрированный контур; 4 — подтверждённые негативные/runtime проверки; 5 — зрелая эксплуатация с доказательствами. Общая оценка ограничена критическими разрывами и не является арифметическим средним.

| Ось | 0–5 | Основание |
|---|---:|---|
| Architecture | 2 | Nest feature modules, Prisma и BullMQ; `src/app.module.ts:31–51`, `src/queues/queue.module.ts:14–46`. Дублирующие SMTP/IMAP service и worker implementations расходятся. |
| Functions | 2 | Account/campaign/sequence/CSV CRUD реализован; `sequences.service.ts:13–34` имеет ownership check и transaction. Сквозная доставка нарушена схемой; scheduler/warmup consumers неполны. |
| Mail safety | 1 | Есть time-window/daily-limit намерения, reply/bounce detection; нет send-time consent/stop/quota CAS, unknown_delivery и надёжной отмены queued jobs. |
| Security / tenant / credentials | 1 | JWT, bcrypt12, DTO whitelist, AES-GCM присутствуют. Tenant join hole, TLS validation off, OAuth state/token handling и worker CBC несовместимы с безопасной поставкой. |
| Tests | 0 | Полный Git tree322paths: **0 executable test/spec files, 0 Jest config**, нет test/e2e файла, на который ссылается package script. `docs/test-scenarios.md` — сценарии, не тесты. |
| Ops | 1 | Docker/Compose/migrations есть; lockfiles и CI workflows отсутствуют, worker entrypoints и healthcheck расходятся с source. |
| UI | 2 | Next/React компоненты, campaign fetch/actions; accounts/unibox/analytics частично mock/static. Browser/render/a11y/mobile QA не выполнены. |

## Находки, блокирующие перенос почтового контура

**1. Workers не соответствуют фактической модели данных — P1 интеграции.** Prisma определяет `smtp_username`, `warmup_status`, `sent_today`, `campaign_accounts`, `sent_count` ([schema:141–196][schema]). Send worker читает `smtpUsername` и обновляет `sentToday` ([send:39–45,76–90][send]); scheduler использует `campaign.sendingAccounts`, `warmupStatus`, `campaignId`, `currentStep` ([schedule:75–95,130–168][schedule]). Непосредственных Prisma aliases для этих полей нет. Это source-level несовместимость; build фактически не запускался, поэтому не называем её наблюдённым build failure.

**2. Два несовместимых crypto contracts — P1.** Account creation шифрует через общий EncryptionService ([accounts:25–42][accounts]): AES-256-GCM, scrypt-derived key, строка `iv:authTag:ciphertext` ([crypto:10–38][crypto]). Реально зарегистрированный send worker самостоятельно расшифровывает как AES-256-CBC с raw hex key и двумя компонентами ([send:110–118][send]); IMAP worker повторяет другой decrypt. Исправления snake_case недостаточно: credentials нового account не совместимы с worker. Не переносить crypto/key storage; сохранить N7 secret handling. У общего GCM helper нет envelope version/key ID/tenant AAD/rotation — заимствование возможно только после отдельного проектирования и тестов, выгода сомнительна.

**3. SMTP retry допускает дубли и ложные bounce — P1.** Worker отправляет SMTP, затем отдельно обновляет message/account ([send:65–92][send]); любое исключение после фактического accepted send приводит к повтору, максимум попыток переводит сообщение в bounced ([send:95–106][send]). Scheduler устанавливает3attempts ([schedule:143–158][schedule]). Нет стабильного operation key/claim CAS/unknown_delivery reconciliation и проверки уже-sent перед повтором. DB error послеaccepted SMTP — конкретный сценарий дублирования. Это вывод по control flow, не выполненная отправка.

**4. Pause/reply/quota не защищают последнюю границу отправки — P1.** Campaign pause меняет только DBstatus ([campaigns:123–132][campaigns]); send worker не читает campaign/lead consent, pause, quota/stop state. IMAP service «отменяет» queued messages статусом bounced ([imap:171–175][imap]), а worker не проверяет этот статус и BullMQ jobs не удаляются. Unibox reply напрямую вызывает EmailService, минуя очередь/общие лимиты ([unibox:36–51][unibox]). Scheduler читает sentToday, резервирования квоты до enqueue нет; DBcreate→queue.add→lead.update не атомарны ([schedule:106–168][schedule]). Повтор scheduler после частичной ошибки может задублировать работу; step advance идёт до подтверждения доставки, nextSendAt=null, delay_days не применяется. Нельзя заменять этим принятый N7 send-CAS/stop/consent/quota контур.

**5. Warmup pool не ограничен tenant и явным consent — P1.** Выбор peers — все connected аккаунты с warmup-status, кроме собственного; нет user/workspace/pool-opt-in фильтра ([warmup:44–52][warmup]). Ставятся send/reply/mark_not_spam jobs от peer account ([warmup:63–143][warmup]). Кроме того, WARMUP_SEND очередь зарегистрирована, но consumer для неё среди пяти tracked workers/QueueModule providers отсутствует ([queues:30–46][queues]). Весь warmup policy/runtime отвергнуть как reuse; не считать «ready» consent.

**6. Tenant joins частично проверяются — P1.** Campaign create сверяет принадлежность accounts ([campaigns:35–43][campaigns]); CSV import сверяет ownership campaign ([leads:67–74][leads]) — полезные локальные проверки. Однако одиночный createLead принимает произвольный campaign_id и записывает рядом текущий user_id без ownership check ([leads:51–64][leads]); DTO проверяет лишь UUID, schema FK campaign_id не связывает tenant. Учитывая выбор scheduler по campaign_id, это опасная межтенантная связь, если остальной runtime исправить. Workspace stats собирает все campaigns/leads всех участников по user_id, без workspace predicate (`src/workspaces/workspaces.service.ts:43–70`): membership не равен принадлежности всех данных workspace.

**7. IMAP — только сырьё для переработки.** Оба клиента отключают проверку сертификата ([imap:178–186][imap]; `workers/imap-check.processor.ts:235–245`). Основной service каждый раз сканирует24h UNSEEN с markSeen=false, не хранит UID/UIDVALIDITY/dedup checkpoint; обработка увеличивает reply counters и создаёт unibox rows повторно ([imap:41–50,112–139,194–219][imap]). `setTimeout(500)` не ждёт все async parsers, ошибки parse подавляются. Полезны только идеи message-ID correlation и классификации; нужны fake IMAP fixtures, bounded MIME parsing, TLS validation, durable checkpoint/idempotency.

## Остальная безопасность и достоверность UI/ops

- **Credentials/API:** Account list возвращает полную account запись с ciphertext полями ([accounts:18–22][accounts]); campaign включает account:true ([campaigns:19–24][campaigns]). Это не открытый пароль, но лишняя экспозиция encrypted credentials. SMTP host — произвольная строка/port1–65535; verifySMTP создаёт исходящее соединение без видимого private-address/egress ограничения (`accounts/dto/index.ts:11–31`, [accounts:121–129][accounts]). Требует защиты SSRF/egress, а не только DTO.
- **Diagnostics:** testConnection возвращает `{smtp:'ok', imap:'ok'}` после одного SMTP verify, IMAP connect здесь не вызывается ([accounts:49–69][accounts]). Нельзя переносить UI-label как реальную проверку двух протоколов.
- **OAuth:** AmoCRM state=userId без nonce; callback принимает code/domain без state validation ([oauth:26–58][oauth], `amocrm.controller.ts:30–42`). Tokens сохраняются plaintext и controller возвращает результат upsert с ними ([oauth:67–85][oauth]). Нужны nonce/session binding, domain allowlist, token encryption/redaction и refresh concurrency. Это не готовый OAuth adapter.
- **Payments/webhooks:** в tracked src/schema не найден платёжный webhook/проверка signature/replay; наличие Plan enum не означает billing integration. Ничего отсюда не переносить в N7 payment/hold semantics.
- **HTTP/auth:** `src/main.ts:11–14` разрешает отражённый CORS origin с credentials; rate-limit middleware в source не найден. Access/refresh используют одинаковые payload/secret без type distinction (`auth.service.ts:64–86`), JWT strategy принимает их по подписи/exp (`auth/strategies/jwt.strategy.ts:15–28`). При переносе сохранить N7 существующий auth, не донорский.
- **UI:** accounts — `mockAccounts` ([UI accounts:19–66][uiaccounts]); unibox — `MOCK_MESSAGES` (`frontend/src/app/unibox/page.tsx:8–16`); analytics KPI/chart — constants ([UI analytics:7–21][uianalytics]). Campaign list делает настоящие fetch/actions (`frontend/src/app/campaigns/page.tsx:30–97`). Это смешанный прототип, не доказанный live dashboard.
- **Ops:** Dockerfile требует npm ci, но tracked package-lock/yarn/pnpm lock отсутствуют ([Dockerfile:4–14][dockerfile]). Compose workers указывают dist/workers/email.js,warmup.js,imap.js,ai.js, тогда как в src только *.processor.ts без таких entrypoints ([Compose:38–81][compose]). Healthcheck идёт /api/health, source prefix api/v1 + healthController дают /api/v1/health (`main.ts:24`, `app.module.ts:23–27`). PG/Redis ports публикуются без loopback bind ([Compose:88–111][compose]); hardened production deployment не подтверждён.

## Reuse-карта для N7

Сложность — порядковая шкала1(низкая)–5(очень высокая), **не ETA**. До копирования требуется право использования.

| Кандидат | Что пригодно | Что обязательно сохранить/доделать в N7 | Сложность |
|---|---|---|---:|
| CSV mapping/dedup | `csv-import.service.ts:27–62,79–135`: EN/RU aliases, BOM, статистика | Чистую функцию вынести отдельно; tenant join, bounded row/memory, DB unique/case normalization, реальные insert counts, негативные тесты. Email lowercased лишь дляdedup, stored value остаётся original. | 2 |
| Campaign/sequence forms & CRUD shape | `campaigns.service.ts:35–43`, `sequences.service.ts:13–34,52–80` | N7 auth/tenant transactions, dry-run preview, consent/quota/start-stop invariants; не переносить scheduler. | 3 |
| SMTP transport helper | `email.service.ts:85–125`: Nodemailer config/accepted result | Тонкий adapter внутри N7 delivery state machine; TLS/timeout/egress/secret redaction; unknown_delivery обязательна. Существующий worker не reuse. | 4 |
| IMAP parsing/classification | `email/imap.service.ts:64–168` как reference | Почти переписать lifecycle/checkpoint/dedup/TLS; bounded parsed fixtures; N7 stop semantics. | 4 |
| BullMQ declarations | `queues/queue.constants.ts`, QueueModule | Только naming/reference; adoption Redis/BullMQ добавляет другой infra/state boundary. Не заменять N7 Postgres queue ради наличия зависимости. | 4 |
| Diagnostics UI | Account form/test affordance, status components | Отдельные доказанные SMTP/IMAP outcomes, no fake green, egress guard. | 2–3 |
| UI primitives | DataTable/EmptyState/StatusBadge/sidebars | Адаптировать к существующему N7 UX; реальные данные, mobile/a11y/browser tests. | 2 |
| Warmup policy, crypto, OAuth, payments | Готового безопасного модуля нет | Не переносить; N7 принятые protections неизменны. | 5 |

## Claims, tests, license, проверено

CLAUDE обещает AES-GCM/rate limits/compliance и перечисляет SMTP/IMAP/BullMQ; GCM есть только в одном service, worker его не использует, compliance service — текстовая эвристика (`src/compliance/compliance.service.ts:45–69`), не доказательство согласия или юридического соответствия. README само относит tests/CI/SSL/monitoring к будущей v1.1 ([README:54–59][readme]). Сценарии docs и package test scripts не являются выполненными тестами.

**Лицензия:** README:62–64 явно **Private / Proprietary**; LICENSE/COPYING файла в полном tracked tree нет. Публичная доступность GitHub не даёт разрешения копировать. До code reuse владелец должен подтвердить права/разрешение; сравнительный анализ не снимает этот блокер.

Фактически проверено: pinned HEAD,322trackedpaths, наличие/содержание перечисленного кода, schema/control-flow соответствие, отсутствие tracked executable tests/lockfiles/CI/license. Donor checkout не изменён. Не проверено: build/typecheck, миграции, живые SMTP/IMAP, runtime/browser, security exploit, load/ops. Новые исполнители не запускались. Native actual model/usage/cost неизвестны; не реконструированы. Следующий оправданный шаг после разрешения reuse — один узкий CSV/UI port в N7 с существующими guards; для live mail лучше расширять проверенный N7 контур, чем чинить этот донор целиком.

[repo]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/tree/fdf565827880813c97535c9aa68ea7fa08ee4339
[schema]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/prisma/schema.prisma#L141
[send]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/workers/email-send.processor.ts#L32
[schedule]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/workers/email-schedule.processor.ts#L51
[accounts]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/accounts/accounts.service.ts#L18
[crypto]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/common/encryption.service.ts#L10
[campaigns]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/campaigns/campaigns.service.ts#L13
[imap]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/email/imap.service.ts#L22
[unibox]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/unibox/unibox.service.ts#L36
[warmup]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/workers/warmup.processor.ts#L44
[queues]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/queues/queue.module.ts#L30
[leads]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/leads/leads.service.ts#L51
[oauth]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/integrations/amocrm/amocrm.service.ts#L26
[uiaccounts]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/frontend/src/app/accounts/page.tsx#L19
[uianalytics]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/frontend/src/app/analytics/page.tsx#L7
[dockerfile]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/Dockerfile#L4
[compose]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/docker-compose.yml#L38
[readme]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/README.md#L54
