# N3a development guide

## Bootstrap boundary

Сейчас в проекте есть валидированные документы и project-specific toolkit. Runtime scaffold,
package scripts, зависимости, миграции, compose и приложение создаются отдельным foundation
этапом. До этого нельзя считать команды `test`, `build`, `dev` или контейнеры доступными.

Общие lifecycle-инструменты читаются из корневой `.claude/`; локальные дополнения перечислены
в `docs/toolkit-map.md`. Перед изменениями читать корневой и проектный `CLAUDE.md`, применимые
root rules и локальные rules проекта.

## Foundation sequence

1. Повторно проверить текущие исходники и правила N1/N2; записать revision/hash, dependency
   closure, выбранные блоки и адаптации в N3a.
2. Использовать выбранный N1 Argon2id и мигратор N2 согласно `docs/features/foundation/03_architecture.md`; Pseudocode/ADR синхронизированы с этим решением.
3. Зафиксировать точные Node/framework/PostgreSQL версии, workspace paths и package scripts.
4. Создать новую N3a схему, секреты, compose namespace/network/volume без host port БД.
5. Реализовать roadmap по зависимостям, начиная с `foundation`. Изменения N1
   выполняет отдельный integration owner с N1 regression; N2 остаётся донором.
6. На каждой фиче связать FR/SC → алгоритм → executable test → точную revision evidence.

## Document traceability gate

После локальной установки `@dzhechkov/p-replicator` package guard должен разрешаться через
Node, а не через предполагаемый глобальный путь. Из корня N3a используется:

```bash
bash "$(node -p "require.resolve('@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh')")" \
  . --traceability \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

На проверенном integration worktree с p-replicator 1.13.2 команда дала PASS 36/36.
Это свидетельство доступности пакета и документов в том worktree, не установки зависимости
или наличия npm-script здесь. Корневой integration owner добавляет package script отдельно.

## Verification by risk

- Auth/tenant: negative role and cross-program tests, session expiry/revocation, brute-force
  control, password dummy verification and bounded KDF concurrency.
- N1 bridge: authenticated envelope, version/type/merchant/environment/order/amount/RUB checks,
  concurrent duplicates, reorder, restart and cursor recovery; N1 billing remains available.
- Ledger/refunds: real PostgreSQL unique/locking tests, partial/full/over-refund, economic versus
  audit hashes, crash before commit and mutation checks.
- Registry/tax/transfer: month boundaries, freeze races, R1–R4 restore fixtures, payer/person/year
  serialization, unknown inputs blocked, actual/due date and CSV no-transition.
- UI: separate N1/N3a origins, owner/partner isolation, keyboard/focus/status text and contract
  widths. Prototype browser results do not count for the application.
- Release: full regression, backup/restore, port check, test-store ЮKassa E2E, independent
  money/security review and explicit release authority.

Record unavailable checks as unavailable. Production rollout and real transfers remain outside
this bootstrap authorization.
