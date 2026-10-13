# N7: внешние Email API services — проверка 2026-10-08

Status: completed. Исследование официальных публичных источников, без регистрации, расходов, отправки писем, изменения DNS или обращения к поставщикам. Цены — USD, опубликованные на момент проверки; налоги, региональная доступность, approval аккаунта и индивидуальный контракт не проверялись. Это исследование возможностей и условий поставщиков, не юридическое заключение.

## Решение для текущего ограничения

При доступном HTTPS443 все пять сервисов могут заменить **исходящий SMTP transport** для писем, отправляемых через инфраструктуру ESP. Они не являются drop-in заменой подключения множества существующих Gmail/Яндекс ящиков: собственный домен, подтверждённый для ESP, не означает авторизацию к Google/Yandex account, чтение папок, Sent, Spam, историю или flags.

Inbound parsing — обработка писем, **доставленных ESP** через его адрес, MX собственного домена/субдомена либо настроенное владельцем forwarding. Если ответ пришёл только в текущий Gmail/Яндекс inbox и не был направлен ESP, ESP о нём не знает. Из наличия inbound или маркетинговых рассылок нельзя выводить разрешение cold outreach. Ни один из пяти не подходит как заявленная универсальная замена Instantly/Smartlead для unsolicited cold campaigns: ограничения конкретизированы ниже.

N7 может использовать ESP отдельно для собственных transactional писем SaaS и согласованных opt-in коммуникаций. Перевод mailbox warmup/цепочек на ESP меняет транспорт и репутацию, а не просто устраняет блокировку TCP.

## Матрица возможностей

| Поставщик | Исходящий HTTPS | Приём и reply detection | Существующий Gmail/Яндекс inbox | Пригодность unsolicited cold outreach |
|---|---|---|---|---|
| Resend | Send Email REST API, Reply-To, headers, scheduling | receiving domain или `<id>.resend.app`, email.received webhook, list/get content API; собственные Inboxes private beta | Подтверждения external inbox sync нет; домены собственные | Прямой запрет cold outreach |
| Postmark | Email API, Sender Signatures/domain, ReplyTo | GUID inbound address или custom MX/forwarding, JSON webhook, headers/MailboxHash/StrippedTextReply | Forwarding из Gmail возможен, full sync не предоставляется этой интеграцией | Permission-based подписки; purchased/rented lists запрещены |
| SES | API/SDK; свой verified email/domain | Domain MX + receipt rules + SNS/S3/Lambda; уведомление в HTTPS backend требует соответствующей AWS интеграции | SES прямо не предоставляет POP/IMAP inbox | AWS запрещает unsolicited mass email; SES контролирует unsolicited sending |
| SendGrid | Mail Send API; domain auth/Single Sender | Inbound Parse: authenticated receiving domain MX, public HTTP endpoint, headers/body/attachments | Parse не подключается к внешнему mailbox | Affirmative consent для всех non-transactional писем |
| Mailgun | REST API, verified sending domain | Inbound Routes: MX домена, forward(URL), store/get, parsed HTTP payload | Routes не синхронизируют сторонний inbox | Express clear/provable consent, opt-in для non-transactional |

Матрица — синтез источников следующих разделов; отсутствие full sync означает отсутствие подтверждения этой возможности в исследованных официальных продуктах, а не утверждение обо всех будущих private offerings.

## Resend

