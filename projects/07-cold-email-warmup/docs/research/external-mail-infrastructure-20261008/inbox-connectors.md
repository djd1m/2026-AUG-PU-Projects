# N7: HTTPS inbox connectors — исследование на 2026-10-08

Назначение: заменить сетевую часть OUTBOUND SMTP / INBOUND IMAP worker для множества существующих собственных Gmail, Outlook и Яндекс ящиков. Входное условие владельца: VPS не достигает SMTP 465/587 и IMAP 993, HTTPS 443 работает. Это условие не проверялось заново. Выполнен только поиск и чтение официальных публичных документов; без регистраций, подключений ящиков, писем, платежей, изменений кода или git push.

**Результат:** hosted Nylas/Aurinko и прямые Gmail API/Microsoft Graph технически могут заменить отправку и получение через 443. EmailEngine на том же VPS решает это только с native Gmail API / Graph backend; его generic IMAP/SMTP backend сохраняет исходную блокировку. Для Яндекса нужен внешне размещённый IMAP/SMTP bridge или hosted connector, где к почтовым портам подключается другая инфраструктура. Но unsolicited cold outreach имеет отдельный прямой policy blocker в Gmail API и Nylas; технический PoC не доказывает допустимость такого SaaS.

## 1. Сравнение транспортов

| Вариант | Gmail / Workspace | Outlook / M365 | Произвольный IMAP | Яндекс | Работает при blocked 465/587/993 на нашем VPS |
|---|---|---|---|---|---|
| EmailEngine на нашем VPS, native APIs | Gmail REST API | Microsoft Graph API | Нужны IMAP+SMTP | Native HTTPS mailbox API не подтверждён | Да для Gmail/Graph; нет для IMAP/SMTP |
| EmailEngine на отдельно разрешённом хосте | Gmail API либо IMAP | Graph либо IMAP | Да, при доступе этого хоста к серверу | Вероятно через стандартные протоколы; vendor confirmation отсутствует | Наше приложение ходит к bridge по443; у bridge должны работать почтовые порты |
| Nylas hosted Connect | OAuth Gmail | OAuth Graph / Exchange | Подтверждены IMAP receive + SMTP send | Совместимость через generic IMAP обоснована, но явно не подтверждена | Да архитектурно: наше приложение вызывает api.us.nylas.com / api.eu.nylas.com |
| Aurinko hosted Unified API | Gmail | Office365, Outlook.com, Exchange | IMAP перечислен | Vendor confirmation отсутствует; generic IMAP гипотеза | Да архитектурно: api.aurinko.io |
| Gmail API напрямую | Да | Нет | Нет | Нет | Да |
| Graph напрямую | Нет | Personal Outlook и organization Outlook | Нет | Нет | Да |
| Unipile hosted, дополнительный вариант | Да | Да | Да | Vendor confirmation отсутствует | Есть официально описанный standard443 режим |

