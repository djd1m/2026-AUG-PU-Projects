# N7: выбор внешнего почтового транспорта и облачного хостинга

Дата проверки: 2026-10-08 UTC. Решение для владельца: сначала рассмотреть штатное открытие портов на AdminVPS; если это недоступно — разместить существующий worker отдельно, первым кандидатом взять Yandex Compute, альтернативами Vultr/GCP либо платный Railway/Render. Покупки, подключения аккаунтов, миграции и отправки в этом исследовании не выполнялись.

## Что действительно нужно N7

N7 подключается к существующим ящикам пользователя: authenticated SMTP **465 либо 587**, входящая почта по IMAP TLS **993**, HTTPS **443**. Собственный SMTP-сервер и отправка непосредственно на MX по порту25 для этого не нужны. Запрет только25 не блокирует этот сценарий.

На текущем VPS ранее наблюдались SYN без ответов для SMTP/IMAP при работающем HTTPS. Локальные правила не объясняют наблюдение, но оно не устанавливает виновника блокировки. Официальная инструкция AdminVPS перечисляет SMTP-порты по умолчанию для некоторых локаций и предлагает обратиться за открытием; **993 в перечне отсутствует**. Причину недоступности IMAP нужно выяснять отдельно. [AdminVPS](https://my.adminvps.ru/knowledgebase/280/setevye-nastroiki.html).

## Облака: ответы на вопрос «у кого нет таких ограничений?»

Это матрица опубликованных политик, а не результат соединений с новых ВМ. Открытый порт не гарантирует SMTP AUTH, доставку или разрешённость конкретной рассылки. Для всех кандидатов необходимо отдельно подтвердить IMAP993 на фактическом аккаунте/регионе.

| Провайдер / продукт | SMTP465/587 | Решение для N7 / условие | Первичный источник |
|---|---|---|---|
| **Yandex Compute/VPC** | FAQ прямо рекомендует оба вместо заблокированного25 | Первый кандидат для отдельного worker; проверить993 | [FAQ](https://yandex.cloud/ru/docs/vpc/qa/) |
| **Vultr Compute** | Оба прямо разрешены для внешнего SMTP | Простой VM-кандидат; доступность регистрации/оплаты не подтверждена | [SMTP](https://docs.vultr.com/support/products/compute/why-is-smtp-blocked) |
| **GCP Compute Engine** | Оба unrestricted, если свои firewall rules не запрещают | Технический кандидат; новые регистрации из России приостановлены | [SMTP](https://docs.cloud.google.com/compute/docs/tutorials/sending-mail), [billing](https://docs.cloud.google.com/billing/docs/resources/currency) |
| **Railway Pro+** | SMTP доступен; Free/Trial/Hobby отключён | От $20/месяц minimum usage с включёнными credits; после upgrade redeploy | [Outbound](https://docs.railway.com/networking/outbound-networking), [pricing](https://railway.com/pricing) |
| **Render paid compute** | Снимает free-блок25/465/587 | Постоянный worker512MB от $7/месяц; отдельно DB/storage | [Policy](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports), [pricing](https://render.com/pricing) |
| **Fly.io Machines** |587 подтверждён сотрудником;465 неизвестен | Возможен587 после проверки TLS/993;512MB $3.69/30дней в iad/ewr | [Staff587](https://community.fly.io/t/request-to-unblock-outbound-smtp-port-587-for-app-rialma-api/27164/2), [pricing](https://docs.fly.io/about/pricing) |
| **Hetzner Cloud** |587 доступен;465 blocked по умолчанию | Подходит только при587 либо approved unblock465 | [FAQ](https://docs.hetzner.com/cloud/servers/faq/) |
| **AWS EC2** |465/587 ожидаются по официальным SMTP/SG документам;25 default blocked | Резерв, полноценный unrestricted promise не найден | [Troubleshooting](https://repost.aws/knowledge-center/ec2-windows-email-server-issues) |
| **Azure VM** |587 явно разрешён;465 отдельно не подтверждён | Резерв для587, требуется рабочий internet egress | [SMTP](https://learn.microsoft.com/en-us/troubleshoot/azure/virtual-network/troubleshoot-outbound-smtp-connectivity) |
| **DigitalOcean Droplets** |25/465/587 blocked на всех Droplets | Для текущего native SMTP worker не выбирать | [Limits](https://docs.digitalocean.com/products/droplets/details/limits/) |
| **Selectel** |25/465/587 default blocked; есть исключения pools/products | Не универсальная альтернатива; support approval/точный pool | [Blocked ports](https://docs.selectel.ru/infrastructure/blocked-ports/) |
| **OVHcloud VPS** | Regular587 рекомендован; Local Zones любойSMTP blocked | Не брать Local Zones;465 regular неизвестен | [VPS FAQ](https://support.us.ovhcloud.com/hc/en-us/articles/48817968371091-OVHcloud-VPS-FAQ) |
| **Cloud.ru Evolution** | Есть SMTP tutorial; общей политики465/587 не найдено | Запросить подтверждение; tutorial не гарантия egress | См. [региональный отчёт](cloud-regional.md) |
| **Akamai/Linode** | Некоторые аккаунты default block25/465/587 | Возможна заявка; официальное send-mail руководство требует opt-in | См. [региональный отчёт](cloud-regional.md) |

Цены выше — минимальный вход для одного небольшого worker, **не** стоимость всего N7 и не эквивалент VPS8CPU/12GB. DB, Redis/очередь, storage, трафик, налоги и резервирование считаются отдельно. Перенос всего приложения пока не обоснован: можно вынести только transport worker, но для этого проектируется безопасный доступ к состоянию/очереди и полномочиям, а не просто копируется процесс без shared state.

## Подписки вместо нашего SMTP/IMAP worker

| Класс | Примеры | Что заменяет | Что не заменяет / ключевое условие |
|---|---|---|---|
| ESP Email API | Resend, Postmark, SES, SendGrid, Mailgun | Отправку через инфраструктуру ESP поHTTPS; inbound только на маршрутизированный ESP адрес | Не читает существующий Gmail/Яндекс inbox; verified свой домен не даёт права отправлять от gmail.com. Подходит отдельно для transactional/opt-in |
| Hosted inbox connector | Aurinko, Nylas, Unipile | Подключение существующего inbox, send/read/sync, webhooks черезHTTPS | Яндекс vendor compatibility не подтверждена испытанием; per-account стоимость; условия конкретного потока |
| Self-hosted gateway | EmailEngine | MIME/SMTP/IMAP/API интеграцию и webhooks | **Нет hosted API endpoint**; IMAP backend на том же VPS сохраняет сетевой блок. Нужен разрешённый egress хост либо native Gmail/Graph backend |
| Managed outreach engine | Instantly, Smartlead, EmailBison | Значительную часть SMTP/IMAP, sequences и warmup | Это более широкий outsourcing; нужны права использовать backend для конкурирующего SaaS, контроль reply-stop/quotas/изоляции |

**Resend не подходит как универсальная замена для исходного cold outreach:** AUP прямо запрещает такой поток. Получение email теперь есть, включая отдельные Inbox API в private beta, но это не синхронизация существующего стороннего ящика. [Resend AUP](https://resend.com/legal/acceptable-use), [Inbox API](https://resend.com/docs/api-reference/inboxes/create-inbox).

**Nylas технически подходит классу hosted connector, но default Terms §9 запрещают unsolicited advertising/solicitation.** Google Workspace API developer policy также запрещает приложения для unsolicited commercial mail и обход ограничений через несколько аккаунтов. Миграция илиHTTPS transport эти условия не меняют. [Nylas](https://www.nylas.com/legal/terms/), [Google policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

Aurinko — ценовой кандидат для допустимого потока: specific billing FAQ указывает **$2/active account/месяц включаяIMAP**, то есть $200/100ящиков и$2000/1000. Marketing pricing расходится сFAQ; перед покупкой подтверждается тариф. Яндекс и конкретный cold/warmup сценарий неизвестны. [Billing FAQ](https://docs.aurinko.io/faq/how-does-aurinko-billing-work).

EmailEngine: **$1450/год** ($120.83/месяц амортизация), unlimited mailboxes/instances плюс hosting. Это кандидат для сокращения собственного кода, а не готовая облачная подписка. [Pricing](https://emailengine.app/), [Introduction](https://learn.emailengine.app/docs/getting-started/introduction).

EmailBison — кандидат для переговоров о white-label backend/warmup: есть явное приглашение для новых продуктов, но public terms содержат коммерческие/конкурентные ограничения; это не автоматическое разрешение. Общий published plan $599/месяц, отдельная стоимость warmup неизвестна. Instantly имеет competitive-use restriction, Smartlead — ограничения resale, а документируемая задержка reply ingestion30–60мин требует проверки требования AI-ответа<5мин. [EmailBison warmup](https://emailbison.com/features/email-warmup), [terms](https://emailbison.com/emailbison-terms-of-service-v2.pdf); подробности в [отчёте outreach](outreach-platforms.md).

## Рекомендуемая последовательность

1. Уточнить у AdminVPS открытие **465/587 и993**, раздельно: официальная SMTP-политика не доказывает IMAP block. Это самый малый путь изменения; сообщение провайдеру ещё не отправлялось.
2. Если текущий VPS не подходит — выбрать отдельный worker на Yandex Compute; Vultr/GCP или платный Railway/Render как технические альтернативы. Перед расходами подтвердить account/payment/region и сетевую доступность.
3. Для дальнейшего сокращения самописного transport кода отдельно сравнить EmailEngine и допустимый hosted connector. Не менять модель продукта на ESP только ради443.
4. Проверить TLS handshake SMTP465 или STARTTLS587, IMAP993, certificate verification, greeting/EHLO/CAPABILITY. Затем только разрешённый one-mailbox pilot: AUTH → полный poll → controlled send → receipt → reply → stop-on-reply. Network test не доказывает delivery.
5. Для любого adapter сохраняются tenant isolation, durable inbound events, thread matching, atomic stop+last-submit check, suppression, deduplication/reconciliation, объединённые warmup+campaign quotas, аудит и ambiguous submit без blind retries. Webhook сам по себе нельзя объявлять «полным IMAP-опросом<60сек»: требуется явная новая семантика freshness и доказательство missed-event recovery.

## Артефакты и проверка

Первый отдельный рой: [ESP APIs](provider-apis.md), [inbox connectors](inbox-connectors.md), [outreach engines](outreach-platforms.md). Второй отдельный рой: [PaaS](cloud-paas.md), [VM](cloud-vms.md), [regional/independent review](cloud-regional.md). Для каждого сохранён файл `*-sources.json` с официальными источниками и измерениями.

Профиль **model-routing-econom**, шесть исследователей с запрошенными **gpt-6.1-sol/high**, независимые fork-none контексты. Фактическая модель исполнения, токены и стоимость не предоставлены инструментарием и записаны null — это не нулевой расход. Начальная запись прогона была создана после первой делегации; пробел времени явно сохранён в [run.json](run.json). Root проверил ключевые противоречия по первичным страницам: Nylas запрет находится в§9, не§6; Aurinko цены имеют конфликт; outbound и ingressIP Fly разделены.

Проверки документов: JSON parse, существование локальных Markdown links, ссылки источников, secret-pattern scan и git diff --check фиксируются в run.json. Runtime/E2E/provider AUTH не выполнялись: результат этой стадии — исследование, а не готовая интеграция. Код, текущий transport authority и LIVE deployment не изменены.
