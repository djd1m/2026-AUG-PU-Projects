# N7: исходящие email ports у DigitalOcean, Railway, Fly.io и Render

Проверено 2026-10-08 UTC. Только публичные первичные источники: документация/тарифы провайдеров и ответы подтверждённых сотрудников на официальном форуме. Регистраций, покупок, обращений, миграций и сетевых проб с аккаунтов провайдеров не было.

Для N7 нужны authenticated SMTP 465 **или** 587, IMAP TLS 993 и HTTPS 443. Это клиент существующих почтовых ящиков; собственный MTA и direct-to-MX 25 не нужны. Политика исходящих портов и успешная доставка — разные проверки.

| Провайдер / продукт | 25 outbound | 465 / 587 outbound | IMAP 993 | HTTPS 443 | Минимальный релевантный платный вход |
| --- | --- | --- | --- | --- | --- |
| DigitalOcean Droplet | Blocked на всех Droplets | Оба blocked по умолчанию; SMTP AUTH не меняет портовый блок | Явное подтверждение не найдено; unknown | Общий outbound поддерживается; docs используют 443 | $4/мес, 1 vCPU, 512 MiB, но это не решает SMTP block |
| Railway Free / Trial / Hobby | SMTP disabled | SMTP disabled | Явное подтверждение не найдено; unknown | HTTPS email APIs доступны на всех планах | Hobby $5 не подходит для текущего SMTP |
| Railway Pro+ | SMTP available; docs диагностика включает 25 | SMTP available; docs явно проверяют 465/587 | Явное подтверждение не найдено; unknown | HTTPS APIs поддерживаются | Pro: $20 minimum monthly usage, включая $20 credits; сверх них по использованию |
| Fly.io Machines | Staff: нет per-account block 25 | **587:** staff прямо говорит, что не blocked. **465:** явное policy подтверждение не найдено | Явное подтверждение не найдено; unknown | Обычный outbound networking; конкретный endpoint не тестировался | Без monthly platform fee: от $2.19/30 дней, 256 MB в iad/ewr; 512 MB $3.69, 1 GB $6.70 |
| Render paid Background Worker | Paid compute снимает free SMTP limitation | Paid compute снимает block 25/465/587 | Явное подтверждение не найдено; unknown | Workers могут вызывать внешние APIs | Hobby workspace $0 + paid worker $7/мес, 0.5 CPU / 512 MB |

Статус unknown означает недостаток явного подтверждения в изученных источниках, а не установленную блокировку. Никакая строка не является live connectivity receipt для реального SMTP/IMAP endpoint N7.

## DigitalOcean

