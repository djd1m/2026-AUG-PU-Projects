# CloudPayments: подготовка будущего подключения

Дата сверки: **2026-09-09**.

> **Текущий статус N3:** это документация для оценки и будущей разработки. В N3 нет адаптера CloudPayments, config-схемы, checkout-кода или webhook endpoint. Не направляйте реальные платежи и уведомления на существующие N3 URL: они не будут авторитетно обработаны.

## Что выдаёт CloudPayments

В личном кабинете сайта/терминала доступны два значения с разными границами:

- **Public ID** (в новой документации виджета также встречается `publicTerminalId`) идентифицирует сайт/терминал и передаётся в виджет; он не даёт серверных полномочий API Secret;
- **API Secret** — серверный секрет. Он служит паролем HTTP Basic Auth и ключом HMAC уведомлений. Его нельзя отдавать браузеру, вставлять в JavaScript или логировать.

Серверный API использует Basic Auth: Public ID как login, API Secret как password. Для повторобезопасности CloudPayments описывает `X-Request-ID`, результат по которому хранится один час. Этого окна недостаточно как единственной дедупликации N3: будущий адаптер обязан хранить provider transaction ID и бизнес-ключи в PostgreSQL.

## 1. Подготовьте кабинет без подключения N3

1. Зарегистрируйте отдельный сайт/терминал для N3 и завершите требования договора/модерации в кабинете CloudPayments.
2. Возьмите Public ID и API Secret из настроек именно этого сайта. Сохраните Secret в менеджере секретов; Public ID можно раскрыть виджету только после реализации конкретного N3 frontend-контракта.
3. Уточните у провайдера режимы терминала, схему платежа (`Single`/`Dual` либо соответствующие методы `charge`/`auth`), доступные способы оплаты, кассу и возвраты для вашего договора.
4. Не записывайте эти значения в `.runtime/yookassa.json` или `.runtime/access.json`: обе схемы предназначены для других провайдеров.
5. Не включайте Pay/Check/Refund URL в кабинете до появления и проверки выделенных N3 handlers.

Сейчас безопасный ожидаемый результат — credentials подготовлены вне N3, а provider traffic в N3 отсутствует.

Сразу после создания новый сайт в кабинете CloudPayments находится в тестовом режиме: платежи и другие операции эмулируются. Переход терминала в боевой режим — отдельное действие после договорной и технической готовности. Не определяйте среду только по внешнему виду widget; будущий N3 binding должен хранить конкретный terminal и явный test/live статус, а перед production выполнить малую денежную сверку.

## 2. Выберите браузерный сценарий

CloudPayments предлагает hosted widget и Checkout script. Для N3 разумный исходный кандидат — hosted widget: карточные поля находятся в iframe провайдера. Скрипт необходимо загружать только с официального HTTPS-адреса CloudPayments; не копируйте его в bundle и не принимайте API Secret в браузере.

Но одного виджета недостаточно. Browser callback «success» сообщает о завершении UI-сценария и не является финансовым фактом. Сумма, валюта, `externalId`/`invoiceId`, account и beneficiary должны быть сохранены сервером N3 до открытия формы, а итог должен подтверждаться серверным уведомлением и/или authenticated API read-back.

До реализации адаптера не добавляйте подобный фрагмент в N3:

```text
https://widget.cloudpayments.ru/bundles/cloudpayments.js
```

Это адрес официального script, а не готовая N3-интеграция. Нужны CSP, integrity/dependency review, строгая выдача server-created order и тесты позднего browser callback.

## 3. Спроектируйте серверные уведомления

CloudPayments поддерживает Check, Pay, Fail, Confirm, Refund, Recurrent и Cancel notifications. Будущая минимальная N3-фича должна явно выбрать события; нельзя включить всё и молча игнорировать часть денежных переходов.

Для POST уведомления CloudPayments вычисляет HMAC-SHA256 по телу запроса в UTF-8, использует API Secret как ключ и передаёт Base64 в заголовках `X-Content-HMAC`/`Content-HMAC` (варианты различаются обработкой URL encoding). Handler должен:

1. принять HTTPS POST с жёстким лимитом тела;
2. сохранить сырые байты до form/JSON parsing;
3. вычислить ожидаемый HMAC тем же вариантом и сравнить в постоянное время;
4. отвергнуть запрос до бизнес-обработки при отсутствии/ошибке подписи;
5. проверить терминал, сумму, валюту, N3 order и provider transaction ID;
6. атомарно записать inbox/fact с уникальным provider ID;
7. корректно обработать дубль и доставку Refund/Cancel в неожиданном порядке;
8. вернуть документированный JSON `{"code":0}` только после принятого результата.

