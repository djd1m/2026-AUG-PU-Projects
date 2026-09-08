# Общие модули N3

Сейчас здесь [общий PRD](docs/PRD.md). Runtime-ядро ещё не реализовано.

Предлагаемая структура для F1:

```text
shared/
  domain/          # правила атрибуции, reward policy, типы cash/credit, ledger
  application/     # use cases, authorization, idempotency, registry/task lifecycle
  contracts/       # DTO/schema, ошибки, версии, actor/artifact references
  infrastructure/  # БД, inbox/outbox и provider adapters
  transports/      # HTTP/MCP/A2A → application ports
  ui/              # доступные элементы, деньги/статусы/таблицы/подтверждения
  testing/         # fixtures, эталонные наборы, contract/parity/negative tests
  docs/PRD.md
```

Каждый вариант в `../variants/` владеет только своей композицией экранов, входом в сценарий и локальными тестами. Его браузерная часть импортирует shared contracts/клиентский фасад и UI-компоненты; импорт кода другого варианта запрещён. Одна ошибка общего расчёта исправляется здесь один раз.

Папки runtime перечислены как план, не изображаются существующими пакетами. Текущие общие исходники HTML-демо находятся в `../docs/prototypes/cjm/assets/`; собранные HTML копируются в подпапки вариантов детерминированной сборкой. Эти HTML-фикстуры нельзя выдавать за production financial core.
