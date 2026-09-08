# Четыре варианта N3

Каждый вариант — отдельная папка с собственным PRD и автономным прототипом. Будущие `src/` и `tests/` находятся в той же папке. Общие правила/модули — `../shared/`.

| Вариант | PRD | HTML |
|---|---|---|
| A — владелец | [PRD](a-merchant/docs/PRD.md) | [Прототип](a-merchant/prototype/index.html) |
| B — клиент | [PRD](b-customer/docs/PRD.md) | [Прототип](b-customer/prototype/index.html) |
| C — партнёр | [PRD](c-partner/docs/PRD.md) | [Прототип](c-partner/prototype/index.html) |
| D — личный агент | [PRD](d-agent/docs/PRD.md) | [Прототип](d-agent/prototype/index.html) |

[Общий PRD](../shared/docs/PRD.md) · [Архитектура](../docs/variant-architecture.md) · [План реализации и сравнения](../docs/variant-implementation-plan.md).

На GitHub HTML скачивают через Download raw file и открывают в браузере. Файлы автономны, установка не нужна. Папки пока содержат документы и текущие демонстрации; четыре backend-приложения ещё не реализованы. Выбор будущего продукта может быть сочетанием вариантов.
