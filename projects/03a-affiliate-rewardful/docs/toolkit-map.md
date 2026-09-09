# N3a toolkit map

This map applies the p-replicator split: stable workflow instruments are inherited from the
repository root; N3a contains only source-bound additions. It does not install commands, hooks,
services, dependencies, or runtime configuration.

## P0 — inherited, read-only

| Capability | Root source | Local action |
|---|---|---|
| Lifecycle commands | `../../../.claude/commands/{start,plan,feature,next,go,run,myinsights,docs,deploy}.md` | Reuse; no copy or override |
| Lifecycle and git rules | `../../../.claude/rules/{feature-lifecycle,git-workflow,insights-capture,swarm-file-evidence}.md` | Reuse; no copy or override |
| Safety rules | `../../../.claude/rules/{incoming-webhooks,security-operation-order,fail-closed-defaults,honest-configuration,shared-resource-verification,docker-ports}.md` | Reuse with local stricter rules |
| Hooks and settings | `../../../.claude/hooks/`, `../../../.claude/settings.json` | Reuse as installed; no local hook/config claim |
| Planning/review skills | `../../../.claude/skills/{sparc-prd-mini,requirements-validator,brutal-honesty-review,explore,goap-research-ed25519,problem-solver-enhanced}/` | Load on demand; no vendoring |
| Orchestration | root `CLAUDE.md` and p-replicator toolkit | No second orchestrator |

## P1 — generated locally

| Artifact | Source binding | Purpose |
|---|---|---|
| `.claude/agents/planner.md` | Specification, Pseudocode, implementation plan | Dependency/source-bound decomposition |
| `.claude/agents/architect.md` | Architecture, ADR, C4 | Trust, data and integration design |
| `.claude/agents/code-reviewer.md` | Refinement, Completion, SC/BDD | Read-only money/security review |
| `.claude/rules/security.md` | NFR-SECURITY/PRIVACY, webhook contract | Auth, tenant and intake boundary |
| `.claude/rules/coding-style.md` | Architecture, Pseudocode | TypeScript/PostgreSQL/money conventions |
| `.claude/rules/testing.md` | Refinement and test scenarios | Executable evidence requirements |
| `.claude/rules/secrets-management.md` | Architecture/Completion | N1 credential separation and rotation |
| `.claude/skills/project-context/SKILL.md` | PRD and validation report | Scope, actors and vocabulary |
| `.claude/skills/coding-standards/SKILL.md` | Pseudocode/ADR | On-demand implementation standards |
| `.claude/skills/security-patterns/SKILL.md` | webhook/security contracts | Boundary patterns |
| `.claude/skills/feature-navigator/SKILL.md` | root roadmap schema and N1 plan | Roadmap selection/status logic |
| `.claude/feature-roadmap.json` | PRD, Specification, Architecture, implementation plan | Ten bounded dependency-ordered features |
| `README.md`, `DEVELOPMENT_GUIDE.md` | completion and actual bootstrap state | Honest operator/developer orientation |

## P2/P3 — optional and absent

| Candidate | State | Reason |
|---|---|---|
| Local tdd/DDD agents and aggregate/event skills | absent | No DDD document tree; core local review roles cover validated SPARC scope |
| Local commands, SessionStart/Stop hooks or settings | absent | Root p-replicator already owns them; local duplication would fork behavior |
| `.mcp.json` or provider plugins | absent | N3a MVP has no authorized MCP/A2A product surface; N1 server contract is ordinary HTTPS |
| DDD enterprise lifecycle | absent | No DDD strategic/tactical inputs |
| Deployment/CI automation | absent | Runtime scaffold and release authority do not exist at toolkit stage |

## Roadmap contract and package gate

`.claude/feature-roadmap.json` follows the single schema in root
`../../../.claude/commands/next.md`: required `id`, closed-set `priority`, and closed-set
`status`, with `depends_on` and explicit blockers. D7 is a separate blocked proposal and is
not unblocked by completing N1 work.

After the project installs `@dzhechkov/p-replicator`, resolve its guard through Node:

```bash
bash "$(node -p "require.resolve('@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh')")" \
  . --traceability \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

The two role-map flags are required because the stable maps remain in the root toolkit. The
command passed 36/36 in the integration worktree with p-replicator 1.13.2; this project-local
toolkit does not claim that dependency is installed in every worktree.