Официальная [SMTP policy](https://docs.digitalocean.com/support/why-is-smtp-blocked/) от 13 июля 2026 говорит о 25/465/587 на всех Droplets по умолчанию, включая Reserved IP. Более свежие [Droplet Limits](https://docs.digitalocean.com/products/droplets/details/limits/) от 19 августа 2026 дополнительно называют ограничения SMTP через IPv6. Поэтому утверждение «у DO заблокирован только 25, а 465/587 свободны» противоречит текущим docs. Возраст аккаунта, тариф и регион не названы исключениями.

Документация не даёт гарантированной процедуры unblock. Community ответы советуют запросить ручную проверку support, но это не официальная гарантия снятия; общую документацию следует считать определяющей до письменного решения по конкретному аккаунту. [Официальные цены Droplets](https://www.digitalocean.com/pricing/droplets): $4/мес для 512 MiB/1 vCPU, $6 для 1 GiB.

Droplet — Linux VM; архитектурно подходит для Docker и постоянного worker. [App Platform](https://docs.digitalocean.com/products/app-platform/details/pricing/) предлагает контейнерные workers от $5/мес. Однако его [limits](https://docs.digitalocean.com/products/app-platform/details/limits/) формулируют SMTP restriction как невозможность «open SMTP ports»: этого недостаточно, чтобы самостоятельно доказать именно outbound policy. Доступность outbound 465/587 у App Platform остаётся не подтверждённой этим исследованием. [Networking support](https://docs.digitalocean.com/support/networking/) подтверждает использование outbound 443 для metrics.

## Railway

[Outbound Networking](https://docs.railway.com/networking/outbound-networking) прямо ограничивает SMTP планами Pro и выше. После upgrade обязателен redeploy; без него прежний запрет может сохраниться. Документ включает проверку 25/465/587/2525 и советует при недоступности сначала выяснить, не отклоняет ли email provider Railway IP, затем обратиться в Central Station. Это не обещание, что каждый внешний SMTP сервер примет соединение.

Регион или дополнительная выдержка нового аккаунта для SMTP в этой policy не указаны. IPv6 outbound включается отдельно per service и по умолчанию выключен. [Pro price](https://railway.com/pricing): $20 minimum usage/месяц, $20 credits включены; не $20 плюс первые $20 usage.

[Static outbound IPs](https://docs.railway.com/networking/static-outbound-ips) на Pro дают постоянные IPv4 адреса, сейчас три с балансировкой. Они могут быть общими с другими клиентами; смена региона меняет IP. Не считать static равным dedicated или чистой репутации.

[Platform philosophy](https://docs.railway.com/platform/philosophy) говорит о stateful Docker containers и поддержке любых Docker/Railpack workloads; [Dockerfiles](https://docs.railway.com/builds/dockerfiles) поддерживаются. Для N7 постоянный worker должен иметь выключенный [Serverless](https://docs.railway.com/deployments/serverless): включение допускает сон после отсутствия outbound активности.

## Fly.io

Сотрудник flyio-support 23 августа 2026 в [outbound 25 thread](https://community.fly.io/t/outbound-port-25-direct-to-mx-smtp-blocked-by-default-on-new-accounts/28537/4) подтвердил отсутствие блокировки 25 по аккаунтам. Сотрудник lillian 19 февраля 2026 в [outbound 587 thread](https://community.fly.io/t/request-to-unblock-outbound-smtp-port-587-for-app-rialma-api/27164/2) прямо подтвердил, что 587 не blocked. Публичный topic JSON проверен: у ответа post 2 staff=true, admin=true, moderator=true. Для 465 и 993 аналогичного явного подтверждения в ограниченном поиске не найдено.

В [troubleshooting](https://docs.fly.io/getting-started/troubleshooting) раздел с заголовком outbound смешивает его с правилами shared **ingress** IPv4/SNI. Это не доказательство запрета исходящего raw TCP и не основание покупать dedicated ingress IPv4 для SMTP submission.

[Fly Machines](https://docs.fly.io/machines/overview) — VM из контейнерного образа; постоянный worker возможен. Если на него распространяются proxy service настройки, [auto_stop_machines="off"](https://docs.fly.io/reference/configuration) сохраняет постоянную работу. Docker Node 22 и обычный child_process архитектурно совместимы, но запуск точного образа N7 здесь не проверялся.

По [текущим тарифам](https://docs.fly.io/about/pricing) минимальный always-on worker $2.19/30 дней в iad/ewr; 512 MB $3.69 и 1 GB $6.70. Это нижняя граница compute, не sizing N7 и не полный стек с БД/Redis. Новый аккаунт получает trial до 2 часов Machine runtime или 7 дней; дальше нужен card и оплата ресурсов, без platform subscription. Цены региональны, 31-дневный месяц дороже. Ранее индексированные $2.02/$3.32 устарели относительно [обновления 1 октября 2026](https://fly.io/pricing-update/).

[Egress IPs](https://docs.fly.io/networking/egress-ips) по умолчанию меняются при lifecycle/infrastructure изменениях, IPv4 проходит NAT, IPv6 тоже возможен. App-scoped static egress выделяется на регион и сохраняется при recreation; optional static egress в тарифах $0.005/час, около $3.60/30 дней. Это другой ресурс, чем dedicated ingress IPv4 $2/мес.

## Render

[Changelog 16 сентября 2025](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports) говорит, что free web services блокируют outbound 25/465/587 во всех регионах с 26 сентября 2025, а any paid instance type позволяет продолжать SMTP. [Free docs](https://render.com/docs/free) подтверждают: переходить надо на paid **compute**, upgrade workspace не снимает free instance limitations. Background workers не имеют free compute tier.

[Background Workers](https://render.com/docs/background-workers) работают непрерывно без входящего трафика; [Docker](https://render.com/docs/docker) поддерживает готовые образы или Dockerfile. Node 22/child_process подходят по контейнерной модели; точный N7 runtime не запускался. [Pricing](https://render.com/pricing?trk=article-ssr-frontend-pulse_little-text-block): Hobby workspace $0 + compute, worker 0.5c-512mb $7/мес, 1c-2g $25. Тариф worker не включает БД/Redis и лишний bandwidth.

[Outbound IPs](https://render.com/docs/outbound-ip-addresses) shared между сервисами региона, приложение может использовать любой IP своих диапазонов. Это требует allowlist диапазонов, а не одного случайно наблюдавшегося IP. Старые Oregon workspaces до 23 января 2022 имеют отдельное исключение. Dedicated outbound IP — опциональная отдельная платная функция.

## Вывод для решения

Из названных владельцем трёх платформ **Railway Pro** даёт самое явное документальное разрешение обоих 465/587, но с минимумом $20/месяц. **Fly.io** — дешёвый постоянный worker и подтверждённый staff открытый 587; остаются явно не подтверждёнными 465 и IMAP993. **DigitalOcean Droplet** не устраняет текущую блокировку email ports. Дополнительный **Render paid worker** даёт документированное снятие free SMTP block от $7/месяц.

Для любой выбранной платформы следующий разрешённый технический шаг — отдельная проверка TCP/TLS к точным SMTP465/587 и IMAP993 endpoints N7 из выбранного региона/аккаунта, без отправки сообщения, если отправка отдельно не разрешена. Поддержка порта не подтверждает SMTP AUTH, IMAP login, provider IP acceptance или доставку. Новый egress может изменить именно acceptance/allowlist внешнего mailbox provider; dedicated/static IP не гарантирует репутацию.

Исследование завершено; E2E not_applicable (документальный сравнительный анализ, нет провайдерского аккаунта/развёртывания). Профиль: bounded read-only research. Requested model: gpt-6.1-sol/high; фактические metadata модели и usage недоступны и равны null. Начало: 06:33:46 UTC. Длительность и проверки артефактов фиксируются в sources.json.

Уверенность: высокая для DO Droplet block, Railway Pro requirement и Render paid-compute distinction (явные официальные docs); высокая для узкого утверждения staff Fly о587, средняя при переносе его на любой новый аккаунт/регион без live probe. Docker/Node22/child_process compatibility — архитектурный вывод средней уверенности, не runtime receipt. IMAP993 и Fly465 — insufficient evidence.
