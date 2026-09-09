# Bootstrap checks

Installed project-local `@dzhechkov/p-replicator@1.13.2` with an independent npm lockfile; no root toolkit or global settings changed. Dependency installation retried with approved network access after sandbox DNS EAI_AGAIN.

The packaged checker default invocation exited 2 because project-local shared commands/skills do not exist. Supported explicit role-map options resolve this without copying the root toolkit.

```text
bash node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
TRACE contour=project specification=./docs/Specification.md pseudocode=./docs/Pseudocode.md
COUNT requirements=36 algorithms=36 missing-algorithm=0 orphan-algorithm=0
PASS contour=project bidirectional traceability complete
VERDICT traceability=PASS features=0 gaps=0 inconclusive=0
```

Exit: 0. Scope: current global document machine-key mapping only. No feature implementation, build, database or application tests are claimed. Historical PRD report remains a record of its earlier checks.

Shared root pre-shipped contract: `node projects/03a-affiliate-rewardful/node_modules/@dzhechkov/p-replicator/bin/cli.js verify` from repository root exited 0: `[OK] Pre-shipped contract OK (10 post-replicate hint(s)).` The hints inspect root rather than N3a and are not proof of project bootstrap completion.