IP-диапазоны из документации можно использовать дополнительным сетевым фильтром, но не вместо HMAC. Значения меняются у провайдера, поэтому их нужно сверять перед deployment и не вшивать из этой инструкции без процедуры обновления.

## Точного N3 webhook URL пока нет

Маршрут вида `/api/webhooks/cloudpayments` **не существует**. Не создавайте его только в документации и не указывайте в кабинете: запрос попадёт в 404/неподдерживаемый frontend и финансовый факт будет потерян. Точный URL можно публиковать только вместе с кодом handler, raw-body/HMAC tests, PostgreSQL inbox и deployment smoke.

## 4. Требования к будущему runtime

Отдельная фича должна добавить собственный ignored secret JSON и environment file pointer. Имена ещё не утверждены, поэтому эта инструкция намеренно не предлагает `N3_CLOUDPAYMENTS_*` как работающий контракт.

Минимальные инварианты:

- один явно назначенный terminal ↔ tenant на deployment или проверенная таблица bindings;
- API Secret только на backend; browser получает Public ID и server-issued order fields;
- provider amount не выбирает tenant/beneficiary; он сверяется с сохранённым order;
- `X-Request-ID` повторяется для того же внешнего вызова, но долговременная идемпотентность живёт в БД N3;
- внешний IO не удерживает SQL lock/connection;
- неопределённый create/refund не повторяется новым business key до read-back;
- test/live факты разделены и тестовые деньги исключены из payable totals;
- refunds сохраняют исходный payment и отдельную неизменяемую correction;
- checkout success/redirect никогда не зачисляет reward.

## 5. Проверка кабинета и API до разработки

Официальный API имеет test method `POST https://api.cloudpayments.ru/test` с Basic Auth. Его можно вызвать из одноразовой защищённой operator-среды, не из браузера и не сохраняя credentials в shell history. Ожидаемый `Success:true` подтверждает пару credentials и доступ к API, но не проверяет N3, widget, уведомление или реальный платёж.

CloudPayments публикует тестовые terminal/card сценарии и сообщает, что в demo/test списания не происходит. Используйте только актуальные данные со страницы провайдера. Зафиксируйте отдельно:

- test API authentication;
- hosted widget result;
- signed Pay notification;
- duplicate delivery;
- Refund/Cancel и перестановку;
- provider API read-back/reconciliation;
- боевую малую оплату и возврат после активации terminal.

Не называйте test method или demo widget «живой приёмкой N3».

## Ошибки и диагностика

| Признак | Что означает/делать |
|---|---|
| N3 отвечает 404 на notification | ожидаемо: handler не реализован; удалить URL из кабинета, не ретраить в другой N3 route |
| 401 от `api.cloudpayments.ru` | проверить Public ID/API Secret и выбранный terminal; Secret не передавать в frontend |
| HMAC не совпадает | сравнить сырые POST-байты, UTF-8, SHA256, Base64 и правильный заголовок; не отключать проверку |
| Widget показывает success, N3 не начислил reward | корректное поведение без подтверждённого server fact |
| Повтор создаёт второй факт | дефект будущей реализации: нужен уникальный provider transaction ID в PostgreSQL |
| 429 от API | соблюдать documented concurrency limits/backoff; повторять с тем же business/X-Request ID |
| Неясно test это или live | остановить финансовую обработку; хранить явный terminal/mode binding и сверять кабинет |

## Ротация, отключение и rollback

Пока адаптера нет, ротация ограничена кабинетом/внешним secret store: новый Secret не должен попадать в N3. При утечке отзовите/перевыпустите Secret в CloudPayments, отключите notification URL и проверьте журнал операций терминала.

Для будущей реализации нужен runbook overlap: создать новый Secret, атомарно заменить backend secret, проверить authenticated API и подписанное тестовое уведомление, затем отозвать старый. Если provider не поддерживает одновременные secrets, заранее назначьте окно остановки ingress. После реальных фактов откат допускается только на совместимый processor; иначе остановите новые checkout, сохраните очередь уведомлений и выпускайте forward-fix.

## Условие готовности к включению

CloudPayments можно направить в N3 только когда одновременно существуют reviewable adapter, config contract, точный HTTPS route, HMAC-before-parse, durable dedupe/order handling, test/live isolation, refund tests, browser E2E и операция в provider test environment. Сейчас ни один N3 endpoint для CloudPayments не заявлен.

## Официальные источники

- [Документация CloudPayments: API, Basic Auth, идемпотентность, notifications](https://developers.cloudpayments.ru/)
- [Платёжный виджет](https://developers.cloudpayments.ru/pages/widget.html)
- [Английская документация с обзором способов интеграции](https://developers.cloudpayments.ru/en/)