EmailEngine — **self-hosted software, не cloud service**, и у производителя нет hosted API endpoint. “Hosted authentication form” в его документации — форма на вашей установке, а не внешняя почтовая инфраструктура. Прямой backend выбирается отдельно от OAuth: OAuth поверх IMAP/SMTP всё равно использует blocked порты. [EmailEngine introduction](https://learn.emailengine.app/docs/getting-started/introduction), [OAuth backends](https://learn.emailengine.app/docs/accounts/oauth2-setup).

Nylas официально мониторит IMAP и отправляет через SMTP; для send SMTP configuration обязательна фактически, хотя в hosted auth она optional по умолчанию (можно требовать smtp_required). Пользовательские host/port задаются при BYO auth. [Nylas IMAP provider guide](https://developer.nylas.com/docs/provider-guides/imap/), [IMAP auth](https://developer.nylas.com/docs/v3/auth/imap/). Aurinko подтверждает Gmail/Office365/Outlook.com/Exchange/Zoho/iCloud/IMAP, REST send и incremental sync. Детальная IMAP connection page была в официальном индексе, но не открылась; поэтому specifics SMTP/auth остаются недостаточно проверенными. [Aurinko Email API](https://docs.aurinko.io/unified-apis/email-api), [официальный индекс](https://docs.aurinko.io/llms.txt).

Яндекс официально разрешает стандартные IMAP/SMTP clients: imap.yandex.com:993 SSL; smtp.yandex.com:465 SSL либо587; включённый доступ почтовых клиентов и app password/OAuth. Это подтверждает **протокол Яндекса**, но не проверенную интеграцию конкретного hosted vendor, региональную доступность и принятие его IP. В официальных найденных документах EmailEngine/Nylas/Aurinko отдельного Yandex compatibility assertion не найдено. [Yandex client setup](https://www.yandex.com/support/yandex-360/customers/mail/en/mail-clients/others).

## 2. Send, ответы, webhooks и stop-on-reply

| Вариант | Отправка и входящие | Что учитывать |
|---|---|---|
| EmailEngine | REST send; webhook messageNew; native APIs / IMAP backend | Очередь, threading, scheduled sends есть в gateway. На IMAP backend bridge обязан иметь egress к IMAP/SMTP |
| Nylas Connect | Messages/send API; message.created webhook на connected accounts | webhook не является бизнес-событием “ответ на нашу кампанию”; нужен matching и durable обработка |
| Aurinko | REST send, sync; /email/messages webhooks; /email/tracking events reply и replyBounce | Есть primitives reply tracking; остановка sequence всё равно отдельная бизнес-операция |
| Gmail API | messages.send с MIME; watch → Cloud Pub/Sub → history.list → message fetch | watch renew минимум каждые7дней, рекомендация ежедневно; уведомление содержит emailAddress/historyId, а не тело письма; возможны пропуски, нужен reconciliation |
| Microsoft Graph | /me/sendMail; message subscriptions + delta | sendMail 202 означает accepted, а не delivered; renewable subscriptions и recovery |

[EmailEngine функции](https://emailengine.app/), [Nylas Email API](https://developer.nylas.com/docs/v3/email/), [Nylas inbound recipe](https://developer.nylas.com/docs/cookbook/use-cases/build/new-email-webhook/), [Aurinko webhooks](https://docs.aurinko.io/unified-apis/webhooks-api.md), [Gmail send](https://developers.google.com/workspace/gmail/api/guides/sending), [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push), [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).

Graph basic message subscription живёт менее7дней (10080мин); rich notification — менее1дня. Mail.Read нужен для notifications; delta messages выполняется по folders. Следует обрабатывать lifecycle events и синхронизировать пропуски, а не считать webhook ровно один раз доставленным. [Outlook notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview), [subscription lifetime](https://learn.microsoft.com/en-us/graph/change-notifications-overview), [delta](https://learn.microsoft.com/en-us/graph/delta-query-messages), [lifecycle](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events).

Архитектурное предложение для N7: transport adapter → durable inbound event → tenant/account lookup → normalize Message-ID/In-Reply-To/References/provider thread → classify human reply/bounce/auto-reply → атомарно mark sequence stopped и invalidate queued follow-ups. Перед фактической отправкой повторно проверить stop/suppression/account health; webhook может прийти одновременно с due-job. Poll/reconciliation сохраняется для recovery. Это рекомендация автора исследования, не обещание SDK или проверка существующего кода.

## 3. Тарифы и масштаб connected accounts

Цены опубликованы на дату исследования; подписки самих Gmail/Workspace/M365/Yandex, VPS/Redis, Pub/Sub, taxes и OAuth assessment сюда не включены.

| Вариант | Публичная коммерческая цена | Пример100 ящиков | Пример1000 |
|---|---|---:|---:|
| EmailEngine | $1450 / €1200 в год; unlimited mailboxes/instances; hosting отдельно | $120.83/мес амортизация | $120.83/мес амортизация |
| Nylas Essentials | $15/мес,10 accounts + $2.25 за следующий | $217.50 | $2242.50 |
| Nylas Pro Monthly | $49/мес,25 accounts + $2/account | $199 | $1999 |
| Nylas Pro Annual | $43/мес,25 accounts + $1.75/account, annual commitment | $174.25 | $1749.25 |
| Aurinko Email/CRM FAQ | $1.50/active account/мес, non-IMAP email, до1GB | $150 | $1500 |
| Aurinko Full Platform FAQ | $2/active account/мес, включаяIMAP, unlimited traffic | $200 | $2000 |
| Gmail/Graph напрямую | Нет отдельного inbox-connector fee; mail licenses/infra остаются | зависит от mail subscriptions и infra | зависит от mail subscriptions и infra |

[EmailEngine pricing](https://emailengine.app/), [Nylas pricing](https://www.nylas.com/pricing/), [Nylas pricing math](https://cli.nylas.com/guides/email-api-pricing-models), [Aurinko billing FAQ](https://docs.aurinko.io/faq/how-does-aurinko-billing-work).

**Aurinko pricing discrepancy:** marketing страница описывает $1 <1GB, $1.5 <5GB, $2 unlimited; свежий billing FAQ описывает $1 только calendar/contacts/tasks, $1.50 non-IMAP email до1GB, $2 включаяIMAP. Для планирования N7 взяты более специфичные FAQ цены; перед покупкой нужна письменная тарифная спецификация. Active определяется >10APIcalls ИЛИ >1MB за месяц; disconnect/delete не убирает уже активный account из месячного billing; duplicate connections одного mailbox дедуплицируются. [Marketing pricing](https://www.aurinko.io/pricing/), [billing FAQ](https://docs.aurinko.io/faq/how-does-aurinko-billing-work).

Nylas free имеет5connected accounts. **Nylas Agent Accounts** — новые Nylas-hosted inboxes с отдельными allowances; их цены не следует подставлять вместо Connect для существующих Gmail/Яндекс. Pro Annual Accelerator/Shared Google App имеет условия доступа и возможную отдельную цену add-on, которую найденные документы численно не раскрывают. [Nylas pricing](https://www.nylas.com/pricing/), [Google guide](https://developer.nylas.com/docs/provider-guides/google/).

## 4. OAuth и security review

Для полного send+reply sync Gmail минимальная практическая комбинация обычно gmail.send + gmail.readonly; при изменении labels/state нужен gmail.modify. gmail.send — sensitive; gmail.readonly, gmail.metadata и gmail.modify — restricted. Даже чтение headers через metadata не убирает restricted verification. Для public SaaS restricted server-side processing требует OAuth verification и security assessment, кроме применимых исключений. Только send scope не даёт stop-on-reply. Internal-only Workspace app имеет исключение для собственной организации, но это не эквивалент multi-tenant SaaS или набора личных gmail.com accounts. [Google scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [restricted verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [Workspace policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

EmailEngine не снимает ответственность за собственный Google OAuth app; API preset использует gmail.modify, есть narrower scope sets. Aurinko **не предоставляет shared verified Google OAuth app**, customer owns credentials/verification. [EmailEngine OAuth](https://learn.emailengine.app/docs/accounts/oauth2-setup), [Aurinko shared-app FAQ](https://docs.aurinko.io/faq/does-aurinko-provide-a-shared-verified-google-oauth-application), [Aurinko Google setup](https://docs.aurinko.io/authentication/google-oauth-setup).

Nylas предлагает собственный verified Google Shared App, прошедший Tier3 CASA, на Pro Annual Accelerator и Enterprise add-on; consent screen показывает Nylas. Это снимает аудит **этого provider OAuth app**, не разрешает запрещённый use case и не заменяет наши privacy/data controls. Перенос с собственного OAuth client требует re-auth и обновления grant IDs. [Nylas shared app](https://developer.nylas.com/docs/provider-guides/google/shared-gcp-app/).

Graph send+read: delegated Mail.Send + Mail.Read и offline_access; если создавать/редактировать drafts или state — Mail.ReadWrite. Mail.Send отдельно разрешает Sent Items copy. Application Mail.* permissions требуют admin consent и потенциально охватывают все mailboxes, поэтому их надо ограничивать применимым mailbox access control. SaaS needs multitenant registration; personal Outlook support выбирается в account types. Verified publisher бесплатен, но требует CPP/PartnerID и организационные prerequisites; tenant consent policies могут блокировать unverified apps. Не найдено обязательного платного Google CASA-эквивалента для обычного Graph mail доступа. [Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference), [publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview), [Graph mailbox support](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview?view=graph-rest-1.0), [Graph cost categories](https://learn.microsoft.com/en-gb/graph/metered-api-overview).

## 5. Quotas: connector не повышает provider allowance

Новые Gmail Cloud projects с1мая2026:1.2M quota units/project/min и6000/user/project/min; messages.send стоит100units. Daily threshold80M/project: standard usage пока без доплаты; overage billing планируется later2026, численные rates pending и обещано90дней notice. Старые активные проекты могут сохранять прежние quota settings. API quota отличается от daily sender mailbox limits. [Google quota, updated2026-09-10](https://developers.google.com/workspace/gmail/api/reference/quota).

Workspace публикует лимиты2000messages/day для обычных paid accounts и500 для trials, а также recipient limits; это не гарантированный “safe outreach volume”. После превышения отправка может быть приостановлена. [Workspace sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace).

Nylas имеет свои limits и provider throttling: JSON send до200requests/grant/sec не означает200доставленных emails/sec. Provider429 возвращается приложению, send/read автоматически не повторяются; honour Retry-After или backoff. [Nylas limits, updated2026-10-06](https://developer.nylas.com/docs/dev-guide/platform/rate-limits/).

Exchange Online:30messages/min/mailbox и10000recipients/24h; есть tenant/external-recipient и admin spam-policy ограничения. Массовую почту Microsoft рекомендует отправлять специализированным сервисом; умножение mailbox count не делает tenant allowance безграничным. [Microsoft outbound limits](https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-sending-limits-troubleshoot), [Exchange limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits).

Яндекс:SMTP message до300recipients, антиспам может снижать allowance при похожих templates/advertising/commercial offers; limits нельзя обходить. Не фиксировать выдуманный универсальный daily-safe number дляЯндекса. [Yandex mass sending](https://yandex.com/support/yandex-360/business/mail/en/web/letter/create/send-many-letters).

## 6. Cold outreach / warmup policy gates

- **Gmail API:** запрещены приложения, рассылающие spam или unsolicited commercial mail; пример допустимого bulk CRM — адресат согласился получать email. Отдельно запрещён multiple-account обход limitations/filters/safety restrictions. Это прямое ограничение на исходный unsolicited N7 use case, а не только deliverability рекомендация. [Google Workspace developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).
- **Nylas:** default Terms §9 прямо запрещает unsolicited/unauthorized advertising, promotional email и solicitation. Signed order terms могут supersede default TOU, но никакое такое соглашение в исследовании не проверялось. Для unsolicited cold outreach публичные условия не дают go-ahead. [Nylas Terms](https://www.nylas.com/legal/terms/).
- **Aurinko:** в просмотренном Terms нет найденной явной фразы cold outreach/unsolicited; это **unknown**, не approval. Third-party rules обязательны; данные inbox нельзя использовать/передавать для advertising purposes. Нужно отдельно согласовать допустимость exact workflow с vendor; Gmail restrictions сохраняются. [Aurinko Terms](https://www.aurinko.io/terms/).
- **Яндекс:** honest mailing list требует explicit consent/request и подтверждения адреса, unsubscribe иList-Unsubscribe; нарушение может привести к spam/rejection. [Yandex requirements](https://yandex.com/support/yandex-360/business/mail/en/web/letter/create/send-many-letters).
- **Gmail recipients:** SPF/DKIM, TLS, spam rate<0.3%; bulk>5000/day требуетSPF+DKIM+DMARC иone-click unsubscribe дляmarketing/subscription. Guidelines не гарантируют delivery и не отменяют вышеуказанные API policies. [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en).
- **Warmup:** у рассматриваемых APIs не найдено встроенной управляемой warmup network как уoutreach products. Consent на подключение собственного inbox и consent получателя — разные вещи. Искусственную peer-warmup активность нельзя заранее объявить policy-approved; использовать несколько inbox для обхода лимитов явно запрещено Gmail. Техническая возможность read/send/mark-as-read сама по себе такого разрешения не даёт.

## 7. Что остаётся в N7

Наше приложение сохраняет tenants/RBAC иtenant→mailbox→provider-grant ownership; account onboarding/reconnect/disable; sequence state machine; расписания/timezones; quota budgets наmailbox/domain/tenant; idempotency, retry иdead-letter; stop-on-reply race handling; unsubscribe/suppression/bounce rules; recipient-consent evidence; аудит, retention/deletion иbilling attribution. Token refresh и MIME/provider normalization можно делегировать gateway, но credentials/account identifiers остаются tenant-sensitive.

API scheduled send может быть полезным primitive, но scheduling каждой стадии sequence после reply/suppression checks остаётся вN7. Ни один из изученных коннекторов не является полной заменой Instantly/Smartlead sequences, warmup network или deliverability controls. Это архитектурный вывод из границ опубликованных APIs; существующий код N7 не менялся.

## 8. Дополнительный unified API: Unipile

Подтверждены Gmail/Outlook/IMAP send/reply/list/drafts иnew-email webhooks. $55/мес до10accounts;11–50 $5.50/account;51–200 $5;201–1000 $4.50;1001–5000 $4;5001+ $3.50, безper-message/request charges. API URL примеры имеют нестандартный порт, **но официальныйAPI Usage прямо описывает standard443 fallback с query port=XXXXX**. Яндекс explicit confirmation отсутствует. [Unipile pricing](https://www.unipile.com/pricing-api/), [email docs](https://developer.unipile.com/docs/emails), [443 fallback](https://developer.unipile.com/docs/api-usage).

Terms требует соблюдения connected provider ToS; маркетинговые outreach примеры не отменяют Gmail prohibition. Собственная verified/shared Google OAuth схема и её commercial entitlement в этом bounded исследовании подробно не проверены — не выдавать это за оценённый OAuth shortcut. [Unipile Terms](https://www.unipile.com/terms-of-use/).

## 9. Решение для дальнейшей стадии без регистраций и расходов

1. Сначала установить допустимый продуктовый контракт: recipient-consented sequences либо другой явно разрешённый outreach workflow; исходный unsolicited Gmail/Nylas режим не проходит публичные условия.
2. Для consented Gmail/M365-only: сравнить direct APIs (больше нашей integration/verification работы) иEmailEngine native APIs на существующемVPS (годовая license +ops). Оба транспортно используют443.
3. ДляGmail+Яндекс: Aurinko — ценовой кандидат ($2IMAP) сunknown vendor Yandex acceptance; Nylas — хорошо документированный connector, но default unsolicited prohibition иper-account cost; EmailEngine на отдельном egress-capable host — вариант при разрешении новой инфраструктуры.
4. После отдельного разрешения наподключение — bounded PoC: одинmailbox наprovider, send/reply/thread, duplicate/missed webhook recovery, expired credentials, quota429 иstop/send race. ДоPoC не утверждатьYandex ready илиproduction ready.
5. Ничего непокупать и незапускать из этой записки автоматически.

Измерения: requested model gpt-6.1-sol/high; actual execution model иusage counters недоступны из tool metadata и записаныnull. Исследование ограничено12мин; wall-clock окончание будет вsources.json. Тесты API/provider не выполнялись; результат — проверяемые публичные ссылки и явно обозначенныеunknown. Готовые артефакты:report.md иsources.json в/tmp/n7-inbox-connectors-research-20261008/.
