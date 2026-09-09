# Source versions — F4 Proofwall bridge

**Правки и выводы:** ДА
**Проверка версий:** ВЫПОЛНЕНА

| Что | Вид | Источник | Хеш источника |
|---|---|---|---|
| External merchant reservation, verification and delivery | правка | docs/features/f4-proofwall-integration/02_pseudocode.md | cecb418a726335f79bfae2b13d96a027d7885d45a4323c5ad85435f5f3b1c6eb |

N3 source commit e23ab3e, additional reviewed test coverage c1ac69d. Separate release branch codex/n3-proofwall-release begins at deployed f8055e3 and carries only bridge commits0aac8ad and7f67157. It excludes unaccepted access onboarding. P1 source author works in isolated /tmp/proofwall-n3-bridge from a16c0be; main source integration and runtime verification pending. Exact evidence under docs/telemetry/p-replicator/20260909T170258Z-proofwall-n3/evidence. No cross-project Docker network or database access forms part of the contract; production communication uses public HTTPS API origins.
