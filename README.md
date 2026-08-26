# 2026-AUG-PU-Projects

## Установленный тулчейн

Глобально установлены (npm, Node 22):

| Пакет | Версия | Бинарь | Назначение |
|---|---|---|---|
| `@dzhechkov/harness-cli` | 0.7.8 | `dz` | Кросс-платформенный harness: установка AI-скиллов для Claude Code / Codex / OpenCode и др. |
| `@dzhechkov/p-replicator` | 1.5.18 | `p-replicator` | Пайплайн `/replicate`, 10 модульных скиллов, `/harvest`, swarm-агенты, quality gates |
| `@dzhechkov/skills-feature-adr` | 1.5.4 | `skills-feature-adr` | Adaptive Feature Development: 11-шаговый пайплайн, Complexity Router (S/M/L/XL), ADR |
| `ruflo` | 3.38.20 | `ruflo` | Оркестрация AI-агентов (claude-flow): 60+ агентов, swarm, MCP, векторная память |

Переустановка:

```bash
npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo
```