**Что заменяет.** Исходящую отправку REST API; webhooks сообщают delivery, bounce, open/click и inbound events. Получение письма возможно на verified receiving domain либо предоставленном `<id>.resend.app`; list/get API возвращают полученные письма, полное содержимое и attachments. Это позволяет N7 обрабатывать ответы, если они направлены туда. [Send Email](https://resend.com/docs/api-reference/emails/send-email), [Webhooks](https://resend.com/docs/webhooks/introduction), [Receiving](https://resend.com/docs/dashboard/receiving/introduction).

**Identity и inbox.** Resend требует домен, которым отправитель владеет, исключая shared/public domains. Можно сохранить Google Workspace/Yandex 360 на root domain, использовать отдельный receiving subdomain для ESP и явный Reply-To. Замена root MX переводит входящую почту к ESP; дополнительный MX не создаёт зеркало существующего inbox. Официальный SDK reference поясняет, что webhook metadata не содержит body, его надо получать API. [Verified Domains](https://resend.com/docs/dashboard/domains/introduction), [Receiving reference, официальный репозиторий Resend](https://github.com/resend/resend-skills/blob/main/skills/resend/references/receiving.md).

**Новая возможность, не обход ограничения.** Inboxes API существует в private beta: threads, labels/drafts/replies; inbox отправляет/принимает на адресе одного из собственных доменов. `forwarding=true` выдаёт receiving address без MX, но требует направлять туда mail. Доступ ограничен, response shape может измениться. Это не доказательство OAuth/IMAP подключения Gmail/Yandex. [Create Inbox](https://resend.com/docs/api-reference/inboxes/create-inbox).

**Policy.** AUP от 27 августа 2026 прямо запрещает unsolicited messages, cold outreach, purchased lists и scraped contact data. [Resend AUP](https://resend.com/legal/acceptable-use).

**SaaS/квоты.** Domain-scoped sending API keys ограничивают отправку доменом; это не заменяет изоляцию чтения incoming данных в N7. Default API rate 10 requests/sec **per team across API keys**; outbound и inbound расходуют quota. [API key permissions](https://resend.com/changelog/new-api-key-permissions), [Usage Limits](https://resend.com/docs/api-reference/rate-limit).

## Postmark

**Что заменяет.** REST отправку с ReplyTo; inbound JSON webhook получает mail, адресованный unique server inbound address либо forwarding domain. `MailboxHash` помогает correlation; `StrippedTextReply` — best effort извлечение текста ответа, не решение остановки цепочки. [Email API](https://postmarkapp.com/developer/api/email-api), [Inbound webhook](https://postmarkapp.com/developer/webhooks/inbound-webhook).

**Identity/inbox.** Для отправки от клиента нужен private domain, доступ к DNS и Sender Signature/domain verification. Free provider Gmail адрес нельзя подтвердить как customer sender. На каждом Server один inbound stream и один inbound domain; forwarding из Gmail документирован, но не сообщает всю историю, Sent/Spam/flags или ручные исходящие действия. [Managing Sender Signatures](https://postmarkapp.com/developer/user-guide/managing-your-account/managing-sender-signatures), [Sending on behalf of customers](https://postmarkapp.com/support/article/how-do-i-send-email-on-behalf-of-my-customers), [Configure inbound](https://www.postmarkapp.com/developer/user-guide/inbound/configure-an-inbound-server).

**Policy.** Terms требуют permission-based списки и запрещают purchased/rented lists; guide для SaaS требует явный opt-in клиента на конкретные сообщения. Возможность Broadcast streams не разрешает unsolicited cold outreach. [Terms](https://postmarkapp.com/terms-of-service), [Customer vetting guide](https://postmarkapp.com/guides/how-to-vet-and-set-up-new-customers-for-sending-through-postmark).

**SaaS.** Servers/streams и их tokens подходят для сегментации отправки; N7 по-прежнему отвечает за права пользователей, consent и данные. Документация Sender Signatures говорит об unlimited verified domains, но текущий pricing вводит domain caps — для закупки ориентироваться на действующий plan/checkout, не старую help page. [Adding Sender Signatures](https://postmarkapp.com/support/article/adding-sender-signatures), [Pricing](https://postmarkapp.com/pricing/).

## Amazon SES

**Что заменяет.** API отправку с verified identities. Receiving — own domain/MX и receipt rules; SES не содержит POP/IMAP servers. SNS action может включать полное MIME только до 150KB, более крупные письма требуют S3. На HTTPS backend можно доставлять события/получать S3 объект через AWS интеграцию; SES не является готовым внешним mailbox connector. [Receiving concepts](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-concepts.html), [Receiving domain verification](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-verification.html), [SNS action](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-sns.html).

**Identity.** SES допускает verified email identities и domains, но verification адреса не даёт Gmail/Яндекс transport или mailbox access. DMARC требует alignment с From domain; владение личным mailbox не позволяет публиковать SPF/DKIM у gmail.com/yandex.ru. Для надёжного authenticated production transport нужен контролируемый домен. [Production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html), [SES DMARC](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html).

**Policy.** AWS AUP запрещает unsolicited mass email и содействие его отправке. SES контролирует malicious/unsolicited/low-quality email и может review/pause sending. Это не доказательство общего запрета всякого единичного контакта, но точно не основание обещать cold-campaign SaaS без разрешения поставщика. [AWS AUP](https://aws.amazon.com/aup/), [SES enforcement](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html).

**SaaS/квоты.** SES теперь имеет Tenants: отдельные identities, config sets/templates, reputation metrics, проверки resource association и pause policies по tenant. Старый материал «config sets не изолируют reputation» не отражает эту новую возможность. Tenant primitives не заменяют tenant predicates N7, storage isolation и контроль secret access. [Tenants](https://docs.aws.amazon.com/ses/latest/dg/tenants.html). Новые accounts в region-specific sandbox: verified recipients, 200/24h, 1/sec; production access отдельно проверяется AWS, recipient-based quotas per region. [Production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html), [Sending quotas](https://docs.aws.amazon.com/en_en/ses/latest/dg/manage-sending-quotas.html).

## SendGrid

**Что заменяет.** Email API; Inbound Parse требует authenticated domain/hostname MX `mx.sendgrid.net` и публично доступный URL. Parsed body, headers и attachments доступны webhook; не доставленные 3 суток события удаляются без предварительного уведомления. [Pricing/API overview](https://static0.twilio.com/en-us/products/email-api/pricing), [Configure Parse](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook), [Parse behaviour](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/inbound-email).

**Identity/inbox.** Domain authentication или Single Sender verification — не подключение OAuth к mailbox. Twilio отдельно объясняет DMARC проблемы при использовании gmail.com/yahoo.com/similar address, поскольку инфраструктура SendGrid не авторизована этими доменами. Свой Workspace/Yandex 360 domain можно аутентифицировать, но отправка идёт через SendGrid, а Sent/inbound sync не появляется автоматически. [DMARC and identity](https://www.twilio.com/docs/sendgrid/ui/sending-email/dmarc).

**Policy.** Twilio требует affirmative consent для всех non-transactional messages; запретные примеры включают найденные на Internet/social media адреса без prior consent и unsolicited bulk. Transactional exception относится к действию/транзакции получателя, не к произвольному sales outreach. [Opt-in/opt-out requirements](https://help.twilio.com/articles/47432543786907), [Deliverability guidance](https://www.twilio.com/docs/sendgrid/ui/sending-email/deliverability).

**SaaS.** Pro/Premier дают Subuser Management, segregated statistics/permissions/credit limits; это полезная provider-level сегментация, не доказательство полной физической изоляции и не замена N7 auth/storage. [Current plans](https://static0.twilio.com/en-us/products/email-api/pricing).

## Mailgun

**Что заменяет.** REST transport, verified own sending domain, events/webhooks. MX включает receiving domain в Routes; `forward(URL)` доставляет письмо приложению; `store()` предоставляет временный retrieval. Действие `stop()` останавливает дальнейшую проверку Routes и **не означает stop campaign on reply**. [Quickstart](https://documentation.mailgun.com/docs/mailgun/quickstart), [Domain verification](https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-verify), [Route Actions](https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/route-actions).

**Identity/inbox.** Authenticated From на контролируемом клиентском домене не подключает его Gmail/Yandex account; MX/forwarding принимает routed new mail. Mailgun Routes не предоставляют внешнюю mailbox history или IMAP folder state. Это вывод из documented API architecture, не абсолютное утверждение о private enterprise connectors.

**Policy.** AUP: non-transactional email только после express, clear, explicit, provable consent через single/double opt-in; marketing требует unsubscribe; third-party sending domain должен быть validated и identity раскрыта. Даже validation service нельзя использовать для не opt-in/purchased/rented адресов. [Mailgun AUP](https://www.mailgun.com/legal/aup/).

**SaaS.** Subaccounts имеют собственные API keys/domains/users/webhooks/logs и monthly custom limits. Primary key может действовать от имени subaccount; без правильного `X-Mailgun-On-Behalf-Of` операция может попасть в parent account. Возможность subaccount не гарантирует доступность на каждом плане — проверить plan agreement до procurement. [Features](https://documentation.mailgun.com/docs/mailgun/user-manual/subaccounts/subaccounts-features), [API/custom monthly limit](https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/subaccounts), [Parent delegation](https://help.mailgun.com/hc/en-us/articles/16380043681435-Subaccounts).

## Подписки и опубликованные цены

| Сервис | Free/trial | Начальные paid планы | Существенные ограничения цены |
|---|---|---|---|
| Resend | $0: 3K/mo, 100/day, 3 domains | Pro $20/mo: 50K, extra $0.90/1K, 10 domains; Scale $90/mo: 100K, 1K domains | Received mail тоже quota; paid overage надо включить; +100 domains $20/mo |
| Postmark | 100/mo, бессрочно, без overage | Для slider 10K/mo: Basic $15; Pro $16.50; Platform $18 | Inbound перечислен Pro/Platform; domains 5/10/unlimited; extra $1.80/$1.30/$1.20 per1K; send+receive volume |
| SES | Новый AWS free-tier credit зависит от eligibility/account; не считать гарантированными 62K free/mo | À-la-carte outbound $0.10/1K; Essentials $0.16/1K; Pro $105/account/region/mo + $0.22/1K; Enterprise $500 + $0.23/1K, rates для 0–10M | Attachment data $0.12/GB; classic inbound $0.10/1K + $0.09/1K chunks; SNS/S3 и optional services отдельно |
| SendGrid | Trial 60 days, 100/day | Essentials от $19.95/mo, 50K–100K; Pro от $89.95/mo, 100K–2.5M; Premier quote | Не free forever; pricing depends volume/features, taxes/overages; subusers и dedicated IP в Pro/Premier |
| Mailgun | $0: 100/day, 1 domain, 1 inbound route | Basic $15/mo/10K, extra от$1.80/1K; Foundation $35/50K, extra от$1.30/1K; Scale $90/100K, extra от$1.10/1K | Basic 1 domain/5 routes; Foundation/Scale 1K domains; Foundation/Scale advertised first month free |

Источники цены: [Resend](https://resend.com/pricing), [Postmark](https://postmarkapp.com/pricing/), [SES](https://aws.amazon.com/ses/pricing/), [SendGrid, официальный Twilio static mirror](https://static0.twilio.com/en-us/products/email-api/pricing), [Mailgun](https://www.mailgun.com/pricing/). SendGrid canonical page timed out через browser tool, поэтому использован официальный mirror и [официальный plan PDF](https://www.twilio.com/content/dam/sendgrid/global/en/other/sendgrid-pricing/twi121--sendgrid-pricing-pdf-st1.pdf). PDF: Essentials50K $19.95, 100K $34.95; Pro100K $89.95. Не считать PDF универсальным новым контрактом.

SES: с 21 июля 2026 новые account×region и account×region без metered activity с 1 июня 2025 стартуют Essentials; переход к à-la-carte доступен. Поэтому обещание «SES всегда $0.10/1K сразу после подключения» неверно. Tenants à-la-carte: $0.005/tenant/mo + $0.005/1K emails; текущие планы отличаются inclusion. [SES pricing](https://aws.amazon.com/ses/pricing/).

Таблица — subscription minimum/transport cost, не полный TCO N7. Число connected Gmail/Yandex mailboxes не эквивалентно числу ESP domains; Google/Yandex subscriptions, AI, web/worker, storage и support сюда не включены.

## Warmup: разные продукты

Все перечисленные provider warmup возможности относятся к постепенному увеличению отправки **с dedicated IP ESP**. Они не реализуют N7 peer pool, reading/replying в Gmail/Яндекс mailbox, перенос из Spam в Inbox или гарантию inbox placement.

- Resend: automatic dedicated IP warmup, add-on $30/mo на Scale+ при >3K/day. [Dedicated IPs](https://resend.com/features/dedicated-ips).
- Postmark: managed или DIY IP warmup; dedicated IP eligibility от300K/mo, $50/IP/mo. [Dedicated IPs](https://www.postmarkapp.com/dedicated-ips).
- SES: managed dedicated IP warmup/scaling; separate reputation infrastructure. [Dedicated IPs](https://docs.aws.amazon.com/en_en/ses/latest/dg/dedicated-ip.html).
- SendGrid: automatic throttling/ramp dedicated IP; shared Free/Essentials pools не требуют отдельного IP warmup. [Warmup](https://www.twilio.com/docs/sendgrid/concepts/reputation/warm-up-ip-addresses).
- Mailgun: dedicated IP owned by account, API start/status/delete warmup. [IP warmup API](https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/ip-address-warmup/get-v3-ip-warmups--addr-).

Наличие IP warmup не является разрешением artificial mailbox engagement. Применимость к добровольной когорте N7 и AI-generated peer replies требует отдельной проверки policy/recipient consent; эти действия в исследовании не выполнялись.

## Что остаётся в N7 даже с ESP

Это архитектурные выводы по verified provider interfaces:

1. Sequences/enrollments/schedule, общий лимит и отдельные consent, transactional stop writers и повторная проверка непосредственно перед необратимой API submit.
2. Durable inbound ingestion: authenticity verification, tenant/domain/mailbox binding, deduplication и correlation по сохранённым outbound Message-ID/In-Reply-To/References или защищённому reply token; не считать From/Subject достоверным tenant ключом.
3. Ответ, bounce, unsubscribe и complaint — разные события с отдельными причинами остановки. Delivered/open/click не подтверждают человеческий ответ или inbox placement.
4. Webhook задержки и пропуски: очередь/replay/backfill, health/fail-closed для остановки, provider retention limits. Нельзя гарантировать остановку до наблюдения ответа; уже принятую API/ESP отправку нельзя считать отозванной.
5. Reservation/reconciliation и unknown delivery: HTTP timeout после submission может означать accepted email. Не делать blind retry; supported provider idempotency/status controls нужно проверять отдельно.
6. Tenant isolation в N7 API/DB/credentials/inbound данных, provider quotas и N7 total quota одновременно. Domain keys/subusers/SES Tenants — дополнительный слой.
7. Gmail/Yandex outbound native identity, history/Sent/Spam/flags, mailbox-level warmup остаются отдельной transport/sync задачей. HTTPS mailbox-native API или отдельно размещённый SMTP/IMAP worker с разрешённым egress — другой класс решения, не реализуемый пятью ESP как mailbox connector.

Рекомендация: не менять согласованную модель продукта только ради HTTPS egress. Выделить optional ESP transport для transactional/opt-in mail; для mailbox-native cold outreach/warmup сохранить отдельный выбор connector/worker и его policy/consent gates. Среди ESP выбирать только после подтверждения допустимости конкретного разрешённого потока: published prices сами по себе не подтверждают approval SaaS tenants или warmup use case.

## Evidence и измерения

- Project root: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-replicate/projects/07-cold-email-warmup
- Source revision at handoff: cfc075948e1f0dfa12fbe600fe0b8539f3ddb959. Исходники не изменялись.
- Work unit: n7_mail_services_research; profile model-routing-econom; requested Sol6.1/high; actual model/runtime metadata unavailable.
- Usage tokens/cost: null, причина — host не предоставил измерения. Это не нулевой расход.
- Read-only web research и проверка official source mappings выполнены; live email/API integration/E2E not_applicable — запрещены рамками исследования.
- Trace/evidence: этот файл и sources.json; parent coordinator owns project run telemetry. Независимое acceptance/review parent не заявляется пройденным этим исследованием.
- Проверены 5/5 providers, outgoing/inbound interfaces, identity, consent policy, current public pricing, quotas/isolation, warmup distinction и N7 responsibility mapping.
- Пробелы: не подтверждены provider account approval, client-specific legal basis, negotiated plans, regional availability, individual enterprise exceptions; Resend Inbox beta access и production behaviour не тестировались.
