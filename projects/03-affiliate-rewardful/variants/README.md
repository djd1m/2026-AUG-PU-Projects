# Четыре варианта N3

Все четыре интерфейса реализованы в своих папках `app/` и используют один API и PostgreSQL. У каждого свой PRD, Docker Compose и сценарий демонстрации; общие правила находятся в `../shared/`. Автоматические UI E2E находятся в `../tests/e2e/`.

| Вариант | PRD | Демонстрация | Публичный UI |
|---|---|---|---|
| A — владелец | [PRD](a-merchant/docs/PRD.md) | [MD](a-merchant/docs/demo.md) · [HTML](a-merchant/docs/demo.html) | https://n3-a.212.192.0.33.sslip.io/ |
| B — клиент | [PRD](b-customer/docs/PRD.md) | [MD](b-customer/docs/demo.md) · [HTML](b-customer/docs/demo.html) | https://n3-b.212.192.0.33.sslip.io/ |
| C — партнёр | [PRD](c-partner/docs/PRD.md) | [MD](c-partner/docs/demo.md) · [HTML](c-partner/docs/demo.html) | https://n3-c.212.192.0.33.sslip.io/ |
| D — личный агент | [PRD](d-agent/docs/PRD.md) | [MD](d-agent/docs/demo.md) · [HTML](d-agent/docs/demo.html) | https://n3-d.212.192.0.33.sslip.io/ |

[Открытие стендов и порядок показа](../docs/demos/index.md) · [Общий PRD](../shared/docs/PRD.md) · [Архитектура](../docs/variant-architecture.md).

F1 использует синтетические данные. UI E2E49/49; реальные платежи, production identity и MCP/A2A wire не подключены. Статические CJM сохранены в `prototype/`; функциональные стенды запускаются через Docker. HTML-инструкцию на GitHub можно скачать через Download raw file и открыть локально; для работы самого UI нужен SSH-туннель к VPS. Можно выбрать сочетание удачных частей разных вариантов.
