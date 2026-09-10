# N3a development guide

## Bootstrap boundary

Foundation принята. Реализованы публичные auth/enrollment API, настройка программы, согласие партнёра и личные материалы; результаты текущего этапа — `docs/features/identity-program-partner/05_completion.md`. Интеграция N1, денежный ledger и выплаты остаются следующими этапами.

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

## Исполняемый цикл foundation

`npm run verify` проверяет типы, unit-тесты, production build и traceability. `npm run test:isolated -- --mutations` последовательно собирает приложение, проверяет конфигурацию/порты, создаёт приватный PostgreSQL и запускает unit/SQL/mutation/smoke проверки. Не запускать сборку параллельно smoke на том же `.next`.

Реальные SQL-suite требуют разные `TEST_DATABASE_URL` и `TEST_DATABASE_URL_MIGRATE`; без них `npm run test:integration` завершается ошибкой, а не пропускает тесты. Предпочтителен изолированный harness: он генерирует новые секреты сам. Адреса/секреты не выводятся; диагностический handle находится в `/tmp`, результаты мутаций в игнорируемой `.runtime/`.

Совместимость доноров не означает безопасность их старых зависимостей: Vitest обновлён до5.0.0, PostCSS до8.5.28; см. `docs/discovery/foundation-reuse-provenance.md`.

### Foundation acceptance checks

`npm run verify` also runs the two real checker regression tests and `npm run check:completion`. The latter uses a project adapter pinned to p-replicator1.13.2 and its exact SHA because upstream doubles the global completion path. It changes only a temporary variable name, preserves original validations and exit codes, and rejects unknown upstream bytes. No vendor/root toolkit is modified.

`npm run test:isolated -- --mutations --image` performs serial build/test validation plus Docker image build and startup, then stops both app/test profiles in its own namespace. Allow disk capacity for image layers; ENOSPC is a failed check.

## Onboarding verification

`npm run test:isolated -- --mutations --browser` проверяет приложение и PostgreSQL, собирает Docker image и проходит настоящий Firefox-сценарий владельца/партнёра на320/390/768/1440px. Нужны Docker, Firefox и geckodriver; используются только синтетические данные. Web публикует случайный localhost-порт через собственный ingress bridge; PostgreSQL и тестовый контейнер подключены только к internal private network. Harness убирает контейнеры/сети своего запуска; диагностические test volumes сохраняются и после завершения могут быть удалены по точному namespace.

Для служебных проверок: `npm run test:tooling` (8 регрессионных тестов двух адаптеров), `npm run check:completion` и `npm run check:canon`. Последняя использует временную копию корневого checker с закреплённым SHA: читает единицы только из раздела `## Единицы`, сохраняя остальные проверки и коды выхода. Vendor-файлы не изменяются. Ошибка spawnSync EPERM в ограниченной песочнице требует разрешённого запуска дочерних процессов; её нельзя считать дефектом приложения или зелёной проверкой.

Bootstrap владельца описан в `docs/features/identity-program-partner/05_completion.md`; runtime не создаёт пилота автоматически. Источники donor-кода и адаптации перечислены в `docs/discovery/identity-donor-audit.md`. Программа остаётся draft/not_ready до реализации и проверки N1 bridge.
