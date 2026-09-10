# Agent payments implementation dispatch

**Пишущий фан-аут:** да
**Канон:** docs/features/agent-purchase/implementation-contract.md
**Хеш канона:** 251b171f20b6903bbbb57a25488116316e63de9f0ac6b7662f4765088a01abf5
**Проверка канона:** ВЫПОЛНЕНА
**Координатор пишет:** да
**Разрезы файлов:** нет
**Проверка владения:** ВЫПОЛНЕНА

## Единицы

| Единица | Что пишет |
|---|---|
| core | packages/agent-payments/** |
| host | apps/web/**, packages/db/migrations/020_agent_payments_host.sql |

## Владение

| Файл | Владелец |
|---|---|
| packages/agent-payments/** | core |
| apps/web/** | host |
| services/agent-api/** | координатор |
| services/worker/** | координатор |
| packages/db/migrations/020_agent_payments_host.sql | host |
| docs/** | координатор |
| package.json | координатор |
| package-lock.json | координатор |
| compose.agent-payments.yml | координатор |

Core isolated worktree /tmp/agent-payments-core-7e80; coordinator main worktree. Public TypeScript contracts published first before host code depends on them. No other writer.
