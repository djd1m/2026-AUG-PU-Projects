# Контракты провайдеров — подготовка 2026-10-06

Проверка первичной документации; не runtime acceptance и не разрешение live вызовов.
Ниже подтверждены отдельные интерфейсы, полные адаптеры остаются непроверенными.

## SMTP

Nodemailer документирует подключение к IP с исходным `tls.servername`,
`requireTLS`, таймауты и запрет доступа к файлам/URL. Это подходит для thin
adapter поверх N7 pinned endpoint; service presets, opportunistic TLS и debug
не должны обходить политику. Abort, фазу DATA и исход unknown нужно доказать
на закреплённой версии и protocol fixtures, документация не доказывает безопасный retry.
Источник: [официальный SMTP transport](https://nodemailer.com/smtp).

## IMAP

ImapFlow предоставляет UID-режим fetch, `uidValidity`, `uidNext`, read-only
mailbox locks и ограниченное получение source. Документированный клиент не
восстанавливает соединение автоматически. N7 сам отвечает за bounded range,
подтверждение покрытия, checkpoint/replay и предельный wire/parser memory;
лимит сохранённого body не доказывает лимит сетевого буфера. Семантика
`internalDate` не доказывает исходное server arrival для произвольного письма.
Источники: [Client API](https://imapflow.com/docs/api/imapflow-client/),
[Fetching Messages](https://imapflow.com/docs/guides/fetching-messages/).

## OpenAI

Responses поддерживает строгий JSON schema output через `text.format`; объекты
схемы требуют `additionalProperties: false`. Схема не доказывает смысловую
корректность, основания обещаний или право на отправку; N7 валидирует результат
и отдельно выдаёт полномочия. Модель должна быть явно разрешена и проверена
на совместимость и качество перед пилотом.
Источник: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Для foreground requests предполагается `store:false`, без Conversations/Files
и без background state. Это не обещание zero retention: abuse monitoring и
применимые controls организации проверяются отдельно. A3 local body/draft TTL
относится к хранилищу N7, а не к срокам провайдера. Disclosure перед передачей
писем должен отражать фактические provider controls; ZDR не считается доступным
без подтверждения.
Источник: [Data controls](https://developers.openai.com/api/docs/guides/your-data).

## Остаточные ворота

Точные версии и abort/pinning/coverage/outcome mappings ещё предстоит закрепить
при F08–F09/F12 и доказать fixtures. Доступность модели, бюджет, условия
почтового провайдера и trusted arrival source конкретного пилота остаются
внешними входами F15. Наличие документации и ключей не закрывает эти ворота.
