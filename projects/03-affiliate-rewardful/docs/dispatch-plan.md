# F4 Proofwall bridge dispatch

**Пишущий фан-аут:** ДА
**Канон:** docs/features/f4-proofwall-integration/02_pseudocode.md
**Хеш канона:** cecb418a726335f79bfae2b13d96a027d7885d45a4323c5ad85435f5f3b1c6eb
**Проверка канона:** ВЫПОЛНЕНА
**Координатор пишет:** ДА
**Разрезы файлов:** НЕТ
**Проверка владения:** ВЫПОЛНЕНА

| Единица | Владение |
|---|---|
| bridge-proofwall-implementation (requested Astra high) | P1 apps/web/src/**, apps/web/tests/**, packages/db/migrations/019_n3_bridge.sql, packages/db/tests/**, services/worker/src/**, services/worker/tests/** in isolated /tmp/proofwall-n3-bridge |
| bridge-catalog-gate (requested Sol high) | /tmp/n3-check-feature-catalog.mjs and /tmp receipt only; coordinator integrates |
| coordinator | All N3 source/tests/docs; all shared manifests, lockfiles, compose, deployment, cross-project E2E, telemetry |

Root integrates commits; no concurrent writers in a worktree. Maximum two active children. Independent Astra delta validation READY, P1 scoped planning gates and complete N3 planning gates exit0. Historical P1 catalog failures remain disclosed. Writer cannot deploy, read secrets or run real external IO. P1 tests use separate closed compose.bridge-test.yml, never existing host-port test stack. Root sequences integration DB tests. New P1 source build/test commits are separate from docs/telemetry so release can cherry-pick bridge-only code onto f8055e3 without pending access checkpoint.

Run: docs/telemetry/p-replicator/20260909T170258Z-proofwall-n3.
Actual model/usage remains unknown until host metadata confirms it; requested model alone is not evidence. Prior access dispatch remains in Git history.
