# Receipt: spatial research

- Run ID: `20261013T202009Z-expanded-cjm-9f69`
- Work unit: `spatial`
- Baseline: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`
- Worktree: `/tmp/n8-research-spatial-20261013`
- Observed at: 2026-10-13 UTC
- Scope: read-only external research; only this report and receipt were written.
- Output: `projects/08-interior-ai-redesign/docs/research/spatial-ai.md`

## Instruction and memory evidence

Read before research: root `CLAUDE.md`, `projects/08-interior-ai-redesign/docs/project-input.md`, `.claude/rules/complexity-router.md`, `.claude/skills/reverse-engineering-unicorn/SKILL.md`, and module `02-product-customers.md`. Project-local `CLAUDE.md` was absent.

Required recall command:

```text
/opt/corp-infra/runtime/node-v24.21.0-linux-x64/bin/dz recall \
  'Scaniverse Gemini 3D geometry model cost' --json --limit 5 \
  --project /home/2026-AUG-PU-Projects
```

Result: `[]`. No recalled lesson was applied and this worker did not teach the shared brain.

## Evidence collection

No paid API calls, credentials, deployments, installs or changes to global configuration. Primary-source discovery and direct reads covered:

- Scaniverse official support, release notes, advanced scan review and Niantic SPZ repository;
- live unauthenticated `https://openrouter.ai/api/v1/models` snapshot;
- Khronos glTF 2.0 specification and glTF Validator;
- official GitHub repositories/API metadata for Babylon.js, three.js, PlayCanvas, model-viewer, glTF Transform, trimesh and Niantic SPZ.

Representative commands:

```text
curl -fsSL https://openrouter.ai/api/v1/models | jq ...
curl -fsSL https://api.github.com/repos/<owner>/<repo> | jq ...
curl -fsSL https://api.github.com/repos/<owner>/<repo>/commits/HEAD | jq -r .sha
```

OpenRouter response SHA-256 at observation: `443f6e316139766e36bfa24108a21169e2f14338eb45eddbf8c79c9bf818eeb9`. Selected live IDs were `google/gemini-4-argon`, `google/gemini-2.5-pro`, `google/gemini-3-pro-image`, `google/gemini-3.1-flash-image`, and `google/gemini-3.1-pro-preview`. No inference request was made.

## Claim discipline and gaps

- Proven claims are linked to first-party documentation or repository metadata in the report.
- Inferences/recommendations are identified as design decisions or candidates.
- No numerical Scaniverse accuracy, 25-second timing, model quality benchmark, per-scene cost, or exact-3D AI capability was found or invented.
- OpenRouter prices are a point-in-time public catalog observation, not a quote; the report uses only mechanically converted per-token fields.
- Runtime did not expose verifiable worker model metadata to this agent. Actual model: `unknown`; requested routing information belongs in coordinator telemetry.
- Duration/usage counters were not exposed to this agent and were not reconstructed. Duration: `unknown`; token/monetary usage: `unknown`.

## Validation

Planned checks after writing: line count under 350 for the report, status/diff restricted to the two owned files, link presence, receipt terminal status line.

Status: completed
